#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
source scripts/audit/replay-migrations.sh
set -euo pipefail
subir_container chapas-public-grants
bootstrap
schema_files="$(lista_por_filtro 'm["replaySchema"] and m["arquivo"] < "20260912160000"')"
replay "$schema_files" 0
[[ ${#R_FALHAS[@]} -eq 0 ]] || { printf '%s\n' "${R_FALHAS[@]}" >&2; exit 1; }
q() { docker exec -i "$CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
q -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text,created_by text,idempotency_key text,rollback text[]);
SQL
SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
node --import tsx scripts/audit/apply-vice-status.ts apply "$SHA" | q -q
echo 'PASS PG17: predecessor state with 160000/160100 applied'
if printf 'SET ROLE anon; SELECT count(*) FROM public.chapas_2026_publico;' | q -q 2>/tmp/pf-acl-deny.err; then echo 'FAIL PG17: missing ACL was readable' >&2; exit 1; fi
grep -q 'permission denied' /tmp/pf-acl-deny.err
node --import tsx scripts/audit/apply-chapas-public-grants.ts apply "$SHA" | q -q
node --import tsx scripts/audit/apply-chapas-public-grants.ts verify "$SHA" | q -q
echo 'PASS PG17: ACL forward/readback under anon/authenticated and private denial'
q -q < supabase/rollback/20260912160200_grant_chapas_publico_columns.rollback.sql
if printf 'SET ROLE authenticated; SELECT count(*) FROM public.chapas_2026_publico;' | q -q 2>/tmp/pf-acl-rollback.err; then echo 'FAIL PG17: rollback left public view readable' >&2; exit 1; fi
grep -q 'permission denied' /tmp/pf-acl-rollback.err
q -q -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20260912160000','20260912160100')" | grep -qx 2
echo 'PASS PG17: rollback ACL only, previous two ledger entries preserved, access denied restored'
docker rm -f "$CONTAINER" >/dev/null
