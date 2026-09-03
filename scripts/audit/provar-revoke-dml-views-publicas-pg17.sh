#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartavel: forward, readback contra pre-estado e
# contra adulteracao, rollback fechado por ledger, e service_role intocado.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260902200000"
PREVIOUS="20260901180000"
PREVIOUS_DIGEST="sha256:5657c95cc8398e7a214455204c0973326ad7dd351d7084e9724c196010474353"
MIGRATION="supabase/migrations/${VERSION}_revoke_dml_views_publicas.sql"
READBACK="supabase/readback/${VERSION}_revoke_dml_views_publicas.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_revoke_dml_views_publicas.rollback.sql"
ROLLBACK_READBACK="supabase/readback/${VERSION}_revoke_dml_views_publicas.rollback.readback.sql"
CONTAINER_ID="$(docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE")"

cleanup() {
  docker stop "$CONTAINER_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_ID" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 \
     && docker exec "$CONTAINER_ID" psql -U postgres -h 127.0.0.1 -d postgres -Atqc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

q() {
  docker exec -i "$CONTAINER_ID" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

# Espelho do ACL medido em producao em 02/09/2026, sem o corpo real das views:
# o que esta em prova e o privilegio, nao a consulta.
q -q <<SQL
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text,
  created_by text,
  idempotency_key text,
  rollback text[]
);
INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key)
VALUES ('${PREVIOUS}', '${PREVIOUS_DIGEST}');

CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;

CREATE TABLE public.candidatos (id uuid PRIMARY KEY, slug text NOT NULL);
CREATE TABLE public.financiamento (id bigint PRIMARY KEY, candidato_id uuid NOT NULL, valor numeric NOT NULL);
CREATE VIEW public.candidatos_identidade_tier1_auditavel WITH (security_invoker = true) AS
  SELECT id, slug FROM public.candidatos;
CREATE VIEW public.financiamento_publico WITH (security_invoker = true) AS
  SELECT id, candidato_id, valor FROM public.financiamento;

GRANT ALL ON public.candidatos_identidade_tier1_auditavel TO service_role;
GRANT ALL ON public.financiamento_publico TO service_role;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.candidatos_identidade_tier1_auditavel TO anon, authenticated;
GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER
  ON public.financiamento_publico TO anon, authenticated;
SQL

acl_service_role() {
  q -Atq -c "SELECT string_agg(has_table_privilege('service_role', t, p)::text, ',' ORDER BY t, p)
             FROM unnest(ARRAY['public.candidatos_identidade_tier1_auditavel','public.financiamento_publico']) t,
                  unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p"
}
before_service_role="$(acl_service_role)"

if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: forward readback aceitou o pre-estado" >&2
  exit 1
fi

q -q < "$MIGRATION"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('$VERSION', 'sha256:fixture')"
q -q < "$READBACK"

forward_state="$(q -Atq -c "SELECT count(*) FROM information_schema.role_table_grants
  WHERE table_schema='public'
    AND table_name IN ('candidatos_identidade_tier1_auditavel','financiamento_publico')
    AND grantee IN ('anon','authenticated')")"
[[ "$forward_state" == "2" ]] || {
  echo "FAIL: forward inesperado: $forward_state grants para papel publico (esperado 2, so SELECT em financiamento_publico)" >&2
  exit 1
}

# Adulteracao: um grant que volte por DROP + CREATE da view precisa derrubar o readback.
q -q -c "GRANT INSERT ON public.candidatos_identidade_tier1_auditavel TO anon"
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: forward readback aceitou grant adulterado" >&2
  exit 1
fi
q -q -c "REVOKE INSERT ON public.candidatos_identidade_tier1_auditavel FROM anon"
q -q < "$READBACK"

q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260903000000', 'sha256:future')"
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback aceitou migration posterior" >&2
  exit 1
fi
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260903000000'"

q -q < "$ROLLBACK"
q -q < "$ROLLBACK_READBACK"

after_service_role="$(acl_service_role)"
[[ "$after_service_role" == "$before_service_role" ]] || {
  echo "FAIL: privilegios de service_role mudaram: antes=$before_service_role depois=$after_service_role" >&2
  exit 1
}

rollback_state="$(q -Atq -c "SELECT count(*) FROM information_schema.role_table_grants
  WHERE table_schema='public'
    AND table_name IN ('candidatos_identidade_tier1_auditavel','financiamento_publico')
    AND grantee IN ('anon','authenticated')")"
[[ "$rollback_state" == "20" ]] || {
  echo "FAIL: rollback inesperado: $rollback_state grants (esperado 20 = 6+6 na tier1 e 4+4 em financiamento_publico)" >&2
  exit 1
}

echo "PASS: revoke DML das views publicas tem forward, adulteracao, migration posterior, rollback e service_role intocado provados em PostgreSQL 17"
