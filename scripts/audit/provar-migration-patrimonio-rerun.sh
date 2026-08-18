#!/usr/bin/env bash
#
# Prova EXECUTAVEL da 20260810093000 e do rollback dela, em Postgres 17 efemero.
#
# Mesma razao das provar-migration-b2.sh e provar-migration-trilha-a.sh: asserção
# sobre TEXTO de SQL nao pega guard que nao dispara, e um no-op BEM-SUCEDIDO e
# exatamente o modo de falha caro aqui (grava a versao no ledger e deixa fichas
# com bens omitidos ou ausencia sem evidencia).
#
# O que precisa ser provado sao as 21 operacoes e os guards que decidem se elas
# acontecem: 10 INSERT em `patrimonio`, 1 UPDATE em `patrimonio` (priscila-voigt)
# e 10 DELETE em `patrimonio_ausencia_oficial`.
#
# Nove ramos. Qualquer divergencia sai RC=1.
#
#   F0 base vazia              -> NO-OP com rc 0 (replay linear em Postgres vazio)
#   F1 coorte parcial (12 de 13) -> ABORTA, nada escrito
#   F2 SQ divergente na ausencia -> ABORTA (par (slug, SQ) nao casa)
#   F3 ficha ja com patrimonio 2026 -> ABORTA (reaplicacao ou escrita posterior)
#   F4 priscila-voigt fora da composicao de 07/08 -> ABORTA
#   F5 estado real de producao -> aplica as 21; readback por contagem e por ficha
#   F6 reaplicar sobre F5      -> ABORTA no guard 2
#   R1 rollback sobre F5       -> restaura tudo, e apaga a linha do ledger
#   R2 rollback com curadoria posterior -> ABORTA e nao destroi o valor novo
#
# ESCOPO: a semantica dos guards e a cardinalidade das escritas. Fidelidade de
# schema e do `audit:migrations:replay --gate`; aqui as tabelas sao minimas de
# proposito, com as colunas e a UNIQUE que os statements de fato usam.
#
# Uso: bash scripts/audit/provar-migration-patrimonio-rerun.sh
set -uo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSAO="20260810093000"
FWD="supabase/migrations/${VERSAO}_rerun_patrimonio_2026_tse_publicou.sql"
RBK="supabase/rollback/${VERSAO}_rerun_patrimonio_2026_tse_publicou.rollback.sql"
READBACK="supabase/readback/${VERSAO}_rerun_patrimonio_2026_tse_publicou.readback.sql"

# As 10 fichas com bens no pacote atual.
PUBLICOU=(
  "andre-marinho:190002537524"
  "cleber-rabelo:140002538631"
  "efraim-filho:150002538692"
  "geraldo-carvalho:180002537422"
  "ivan-moraes:170002538097"
  "joao-campos:170002537230"
  "joel-rodrigues:180002538530"
  "raquel-lyra:170002537227"
  "jose-estevao:50002536579"
  "samara-mineiro:70002537111"
)
# As 8 ausencias contraditas por bens e removidas junto aos INSERT.
AUSENCIAS_PUBLICOU=("${PUBLICOU[@]:0:8}")
# As 2 ausencias sem ST_DECLARAR_BENS = N, removidas sem inserir patrimonio.
SEM_EVIDENCIA=(
  "dr-luisinho:10002533539"
  "preta-lu:100002534191"
)
# As 3 linhas legadas fora deste delta.
INTACTAS=(
  "gilberto-vasconcelos:40002535267"
  "luciana-gurgel:30002530015"
  "vera-lucia:250002536915"
)
BENS_PRISCILA_ANTES='[{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO","valor":1000}]'
FONTE_PRISCILA_ANTES='TSE Dados Abertos bem_candidato_2026 SQ 210002533355 (total agregado, snapshot 2026-08-04)'

for arquivo in "$FWD" "$RBK" "$READBACK"; do
  [[ -f "$arquivo" ]] || { echo "FAIL: $arquivo nao existe"; exit 1; }
done

C="pf-patrimonio-rerun-$$"
limpar() { docker rm -f "$C" >/dev/null 2>&1; }
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
igual(){ if [[ "$2" == "$3" ]]; then ok "$1 ($2)"; else nok "$1: esperado '$3', observado '$2'"; fi }
rodar(){ local saida rc; saida="$(aplicar < "$1" 2>&1)"; rc=$?; printf '%s|%s' "$rc" "$saida"; }
aborta(){
  # aborta <rotulo> <arquivo> <trecho esperado na mensagem>
  local r rc saida
  r="$(rodar "$2")"; rc="${r%%|*}"; saida="${r#*|}"
  if [[ "$rc" != 0 ]] && grep -q "$3" <<<"$saida"; then
    ok "$1 abortou ($3)"
  else
    nok "$1 nao abortou como esperado (rc=$rc): $(tr '\n' ' ' <<<"$saida" | cut -c1-220)"
  fi
}

q <<'SQL' >/dev/null
create extension if not exists "pgcrypto";
create schema if not exists supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key, name text);
create table public.candidatos(
  id uuid primary key default gen_random_uuid(),
  slug text unique not null
);
create table public.patrimonio(
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid references public.candidatos(id) on delete cascade,
  ano_eleicao integer not null,
  valor_total numeric(15, 2),
  bens jsonb,
  fonte text default 'TSE',
  created_at timestamptz default now()
);
create table public.patrimonio_ausencia_oficial(
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  ano_eleicao integer not null,
  sq_candidato text not null,
  fonte_url text,
  verificado_em timestamptz,
  detalhe text,
  execucao text not null default 'A2B-ausencias-oficiais-20260807',
  created_at timestamptz default now(),
  unique (candidato_id, ano_eleicao)
);
SQL

zerar() {
  q -c "delete from public.patrimonio; delete from public.patrimonio_ausencia_oficial;
        delete from public.candidatos; delete from supabase_migrations.schema_migrations;" >/dev/null
}
ficha()   { q -c "insert into public.candidatos(slug) values ('$1');" >/dev/null; }
ausencia(){
  q -c "insert into public.patrimonio_ausencia_oficial(candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
        select id, 2026, '$2',
               'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip',
               '2026-08-07T18:27:03.374Z'::timestamptz,
               'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
          from public.candidatos where slug='$1';" >/dev/null
}
priscila_aplicada() {
  q -c "insert into public.patrimonio(candidato_id, ano_eleicao, valor_total, bens, fonte)
        select id, 2026, 1000.00, \$j\$${BENS_PRISCILA_ANTES}\$j\$::jsonb, \$f\$${FONTE_PRISCILA_ANTES}\$f\$
          from public.candidatos where slug='priscila-voigt';" >/dev/null
}

# Readbacks. Sao as mesmas perguntas que a Raiz fara em producao depois do apply.
com_patrimonio_2026() {
  q -c "select count(*) from public.patrimonio p join public.candidatos c on c.id=p.candidato_id
        where p.ano_eleicao=2026 and c.slug in ('andre-marinho','cleber-rabelo','efraim-filho','geraldo-carvalho','ivan-moraes','joao-campos','joel-rodrigues','raquel-lyra','jose-estevao','samara-mineiro');"
}
ausencias_das_oito() {
  q -c "select count(*) from public.patrimonio_ausencia_oficial a join public.candidatos c on c.id=a.candidato_id
        where a.ano_eleicao=2026 and c.slug in ('andre-marinho','cleber-rabelo','efraim-filho','geraldo-carvalho','ivan-moraes','joao-campos','joel-rodrigues','raquel-lyra');"
}
ausencias_a_corrigir() {
  q -c "select count(*) from public.patrimonio_ausencia_oficial a join public.candidatos c on c.id=a.candidato_id
        where a.ano_eleicao=2026 and c.slug in ('andre-marinho','cleber-rabelo','efraim-filho','geraldo-carvalho','ivan-moraes','joao-campos','joel-rodrigues','raquel-lyra','dr-luisinho','preta-lu');"
}
ausencias_intactas() {
  q -c "select count(*) from public.patrimonio_ausencia_oficial a join public.candidatos c on c.id=a.candidato_id
        where a.ano_eleicao=2026 and c.slug in ('gilberto-vasconcelos','luciana-gurgel','vera-lucia');"
}
nao_coletados() {
  q -c "select count(*) from public.candidatos c
        where c.slug in ('dr-luisinho','preta-lu')
          and not exists (select 1 from public.patrimonio p where p.candidato_id=c.id and p.ano_eleicao=2026)
          and not exists (select 1 from public.patrimonio_ausencia_oficial a where a.candidato_id=c.id and a.ano_eleicao=2026);"
}
priscila_tipo() {
  q -c "select coalesce((select p.bens->0->>'tipo' from public.patrimonio p join public.candidatos c on c.id=p.candidato_id
        where c.slug='priscila-voigt' and p.ano_eleicao=2026),'<ausente>');"
}
valor_de() {
  q -c "select coalesce((select p.valor_total::text from public.patrimonio p join public.candidatos c on c.id=p.candidato_id
        where c.slug='$1' and p.ano_eleicao=2026),'<ausente>');"
}
n_bens_de() {
  q -c "select coalesce((select jsonb_array_length(p.bens)::text from public.patrimonio p join public.candidatos c on c.id=p.candidato_id
        where c.slug='$1' and p.ano_eleicao=2026),'<ausente>');"
}
sq_ausencia_de() {
  q -c "select coalesce((select a.sq_candidato from public.patrimonio_ausencia_oficial a join public.candidatos c on c.id=a.candidato_id
        where c.slug='$1' and a.ano_eleicao=2026),'<ausente>');"
}
ledger() { q -c "select count(*) from supabase_migrations.schema_migrations where version='${VERSAO}';"; }

# Estado equivalente ao de producao, lido em 10/08/2026.
producao() {
  zerar
  ficha priscila-voigt
  for par in "${PUBLICOU[@]}" "${SEM_EVIDENCIA[@]}" "${INTACTAS[@]}"; do
    ficha "${par%%:*}"
  done
  for par in "${AUSENCIAS_PUBLICOU[@]}" "${SEM_EVIDENCIA[@]}" "${INTACTAS[@]}"; do
    ausencia "${par%%:*}" "${par##*:}"
  done
  priscila_aplicada
}

echo "== forward"

echo "F0 base vazia -> no-op com rc 0 (replay linear)"
zerar
r="$(rodar "$FWD")"; rc="${r%%|*}"; saida="${r#*|}"
igual "F0 rc" "$rc" "0"
if grep -q "nenhuma das 13 fichas existe" <<<"$saida"; then
  ok "F0 disse em voz alta que virou no-op"
else
  nok "F0 nao emitiu o NOTICE do no-op: $(tr '\n' ' ' <<<"$saida" | cut -c1-220)"
fi
igual "F0 nada escrito em patrimonio" "$(q -c 'select count(*) from public.patrimonio;')" "0"

echo "F1 coorte parcial (12 de 13) -> aborta"
producao
q -c "delete from public.candidatos where slug='raquel-lyra';" >/dev/null
aborta "F1" "$FWD" "coorte parcial"
igual "F1 nada escrito" "$(com_patrimonio_2026)" "0"

echo "F2 SQ divergente na ausencia -> aborta"
producao
q -c "update public.patrimonio_ausencia_oficial a set sq_candidato='999999999999'
      from public.candidatos c where c.id=a.candidato_id and c.slug='joao-campos';" >/dev/null
aborta "F2" "$FWD" "de 10 linhas de ausencia"
igual "F2 nada escrito" "$(com_patrimonio_2026)" "0"
igual "F2 linhas de ausencia intactas" "$(ausencias_a_corrigir)" "10"
igual "F2 SQ divergente preservado" "$(sq_ausencia_de joao-campos)" "999999999999"

echo "F3 ficha ja com patrimonio 2026 -> aborta"
producao
q -c "insert into public.patrimonio(candidato_id, ano_eleicao, valor_total, bens, fonte)
      select id, 2026, 1.00, '[]'::jsonb, 'curadoria posterior' from public.candidatos where slug='ivan-moraes';" >/dev/null
aborta "F3" "$FWD" "ja tem patrimonio de 2026"
igual "F3 a linha posterior sobreviveu" "$(valor_de ivan-moraes)" "1.00"

echo "F4 priscila-voigt fora da composicao de 07/08 -> aborta"
producao
q -c "update public.patrimonio p set valor_total=2500.00
      from public.candidatos c where c.id=p.candidato_id and c.slug='priscila-voigt';" >/dev/null
aborta "F4" "$FWD" "nao esta na composicao aplicada em 07/08"
igual "F4 valor curado preservado" "$(valor_de priscila-voigt)" "2500.00"
igual "F4 nada inserido" "$(com_patrimonio_2026)" "0"

echo "F5 estado de producao -> aplica as 21 operacoes"
producao
igual "F5 ANTES: patrimonio 2026 das 10" "$(com_patrimonio_2026)" "0"
igual "F5 ANTES: ausencias a corrigir" "$(ausencias_a_corrigir)" "10"
igual "F5 ANTES: priscila tipo" "$(priscila_tipo)" "Dinheiro em espécie - moeda nacional"
r="$(rodar "$FWD")"; rc="${r%%|*}"; saida="${r#*|}"
igual "F5 rc" "$rc" "0"
[[ "$rc" == 0 ]] || echo "       saida: $(tr '\n' ' ' <<<"$saida" | cut -c1-300)"
igual "F5 DEPOIS: 10 INSERT em patrimonio" "$(com_patrimonio_2026)" "10"
igual "F5 DEPOIS: 10 DELETE em patrimonio_ausencia_oficial" "$(ausencias_a_corrigir)" "0"
igual "F5 DEPOIS: 1 UPDATE em priscila-voigt" "$(priscila_tipo)" "Depósito bancário em conta corrente no País"
igual "F5 as 3 linhas legadas fora do delta seguem de pe" "$(ausencias_intactas)" "3"
igual "F5 dr-luisinho e preta-lu ficam nao_coletado" "$(nao_coletados)" "2"
igual "F5 jose-estevao valor_total" "$(valor_de jose-estevao)" "600000.00"
igual "F5 jose-estevao n_bens" "$(n_bens_de jose-estevao)" "1"
igual "F5 samara-mineiro valor_total" "$(valor_de samara-mineiro)" "69196.63"
igual "F5 samara-mineiro n_bens" "$(n_bens_de samara-mineiro)" "2"
igual "F5 joao-campos valor_total" "$(valor_de joao-campos)" "2892723.46"
igual "F5 joao-campos n_bens" "$(n_bens_de joao-campos)" "5"
igual "F5 joel-rodrigues n_bens" "$(n_bens_de joel-rodrigues)" "10"
igual "F5 cleber-rabelo valor_total" "$(valor_de cleber-rabelo)" "52292.00"
igual "F5 priscila-voigt valor_total inalterado" "$(valor_de priscila-voigt)" "1000.00"
igual "F5 total de linhas de patrimonio" "$(q -c 'select count(*) from public.patrimonio;')" "11"
q -c "insert into supabase_migrations.schema_migrations values ('${VERSAO}','rerun_patrimonio_2026_tse_publicou');" >/dev/null
aplicar < "$READBACK" >/dev/null || { echo "FAIL F5 readback operacional"; exit 1; }
ok "F5 readback operacional com ledger"
q -c "update public.patrimonio p set fonte=fonte||' adulterado' from public.candidatos c where c.id=p.candidato_id and c.slug='andre-marinho' and p.ano_eleicao=2026" >/dev/null
aborta "F5 readback com payload adulterado" "$READBACK" "assinatura_payload"
igual "F5 mutacao preservada" "$(q -c "select count(*) from public.patrimonio p join public.candidatos c on c.id=p.candidato_id where c.slug='andre-marinho' and p.fonte like '% adulterado'")" "1"
igual "F5 ledger preservado" "$(ledger)" "1"
q -c "update public.patrimonio p set fonte=regexp_replace(fonte,' adulterado$','') from public.candidatos c where c.id=p.candidato_id and c.slug='andre-marinho' and p.ano_eleicao=2026" >/dev/null
aplicar < "$READBACK" >/dev/null || { echo "FAIL F5 readback restaurado"; exit 1; }
q -c "insert into public.patrimonio_ausencia_oficial(candidato_id,ano_eleicao,sq_candidato,execucao) select id,2026,'concorrente','posterior' from public.candidatos where slug='andre-marinho'" >/dev/null
aborta "F5 readback com ausencia concorrente" "$READBACK" "publicados_com_ausencia"
igual "F5 ausencia concorrente preservada" "$(q -c "select count(*) from public.patrimonio_ausencia_oficial a join public.candidatos c on c.id=a.candidato_id where c.slug='andre-marinho' and a.ano_eleicao=2026")" "1"
q -c "delete from public.patrimonio_ausencia_oficial where execucao='posterior'" >/dev/null
aplicar < "$READBACK" >/dev/null || { echo "FAIL F5 readback sem ausencia concorrente"; exit 1; }

# Depois de aplicada, quem barra a reaplicacao e o guard 1, nao o 2: as 10
# ausencias ja foram removidas, entao o par (slug, SQ) nao casa mais e a
# execucao morre antes de chegar ao guard de patrimonio. O guard 2 continua
# sendo exercitado, em F3, sobre o caso em que so o patrimonio existe.
echo "F6 reaplicar sobre F5 -> aborta"
aborta "F6" "$FWD" "de 10 linhas de ausencia"
igual "F6 estado preservado" "$(com_patrimonio_2026)" "10"

echo "== rollback"

echo "R1 rollback sobre F5 -> restaura"
igual "R1 ledger ANTES" "$(ledger)" "1"
r="$(rodar "$RBK")"; rc="${r%%|*}"; saida="${r#*|}"
igual "R1 rc" "$rc" "0"
[[ "$rc" == 0 ]] || echo "       saida: $(tr '\n' ' ' <<<"$saida" | cut -c1-300)"
igual "R1 patrimonio 2026 das 10 de volta a zero" "$(com_patrimonio_2026)" "0"
igual "R1 ausencias 2026 das 8 restauradas" "$(ausencias_das_oito)" "8"
igual "R1 SQ restaurado (joao-campos)" "$(sq_ausencia_de joao-campos)" "170002537230"
igual "R1 priscila-voigt de volta" "$(priscila_tipo)" "Dinheiro em espécie - moeda nacional"
igual "R1 as 3 linhas legadas fora do delta seguem 3" "$(ausencias_intactas)" "3"
igual "R1 dr-luisinho e preta-lu continuam nao_coletado" "$(nao_coletados)" "2"
igual "R1 ledger DEPOIS" "$(ledger)" "0"

echo "R2 curadoria posterior -> aborta e nao destroi"
producao
rodar "$FWD" >/dev/null
q -c "update public.patrimonio p set bens='[{\"tipo\":\"Casa\",\"descricao\":\"CURADORIA POSTERIOR\",\"valor\":1}]'::jsonb, valor_total=1.00
      from public.candidatos c where c.id=p.candidato_id and c.slug='joao-campos' and p.ano_eleicao=2026;" >/dev/null
aborta "R2" "$RBK" "de 10 linhas de patrimonio 2026 ainda na composicao aplicada"
igual "R2 valor curado preservado" "$(valor_de joao-campos)" "1.00"
igual "R2 nada restaurado por engano" "$(ausencias_das_oito)" "0"

echo
if [[ "$FALHAS" -eq 0 ]]; then
  echo "OK: 9 ramos, todos como esperado."
  exit 0
fi
echo "FALHOU: $FALHAS verificacao(oes)."
exit 1
