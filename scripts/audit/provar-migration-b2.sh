#!/usr/bin/env bash
#
# Prova EXECUTAVEL da 20260809070000 e do rollback dela, em Postgres 17 efemero.
#
# Existe porque os testes estaticos de `tests/verificacao-campos-b2-cleber-gilberto-migration.test.ts`
# ficavam verdes com dois defeitos reais dentro do arquivo, achados na revisao de
# 09/08/2026: presenca parcial da coorte virava no-op BEM-SUCEDIDO (a versao
# entraria no ledger deixando a outra ficha sem correcao), e o `jsonb ||`
# rebaixava uma verificacao mais nova para `2026-08-06`. Asserção sobre TEXTO de
# SQL nao pega nenhum dos dois: quem pega e o Postgres.
#
# Oito ramos, todos fail-closed. Qualquer divergencia sai RC=1.
#
#   F1 nenhuma ficha           -> no-op silencioso, sem erro
#   F2 UMA ficha so            -> ABORTA (presenca parcial)
#   F3 identidade divergente   -> ABORTA
#   F4 as duas, identidade ok  -> aplica, jsonb exato nas duas
#   F5 reaplicacao             -> idempotente, jsonb inalterado
#   F6 data mais nova gravada  -> ABORTA e nao rebaixa
#   R1 rollback com data nova  -> ABORTA e nao destroi nada
#   R2 rollback no estado F4   -> remove as 3 chaves e a linha do ledger
#
# ESCOPO desta prova: a SEMANTICA dos guards. A fidelidade de schema (a coluna,
# o privilegio e a view) e provada por `audit:migrations:replay --gate`, que
# aplica a fila real; aqui a tabela e minima de proposito, com as colunas que a
# migration le e escreve, para o harness rodar em segundos e nao virar o gate que
# ninguem espera terminar.
#
# Custo zero e sem risco: container proprio com nome unico, imagem presa por
# digest (a mesma do replay), trap remove so o que esta execucao criou, nunca
# toca producao.
#
# Uso: npm run audit:b2:provar
set -uo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
FWD="supabase/migrations/20260809070000_verificacao_campos_b2_cleber_gilberto.sql"
RBK="supabase/rollback/20260809070000_verificacao_campos_b2_cleber_gilberto.rollback.sql"
READBACK="supabase/readback/20260809070000_verificacao_campos_b2_cleber_gilberto.readback.sql"
ESPERADO='{"social_networks": "2026-08-06", "candidate_complement": "2026-08-06", "candidate_registration": "2026-08-06"}'

for arquivo in "$FWD" "$RBK" "$READBACK"; do
  [[ -f "$arquivo" ]] || { echo "FAIL: $arquivo nao existe"; exit 1; }
done

C="pf-b2-$$"
CRIADOS=("$C")
limpar() { for c in "${CRIADOS[@]}"; do docker rm -f "$c" >/dev/null 2>&1; done; }
trap limpar EXIT INT TERM

docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null || {
  echo "FAIL: docker nao subiu o container"; exit 1; }
pronto=0
for _ in $(seq 1 90); do
  if docker exec "$C" psql -U postgres -h 127.0.0.1 -d postgres -tAc 'select 1' >/dev/null 2>&1; then
    pronto=1; break
  fi
  sleep 1
done
[[ "$pronto" == 1 ]] || { echo "FAIL: postgres nao ficou pronto"; exit 1; }

q()      { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
aplicar(){ docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q --single-transaction -f - ; }

FALHAS=0
ok()   { echo "  PASS  $1"; }
nok()  { echo "  FAIL  $1"; FALHAS=$((FALHAS + 1)); }
# Compara valor observado com esperado. Diferenca e falha, nunca aviso.
igual(){ if [[ "$2" == "$3" ]]; then ok "$1 ($2)"; else nok "$1: esperado '$3', observado '$2'"; fi }
# Roda o arquivo e devolve "RC|saida" para o ramo julgar as duas coisas.
rodar(){ local saida rc; saida="$(aplicar < "$1" 2>&1)"; rc=$?; printf '%s|%s' "$rc" "$saida"; }

q <<'SQL' >/dev/null
create schema if not exists supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key, name text);
create table public.candidatos(
  slug text primary key,
  cargo_disputado text,
  estado text,
  partido_sigla text,
  verificacao_campos jsonb not null default '{}'::jsonb
);
SQL

zerar() {
  q -c "delete from public.candidatos;" >/dev/null
  q -c "delete from supabase_migrations.schema_migrations;" >/dev/null
}
inserir() {
  local vc="${3-}"
  [[ -z "$vc" ]] && vc='{}'
  q -c "insert into public.candidatos values ('$1','Governador','$2','PSTU','$vc'::jsonb);" >/dev/null
}
jsonb_de() { q -c "select coalesce((select verificacao_campos::text from public.candidatos where slug='$1'),'<ausente>');"; }

echo "== forward"

echo "F1 nenhuma ficha -> no-op"
zerar
r="$(rodar "$FWD")"
igual "F1 rc" "${r%%|*}" "0"

echo "F2 uma ficha so -> aborta"
zerar; inserir cleber-rabelo PA
r="$(rodar "$FWD")"; rc="${r%%|*}"; saida="${r#*|}"
if [[ "$rc" != 0 ]] && grep -q "presenca parcial" <<<"$saida"; then
  ok "F2 abortou por presenca parcial"
else
  nok "F2 nao abortou (rc=$rc): $(tr '\n' ' ' <<<"$saida" | cut -c1-160)"
fi
igual "F2 ficha intacta" "$(jsonb_de cleber-rabelo)" "{}"

echo "F3 identidade divergente -> aborta"
zerar; inserir cleber-rabelo PA; inserir gilberto-vasconcelos RR
r="$(rodar "$FWD")"; rc="${r%%|*}"; saida="${r#*|}"
if [[ "$rc" != 0 ]] && grep -q "identidade divergente" <<<"$saida"; then
  ok "F3 abortou por identidade"
else
  nok "F3 nao abortou (rc=$rc): $(tr '\n' ' ' <<<"$saida" | cut -c1-160)"
fi
igual "F3 ficha intacta" "$(jsonb_de gilberto-vasconcelos)" "{}"

echo "F4 identidade correta -> aplica"
zerar; inserir cleber-rabelo PA; inserir gilberto-vasconcelos AM
r="$(rodar "$FWD")"
igual "F4 rc" "${r%%|*}" "0"
igual "F4 cleber"   "$(jsonb_de cleber-rabelo)"        "$ESPERADO"
igual "F4 gilberto" "$(jsonb_de gilberto-vasconcelos)" "$ESPERADO"
q -c "insert into supabase_migrations.schema_migrations values ('20260809070000','verificacao_campos_b2_cleber_gilberto');" >/dev/null
r="$(rodar "$READBACK")"
igual "F4 readback pos-commit" "${r%%|*}" "0"

echo "F5 reaplicacao -> idempotente"
r="$(rodar "$FWD")"
igual "F5 rc" "${r%%|*}" "0"
igual "F5 cleber inalterado" "$(jsonb_de cleber-rabelo)" "$ESPERADO"

echo "F6 verificacao mais nova -> aborta sem rebaixar"
zerar
inserir cleber-rabelo PA '{"social_networks":"2026-09-01"}'
inserir gilberto-vasconcelos AM
r="$(rodar "$FWD")"; rc="${r%%|*}"; saida="${r#*|}"
if [[ "$rc" != 0 ]] && grep -q "rebaixaria verificacao existente" <<<"$saida"; then
  ok "F6 abortou por regressao de data"
else
  nok "F6 nao abortou (rc=$rc): $(tr '\n' ' ' <<<"$saida" | cut -c1-160)"
fi
igual "F6 data nova preservada" \
  "$(q -c "select verificacao_campos ->> 'social_networks' from public.candidatos where slug='cleber-rabelo';")" \
  "2026-09-01"
igual "F6 par nao materializado" "$(jsonb_de gilberto-vasconcelos)" "{}"

echo "== rollback"

echo "R1 rollback com data mais nova -> aborta"
zerar
inserir cleber-rabelo PA '{"social_networks":"2026-09-01"}'
inserir gilberto-vasconcelos AM "$ESPERADO"
q -c "insert into supabase_migrations.schema_migrations values ('20260809070000','verificacao_campos_b2_cleber_gilberto');" >/dev/null
r="$(rodar "$RBK")"; rc="${r%%|*}"; saida="${r#*|}"
if [[ "$rc" != 0 ]] && grep -q "rollback abortado" <<<"$saida"; then
  ok "R1 abortou"
else
  nok "R1 nao abortou (rc=$rc): $(tr '\n' ' ' <<<"$saida" | cut -c1-160)"
fi
igual "R1 nada destruido" "$(jsonb_de gilberto-vasconcelos)" "$ESPERADO"
igual "R1 ledger intacto" \
  "$(q -c "select count(*) from supabase_migrations.schema_migrations where version='20260809070000';")" "1"

echo "R2 rollback no estado da forward -> desfaz tudo"
zerar
inserir cleber-rabelo PA "$ESPERADO"
inserir gilberto-vasconcelos AM "$ESPERADO"
q -c "insert into supabase_migrations.schema_migrations values ('20260809070000','verificacao_campos_b2_cleber_gilberto');" >/dev/null
r="$(rodar "$RBK")"
igual "R2 rc" "${r%%|*}" "0"
igual "R2 cleber"   "$(jsonb_de cleber-rabelo)"        "{}"
igual "R2 gilberto" "$(jsonb_de gilberto-vasconcelos)" "{}"
igual "R2 ledger reconciliado" \
  "$(q -c "select count(*) from supabase_migrations.schema_migrations where version='20260809070000';")" "0"

echo
if [[ "$FALHAS" -gt 0 ]]; then
  echo "GATE B2: $FALHAS asserção(ões) falharam"
  exit 1
fi
echo "GATE B2: 8 ramos, todas as asserções passaram"
