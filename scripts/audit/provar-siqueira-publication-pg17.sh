#!/usr/bin/env bash
# Schema real completo pelo harness canônico; dados mínimos só para a coorte.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# Estado local preenchido pelo harness importado, não configuração de ambiente.
CONTAINER=''
R_APLICADAS=0
# Reusa funções/bootstrap/imagem/trap pela entrada estática do harness.
source scripts/audit/replay-migrations.sh
set -euo pipefail
subir_container siqueira
bootstrap
schema_files="$(lista_por_filtro 'm["replaySchema"] and m["arquivo"] < "20260907193000"')"
replay "$schema_files" 0
if [[ ${#R_FALHAS[@]} -ne 0 ]]; then printf '%s\n' "${R_FALHAS[@]}" >&2; exit 1; fi
echo "PASS: schema real PG17, $R_APLICADAS migrations anteriores."
q() { docker exec -i "$CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
expect_sql_error() {
  local output code
  if output="$(q -q 2>&1)"; then echo "FAIL: SQL deveria recusar: $1" >&2; exit 1; else code=$?; fi
  if [[ "$code" -ne 3 || "$output" != *"$1"* ]]; then
    printf 'FAIL: erro SQL inesperado (exit %s), esperado %s\n%s\n' "$code" "$1" "$output" >&2; exit 1
  fi
}
reject_query() { printf '%s\n' "$1" | expect_sql_error "$2"; }
S='supabase/migrations/20260907193000_chapas_divulgacand_fonte_direta.sql'
D='supabase/migrations/20260907193100_siqueira_to_publication.sql'
SR='supabase/readback/20260907193000_chapas_divulgacand_fonte_direta.readback.sql'
DR='supabase/readback/20260907193100_siqueira_to_publication.readback.sql'
SB='supabase/rollback/20260907193000_chapas_divulgacand_fonte_direta.rollback.sql'
DB='supabase/rollback/20260907193100_siqueira_to_publication.rollback.sql'
DBR='supabase/readback/20260907193100_siqueira_to_publication.rollback.readback.sql'
EXPECTED_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
compose() { node --import tsx scripts/audit/apply-siqueira-publication.ts "$1" "$EXPECTED_SHA"; }
predecessor_digest="$(node -e "const fs=require('fs'),c=require('crypto');process.stdout.write('sha256:'+c.createHash('sha256').update(fs.readFileSync('supabase/migrations/20260907180000_danilo_nome_urna.sql')).digest('hex'))")"
q -q <<SQL
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text,created_by text,idempotency_key text,rollback text[]);
INSERT INTO supabase_migrations.schema_migrations(version,idempotency_key) VALUES ('20260907180000','$predecessor_digest');
INSERT INTO public.candidatos(id,slug,nome_completo,nome_urna,partido_atual,partido_sigla,cargo_disputado,estado,sq_candidato_2026,publicavel,status,situacao_candidatura)
VALUES ('b474c1e4-2782-4434-8663-9e47a22e8b1a','subtenente-luiz-carlos','LUIZ CARLOS FERREIRA DA SILVA','SUBTENENTE LUIZ CARLOS','DEMOCRATA','DEMOCRATA','Governador','TO','270002546368',false,'removido','indeferido');
INSERT INTO public.chapas_2026(id,chave,eleicao_codigo,eleicao_data,uf,cargo_titular,sq_coligacao,identidade_status,vinculo_titular_status,tse_situacao_codigo,tse_situacao_titular_codigo,tse_situacao_vice_codigo,tipo_agremiacao,composicao,titular_candidato_id,titular_sq_candidato,vice_sq_candidato,titular_nome_completo,titular_nome_urna,titular_partido_sigla,vice_nome_completo,vice_nome_urna,vice_partido_sigla,fonte_url,fonte_sha256,snapshot_em)
VALUES ('00000000-0000-0000-0000-000000000003','fixture:legado','6259','2026-10-04','TO','Governador','fixture-coligacao','confirmada','confirmado','Indeferido','fixture-csv','fixture-csv','PARTIDO ISOLADO','DEMOCRATA','b474c1e4-2782-4434-8663-9e47a22e8b1a','270002546368','270002546369','LUIZ CARLOS FERREIRA DA SILVA','SUBTENENTE LUIZ CARLOS','DEMOCRATA','JAIR MEDEIRO DA CUNHA','JAIR MEDEIROS','DEMOCRATA','https://example.test/fixture','fixture-hash','2026-09-06T00:00:00Z');
SQL
schema_before="$(dump_schema)"
expect_sql_error 'siqueira readback: recibos ausentes ou inválidos' < "$DR"
# Composer dry-run aplica schema+dado+ledger+readbacks atomicamente e desfaz tudo.
compose dry-run | q -q
q -q <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.candidatos WHERE slug='siqueira-campos-jr')
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chapas_2026' AND column_name='fonte_tipo')
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version>'20260907180000') THEN RAISE EXCEPTION 'dry-run persistiu escrita'; END IF;
END $$;
SQL
# Rollback estrutural antes da admissão devolve schema exato, sem alterar dados.
q -q < "$S"
q -q < "$SR"
expect_sql_error 'chapas fonte detalhada: precondição estrutural divergiu' < "$S"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260907193000')"
q -q < "$SB"
schema_after="$(dump_schema)"
if [[ "$schema_before" != "$schema_after" ]]; then echo 'FAIL: rollback estrutural mudou o schema original' >&2; exit 1; fi
# Composer recusa predecessor errado antes de qualquer DDL.
q -q -c "UPDATE supabase_migrations.schema_migrations SET idempotency_key='errado' WHERE version='20260907180000'"
compose apply | expect_sql_error 'siqueira-publication: ledger or digest drift'
q -q -c "UPDATE supabase_migrations.schema_migrations SET idempotency_key='$predecessor_digest' WHERE version='20260907180000'"
compose apply | q -q
compose verify | q -q
# Dois recibos concordando no MESMO SHA errado ainda devem reprovar.
q -q -c "UPDATE supabase_migrations.schema_migrations SET created_by=regexp_replace(created_by,'[a-f0-9]{40}$',repeat('b',40)) WHERE version IN ('20260907193000','20260907193100')"
compose verify | expect_sql_error 'siqueira-publication: stored migration provenance mismatch'
q -q -c "UPDATE supabase_migrations.schema_migrations SET created_by=regexp_replace(created_by,'[a-f0-9]{40}$',repeat('a',40)) WHERE version IN ('20260907193000','20260907193100')"
compose verify | q -q
compose apply | expect_sql_error 'siqueira-publication: ledger or digest drift'
expect_sql_error 'siqueira: colisão de inscrição/chapa ou recibo existente' < "$D"
# O ramo legado continua recusando códigos/coligação ausentes.
reject_query "UPDATE public.chapas_2026 SET tse_situacao_titular_codigo=NULL WHERE chave='fixture:legado';" 'violates check constraint "chapas_2026_fonte_legado_check"'
reject_query "UPDATE public.chapas_2026 SET sq_coligacao=NULL WHERE chave='fixture:legado';" 'violates check constraint "chapas_2026_check1"'
# Cada chave obrigatória removida do recibo direto deve reprovar, inclusive NULL.
for role in titular vice; do
  for field in url sha256 checked_at http_status sq_candidato nome_completo nome_urna partido_sigla cargo uf descricao_situacao is_candidato_inapto substituido; do
    reject_query "UPDATE public.chapas_2026 SET fonte_detalhe=fonte_detalhe #- '{$role,$field}' WHERE fonte_tipo='divulgacand_detalhe';" 'violates check constraint "chapas_2026_fonte_detalhe_check"'
  done
done
for field in vice_vigente_sq contagem_vices_vigentes; do
  reject_query "UPDATE public.chapas_2026 SET fonte_detalhe=fonte_detalhe #- '{titular,$field}' WHERE fonte_tipo='divulgacand_detalhe';" 'violates check constraint "chapas_2026_fonte_detalhe_check"'
done
reject_query "UPDATE public.chapas_2026 SET fonte_detalhe=NULL WHERE fonte_tipo='divulgacand_detalhe';" 'violates check constraint "chapas_2026_fonte_detalhe_check"'
reject_query "UPDATE public.chapas_2026 SET fonte_detalhe=jsonb_set(fonte_detalhe,'{vice,checked_at}','\"infinity\"') WHERE fonte_tipo='divulgacand_detalhe';" 'violates check constraint "chapas_2026_fonte_detalhe_check"'
reject_query "UPDATE public.chapas_2026 SET tse_situacao_titular_codigo='8' WHERE fonte_tipo='divulgacand_detalhe';" 'violates check constraint "chapas_2026_fonte_detalhe_check"'
reject_query "INSERT INTO public.chapas_2026 SELECT p.* FROM public.chapas_2026 x CROSS JOIN LATERAL jsonb_populate_record(NULL::public.chapas_2026,to_jsonb(x)||'{\"id\":\"00000000-0000-0000-0000-000000000004\",\"chave\":\"fixture:duplicate\"}'::jsonb) p WHERE x.fonte_tipo='divulgacand_detalhe';" 'duplicate key value violates unique constraint "chapas_2026_detalhe_'
# Vínculo candidato/SQ precisa passar readback, além de FK e constraints da chapa.
q -q -c "UPDATE public.candidatos SET sq_candidato_2026='270002554399' WHERE slug='siqueira-campos-jr'"
expect_sql_error 'siqueira readback: postimagem ou invariância divergiu' < "$DR"
expect_sql_error 'siqueira rollback: postimagem ou invariância divergiu' < "$DB"
q -q -c "UPDATE public.candidatos SET sq_candidato_2026='270002554375' WHERE slug='siqueira-campos-jr'"
# Alteração vizinha e ledger posterior também bloqueiam rollback.
q -q -c "UPDATE public.chapas_2026 SET composicao='drift' WHERE chave='fixture:legado'"
expect_sql_error 'siqueira rollback: postimagem ou invariância divergiu' < "$DB"
q -q -c "UPDATE public.chapas_2026 SET composicao='DEMOCRATA' WHERE chave='fixture:legado'"
# Duas sessões: migration posterior ainda não commitada detém o lock canônico.
# Rollback deve aguardar, então rejeitar o ledger novo sem despublicar ninguém.
docker exec -i "$CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q >/dev/null <<'SQL' &
SET application_name='pf-siqueira-ledger-writer';
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260907194000');
SELECT pg_sleep(3);
COMMIT;
SQL
writer_pid=$!
writer_ready=false
for _ in $(seq 1 40); do
  if [[ "$(q -Atqc "SELECT count(*) FROM pg_stat_activity WHERE application_name='pf-siqueira-ledger-writer' AND wait_event='PgSleep'")" == 1 ]]; then writer_ready=true; break; fi
  sleep 0.05
done
if [[ "$writer_ready" != true ]]; then wait "$writer_pid"; echo 'FAIL: sessão concorrente não chegou ao lock' >&2; exit 1; fi
expect_sql_error 'siqueira rollback: ledger divergiu' < "$DB"
wait "$writer_pid"
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260907194000'"
compose verify | q -q
q -q < "$DB"
q -q < "$DBR"
expect_sql_error 'chapas fonte detalhada rollback: linhas diretas preservadas impedem remoção estrutural' < "$SB"
expect_sql_error 'siqueira rollback: ledger divergiu' < "$DB"
echo 'PASS PG17: schema real, composer dry-run/apply/verify, hash/ledger, legado preservado, JSON fail-closed, unicidade, identidade, invariância, rollback preservador e reversão estrutural guardada.'
