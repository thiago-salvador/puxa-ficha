#!/usr/bin/env bash
# Rollback coordenado do roster: executa o rollback combinado de 30000,
# remove as linhas 30000 e 30001 juntas e nunca repete a escrita do schema.
set -euo pipefail
case $- in *x*) set +x ;; esac
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/audit/lib/configure-libpq-from-url.sh"
: "${PF_DATABASE_URL:?PF_DATABASE_URL e obrigatoria}"
: "${PF_EXPECTED_SHA:?PF_EXPECTED_SHA e obrigatoria}"
: "${GITHUB_REF:?GITHUB_REF e obrigatoria}"
[[ "$PF_EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "FAIL: SHA invalido" >&2; exit 2; }
[[ "$(git rev-parse HEAD)" == "$PF_EXPECTED_SHA" ]] || { echo "FAIL: checkout divergiu" >&2; exit 2; }
[[ -z "$(git status --porcelain=v1 --untracked-files=normal)" ]] || { echo "FAIL: checkout sujo" >&2; exit 2; }
[[ "$GITHUB_REF" == "refs/heads/main" ]] || { echo "FAIL: somente main" >&2; exit 2; }
[[ "$(git ls-remote https://github.com/thiago-salvador/puxa-ficha.git refs/heads/main | cut -f1)" == "$PF_EXPECTED_SHA" ]] || { echo "FAIL: SHA nao e o topo remoto de main" >&2; exit 2; }
database_ref="$({ node <<'NODE'
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
unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE PGOPTIONS PGSERVICE PGSERVICEFILE PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCRLDIR
pf_configure_libpq_from_url
export PGCONNECT_TIMEOUT=10 PGSSLMODE=verify-full PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt"
data_version=20260829030000
schema_version=20260829030001
previous_version=20260828025037
rollback="$ROOT/supabase/rollback/${data_version}_candidate_roster_publication_integrity.rollback.sql"
readback="$ROOT/supabase/readback/${data_version}_candidate_roster_publication_integrity.rollback.readback.sql"
[[ -f "$rollback" && -f "$readback" ]] || { echo "FAIL: rollback/readback roster ausente" >&2; exit 2; }
data_hash="sha256:$(shasum -a 256 "$ROOT/supabase/migrations/${data_version}_candidate_roster_publication_integrity.sql" | cut -d' ' -f1)"
schema_hash="sha256:$(shasum -a 256 "$ROOT/supabase/migrations/${schema_version}_candidate_roster_publication_integrity_schema.sql" | cut -d' ' -f1)"
rollback_hash="sha256:$(shasum -a 256 "$rollback" | cut -d' ' -f1)"
state="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c "select coalesce(max(version),'') || '|' || count(*) filter(where version='$data_version') || '|' || coalesce(max(idempotency_key) filter(where version='$data_version'),'') || '|' || count(*) filter(where version='$schema_version') || '|' || coalesce(max(idempotency_key) filter(where version='$schema_version'),'') from supabase_migrations.schema_migrations")"
IFS='|' read -r ledger_top data_count data_key schema_count schema_key <<<"$state"
[[ "$ledger_top" == "$schema_version" && "$data_count" == "1" && "$data_key" == "$data_hash" && "$schema_count" == "1" && "$schema_key" == "$schema_hash" ]] || { echo "FAIL: rollback roster exige ledger 30000+30001 exato no topo: $state" >&2; exit 1; }
python3 "$rollback" "$data_version" "$schema_version" "$data_hash" "$schema_hash" "$rollback_hash" "$previous_version" "$readback" <<'PY' | PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
import hashlib, pathlib, re, sys
rollback_path, data_version, schema_version, data_digest, schema_digest, rollback_digest, previous, readback_path = sys.argv[1:]
raw = pathlib.Path(rollback_path).read_bytes()
if "sha256:" + hashlib.sha256(raw).hexdigest() != rollback_digest: raise SystemExit("rollback roster mudou durante a preparacao")
text = raw.decode("utf-8")
begins = list(re.finditer(r"(?im)^\s*BEGIN;\s*$", text)); commits = list(re.finditer(r"(?im)^\s*COMMIT;\s*$", text))
if len(begins) != 1 or len(commits) != 1 or begins[0].end() >= commits[0].start(): raise SystemExit("rollback roster deve ter BEGIN/COMMIT unicos")
body = text[begins[0].end():commits[0].start()]
def lit(v): return "'" + v.replace("'", "''") + "'"
print("BEGIN;")
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:candidate-roster-integrity-production', 0));")
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(schema_version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(data_version)} AND idempotency_key={lit(data_digest)}) <> 1 OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(schema_version)} AND idempotency_key={lit(schema_digest)}) <> 1 THEN RAISE EXCEPTION 'rollback roster: ledger divergiu sob lock'; END IF; END $ledger$;")
print(body, end="" if body.endswith("\n") else "\n")
print(f"DELETE FROM supabase_migrations.schema_migrations WHERE version IN ({lit(data_version)}, {lit(schema_version)});")
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(previous)} OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ({lit(data_version)}, {lit(schema_version)})) THEN RAISE EXCEPTION 'rollback roster: ledger final divergiu'; END IF; END $ledger$;")
print(pathlib.Path(readback_path).read_text(encoding="utf-8"), end="")
print("COMMIT;")
PY
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f "$readback"
echo "PASS: rollback coordenado do roster aplicado, duas linhas removidas e readback confere"
