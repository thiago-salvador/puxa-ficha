#!/usr/bin/env bash
# Aplica a quarentena ampliada de gastos parlamentares com CAS, ledger e readback.
# Uso: apply-gastos-parlamentares-quarentena-universo-production.sh dry-run|apply
# Exige PF_DATABASE_URL, PF_EXPECTED_SHA, PF_PREVIOUS_VERSION e GITHUB_REF.
set -euo pipefail
case $- in *x*) set +x ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/audit/lib/configure-libpq-from-url.sh"
: "${PF_DATABASE_URL:?}"
: "${PF_EXPECTED_SHA:?}"
: "${PF_PREVIOUS_VERSION:?}"
: "${GITHUB_REF:?}"
[[ "$PF_EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ "$PF_PREVIOUS_VERSION" =~ ^[0-9]{14}$ ]] || exit 2
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
version=20260925221042
name=quarentena_gastos_parlamentares_universo
previous="$PF_PREVIOUS_VERSION"
[[ "$previous" < "$version" ]] || { echo 'FAIL: previous_version precisa ser anterior à migration' >&2; exit 2; }
migration="$ROOT/supabase/migrations/${version}_${name}.sql"
readback="$ROOT/supabase/readback/${version}_${name}.readback.sql"
receipt="$ROOT/QA/evidencias/2026-09-25-gastos-quarentena-universo/preflight.json"
shopt -s nullglob
prior_files=("$ROOT"/supabase/migrations/"${previous}"_*.sql)
shopt -u nullglob
[[ ${#prior_files[@]} -eq 1 ]] || { echo 'FAIL: previous_version sem arquivo único em supabase/migrations' >&2; exit 2; }
prior="${prior_files[0]}"
# A migration anterior no ledger tem de ser a imediatamente anterior em ordem de arquivo.
expected_prior="$(ls "$ROOT"/supabase/migrations/*.sql | sed 's#.*/##' | sort | awk -v v="$version" '$0 < v' | tail -1)"
[[ "$(basename "$prior")" == "$expected_prior" ]] || { echo "FAIL: previous_version não é a migration anterior em ordem de arquivo ($expected_prior)" >&2; exit 2; }
[[ -f "$migration" && -f "$readback" && -f "$receipt" ]] || exit 2
receipt_digest="$(shasum -a 256 "$receipt" | cut -d' ' -f1)"
grep -Fqx -- "-- SHA-256: $receipt_digest" "$migration" || { echo 'FAIL: recibo divergiu' >&2; exit 2; }
if grep -Eiq '^[[:space:]]*(BEGIN([[:space:]]+READ[[:space:]]+ONLY)?[[:space:]]*;|COMMIT[[:space:]]*;|ROLLBACK[[:space:]]*;|SET[[:space:]]+(LOCAL[[:space:]]+)?ROLE)' "$readback"; then
  echo 'FAIL: readback não pode abrir, fechar transação nem trocar de papel' >&2; exit 2
fi
digest="sha256:$(shasum -a 256 "$migration" | cut -d' ' -f1)"
prior_digest="sha256:$(shasum -a 256 "$prior" | cut -d' ' -f1)"
ro_opts='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000'

ledger="$(PGOPTIONS="$ro_opts" psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c \
  "select coalesce(max(version),'') || '|' || count(*) filter (where version='$previous') || '|' || coalesce(max(idempotency_key) filter (where version='$previous'),'') || '|' || count(*) filter (where version='$version') || '|' || coalesce(max(idempotency_key) filter (where version='$version'),'') from supabase_migrations.schema_migrations")"
IFS='|' read -r top prior_count prior_key target_count target_key <<<"$ledger"
if [[ "$target_count" == 1 && "$target_key" == "$digest" ]]; then
  { echo 'BEGIN READ ONLY;'; cat "$readback"; echo 'COMMIT;'; } | PGOPTIONS="$ro_opts" psql -X -v ON_ERROR_STOP=1 -f -
  echo 'PASS: quarentena ampliada já aplicada; ledger e readback conferidos'
  exit 0
fi
# O ledger antigo não tem idempotency_key em toda linha; a anterior basta existir uma vez.
[[ "$top" == "$previous" && "$prior_count" == 1 && "$target_count" == 0 ]] || {
  echo "FAIL: ledger inicial divergente: $ledger" >&2; exit 1;
}
[[ -z "$prior_key" || "$prior_key" == "$prior_digest" ]] || { echo 'FAIL: digest da migration anterior divergiu' >&2; exit 1; }

python3 - "$PF_EXPECTED_SHA" "$mode" "$previous" "$version" "$digest" "$migration" "$readback" <<'PY' | \
  PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
import base64, pathlib, re, sys
sha, mode, previous, version, digest, migration, readback = sys.argv[1:]
def lit(s): return "'" + s.replace("'", "''") + "'"
raw = pathlib.Path(migration).read_bytes()
text = raw.decode('utf-8')
begin = list(re.finditer(r'(?im)^\s*BEGIN;\s*$', text))
commit = list(re.finditer(r'(?im)^\s*COMMIT;\s*$', text))
if len(begin) != 1 or len(commit) != 1 or begin[0].end() >= commit[0].start():
    raise SystemExit('FAIL: migration sem fronteira transacional única')
print('BEGIN;')
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));")
print('LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;')
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(previous)} OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = {lit(version)}) THEN RAISE EXCEPTION 'gastos-universo: ledger divergiu sob lock'; END IF; END $ledger$;")
print(text[begin[0].end():commit[0].start()])
encoded = base64.b64encode(raw).decode('ascii')
name = pathlib.Path(migration).stem.removeprefix(version + '_')
print('INSERT INTO supabase_migrations.schema_migrations (version,statements,name,created_by,idempotency_key) VALUES (')
print(f"{lit(version)}, ARRAY[convert_from(decode({lit(encoded)},'base64'),'UTF8')], {lit(name)}, {lit('Thiago Salvador <contato.thiagosalvador@gmail.com> via github-actions:' + sha)}, {lit(digest)});")
print(pathlib.Path(readback).read_text())
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = {lit(version)} AND idempotency_key = {lit(digest)}) <> 1 THEN RAISE EXCEPTION 'gastos-universo: ledger final divergiu'; END IF; END $ledger$;")
print('ROLLBACK;' if mode == 'dry-run' else 'COMMIT;')
PY

if [[ "$mode" == 'apply' ]]; then
  { echo 'BEGIN READ ONLY;'; cat "$readback"; echo 'COMMIT;'; } | PGOPTIONS="$ro_opts" psql -X -v ON_ERROR_STOP=1 -f -
fi
echo "PASS: $mode, migration, ledger e readback conferidos"
