#!/usr/bin/env bash
# Aplica somente a migration de correção das fontes da issue #96.
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

database_ref="$({
  node <<'NODE'
const raw = process.env.PF_DATABASE_URL ?? ""
let url
try { url = new URL(raw) } catch { process.exit(2) }
if (!/^(?:postgres|postgresql):$/.test(url.protocol) || url.search || url.hash) process.exit(2)
if (url.pathname !== "/postgres") process.exit(2)
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

unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE
unset PGSERVICE PGSERVICEFILE PGOPTIONS
unset PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCRLDIR
pf_configure_libpq_from_url
export PGCONNECT_TIMEOUT=10
export PGSSLMODE=verify-full
export PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt"

version=20260825123000
previous_version=20260823160000
migration=("$ROOT/supabase/migrations/${version}_"*.sql)
rollback=("$ROOT/supabase/rollback/${version}_"*.rollback.sql)
readback=("$ROOT/supabase/readback/${version}_"*.readback.sql)
[[ ${#migration[@]} -eq 1 && -f ${migration[0]} ]] || { echo "FAIL: migration nao unica" >&2; exit 2; }
[[ ${#rollback[@]} -eq 1 && -f ${rollback[0]} ]] || { echo "FAIL: rollback nao unico" >&2; exit 2; }
[[ ${#readback[@]} -eq 1 && -f ${readback[0]} ]] || { echo "FAIL: readback nao unico" >&2; exit 2; }

migration_hash="$(shasum -a 256 "${migration[0]}" | cut -d' ' -f1)"
idempotency_key="sha256:${migration_hash}"
state="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -c \
  "select coalesce(max(version),'') || '|' || count(*) filter(where version='$version') || '|' || coalesce(max(idempotency_key) filter(where version='$version'),'') from supabase_migrations.schema_migrations")"

target_count="${state#*|}"
target_count="${target_count%%|*}"
recorded_key="${state##*|}"
if [[ "$target_count" == "1" ]]; then
  [[ "$recorded_key" == "$idempotency_key" ]] || { echo "FAIL: ledger registra conteudo diferente" >&2; exit 1; }
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
    psql -X -v ON_ERROR_STOP=1 -f "${readback[0]}"
  echo "PASS: migration $version ja estava aplicada e o readback confere"
  exit 0
fi
[[ "$state" == "${previous_version}|0|" ]] || { echo "FAIL: ledger inicial $state" >&2; exit 1; }

python3 - "$PF_EXPECTED_SHA" "$version" "$previous_version" "${migration[0]}" "${rollback[0]}" "${readback[0]}" <<'PY' \
  | PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
import base64
import hashlib
import pathlib
import re
import sys

sha, version, previous, migration_path, rollback_path, readback_path = sys.argv[1:]
migration = pathlib.Path(migration_path).read_bytes()
rollback = pathlib.Path(rollback_path).read_bytes()
readback = pathlib.Path(readback_path).read_bytes()
text = migration.decode("utf-8")
begins = list(re.finditer(r"(?im)^\s*BEGIN;\s*$", text))
commits = list(re.finditer(r"(?im)^\s*COMMIT;\s*$", text))
if len(begins) != 1 or len(commits) != 1 or begins[0].end() >= commits[0].start():
    raise SystemExit("migration deve ter exatamente um BEGIN e um COMMIT externos")
body = text[begins[0].end():commits[0].start()]

def b64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")

def lit(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"

name = pathlib.Path(migration_path).stem.removeprefix(version + "_")
digest = "sha256:" + hashlib.sha256(migration).hexdigest()
created_by = "Thiago Salvador <contato.thiagosalvador@gmail.com> via github-actions:" + sha

print("BEGIN;")
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:issue-96-production', 0));")
print("DO $ledger$ BEGIN")
print(f"  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(previous)}")
print(f"     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = {lit(version)}) THEN")
print("    RAISE EXCEPTION 'issue #96: ledger divergiu sob lock';")
print("  END IF;")
print("END $ledger$;")
print(body, end="" if body.endswith("\n") else "\n")
print(readback.decode("utf-8"), end="" if readback.endswith(b"\n") else "\n")
print("INSERT INTO supabase_migrations.schema_migrations")
print("  (version, statements, name, created_by, idempotency_key, rollback)")
print("VALUES (")
print(f"  {lit(version)},")
print(f"  ARRAY[convert_from(decode({lit(b64(migration))}, 'base64'), 'UTF8')],")
print(f"  {lit(name)},")
print(f"  {lit(created_by)},")
print(f"  {lit(digest)},")
print(f"  ARRAY[convert_from(decode({lit(b64(rollback))}, 'base64'), 'UTF8')]")
print(");")
print("DO $ledger$ BEGIN")
print(f"  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)}")
print(f"     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = {lit(version)} AND idempotency_key = {lit(digest)}) <> 1 THEN")
print("    RAISE EXCEPTION 'issue #96: ledger final divergiu';")
print("  END IF;")
print("END $ledger$;")
print("COMMIT;")
PY

PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -f "${readback[0]}"

echo "PASS: migration $version aplicada, registrada no ledger e validada por readback"
