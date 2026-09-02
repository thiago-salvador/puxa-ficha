#!/usr/bin/env bash
# Replay de `supabase/migrations/` num Postgres vazio, migration a migration.
#
# Issue #136. Responde com numero: quantas migrations aplicam limpo num banco
# vazio, qual e a primeira que quebra, e se o conjunto de estrutura produz o
# MESMO schema do replay linear completo (prova por diff de pg_dump, nao por
# contagem de objetos; a vistoria do PR #142 derrubou a contagem com razao).
#
# Custo zero e sem risco: sobe um container Postgres proprio com nome unico por
# execucao (pf-replay-<pid>-<sufixo>), NUNCA usa `--linked`, nao toca producao,
# e um trap remove SO os containers que esta execucao criou. Duas execucoes
# concorrentes nao se derrubam.
#
# Uso:
#   scripts/audit/replay-migrations.sh                          # linear, para na 1a falha
#   scripts/audit/replay-migrations.sh linear --tolerante       # linear, segue e lista falhas
#   scripts/audit/replay-migrations.sh --apenas-schema          # so a classe schema
#   scripts/audit/replay-migrations.sh --com-ddl                # schema separado, sem curadoria/retidas
#   scripts/audit/replay-migrations.sh --schema-gate            # mesmo conjunto, gate explicito de CI
#   scripts/audit/replay-migrations.sh --comparar               # PROVA: diff de schema
#                                                                 linear vs com-ddl

set -uo pipefail

DIR="supabase/migrations"
MODO="${1:-linear}"
TOLERANTE=0
[[ "${2:-}" == "--tolerante" ]] && TOLERANTE=1
# O hash canonico do pg_dump so e um gate se a ferramenta que o produz tambem
# for canonica. A imagem multiarch fica presa ao digest medido nesta separacao;
# override existe apenas para diagnostico deliberado, nunca no workflow.
POSTGRES_IMAGE="${PF_REPLAY_POSTGRES_IMAGE:-postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317}"

# Nome unico por execucao. O trap so remove o que ESTA execucao criou; a versao
# anterior usava nome fixo e um `docker rm -f` cego, entao duas execucoes
# concorrentes se derrubavam (achado da vistoria do PR #142).
CONTAINERS_CRIADOS=()
cleanup() {
  for c in ${CONTAINERS_CRIADOS[@]+"${CONTAINERS_CRIADOS[@]}"}; do
    docker rm -f "$c" >/dev/null 2>&1
  done
}
trap cleanup EXIT INT TERM

CONTAINER=""

psql_run() { docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# Cada migration roda numa transacao unica, como o CLI do Supabase faz. Sem isso,
# `CREATE TEMP TABLE ... ON COMMIT DROP` some antes do proximo statement e o
# replay quebraria por emulacao errada, nao por defeito real.
psql_migration() {
  docker exec -i "$CONTAINER" psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -q --single-transaction -f -
}

subir_container() {
  local sufixo="$1"
  CONTAINER="pf-replay-$$-${sufixo}"
  CONTAINERS_CRIADOS+=("$CONTAINER")
  docker run -d --name "$CONTAINER" \
    -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres \
    "$POSTGRES_IMAGE" >/dev/null
  # A sonda tem de ser TCP, e isso e o conserto de um flake real (CI de 09/08,
  # "FATAL: terminating connection due to administrator command" logo apos o
  # bootstrap comecar). O entrypoint da imagem roda initdb e entao sobe um
  # servidor TEMPORARIO com `listen_addresses=''`, so no socket unix, para
  # executar os scripts de init; depois derruba esse servidor e sobe o
  # definitivo. `pg_isready` sem `-h` fala pelo socket e responde OK justamente
  # nessa janela, entao o harness comecava a aplicar migrations contra um
  # servidor prestes a ser desligado. Em TCP a sonda so responde no servidor
  # definitivo.
  #
  # TCP nao exige senha aqui: a imagem oficial escreve
  # `host all all 127.0.0.1/32 trust` no pg_hba.conf, conferido dentro do
  # container. Nada alem da sonda usa TCP; a aplicacao das migrations segue pelo
  # socket unix.
  for _ in $(seq 1 60); do
    if docker exec "$CONTAINER" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 &&
       docker exec "$CONTAINER" psql -U postgres -h 127.0.0.1 -d postgres -tAc 'select 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "postgres nao ficou pronto em $CONTAINER" >&2
  return 1
}

bootstrap() {
  psql_run <<'SQL'
create schema if not exists extensions;
create schema if not exists auth;
-- O Supabase instala as extensoes no schema `extensions`, e o SQL do projeto
-- chama `extensions.digest(...)` qualificado. Instalar em `public` faria o
-- replay quebrar por ambiente emulado errado, nao por ordem de dependencia.
create extension if not exists "uuid-ossp" schema extensions;
create extension if not exists pgcrypto schema extensions;
create extension if not exists citext schema extensions;
alter database postgres set search_path to "$user", public, extensions;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit login password 'postgres'; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
-- `auth.uid()` e `auth.role()` sao referenciadas por policies do projeto.
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
SQL
}

# Fail-closed (rodada 2 da vistoria): filtro vazio ou classificador quebrado
# NAO pode degradar para replay linear em silencio. Quem chama confere.
lista_por_filtro() {
  local filtro="$1" saida
  if ! saida="$(npx tsx scripts/audit/classificar-migrations.ts --json \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print('\n'.join(m['arquivo'] for m in d['migrations'] if $filtro))")"; then
    echo "classificador falhou; abortando em vez de degradar para replay linear" >&2
    return 1
  fi
  if [[ -z "$saida" ]]; then
    echo "filtro '$filtro' devolveu lista vazia; abortando em vez de degradar para replay linear" >&2
    return 1
  fi
  printf '%s\n' "$saida"
}

# Assinatura estrutural: pg_dump --schema-only do proprio container, sem linhas
# volateis (comentarios, SET, restrict). E contra ISTO que a equivalencia se
# prova, objeto a objeto com colunas, indices, constraints, policies e grants,
# nao contra uma contagem de tabelas.
#
# Fail-closed (rodada 2 da vistoria): pg_dump falhando dos dois lados produzia
# duas strings vazias iguais e o diff vazio virava "EQUIVALENTE". O status do
# pg_dump e conferido via PIPESTATUS e um dump sem um minimo de CREATEs aborta.
dump_schema() {
  local bruto
  bruto="$(docker exec "$CONTAINER" pg_dump -U postgres -d postgres --schema-only)"
  local status=$?
  if [[ $status -ne 0 ]]; then
    echo "pg_dump falhou (status $status) em $CONTAINER" >&2
    return 1
  fi
  local limpo
  limpo="$(grep -avE '^--|^SET |^SELECT pg_catalog\.set_config|^\\restrict|^\\unrestrict|^[[:space:]]*$' <<<"$bruto")"
  local creates
  creates="$(grep -ac '^CREATE ' <<<"$limpo")"
  if [[ "$creates" -lt 50 ]]; then
    echo "dump suspeito: so $creates CREATEs (minimo 50); abortando comparacao" >&2
    return 1
  fi
  printf '%s\n' "$limpo"
}

# Roda um replay no container atual. Saida via globais:
# R_APLICADAS, R_PULADAS, R_FALHAS (array "arquivo :: erro"), R_PRIMEIRA.
replay() {
  local filtro_lista="$1" tolerante="$2"
  R_APLICADAS=0; R_PULADAS=0; R_PRIMEIRA=""; R_FALHAS=()

  for caminho in "$DIR"/*.sql; do
    local arquivo; arquivo="$(basename "$caminho")"
    if [[ -n "$filtro_lista" ]] && ! grep -qxF "$arquivo" <<<"$filtro_lista"; then
      R_PULADAS=$((R_PULADAS + 1))
      continue
    fi
    local erro
    if erro="$(psql_migration < "$caminho" 2>&1)"; then
      R_APLICADAS=$((R_APLICADAS + 1))
    else
      [[ -z "$R_PRIMEIRA" ]] && R_PRIMEIRA="$arquivo"
      # O erro fica amarrado ao SEU arquivo (P2 da vistoria: a versao anterior
      # imprimia o nome da primeira falha junto do stderr da ultima iteracao).
      # Ate 17/08/2026 so casava 'ERROR:'. Migration que morre por FATAL,
      # PANIC ou por abort do proprio guard saia com motivo VAZIO, e o gate
      # reprovava sem dizer por que. Agora tenta as tres formas e, se nenhuma
      # casar, guarda a ultima linha nao vazia da saida.
      local motivo
      motivo="$(grep -am1 -oE '(ERROR|FATAL|PANIC):.*' <<<"$erro" | head -c 200)"
      [[ -z "$motivo" ]] && motivo="$(grep -av '^[[:space:]]*$' <<<"$erro" | tail -1 | head -c 200)"
      [[ -z "$motivo" ]] && motivo="(saida vazia; exit $?)"
      R_FALHAS+=("$arquivo :: $motivo")
      [[ "$tolerante" -eq 0 ]] && break
    fi
  done
}

imprime_resumo() {
  local com_filtro="$1"
  echo
  echo "modo                : $MODO$([[ $TOLERANTE -eq 1 ]] && echo ' --tolerante')"
  echo "aplicadas limpo     : $R_APLICADAS"
  [[ -n "$com_filtro" ]] && echo "puladas             : $R_PULADAS"
  echo "falhas              : ${#R_FALHAS[@]}"
  if [[ ${#R_FALHAS[@]} -gt 0 ]]; then
    printf '  - %s\n' "${R_FALHAS[@]}"
  fi
}

main() {
  local filtro_lista=""
  case "$MODO" in
    linear) ;;
    --apenas-schema) filtro_lista="$(lista_por_filtro 'm["classe"]=="schema"')" || exit 1 ;;
    --com-ddl)
      filtro_lista="$(lista_por_filtro 'm["replaySchema"]')" || exit 1
      ;;
    --schema-gate)
      local lista_schema dump_schema_atual hash_atual hash_esperado
      lista_schema="$(lista_por_filtro 'm["replaySchema"]')" || exit 1
      subir_container schema || exit 1
      bootstrap || { echo "bootstrap falhou" >&2; exit 1; }
      replay "$lista_schema" 0
      imprime_resumo "$lista_schema"
      [[ ${#R_FALHAS[@]} -gt 0 ]] && exit 1
      dump_schema_atual="$(dump_schema)" || exit 1
      hash_atual="$(printf '%s\n' "$dump_schema_atual" | python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())')"
      hash_esperado="$(python3 -c 'import json; print(json.load(open("scripts/audit/schema-replay-substituicoes.json"))["schema_dump_sha256"])')" || exit 1
      if [[ ! "$hash_esperado" =~ ^[a-f0-9]{64}$ ]]; then
        echo "manifesto sem hash canonico; hash medido: $hash_atual" >&2
        exit 1
      fi
      if [[ "$hash_atual" != "$hash_esperado" ]]; then
        echo "schema mudou: esperado $hash_esperado, medido $hash_atual" >&2
        exit 1
      fi
      echo "schema hash : $hash_atual"
      exit 0
      ;;
    --comparar)
      # A prova que a vistoria cobrou: o conjunto com DDL persistente produz o
      # MESMO schema do replay linear completo? Dois containers limpos, dois
      # replays tolerantes, um diff da assinatura inteira.
      local lista_ddl dump_linear dump_ddl
      lista_ddl="$(lista_por_filtro 'm["replaySchema"]')" || exit 1

      subir_container linear || exit 1
      bootstrap || exit 1
      replay "" 1
      echo "linear     : $R_APLICADAS aplicadas, ${#R_FALHAS[@]} falhas"
      dump_linear="$(dump_schema)" || exit 1

      subir_container ddl || exit 1
      bootstrap || exit 1
      replay "$lista_ddl" 1
      echo "com-ddl    : $R_APLICADAS aplicadas, $R_PULADAS puladas, ${#R_FALHAS[@]} falhas"
      dump_ddl="$(dump_schema)" || exit 1

      # O veredito e do comparador canonico (rodada 3 da vistoria): o delta
      # esperado e congelado com lado e conteudo EXATOS em
      # scripts/audit/lib/comparar-dumps.py. Linha inesperada reprova, delta
      # esperado ausente tambem (dumps degenerados ou mista mudou), e definicao
      # alterada da constraint deixa de passar por ter a substring certa.
      # `diff` sai 1 quando ha diferencas, e com pipefail isso contaminaria o
      # pipeline: o RC que interessa e o do comparador, entao o diff roda
      # separado (`|| true` porque diferenca esperada nao e erro do diff).
      local diff_saida veredito rc_comparador
      diff_saida="$(diff <(printf '%s\n' "$dump_linear") <(printf '%s\n' "$dump_ddl") || true)"
      veredito="$(printf '%s\n' "$diff_saida" | python3 scripts/audit/lib/comparar-dumps.py)"
      rc_comparador=$?
      echo "$veredito" | head -45
      if [[ $rc_comparador -ne 0 ]]; then
        echo "schema     : DIVERGE do delta canonico esperado"
        exit 1
      fi
      echo "schema     : EQUIVALENTE (diff de pg_dump linha a linha; deltas canonicos:"
      echo "             candidatos_status_dominio e o contrato exato do Senado,"
      echo "             ambos ausentes do linear por pre-condicao de dado)"
      echo "assinatura : $(printf '%s\n' "$dump_linear" | grep -ac '^CREATE ') CREATEs comparados"
      exit 0
      ;;
    --gate)
      # Gate de CI (rodada 3 da vistoria: o teste estatico de 178 nao mede
      # replay, e FK para tabela inexistente passa como schema/replicavel).
      # Roda o replay linear REAL, tolerante, e compara o conjunto de falhas
      # com o manifesto congelado: falha NOVA reprova em qualquer posicao,
      # inclusive depois da 179a, que o modo estrito nunca alcanca; falha que
      # sumiu exige regenerar o manifesto deliberadamente no mesmo PR.
      subir_container gate || exit 1
      bootstrap || { echo "bootstrap falhou" >&2; exit 1; }
      replay "" 1
      echo "gate       : $R_APLICADAS aplicadas, ${#R_FALHAS[@]} falhas reais"
      # A lista vai por ARQUIVO, nao por stdin: o script do python ja entra por
      # heredoc, e dois usos do mesmo stdin foi exatamente o fail-open que o
      # primeiro teste deste gate pegou (lista vazia = tudo "sumiu").
      local manifesto_rc lista_falhas_tmp
      lista_falhas_tmp="$(mktemp)"
      # A lista vai INTEIRA ("arquivo :: motivo"): ate 02/09/2026 o sed abaixo
      # cortava o motivo antes de o python ler, e o gate reprovava sem dizer
      # por que (o defeito descrito em supabase/migrations-pendentes/README.md).
      # Quem separa nome de motivo e o python, que ja fazia isso.
      printf '%s\n' ${R_FALHAS[@]+"${R_FALHAS[@]}"} > "$lista_falhas_tmp"
      # O total do diretorio entra como ARGUMENTO para o invariante de
      # conservacao abaixo. Contado aqui, no shell, sobre o mesmo diretorio que o
      # replay acabou de percorrer.
      local total_migrations
      total_migrations="$(find "$DIR" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
      python3 - scripts/audit/falhas-replay-linear.json "$R_APLICADAS" "$lista_falhas_tmp" "$total_migrations" <<'PY'
import json, sys
manifesto = json.load(open(sys.argv[1]))
aplicadas = int(sys.argv[2])
esperadas = set(manifesto["falhas"])
linhas_brutas = [l.strip() for l in open(sys.argv[3]) if l.strip()]
reais = {l.partition(" :: ")[0].strip() for l in linhas_brutas}
total = int(sys.argv[4])
novas = sorted(reais - esperadas)
sumiram = sorted(esperadas - reais)
ok = True
if aplicadas < manifesto["aplicadas_esperadas"]:
    print(f"GATE: aplicadas caiu de {manifesto['aplicadas_esperadas']} para {aplicadas}")
    ok = False
# Invariante de conservacao: toda migration do diretorio ou aplicou ou falhou,
# uma vez so. Ele existe porque os dois numeros do relatorio eram conferidos
# SEPARADAMENTE, e nenhum dos dois enxergava migration PULADA: um filtro que
# deixasse arquivos de fora sairia como "291 aplicadas, 86 falhas" com o total em
# 400, e o gate aprovaria. `len(reais)` e o conjunto DEDUPLICADO, entao arquivo
# contado duas vezes tambem quebra a soma em vez de inflar o placar.
if aplicadas + len(reais) != total:
    print(
        f"GATE: conservacao quebrada: {aplicadas} aplicadas + {len(reais)} falhas unicas "
        f"= {aplicadas + len(reais)}, mas o diretorio tem {total} migrations"
    )
    ok = False
else:
    print(f"GATE: conservacao OK: {aplicadas} + {len(reais)} = {total} migrations")
# Falha repetida na lista bruta indicaria arquivo replayado duas vezes, e a
# deduplicacao acima esconderia isso da soma.
brutas = [l.partition(" :: ")[0].strip() for l in linhas_brutas]
if len(brutas) != len(reais):
    print(f"GATE: {len(brutas) - len(reais)} falha(s) repetida(s) na lista bruta do replay")
    ok = False
# A lista bruta guarda "arquivo :: ERROR: ...", mas ate 17/08/2026 o gate
# imprimia so o nome. Quem lia o log via QUE reprovou e nao POR QUE, e tinha
# que reproduzir o replay inteiro para descobrir. O erro ja estava na mao.
motivo_de = {}
for linha in linhas_brutas:
    nome, _, erro = linha.partition(" :: ")
    if erro:
        motivo_de.setdefault(nome.strip(), erro.strip())
for n in novas:
    print(f"GATE: falha NOVA de replay: {n}")
    if motivo_de.get(n):
        print(f"       motivo: {motivo_de[n]}")
    ok = False
for s in sumiram:
    print(f"GATE: falha sumiu sem regenerar o manifesto: {s}")
    ok = False
print("GATE: conjunto de falhas reais bate com o manifesto" if ok else "GATE: REPROVADO")
sys.exit(0 if ok else 1)
PY
      manifesto_rc=$?
      rm -f "$lista_falhas_tmp"
      exit $manifesto_rc
      ;;
    *) echo "modo desconhecido: $MODO" >&2; exit 2 ;;
  esac

  subir_container run || exit 1
  bootstrap || { echo "bootstrap falhou" >&2; exit 1; }
  replay "$filtro_lista" "$TOLERANTE"
  imprime_resumo "$filtro_lista"

  # Fail-closed: replay com falha nunca sai 0, nem no modo tolerante. Quem quer
  # so a medicao le o resumo; o codigo de saida e para maquina, e maquina nao
  # pode confundir "medi 178" com "esta tudo bem".
  [[ ${#R_FALHAS[@]} -gt 0 ]] && exit 1
  exit 0
}

main
