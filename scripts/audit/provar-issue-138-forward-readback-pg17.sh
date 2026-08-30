#!/usr/bin/env bash
# Prova comportamental da ordem forward/rollback da issue #138 em PostgreSQL 17.
# Nao toca Supabase nem qualquer ambiente remoto.
set -euo pipefail
cd "$(dirname "$0")/../.."

MODE="${1:-both}"
case "$MODE" in
  both|backfill|already-applied) ;;
  *) echo "FAIL: modo desconhecido: $MODE" >&2; exit 2 ;;
esac

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
DDL="supabase/migrations/20260829100000_projetos_lei_chave_por_fonte.sql"
BACKFILL="supabase/migrations-pendentes/20260829100100_backfill_projetos_lei_camara_ronaldo_caiado.sql"
FORWARD_READBACK="supabase/readback/20260829100000_projetos_lei_chave_por_fonte.readback.sql"
BACKFILL_READBACK="supabase/readback/20260829100100_backfill_projetos_lei_camara_ronaldo_caiado.readback.sql"
ROLLBACK="supabase/rollback/20260829100100_backfill_projetos_lei_camara_ronaldo_caiado.rollback.sql"
BACKFILL_ROLLBACK_READBACK="supabase/readback/20260829100100_backfill_projetos_lei_camara_ronaldo_caiado.rollback.readback.sql"
SCHEMA_ROLLBACK="supabase/rollback/20260829100000_projetos_lei_chave_por_fonte.rollback.sql"
ROLLBACK_READBACK="supabase/readback/20260829100000_projetos_lei_chave_por_fonte.rollback.readback.sql"
DDL_HASH="sha256:$(shasum -a 256 supabase/migrations/20260829100000_projetos_lei_chave_por_fonte.sql | cut -d' ' -f1)"
BACKFILL_HASH="sha256:$(shasum -a 256 supabase/migrations-pendentes/20260829100100_backfill_projetos_lei_camara_ronaldo_caiado.sql | cut -d' ' -f1)"
C="pf-issue-138-forward-readback-$$"

limpar() { docker rm -f "$C" >/dev/null 2>&1 || true; }
trap limpar EXIT INT TERM

docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null || {
  echo "FAIL: docker nao subiu"; exit 1;
}
pronto=0
for _ in $(seq 1 120); do
  if docker exec "$C" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 &&
     docker exec "$C" psql -U postgres -h 127.0.0.1 -d postgres -tAc 'select 1' >/dev/null 2>&1; then
    pronto=1
    break
  fi
  sleep 1
done
if [[ "$pronto" != 1 ]]; then
  echo "FAIL: postgres nao ficou pronto" >&2
  docker logs "$C" 2>&1 | tail -40 >&2 || true
  exit 1
fi

q() { docker exec -i "$C" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }

q <<'SQL' >/dev/null
create extension if not exists "pgcrypto";
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(
  version text primary key,
  idempotency_key text not null
);
insert into supabase_migrations.schema_migrations(version, idempotency_key)
values ('20260829030002', 'sha256:previous-release');
create table public.candidatos(
  id uuid primary key,
  slug text unique not null
);
create table public.projetos_lei(
  id bigint generated always as identity primary key,
  candidato_id uuid not null references public.candidatos(id),
  tipo text not null,
  numero text not null,
  ano integer not null,
  ementa text not null,
  situacao text,
  url_inteiro_teor text,
  fonte text not null,
  proposicao_id_api text,
  tema text,
  destaque boolean not null default false,
  destaque_motivo text,
  coverage_id text,
  metadata jsonb not null default '{}'::jsonb,
  constraint uq_projetos_lei_candidato_proposicao unique (candidato_id, proposicao_id_api)
);
insert into public.candidatos(id, slug)
values ('781b5abb-aa49-46a7-bc17-c38f16706ed0', 'ronaldo-caiado');
insert into public.projetos_lei(candidato_id, tipo, numero, ano, ementa, fonte, proposicao_id_api)
select '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid, 'PL', gs::text, 2020,
       'Camara baseline ' || gs, 'Camara', 'baseline-camara-' || gs
from generate_series(1, 1845) gs;
insert into public.projetos_lei(candidato_id, tipo, numero, ano, ementa, fonte, proposicao_id_api)
select '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid, 'PLS', gs::text, 2015,
       'Senado baseline ' || gs, 'Senado', 'baseline-senado-' || gs
from generate_series(1, 226) gs;
insert into public.projetos_lei(candidato_id, tipo, numero, ano, ementa, fonte, proposicao_id_api)
values ('781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid, 'PL', '4444', 2015,
        'Senado sem identificador de proposicao', 'Senado', NULL);
insert into public.projetos_lei(
  candidato_id, tipo, numero, ano, ementa, situacao, url_inteiro_teor,
  fonte, proposicao_id_api, metadata
)
values
  ('781b5abb-aa49-46a7-bc17-c38f16706ed0', 'RDR', '41', 2015, 'Requer aditamento ao Requerimento (RDR) nº 33, de 2015, para convidar os Srs. José Alves Filho e Herculano Anghinetti, representantes da Associação Brasileira Pró-Desenvolvimento Regional Sustentável (ADIAL BRASIL), a comparecerem em audiência pública a ser realizada nesta Comissão.', NULL, NULL, 'Senado', '123202', '{}'::jsonb),
  ('781b5abb-aa49-46a7-bc17-c38f16706ed0', 'PLS', '611', 2015, 'Altera a Lei nº 5.172, de 25 de outubro de 1966 (Código Tributário Nacional), para estabelecer limitações à Fazenda Pública e reforçar garantias do contribuinte, e a Lei Complementar nº 87, de 13 de setembro de 1996, para incluir hipótese em que a saída interna de mercadoria é equiparada a operação de exportação.', NULL, NULL, 'Senado', '123149', '{}'::jsonb),
  ('781b5abb-aa49-46a7-bc17-c38f16706ed0', 'RRA', '64', 2015, 'Requer, nos termos do art. 93, inciso II do Regimento Interno do Senado Federal, a realização de audiência pública para debater a possível fraude no Processo Administrativo INCRA nº 54370000952/2006-48, da Superintendência de Sergipe. Para tanto, sugere que sejam convidados: Sra. Rosivan Machado da Silva, magistrada; Sr. José Fausto Santos, pescador; Sr. Manfredo Goes Martins, produtor rural.', NULL, NULL, 'Senado', '123094', '{}'::jsonb),
  ('781b5abb-aa49-46a7-bc17-c38f16706ed0', 'RQS', '597', 2015, 'Requer, nos termos do art. 311 do RISF, preferência para votação do PLV - texto da Comissão,  em relação ao PLV - texto aprovado pela Câmara dos Deputados;', NULL, NULL, 'Senado', '121483', '{}'::jsonb);
SQL


echo "F0: preflight exige constraint antiga e nenhum indice scoped"
q <<'SQL' >/dev/null
DO $assert$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_projetos_lei_candidato_fonte_proposicao') THEN
    RAISE EXCEPTION 'preflight: indice scoped ja existe';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projetos_lei'::regclass
      AND conname = 'uq_projetos_lei_candidato_proposicao'
  ) THEN
    RAISE EXCEPTION 'preflight: constraint antiga ausente';
  END IF;
END
$assert$;
SQL
echo "  PASS  preflight antigo"

echo "F1: modo $MODE, DDL scoped e ledger forward"
if [[ "$MODE" == "both" ]]; then
  python3 - "$DDL_HASH" "$BACKFILL_HASH" "$DDL" "$BACKFILL" "$FORWARD_READBACK" "$BACKFILL_READBACK" <<'PY' | q >/dev/null
import pathlib, re, sys

ddl_digest, backfill_digest, ddl_path, backfill_path, ddl_readback_path, backfill_readback_path = sys.argv[1:]
def body(path):
    text = pathlib.Path(path).read_text(encoding="utf-8")
    begin, commit = list(re.finditer(r"(?im)^\s*BEGIN;\s*$", text)), list(re.finditer(r"(?im)^\s*COMMIT;\s*$", text))
    if len(begin) != 1 or len(commit) != 1 or begin[0].end() >= commit[0].start():
        raise SystemExit(f"{path}: transacao externa invalida")
    return text[begin[0].end():commit[0].start()]
print("BEGIN;")
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:issue-138-proposicao-source-key', 0));")
print(body(ddl_path))
print(f"INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260829100000', '{ddl_digest}');")
print(pathlib.Path(ddl_readback_path).read_text(encoding="utf-8"))
print(body(backfill_path))
print(f"INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260829100100', '{backfill_digest}');")
print(pathlib.Path(backfill_readback_path).read_text(encoding="utf-8"))
print("COMMIT;")
PY
else
  q < "$DDL" >/dev/null
  q -c "insert into supabase_migrations.schema_migrations(version, idempotency_key) values ('20260829100000', '$DDL_HASH')" >/dev/null
  q < "$FORWARD_READBACK" >/dev/null
  q < "$BACKFILL" >/dev/null
  q -c "insert into supabase_migrations.schema_migrations(version, idempotency_key) values ('20260829100100', '$BACKFILL_HASH')" >/dev/null
  q < "$BACKFILL_READBACK" >/dev/null
fi
echo "  PASS  DDL scoped e ledger forward"
q < "$FORWARD_READBACK" >/dev/null
q < "$BACKFILL_READBACK" >/dev/null
echo "  PASS  readbacks pos-commit (modo $MODE)"

echo "F2: rollback readback nao passa antes do rollback"
if rollback_output="$(q < "$ROLLBACK_READBACK" 2>&1)"; then
  echo "FAIL: rollback readback foi aceito fora do fluxo de rollback" >&2
  exit 1
fi
if [[ "$rollback_output" != *"schema rollback readback falhou"* ]]; then
  echo "FAIL: rollback readback falhou por motivo inesperado" >&2
  exit 1
fi
echo "  PASS  rollback readback bloqueado no estado forward"

echo "F3: backfill allowlisted, quatro Camara e Senado intacto"
[[ "$(q -c "select count(*) from public.projetos_lei where candidato_id='781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid and fonte='Camara' and proposicao_id_api in ('123202','123149','123094','121483')")" == 4 ]] || { echo "FAIL: backfill nao inseriu 4 Camara"; exit 1; }
[[ "$(q -c "select count(*) from public.projetos_lei where candidato_id='781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid and fonte='Senado'")" == 231 ]] || { echo "FAIL: Senado foi alterado"; exit 1; }
[[ "$(q -c "select count(*) from public.projetos_lei where candidato_id='781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid and fonte='Senado' and proposicao_id_api is null and numero='4444'")" == 1 ]] || { echo "FAIL: linha Senado sem ID foi alterada"; exit 1; }
echo "  PASS  backfill 4"
echo "  PASS  Senado intacto"

echo "F4: substituicao adversarial da linha Senado sem ID falha forward"
q -c "update public.projetos_lei set ementa='payload adulterado' where candidato_id='781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid and fonte='Senado' and proposicao_id_api is null and numero='4444'" >/dev/null
if q < "$FORWARD_READBACK" >/dev/null 2>&1 || q < "$BACKFILL_READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback forward aceitou payload Senado adulterado" >&2
  exit 1
fi
q -c "update public.projetos_lei set ementa='Senado sem identificador de proposicao' where candidato_id='781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid and fonte='Senado' and proposicao_id_api is null and numero='4444'" >/dev/null
q < "$FORWARD_READBACK" >/dev/null
q < "$BACKFILL_READBACK" >/dev/null
echo "  PASS  forward readbacks recusam substituicao"

echo "R1: rollback e rollback readback separado"
q -c "delete from supabase_migrations.schema_migrations where version='20260829100100' and idempotency_key='$BACKFILL_HASH'" >/dev/null
q < "$ROLLBACK" >/dev/null
q < "$BACKFILL_ROLLBACK_READBACK" >/dev/null
[[ "$(q -c "select count(*) from public.projetos_lei where candidato_id='781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid and fonte='Senado' and proposicao_id_api is null and numero='4444'")" == 1 ]] || { echo "FAIL: linha Senado sem ID nao sobreviveu ao rollback de dados"; exit 1; }
echo "  PASS  rollback de dados e readback"
echo "F5: substituicao adversarial da linha Senado sem ID falha rollback readback"
q -c "update public.projetos_lei set ementa='payload adulterado' where candidato_id='781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid and fonte='Senado' and proposicao_id_api is null and numero='4444'" >/dev/null
if q < "$BACKFILL_ROLLBACK_READBACK" >/dev/null 2>&1 || q < "$ROLLBACK_READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback rollback aceitou payload Senado adulterado" >&2
  exit 1
fi
q -c "update public.projetos_lei set ementa='Senado sem identificador de proposicao' where candidato_id='781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid and fonte='Senado' and proposicao_id_api is null and numero='4444'" >/dev/null
q < "$BACKFILL_ROLLBACK_READBACK" >/dev/null
echo "  PASS  rollback readbacks recusam substituicao"
{ printf '%s\n' "SET pf.issue_138_schema_rollback_compatibility = 'approved';"; cat "$SCHEMA_ROLLBACK"; } | q >/dev/null
q < "$ROLLBACK_READBACK" >/dev/null
[[ "$(q -c "select count(*) from public.projetos_lei where candidato_id='781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid and fonte='Senado' and proposicao_id_api is null and numero='4444'")" == 1 ]] || { echo "FAIL: linha Senado sem ID nao sobreviveu ao rollback de schema"; exit 1; }
echo "  PASS  rollback de schema e readback"
echo "PASS: issue #138 forward/rollback PG17"
