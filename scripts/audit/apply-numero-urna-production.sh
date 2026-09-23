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
readback="$ROOT/supabase/readback/${version}_numero_urna_schema.readback.sql"
digest="sha256:$(shasum -a 256 "$migration" | cut -d' ' -f1)"
previous_digest="sha256:$(shasum -a 256 "$ROOT/supabase/migrations/${previous_version}_analytics_colinha_share.sql" | cut -d' ' -f1)"
tmp_apply="$(mktemp)"
tmp_dry="$(mktemp)"
trap 'rm -f "$tmp_apply" "$tmp_dry"' EXIT
state="$(PGOPTIONS='-c default_transaction_read_only=on' psql -X -Atq -F '|' -c "select coalesce(max(version),'') || '|' || count(*) filter(where version='$previous_version') || '|' || coalesce(max(idempotency_key) filter(where version='$previous_version'),'') || '|' || count(*) filter(where version='$version') || '|' || coalesce(max(idempotency_key) filter(where version='$version'),'') from supabase_migrations.schema_migrations")"
IFS='|' read -r top prev_count prev_key current_count current_key <<<"$state"
if [[ "$top" == "$version" && "$current_count" == 1 && "$current_key" == "$digest" ]]; then
  PGOPTIONS='-c default_transaction_read_only=on' psql -X -v ON_ERROR_STOP=1 -f "$readback"
  exit 0
fi
[[ "$top" == "$previous_version" && "$prev_count" == 1 && "$prev_key" == "$previous_digest" && "$current_count" == 0 ]] || { echo "FAIL: ledger inesperado: $state" >&2; exit 1; }
migration_b64="$(base64 < "$migration" | tr -d '\n')"
rollback_b64="$(base64 < "$rollback" | tr -d '\n')"
sed '/^[[:space:]]*BEGIN;[[:space:]]*$/d; /^[[:space:]]*COMMIT;[[:space:]]*$/d' "$migration" > "$tmp_dry"
{
  echo 'BEGIN;'
  cat "$tmp_dry"
  echo 'ROLLBACK;'
} > "$tmp_apply"
PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f "$tmp_apply"
{
  echo 'BEGIN;'
  cat "$tmp_dry"
  cat <<'SQL'
INSERT INTO supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback)
VALUES (:'version', ARRAY[convert_from(decode(:'migration_b64', 'base64'), 'UTF8')], 'numero_urna_schema', 'Thiago Salvador <contato.thiagosalvador@gmail.com> via github-actions', :'digest', ARRAY[convert_from(decode(:'rollback_b64', 'base64'), 'UTF8')]);
COMMIT;
SQL
} > "$tmp_apply"
PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -v migration_b64="$migration_b64" -v rollback_b64="$rollback_b64" -v version="$version" -v digest="$digest" -f "$tmp_apply"
PGOPTIONS='-c default_transaction_read_only=on' psql -X -v ON_ERROR_STOP=1 -f "$readback"
