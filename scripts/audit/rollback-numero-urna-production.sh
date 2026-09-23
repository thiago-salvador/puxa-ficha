#!/usr/bin/env bash
set -euo pipefail
case $- in *x*) set +x ;; esac
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/audit/lib/configure-libpq-from-url.sh"
: "${PF_DATABASE_URL:?PF_DATABASE_URL e obrigatoria}"
: "${PF_EXPECTED_SHA:?PF_EXPECTED_SHA e obrigatoria}"
: "${GITHUB_REF:?GITHUB_REF e obrigatoria}"
[[ "$PF_EXPECTED_SHA" =~ ^[0-9a-f]{40}$ && "$(git rev-parse HEAD)" == "$PF_EXPECTED_SHA" ]] || { echo "FAIL: checkout/SHA divergente" >&2; exit 2; }
[[ "$GITHUB_REF" == refs/heads/main ]] || { echo "FAIL: somente main" >&2; exit 2; }
[[ -z "$(git status --porcelain=v1 --untracked-files=normal)" ]] || { echo "FAIL: checkout sujo" >&2; exit 2; }
[[ "$(git ls-remote origin refs/heads/main | cut -f1)" == "$PF_EXPECTED_SHA" ]] || { echo "FAIL: SHA nao e o topo remoto de main" >&2; exit 2; }
pf_configure_libpq_from_url
[[ "$PGHOST" == "db.wskpzsobvqwhnbsdsmok.supabase.co" || ( "$PGHOST" == *.pooler.supabase.com && "$PGUSER" == "postgres.wskpzsobvqwhnbsdsmok" ) ]] || { echo "FAIL: banco nao e producao" >&2; exit 2; }
export PGCONNECT_TIMEOUT=10 PGSSLMODE=verify-full PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt"
version=20260923140000
previous_version=20260923130000
migration="$ROOT/supabase/migrations/${version}_numero_urna_schema.sql"
rollback="$ROOT/supabase/rollback/${version}_numero_urna_schema.rollback.sql"
digest="sha256:$(shasum -a 256 "$migration" | cut -d' ' -f1)"
tmp_rollback="$(mktemp)"
tmp_body="$(mktemp)"
trap 'rm -f "$tmp_rollback" "$tmp_body"' EXIT
state="$(PGOPTIONS='-c default_transaction_read_only=on' psql -X -Atq -F '|' -c "select coalesce(max(version),'') || '|' || count(*) filter(where version='$version') || '|' || coalesce(max(idempotency_key) filter(where version='$version'),'') from supabase_migrations.schema_migrations")"
IFS='|' read -r top count key <<<"$state"
[[ "$top" == "$version" && "$count" == 1 && "$key" == "$digest" ]] || { echo "FAIL: rollback exige migration exata no topo: $state" >&2; exit 1; }
sed '/^[[:space:]]*BEGIN;[[:space:]]*$/d; /^[[:space:]]*COMMIT;[[:space:]]*$/d' "$rollback" > "$tmp_body"
{
  echo 'BEGIN;'
  cat "$tmp_body"
  cat <<'SQL'
DELETE FROM supabase_migrations.schema_migrations
WHERE version = :'version' AND idempotency_key = :'digest';
COMMIT;
SQL
} > "$tmp_rollback"
PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -v version="$version" -v digest="$digest" -f "$tmp_rollback"
PGOPTIONS='-c default_transaction_read_only=on' psql -X -v ON_ERROR_STOP=1 -c "select max(version) from supabase_migrations.schema_migrations where version='$previous_version'"
PGOPTIONS='-c default_transaction_read_only=on' psql -X -v ON_ERROR_STOP=1 -c "DO \$verify\$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='candidatos' AND column_name='numero_urna') OR EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='candidatos_numero_urna_estado_cargo_idx') THEN RAISE EXCEPTION 'rollback readback: numero_urna ainda presente'; END IF; IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='$version') THEN RAISE EXCEPTION 'rollback readback: ledger ainda presente'; END IF; END \$verify\$;"
