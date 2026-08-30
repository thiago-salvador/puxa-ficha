#!/usr/bin/env bash
# Aplica somente a migration 20260830151500, com predecessor, hash, lock,
# ledger e readback fechados para o projeto de producao do Puxa Ficha.
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

version=20260830151500
previous_version=20260830143500
previous_digest=sha256:1283572d3eea21bb04408bdf1aef845ad376c05c87241183eea9a726dc1bdfa9
migration="$ROOT/supabase/migrations/${version}_destaques_freshness_reconciliation.sql"
rollback="$ROOT/supabase/rollback/${version}_destaques_freshness_reconciliation.rollback.sql"
readback="$ROOT/supabase/readback/${version}_destaques_freshness_reconciliation.readback.sql"
[[ -f "$migration" && -f "$rollback" && -f "$readback" ]] || {
  echo "FAIL: artefato de reconciliacao de freshness ausente" >&2
  exit 2
}

digest="sha256:$(shasum -a 256 "$migration" | cut -d' ' -f1)"
state="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c \
  "select coalesce(max(version),'') || '|' || count(*) filter(where version='$previous_version') || '|' || coalesce(max(idempotency_key) filter(where version='$previous_version'),'') || '|' || count(*) filter(where version='$version') || '|' || coalesce(max(idempotency_key) filter(where version='$version'),'') from supabase_migrations.schema_migrations")"
IFS='|' read -r ledger_top previous_count previous_key version_count version_key <<<"$state"

if [[ "$ledger_top" == "$version" && "$version_count" == "1" && "$version_key" == "$digest" && "$previous_count" == "1" && "$previous_key" == "$previous_digest" ]]; then
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
    psql -X -v ON_ERROR_STOP=1 -f "$readback"
  echo "PASS: freshness de destaques ja aplicada, ledger e readback conferem"
  exit 0
fi
if [[ "$ledger_top" != "$previous_version" || "$previous_count" != "1" || "$previous_key" != "$previous_digest" || "$version_count" != "0" ]]; then
  echo "FAIL: ledger inicial de freshness de destaques inesperado: $state" >&2
  exit 1
fi

python3 - "$PF_EXPECTED_SHA" "$version" "$previous_version" "$digest" "$previous_digest" "$migration" "$rollback" "$readback" <<'PY' | \
  PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
import base64, pathlib, re, sys

sha, version, previous, digest, previous_digest, migration_path, rollback_path, readback_path = sys.argv[1:]

def split_body(path):
    raw = pathlib.Path(path).read_bytes()
    text = raw.decode("utf-8")
    begins = list(re.finditer(r"(?im)^\s*BEGIN;\s*$", text))
    commits = list(re.finditer(r"(?im)^\s*COMMIT;\s*$", text))
    if len(begins) != 1 or len(commits) != 1 or begins[0].end() >= commits[0].start():
        raise SystemExit(f"{path}: deve ter BEGIN/COMMIT externos unicos")
    return raw, text[begins[0].end():commits[0].start()]

def lit(value): return "'" + value.replace("'", "''") + "'"
def b64(value): return base64.b64encode(value).decode("ascii")

raw, body = split_body(migration_path)
rollback = pathlib.Path(rollback_path).read_bytes()
readback = pathlib.Path(readback_path).read_bytes()
name = pathlib.Path(migration_path).stem.removeprefix(version + "_")
created_by = "Thiago Salvador <contato.thiagosalvador@gmail.com> via github-actions:" + sha

print("BEGIN;")
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:destaques-freshness-production', 0));")
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(previous)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(previous)} AND idempotency_key={lit(previous_digest)}) <> 1 OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version={lit(version)}) THEN RAISE EXCEPTION 'freshness de destaques: ledger divergiu sob lock'; END IF; END $ledger$;")
print(body, end="" if body.endswith("\n") else "\n")
print("INSERT INTO supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback) VALUES (")
print(f"  {lit(version)}, ARRAY[convert_from(decode({lit(b64(raw))}, 'base64'), 'UTF8')], {lit(name)}, {lit(created_by)}, {lit(digest)}, ARRAY[convert_from(decode({lit(b64(rollback))}, 'base64'), 'UTF8')]);")
print(readback.decode("utf-8"), end="" if readback.endswith(b"\n") else "\n")
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)}) <> 1 THEN RAISE EXCEPTION 'freshness de destaques: ledger final divergiu'; END IF; END $ledger$;")
print("COMMIT;")
PY

PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -f "$readback"
echo "PASS: freshness de destaques aplicada, ledger e readback concluidos"
