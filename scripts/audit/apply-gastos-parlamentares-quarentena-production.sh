#!/usr/bin/env bash
# Aplica somente a quarentena das 57 linhas com CAS, ledger e readback.
set -euo pipefail
case $- in *x*) set +x ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/audit/lib/configure-libpq-from-url.sh"
: "${PF_DATABASE_URL:?}"
: "${PF_EXPECTED_SHA:?}"
: "${GITHUB_REF:?}"
[[ "$PF_EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ "$GITHUB_REF" == "refs/heads/main" ]] || exit 2
[[ "$(git rev-parse HEAD)" == "$PF_EXPECTED_SHA" ]] || exit 2
[[ -z "$(git status --porcelain=v1 --untracked-files=normal)" ]] || exit 2
[[ "$(git ls-remote https://github.com/thiago-salvador/puxa-ficha.git refs/heads/main | cut -f1)" == "$PF_EXPECTED_SHA" ]] || exit 2

database_ref="$(node <<'NODE'
const u = new URL(process.env.PF_DATABASE_URL ?? '')
if (!['postgres:', 'postgresql:'].includes(u.protocol) || u.search || u.hash || u.pathname !== '/postgres') process.exit(2)
const direct = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]
const pool = /(?:^|\.)pooler\.supabase\.com$/.test(u.hostname)
const user = decodeURIComponent(u.username).match(/^postgres\.([a-z0-9]+)$/)?.[1]
if ((direct && u.port !== '5432') || (pool && !['5432','6543'].includes(u.port)) || (direct && user && direct !== user) || (!direct && !(pool && user))) process.exit(2)
process.stdout.write(direct ?? user)
NODE
)" || { echo 'FAIL: URL de banco inválida' >&2; exit 2; }
[[ "$database_ref" == "wskpzsobvqwhnbsdsmok" ]] || { echo 'FAIL: projeto incorreto' >&2; exit 2; }
unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE PGOPTIONS
unset PGSERVICE PGSERVICEFILE PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCRLDIR
pf_configure_libpq_from_url
export PGCONNECT_TIMEOUT=10 PGSSLMODE=verify-full
export PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt"

mode="${1:-}"
[[ "$mode" == 'dry-run' || "$mode" == 'apply' ]] || exit 2
version=20260925163543
schema_version=20260925163542
previous=20260924205031
migration="$ROOT/supabase/migrations/${version}_quarentena_gastos_parlamentares_57_linhas.sql"
schema_migration="$ROOT/supabase/migrations/${schema_version}_gastos_parlamentares_quarentena_schema.sql"
readback="$ROOT/supabase/readback/${version}_quarentena_gastos_parlamentares_57_linhas.readback.sql"
prior="$ROOT/supabase/migrations/${previous}_situacao_tse_2026_receipts.sql"
receipt="$ROOT/QA/evidencias/2026-09-25-gastos-quarentena/preflight.json"
[[ -f "$migration" && -f "$schema_migration" && -f "$readback" && -f "$prior" && -f "$receipt" ]] || exit 2
receipt_digest="$(shasum -a 256 "$receipt" | cut -d' ' -f1)"
grep -Fqx -- "-- SHA-256: $receipt_digest" "$migration" || { echo 'FAIL: recibo divergiu' >&2; exit 2; }
digest="sha256:$(shasum -a 256 "$migration" | cut -d' ' -f1)"
schema_digest="sha256:$(shasum -a 256 "$schema_migration" | cut -d' ' -f1)"
prior_digest="sha256:$(shasum -a 256 "$prior" | cut -d' ' -f1)"

ledger="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c \
  "select coalesce(max(version),'') || '|' || count(*) filter (where version='$previous') || '|' || coalesce(max(idempotency_key) filter (where version='$previous'),'') || '|' || count(*) filter (where version='$schema_version') || '|' || coalesce(max(idempotency_key) filter (where version='$schema_version'),'') || '|' || count(*) filter (where version='$version') || '|' || coalesce(max(idempotency_key) filter (where version='$version'),'') from supabase_migrations.schema_migrations")"
IFS='|' read -r top prior_count prior_key schema_count schema_key target_count target_key <<<"$ledger"
if [[ "$top" == "$version" && "$prior_count" == 1 && "$prior_key" == "$prior_digest" && "$schema_count" == 1 && "$schema_key" == "$schema_digest" && "$target_count" == 1 && "$target_key" == "$digest" ]]; then
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
    psql -X -v ON_ERROR_STOP=1 -f "$readback"
  echo 'PASS: quarentena já aplicada; ledger e readback conferidos'
  exit 0
fi
[[ "$top" == "$previous" && "$prior_count" == 1 && "$prior_key" == "$prior_digest" && "$schema_count" == 0 && "$target_count" == 0 ]] || {
  echo "FAIL: ledger inicial divergente: $ledger" >&2; exit 1;
}

python3 - "$PF_EXPECTED_SHA" "$mode" "$previous" "$prior_digest" "$schema_version" "$schema_digest" "$schema_migration" "$version" "$digest" "$migration" "$readback" <<'PY' | \
  PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
import base64, pathlib, re, sys
sha, mode, previous, prior_digest, schema_version, schema_digest, schema_migration, version, digest, migration, readback = sys.argv[1:]
readback_text = pathlib.Path(readback).read_text()
if len(re.findall(r'(?im)^\s*BEGIN READ ONLY;\s*$', readback_text)) != 1 or len(re.findall(r'(?im)^\s*COMMIT;\s*$', readback_text)) != 1:
    raise SystemExit('FAIL: readback sem fronteira transacional única')
def lit(s): return "'" + s.replace("'", "''") + "'"
print('BEGIN;')
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));")
print('LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;')
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(previous)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(previous)} AND idempotency_key={lit(prior_digest)}) <> 1 OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ({lit(schema_version)},{lit(version)})) THEN RAISE EXCEPTION 'gastos: ledger divergiu sob lock'; END IF; END $ledger$;")
for v, d, path in [(schema_version, schema_digest, schema_migration), (version, digest, migration)]:
    raw = pathlib.Path(path).read_bytes()
    text = raw.decode('utf-8')
    begin = list(re.finditer(r'(?im)^\s*BEGIN;\s*$', text))
    commit = list(re.finditer(r'(?im)^\s*COMMIT;\s*$', text))
    if len(begin) != 1 or len(commit) != 1 or begin[0].end() >= commit[0].start():
        raise SystemExit('FAIL: migration sem fronteira transacional única: ' + path)
    print(text[begin[0].end():commit[0].start()])
    encoded = base64.b64encode(raw).decode('ascii')
    name = pathlib.Path(path).stem.removeprefix(v + '_')
    print('INSERT INTO supabase_migrations.schema_migrations (version,statements,name,created_by,idempotency_key) VALUES (')
    print(f"{lit(v)}, ARRAY[convert_from(decode({lit(encoded)},'base64'),'UTF8')], {lit(name)}, {lit('Thiago Salvador <contato.thiagosalvador@gmail.com> via github-actions:' + sha)}, {lit(d)});")
readback_body = re.sub(r'(?im)^\s*(?:BEGIN READ ONLY|COMMIT);\s*$', '', readback_text)
print(readback_body)
print('RESET ROLE;')
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(schema_version)} AND idempotency_key={lit(schema_digest)}) <> 1 OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)}) <> 1 THEN RAISE EXCEPTION 'gastos: ledger final divergiu'; END IF; END $ledger$;")
print('ROLLBACK;' if mode == 'dry-run' else 'COMMIT;')
PY

if [[ "$mode" == 'apply' ]]; then
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
    psql -X -v ON_ERROR_STOP=1 -f "$readback"
fi
echo "PASS: $mode, migration, ledger e readback conferidos"
