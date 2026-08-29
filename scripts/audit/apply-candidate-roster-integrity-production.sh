#!/usr/bin/env bash
# Rota fechada para o release predecessor do issue #138.
# Aplica somente 20260829030000 e 20260829030001, em uma transação única.
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

data_version=20260829030000
schema_version=20260829030001
previous_version=20260828025037
data=("$ROOT/supabase/migrations/${data_version}_"*.sql)
schema=("$ROOT/supabase/migrations/${schema_version}_"*.sql)
data_rollback=("$ROOT/supabase/rollback/${data_version}_"*.rollback.sql)
schema_rollback=("$ROOT/supabase/rollback/${schema_version}_"*.rollback.sql)
readback=("$ROOT/supabase/readback/${data_version}_candidate_roster_publication_integrity.readback.sql")
[[ ${#data[@]} -eq 1 && -f ${data[0]} ]] || { echo "FAIL: roster data nao unico" >&2; exit 2; }
[[ ${#schema[@]} -eq 1 && -f ${schema[0]} ]] || { echo "FAIL: roster schema nao unico" >&2; exit 2; }
[[ ${#data_rollback[@]} -eq 1 && -f ${data_rollback[0]} ]] || { echo "FAIL: rollback roster data nao unico" >&2; exit 2; }
[[ ${#schema_rollback[@]} -eq 1 && -f ${schema_rollback[0]} ]] || { echo "FAIL: rollback roster schema nao unico" >&2; exit 2; }
[[ ${#readback[@]} -eq 1 && -f ${readback[0]} ]] || { echo "FAIL: readback roster nao unico" >&2; exit 2; }

data_hash="sha256:$(shasum -a 256 "${data[0]}" | cut -d' ' -f1)"
schema_hash="sha256:$(shasum -a 256 "${schema[0]}" | cut -d' ' -f1)"
state="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c \
  "select coalesce(max(version),'') || '|' || count(*) filter(where version='$data_version') || '|' || coalesce(max(idempotency_key) filter(where version='$data_version'),'') || '|' || count(*) filter(where version='$schema_version') || '|' || coalesce(max(idempotency_key) filter(where version='$schema_version'),'') from supabase_migrations.schema_migrations")"
IFS='|' read -r ledger_top data_count data_key schema_count schema_key <<<"$state"

if [[ "$data_count" == "1" && "$data_key" == "$data_hash" && "$schema_count" == "1" && "$schema_key" == "$schema_hash" && "$ledger_top" == "$schema_version" ]]; then
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f "${readback[0]}"
  echo "PASS: roster 30000/30001 ja aplicado, ledger e readback conferem"
  exit 0
fi

start=0
if [[ "$data_count" == "1" && "$data_key" == "$data_hash" && "$schema_count" == "0" && "$ledger_top" == "$data_version" ]]; then start=1
elif [[ "$data_count" != "0" || "$schema_count" != "0" || "$ledger_top" != "$previous_version" ]]; then
  echo "FAIL: ledger roster inicial ou parcial inesperado: $state" >&2
  exit 1
fi

python3 - "$PF_EXPECTED_SHA" "$start" "$previous_version" "$data_version" "$schema_version" "$data_hash" "$schema_hash" "${data[0]}" "${schema[0]}" "${data_rollback[0]}" "${schema_rollback[0]}" "${readback[0]}" <<'PY' | PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
import base64, pathlib, re, sys

sha, start, previous, data_version, schema_version, data_digest, schema_digest, data_path, schema_path, data_rollback_path, schema_rollback_path, readback_path = sys.argv[1:]
start = int(start)

def split_body(path):
    raw = pathlib.Path(path).read_bytes()
    text = raw.decode("utf-8")
    begins = list(re.finditer(r"(?im)^\s*BEGIN;\s*$", text))
    commits = list(re.finditer(r"(?im)^\s*COMMIT;\s*$", text))
    if len(begins) != 1 or len(commits) != 1 or begins[0].end() >= commits[0].start():
        raise SystemExit(f"{path}: deve ter exatamente um BEGIN e um COMMIT externos")
    return raw, text[begins[0].end():commits[0].start()]

data_raw, data_body = split_body(data_path)
schema_raw, schema_body = split_body(schema_path)
data_rollback = pathlib.Path(data_rollback_path).read_bytes()
schema_rollback = pathlib.Path(schema_rollback_path).read_bytes()
readback = pathlib.Path(readback_path).read_bytes()

def lit(value): return "'" + value.replace("'", "''") + "'"
def b64(value): return base64.b64encode(value).decode("ascii")

def ledger_insert(version, digest, path, raw, rollback):
    name = pathlib.Path(path).stem.removeprefix(version + "_")
    created_by = "Thiago Salvador <contato.thiagosalvador@gmail.com> via github-actions:" + sha
    print("INSERT INTO supabase_migrations.schema_migrations")
    print("  (version, statements, name, created_by, idempotency_key, rollback)")
    print("VALUES (")
    print(f"  {lit(version)}, ARRAY[convert_from(decode({lit(b64(raw))}, 'base64'), 'UTF8')],")
    print(f"  {lit(name)}, {lit(created_by)}, {lit(digest)},")
    print(f"  ARRAY[convert_from(decode({lit(b64(rollback))}, 'base64'), 'UTF8')]")
    print(");")

print("BEGIN;")
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:candidate-roster-integrity-production', 0));")
if start == 0:
    print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(previous)} OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ({lit(data_version)}, {lit(schema_version)})) THEN RAISE EXCEPTION 'roster: ledger divergiu sob lock'; END IF; END $ledger$;")
    print(data_body, end="" if data_body.endswith("\n") else "\n")
    ledger_insert(data_version, data_digest, data_path, data_raw, data_rollback)
else:
    print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(data_version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(data_version)} AND idempotency_key={lit(data_digest)}) <> 1 OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version={lit(schema_version)}) THEN RAISE EXCEPTION 'roster: ledger divergiu antes do schema'; END IF; END $ledger$;")
print(schema_body, end="" if schema_body.endswith("\n") else "\n")
print(readback.decode("utf-8"), end="" if readback.endswith(b"\n") else "\n")
ledger_insert(schema_version, schema_digest, schema_path, schema_raw, schema_rollback)
print("DO $ledger$ BEGIN")
print(f"  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(schema_version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(data_version)} AND idempotency_key={lit(data_digest)}) <> 1 OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(schema_version)} AND idempotency_key={lit(schema_digest)}) <> 1 THEN")
print("    RAISE EXCEPTION 'roster: ledger final divergiu';")
print("  END IF;")
print("END $ledger$;")
print("COMMIT;")
PY

PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f "${readback[0]}"
echo "PASS: roster 30000/30001 aplicado, ledger e readback concluídos"
