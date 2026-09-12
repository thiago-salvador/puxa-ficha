#!/usr/bin/env bash
# Schema real PG17; mutações confinadas ao container descartável.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
CONTAINER=''
R_APLICADAS=0
source scripts/audit/replay-migrations.sh
set -euo pipefail
subir_container vice-status
bootstrap
schema_files="$(lista_por_filtro 'm["replaySchema"] and m["arquivo"] < "20260912160000"')"
replay "$schema_files" 0
if [[ ${#R_FALHAS[@]} -ne 0 ]]; then printf '%s\n' "${R_FALHAS[@]}" >&2; exit 1; fi
echo "PASS: schema real PG17, $R_APLICADAS migrations anteriores."
q() { docker exec -i "$CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
expect_sql_error() {
  local output code
  if output="$(q -q 2>&1)"; then echo "FAIL: SQL deveria recusar: $1" >&2; exit 1; else code=$?; fi
  if [[ "$code" -ne 3 || "$output" != *"$1"* ]]; then printf 'FAIL: erro inesperado %s\n%s\n' "$code" "$output" >&2; exit 1; fi
}
reject() { printf '%s\n' "$1" | expect_sql_error "$2"; }
SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
compose() { node --import tsx scripts/audit/apply-vice-status.ts "$1" "$SHA"; }
digest="$(node -e "const fs=require('fs'),c=require('crypto');process.stdout.write('sha256:'+c.createHash('sha256').update(fs.readFileSync('supabase/migrations/20260908160000_verified_candidate_updates.sql')).digest('hex'))")"
q -q <<SQL
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text,created_by text,idempotency_key text,rollback text[]);
INSERT INTO supabase_migrations.schema_migrations(version,idempotency_key) VALUES ('20260908160000','$digest');
-- Grant observado no projeto Supabase, além do replay estrutural local.
GRANT ALL ON public.chapas_2026_publico TO service_role;
INSERT INTO public.candidatos(id,slug,nome_completo,nome_urna,partido_atual,partido_sigla,cargo_disputado,estado,sq_candidato_2026,publicavel,status,situacao_candidatura,foto_url,biografia,naturalidade,data_nascimento,formacao,profissao_declarada,genero,estado_civil,cor_raca,verificacao_campos)
VALUES ('00000000-0000-4000-8000-000000000123','clebio-genuino','JOSE CLEBIO GENUINO DO NASCIMENTO','CLÉBIO GENUÍNO','PCO','PCO','Governador','RR','230002553857',true,'candidato','aguardando julgamento','https://example.test/fixture.jpg','Fixture técnica PG17','Fixture','1970-01-01','Fixture','Fixture','Fixture','Fixture','Fixture','{"candidate_registration":{},"candidate_complement":{}}');
INSERT INTO public.chapas_2026(chave,eleicao_codigo,eleicao_data,uf,cargo_titular,sq_coligacao,identidade_status,vinculo_titular_status,tse_situacao_codigo,tse_situacao_titular_codigo,tse_situacao_vice_codigo,tipo_agremiacao,composicao,titular_candidato_id,titular_sq_candidato,vice_sq_candidato,titular_nome_completo,titular_nome_urna,titular_partido_sigla,vice_nome_completo,vice_nome_urna,vice_partido_sigla,fonte_url,fonte_sha256,snapshot_em)
VALUES ('2026:RR:jose-clebio-genuino-do-nascimento','6259','2026-10-04','RR','Governador','230001801451','confirmada','confirmado','-3','-3','-3','PARTIDO ISOLADO','PCO','00000000-0000-4000-8000-000000000123','230002553857','230002554442','JOSE CLEBIO GENUINO DO NASCIMENTO','CLÉBIO GENUÍNO','PCO','fixture vice','JOTA RODRIGUES','PCO','https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip','342852c06b645fa90f4bc767153b497995ead648542d04059ccf14fb745c25d8','2026-09-12T15:20:12.954Z');
SQL
schema_before="$(dump_schema)"
rows_before="$(q -Atqc "select md5(string_agg(to_jsonb(ch)::text,'' order by id)) from public.chapas_2026 ch")"
compose dry-run | q -q
if [[ "$(dump_schema)" != "$schema_before" ]]; then echo 'FAIL: dry-run mudou schema' >&2; exit 1; fi
compose apply | q -q
compose verify | q -q
compose apply | expect_sql_error 'vice-status: ledger or digest drift'
# Production-state ACL regression: the two vice migrations are already in the ledger.
node --import tsx scripts/audit/apply-chapas-public-grants.ts apply "$SHA" | q -q
node --import tsx scripts/audit/apply-chapas-public-grants.ts verify "$SHA" | q -q
q -q < supabase/rollback/20260912160200_grant_chapas_publico_columns.rollback.sql
if [[ "$(q -Atqc "select count(*) from supabase_migrations.schema_migrations where version in ('20260912160000','20260912160100')")" != 2 ]]; then echo 'FAIL: ACL rollback removed prior ledger entries' >&2; exit 1; fi
echo 'PASS PG17: ACL driver forward/readback/rollback preserves vice ledger'
for key in domain situacao_vice status titular_sq_candidato vice_sq_candidato vice_nome_urna vice_partido_sigla uf source_url source_sha256 checked_at; do
  reject "UPDATE public.chapas_2026 SET vice_situacao_divulgacand=vice_situacao_divulgacand-'$key';" 'violates check constraint "chapas_2026_vice_situacao_divulgacand_check"'
done
for patch in '{"domain":"consulta_cand"}' '{"situacao_vice":1}' '{"source_url":"https://example.test"}' '{"vice_sq_candidato":"999"}' '{"checked_at":"infinity"}' '{"source_sha256":"bad"}' '{"cpf":"fixture"}' '{"raw":{}}'; do
  reject "UPDATE public.chapas_2026 SET vice_situacao_divulgacand=vice_situacao_divulgacand||'$patch'::jsonb;" 'violates check constraint "chapas_2026_vice_situacao_divulgacand_check"'
done
reject "UPDATE public.chapas_2026 SET tse_situacao_vice_codigo=NULL;" 'violates check constraint "chapas_2026_fonte_legado_check"'
reject "UPDATE public.chapas_2026 SET vice_sq_candidato='999';" 'violates check constraint "chapas_2026_vice_situacao_divulgacand_check"'
q -q < supabase/rollback/20260912160100_chapas_rr_vice_inapto.rollback.sql
# Uma dependência desconhecida bloqueia rollback estrutural sem removê-la.
q -q -c 'CREATE VIEW public.fixture_vice_dependency AS SELECT vice_situacao_divulgacand FROM public.chapas_2026_publico'
expect_sql_error 'cannot drop view chapas_2026_publico because other objects depend on it' < supabase/rollback/20260912160000_chapas_vice_situacao_divulgacand.rollback.sql
q -q -c 'DROP VIEW public.fixture_vice_dependency'
q -q < supabase/rollback/20260912160000_chapas_vice_situacao_divulgacand.rollback.sql
if [[ "$(dump_schema)" != "$schema_before" ]]; then echo 'FAIL: rollback mudou schema original' >&2; exit 1; fi
if [[ "$(q -Atqc "select md5(string_agg(to_jsonb(ch)::text,'' order by id)) from public.chapas_2026 ch")" != "$rows_before" ]]; then echo 'FAIL: rollback mudou dados originais' >&2; exit 1; fi
echo 'PASS PG17: dry-run, apply, verify, identidade/domínio/fonte, legado preservado, dependência protegida, rollback exato de schema e dados.'
