#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
C="pf-financiamento-acl-$$"
SCHEMA="$ROOT/supabase/migrations/20260810120000_financiamento_verificacoes_por_pleito.sql"
READBACK_SCHEMA="$ROOT/supabase/readback/20260810120000_financiamento_verificacoes_por_pleito.readback.sql"
FORWARD="$ROOT/supabase/migrations/20260810120500_financiamento_verificacoes_acl_exato.sql"
READBACK="$ROOT/supabase/readback/20260810120500_financiamento_verificacoes_acl_exato.readback.sql"
ROLLBACK="$ROOT/supabase/rollback/20260810120500_financiamento_verificacoes_acl_exato.rollback.sql"
ERR="$(mktemp)"

cleanup() {
  docker rm -f "$C" >/dev/null 2>&1 || true
  rm -f "$ERR"
}
trap cleanup EXIT INT TERM

docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null
for _ in $(seq 1 40); do
  if docker exec "$C" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; then break; fi
  sleep 0.25
done
docker exec "$C" pg_isready -U postgres -h 127.0.0.1 >/dev/null

psql_run() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql_apply() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q --single-transaction "$@"; }
query() { docker exec "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtAc "$1" | tr -d '[:space:]'; }

psql_run <<'SQL'
CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE
);
CREATE TABLE public.financiamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id),
  ano_eleicao integer NOT NULL,
  total_arrecadado numeric NOT NULL DEFAULT 0,
  fonte text
);
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
INSERT INTO public.candidatos(slug) VALUES ('adversarial-acl');
SQL

psql_apply < "$SCHEMA"
psql_run -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260810120000');"
psql_run < "$READBACK_SCHEMA"

# Reproduz exatamente os grants automaticos medidos no Supabase de producao.
psql_run <<'SQL'
GRANT ALL PRIVILEGES ON public.financiamento_verificacoes TO service_role;
GRANT ALL PRIVILEGES ON public.financiamento_verificacoes_publico TO service_role;
GRANT SELECT ON public.financiamento_verificacoes_publico TO anon, authenticated;
SQL
if psql_run < "$READBACK_SCHEMA" >"$ERR" 2>&1; then
  echo "FAIL: readback 120000 aceitou ACL automatica excedente" >&2
  exit 1
fi
grep -q 'acl_invalidos=14' "$ERR"
echo "PASS reproducao: Supabase deixa exatamente 14 privilegios invalidos"

psql_run -c "REVOKE SELECT ON public.financiamento_verificacoes_publico FROM anon;"
if psql_apply < "$FORWARD" >/dev/null 2>&1; then
  echo "FAIL: remediacao aceitou pre-estado ACL incompleto" >&2
  exit 1
fi
psql_run -c "GRANT SELECT ON public.financiamento_verificacoes_publico TO anon;"

{
  cat "$FORWARD"
  printf "\nINSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260810120500');\n"
} | psql_apply
psql_run < "$READBACK"
psql_run < "$READBACK_SCHEMA"
[[ "$(query "select count(*) from supabase_migrations.schema_migrations where version='20260810120500'")" == 1 ]]
echo "PASS forward/readback: ACL exata e ledger atomico"

if psql_apply < "$FORWARD" >/dev/null 2>&1; then
  echo "FAIL: remediacao aceitou reaplicacao" >&2
  exit 1
fi

psql_run -c "GRANT SELECT ON public.financiamento_verificacoes_publico TO anon;"
if psql_run < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou grant posterior" >&2
  exit 1
fi
if psql_apply < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback apagou ACL posterior" >&2
  exit 1
fi
psql_run -c "REVOKE SELECT ON public.financiamento_verificacoes_publico FROM anon;"
psql_run < "$READBACK"
echo "PASS adversarial: grant posterior recusa readback e rollback"

psql_run <<'SQL'
INSERT INTO public.financiamento_verificacoes (
  candidato_id, ano_eleicao, resultado, detalhe, execucao
)
SELECT id, 2099, 'erro', 'linha posterior', 'adversarial-acl'
FROM public.candidatos WHERE slug='adversarial-acl';
SQL
if psql_apply < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback apagou linha posterior" >&2
  exit 1
fi
psql_run -c "DELETE FROM public.financiamento_verificacoes WHERE execucao='adversarial-acl';"

psql_run -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260810121000');"
if psql_apply < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback ignorou dependencia 121000" >&2
  exit 1
fi
psql_run -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260810121000';"

psql_run -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260810120500';"
if psql_apply < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback aceitou ledger ausente" >&2
  exit 1
fi
psql_run -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260810120500');"

psql_apply < "$ROLLBACK"
[[ "$(query "select count(*) from supabase_migrations.schema_migrations where version='20260810120500'")" == 0 ]]
if psql_run < "$READBACK_SCHEMA" >"$ERR" 2>&1; then
  echo "FAIL: rollback nao restaurou o pre-estado excedente" >&2
  exit 1
fi
grep -q 'acl_invalidos=14' "$ERR"
echo "PASS rollback: pre-estado ACL exato restaurado, sem apagar dados"

echo "PASS: migration 20260810120500 provada em PostgreSQL 17"
