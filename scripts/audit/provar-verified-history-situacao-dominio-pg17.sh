#!/usr/bin/env bash
# Local-only, disposable PostgreSQL behavioral proof. Requires Docker running.
# 1. Reproduces the failure on the original RPC.
# 2. Applies the migration with its readback embedded in the same write
#    transaction, split exactly like the production runner does.
# 3. Checks the fixed RPC, the standalone read-only readback and the rollback.
# 4. Checks that the embedded readback aborts the apply if the RPC still
#    rejects 'pendente de julgamento'.
set -euo pipefail
cd "$(dirname "$0")/../.."
CONTAINER="pf-verified-situacao-proof-$$"
IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION=20260924120000
MIGRATION="supabase/migrations/${VERSION}_verified_history_situacao_dominio.sql"
READBACK="supabase/readback/${VERSION}_verified_history_situacao_dominio.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_verified_history_situacao_dominio.rollback.sql"
cleanup() { docker rm -fv "$CONTAINER" >/dev/null; }
trap cleanup EXIT
docker run -d --name "$CONTAINER" -e POSTGRES_HOST_AUTH_METHOD=trust -v "$(pwd):/repo:ro" "$IMAGE" >/dev/null
ready=0
for _ in {1..30}; do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]]
psql_repo() { docker exec -i -w /repo "$CONTAINER" psql -U postgres -X -v ON_ERROR_STOP=1 "$@"; }

transactional() {
  python3 - "$1" "$2" <<'PY'
import pathlib, re, sys
def split_body(path):
    text = pathlib.Path(path).read_text(encoding="utf-8")
    begins = list(re.finditer(r"(?im)^\s*BEGIN(?: READ ONLY)?;\s*$", text))
    commits = list(re.finditer(r"(?im)^\s*COMMIT;\s*$", text))
    if len(begins) != 1 or len(commits) != 1 or begins[0].end() >= commits[0].start():
        raise SystemExit(f"{path}: expected one outer BEGIN and COMMIT")
    return text[begins[0].end():commits[0].start()]
print("BEGIN;")
print(split_body(sys.argv[1]))
print("INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260924120000');")
print(split_body(sys.argv[2]))
print("COMMIT;")
PY
}

psql_repo -v fase=antes -f tests/verified-history-situacao-dominio.pg.sql

# Negative control: the embedded readback must abort a transaction whose RPC
# still carries the old list. The rollback body (the original function) stands
# in for the migration body.
negative="$(transactional "$ROLLBACK" "$READBACK" | psql_repo -q -f - 2>&1 >/dev/null || true)"
grep -q "verified history situacao: pendente de julgamento still rejected" <<<"$negative" || {
  echo "FAIL: embedded readback did not reject the original list: $negative" >&2
  exit 1
}
psql_repo -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='${VERSION}'" | grep -qx 0
echo "PASS embedded readback aborts the apply while the old list is live"

transactional "$MIGRATION" "$READBACK" | psql_repo -f -
psql_repo -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='${VERSION}'" | grep -qx 1
echo "PASS migration and embedded readback committed together"

psql_repo -v fase=depois -f tests/verified-history-situacao-dominio.pg.sql
echo "PASS verified history situacao domain proof"
