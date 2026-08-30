#!/usr/bin/env bash
# Reverte somente a migration 20260830143500, recusando migration ou curadoria
# posterior e comprovando o estado anterior em readback separado.
set -euo pipefail
case $- in *x*) set +x ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/audit/lib/configure-libpq-from-url.sh
source "$ROOT/scripts/audit/lib/configure-libpq-from-url.sh"

: "${PF_DATABASE_URL:?PF_DATABASE_URL e obrigatoria}"
: "${PF_EXPECTED_SHA:?PF_EXPECTED_SHA e obrigatoria}"
: "${GITHUB_REF:?GITHUB_REF e obrigatoria}"
[[ "$PF_EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "FAIL: SHA invalido" >&2; exit 2; }
[[ "$(git rev-parse HEAD)" == "$PF_EXPECTED_SHA" ]] || { echo "FAIL: checkout divergiu" >&2; exit 2; }
[[ -z "$(git status --porcelain=v1 --untracked-files=normal)" ]] || { echo "FAIL: checkout sujo" >&2; exit 2; }
[[ "$GITHUB_REF" == "refs/heads/main" ]] || { echo "FAIL: somente main" >&2; exit 2; }
[[ "$(git ls-remote https://github.com/thiago-salvador/puxa-ficha.git refs/heads/main | cut -f1)" == "$PF_EXPECTED_SHA" ]] || {
  echo "FAIL: SHA nao e o topo remoto de main" >&2
  exit 2
}

database_ref="$({
  node <<'NODE'
const raw = process.env.PF_DATABASE_URL ?? ""
let url
try { url = new URL(raw) } catch { process.exit(2) }
if (!/^(?:postgres|postgresql):$/.test(url.protocol) || url.search || url.hash || url.pathname !== "/postgres") process.exit(2)
const host = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]
const user = decodeURIComponent(url.username).match(/^postgres\.([a-z0-9]+)$/)?.[1]
const pooler = /(?:^|\.)pooler\.supabase\.com$/.test(url.hostname)
if ((host && url.port !== "5432") || (pooler && !["5432", "6543"].includes(url.port))) process.exit(2)
if (host && user && host !== user) process.exit(3)
if (!host && !(pooler && user)) process.exit(4)
process.stdout.write(host ?? user)
NODE
} 2>/dev/null)" || { echo "FAIL: URL nao identifica projeto Supabase" >&2; exit 2; }
[[ "$database_ref" == "wskpzsobvqwhnbsdsmok" ]] || { echo "FAIL: banco nao e producao" >&2; exit 2; }

unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE PGOPTIONS
unset PGSERVICE PGSERVICEFILE PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCRLDIR
pf_configure_libpq_from_url
export PGCONNECT_TIMEOUT=10 PGSSLMODE=verify-full
export PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt"

version=20260830143500
previous_version=20260830120000
previous_digest=sha256:166ac4c9b3d766f9173358f201525f0250419853f4a249e7fa166b55c9710ebc
migration="$ROOT/supabase/migrations/${version}_jhc_voto_artigo_17.sql"
rollback="$ROOT/supabase/rollback/${version}_jhc_voto_artigo_17.rollback.sql"
rollback_readback="$ROOT/supabase/readback/${version}_jhc_voto_artigo_17.rollback.readback.sql"
[[ -f "$migration" && -f "$rollback" && -f "$rollback_readback" ]] || {
  echo "FAIL: artefato de rollback de JHC artigo 17 ausente" >&2
  exit 2
}

digest="sha256:$(shasum -a 256 "$migration" | cut -d' ' -f1)"
state="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c \
  "select coalesce(max(version),'') || '|' || count(*) filter(where version='$previous_version') || '|' || coalesce(max(idempotency_key) filter(where version='$previous_version'),'') || '|' || count(*) filter(where version='$version') || '|' || coalesce(max(idempotency_key) filter(where version='$version'),'') from supabase_migrations.schema_migrations")"
IFS='|' read -r ledger_top previous_count previous_key version_count version_key <<<"$state"
[[ "$ledger_top" == "$version" && "$version_count" == "1" && "$version_key" == "$digest" && "$previous_count" == "1" && "$previous_key" == "$previous_digest" ]] || {
  echo "FAIL: rollback de JHC artigo 17 exige ledger exato no topo: $state" >&2
  exit 1
}

python3 - "$version" "$previous_version" "$digest" "$previous_digest" "$rollback" <<'PY' | \
  PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
import pathlib, re, sys

version, previous, digest, previous_digest, rollback_path = sys.argv[1:]
text = pathlib.Path(rollback_path).read_text(encoding="utf-8")
begins = list(re.finditer(r"(?im)^\s*BEGIN;\s*$", text))
commits = list(re.finditer(r"(?im)^\s*COMMIT;\s*$", text))
if len(begins) != 1 or len(commits) != 1 or begins[0].end() >= commits[0].start():
    raise SystemExit("rollback de JHC artigo 17 deve ter BEGIN/COMMIT externos unicos")
body = text[begins[0].end():commits[0].start()]
def lit(value): return "'" + value.replace("'", "''") + "'"

print("BEGIN;")
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:jhc-artigo-17-production', 0));")
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)}) <> 1 THEN RAISE EXCEPTION 'rollback JHC artigo 17: ledger divergiu sob lock'; END IF; END $ledger$;")
print(body, end="" if body.endswith("\n") else "\n")
print(f"DELETE FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)};")
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(previous)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(previous)} AND idempotency_key={lit(previous_digest)}) <> 1 OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version={lit(version)}) THEN RAISE EXCEPTION 'rollback JHC artigo 17: ledger final divergiu'; END IF; END $ledger$;")
print("COMMIT;")
PY

PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -f "$rollback_readback"
echo "PASS: rollback de JHC artigo 17 concluido, predecessor e estado anterior conferem"
