#!/usr/bin/env bash
# Aplica somente as quatro migrations do release de chapas 2026.
set -euo pipefail
case $- in *x*) set +x ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/audit/lib/configure-libpq-from-url.sh
source "$ROOT/scripts/audit/lib/configure-libpq-from-url.sh"

: "${PF_DATABASE_URL:?PF_DATABASE_URL e obrigatoria}"
: "${PF_EXPECTED_SHA:?PF_EXPECTED_SHA e obrigatoria}"

if [[ ! "$PF_EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "FAIL: PF_EXPECTED_SHA invalido" >&2
  exit 2
fi
if [[ "$(git rev-parse HEAD)" != "$PF_EXPECTED_SHA" ]]; then
  echo "FAIL: checkout nao corresponde ao SHA autorizado" >&2
  exit 2
fi
if [[ -n "$(git status --porcelain=v1 --untracked-files=normal)" ]]; then
  echo "FAIL: checkout possui alteracoes" >&2
  exit 2
fi
if [[ "${GITHUB_REF:-refs/heads/main}" != "refs/heads/main" ]]; then
  echo "FAIL: aplicacao autorizada somente a partir de main" >&2
  exit 2
fi

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
} 2>/dev/null)" || {
  echo "FAIL: PF_DATABASE_URL nao identifica inequivocamente um projeto Supabase" >&2
  exit 2
}
if [[ "$database_ref" != "wskpzsobvqwhnbsdsmok" ]]; then
  echo "FAIL: PF_DATABASE_URL nao aponta para producao" >&2
  exit 2
fi

unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE
unset PGSERVICE PGSERVICEFILE PGOPTIONS
unset PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCRLDIR
pf_configure_libpq_from_url
export PGCONNECT_TIMEOUT=10
export PGSSLMODE=verify-full
export PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt"

versions=(20260813040000 20260813040100 20260813040200 20260816011000)

unique_file() {
  local dir="$1" version="$2" suffix="$3"
  local matches=("$dir/${version}_"*"$suffix")
  if [[ ! -f "${matches[0]}" || "${#matches[@]}" -ne 1 ]]; then
    echo "FAIL: esperado exatamente um arquivo $suffix para $version" >&2
    return 2
  fi
  printf '%s' "${matches[0]}"
}

state="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -c \
  "select coalesce(max(version),'') || '|' || count(*) filter (where version in ('20260813040000','20260813040100','20260813040200','20260816011000')) from supabase_migrations.schema_migrations")"
if [[ "$state" != "20260812130000|0" && "$state" != "20260816010000|0" ]]; then
  echo "FAIL: ledger inicial divergiu: $state, esperado 20260812130000|0 ou 20260816010000|0" >&2
  exit 1
fi

release_args=("$PF_EXPECTED_SHA")
for i in "${!versions[@]}"; do
  version="${versions[$i]}"
  migration="$(unique_file "$ROOT/supabase/migrations" "$version" .sql)"
  rollback="$(unique_file "$ROOT/supabase/rollback" "$version" .rollback.sql)"
  readback="$(unique_file "$ROOT/supabase/readback" "$version" .readback.sql)"
  release_args+=("$version" "$migration" "$rollback" "$readback")
done

python3 - "${release_args[@]}" <<'PY' \
  | PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' \
      psql -X -v ON_ERROR_STOP=1 -f -
import base64, hashlib, pathlib, sys
sha, *args = sys.argv[1:]
if len(args) != 16:
    raise SystemExit("esperava quatro quartetos de release")
def b64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")
def lit(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"
print("BEGIN;")
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:chapas-2026-release',0));")
print("DO $$ BEGIN")
print("  IF (SELECT coalesce(max(version),'') FROM supabase_migrations.schema_migrations) NOT IN ('20260812130000','20260816010000')")
print("     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('20260813040000','20260813040100','20260813040200','20260816011000')) THEN")
print("    RAISE EXCEPTION 'ledger inicial divergiu sob lock';")
print("  END IF;")
print("END $$;")
for index in range(0, len(args), 4):
    version, migration_path, rollback_path, readback_path = args[index:index+4]
    migration = pathlib.Path(migration_path).read_bytes()
    rollback = pathlib.Path(rollback_path).read_bytes()
    readback = pathlib.Path(readback_path).read_bytes()
    name = pathlib.Path(migration_path).stem.removeprefix(version + "_")
    print(migration.decode("utf-8"), end="" if migration.endswith(b"\n") else "\n")
    print(readback.decode("utf-8"), end="" if readback.endswith(b"\n") else "\n")
    print("INSERT INTO supabase_migrations.schema_migrations")
    print("  (version, statements, name, created_by, idempotency_key, rollback)")
    print("VALUES (")
    print(f"  {lit(version)},")
    print(f"  ARRAY[convert_from(decode({lit(b64(migration))}, 'base64'), 'UTF8')],")
    print(f"  {lit(name)},")
    print(f"  {lit('github-actions:' + sha)},")
    print(f"  {lit('sha256:' + hashlib.sha256(migration).hexdigest())},")
    print(f"  ARRAY[convert_from(decode({lit(b64(rollback))}, 'base64'), 'UTF8')]")
    print(");")
print("DO $$ BEGIN")
print("  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> '20260816011000'")
print("     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20260813040000','20260813040100','20260813040200','20260816011000')) <> 4 THEN")
print("    RAISE EXCEPTION 'ledger final divergiu';")
print("  END IF;")
print("END $$;")
print("COMMIT;")
PY

echo "PASS: migrations 20260813040000, 20260813040100, 20260813040200 e 20260816011000 aplicadas com readback"
