#!/usr/bin/env bash
# Aplica a quarentena ampliada de gastos parlamentares com CAS, ledger, readback
# e prova de leitura anônima.
# Uso:
#   apply-gastos-parlamentares-quarentena-universo-production.sh dry-run|apply
#     Exige PF_DATABASE_URL, PF_EXPECTED_SHA, PF_PREVIOUS_VERSION e GITHUB_REF.
#   apply-gastos-parlamentares-quarentena-universo-production.sh print-sql dry-run|apply
#   apply-gastos-parlamentares-quarentena-universo-production.sh print-anon-sql
#     Só leem arquivos do checkout e imprimem o SQL que seria enviado; não
#     conectam em banco. Usados pela prova descartável em PG17.
set -euo pipefail
case $- in *x*) set +x ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

mode="${1:-}"
case "$mode" in
  dry-run|apply) print_only='' ;;
  print-sql) print_only=tx; tx_mode="${2:-}"; [[ "$tx_mode" == dry-run || "$tx_mode" == apply ]] || exit 2 ;;
  print-anon-sql) print_only=anon ;;
  *) exit 2 ;;
esac
[[ -n "$print_only" ]] || tx_mode="$mode"

: "${PF_PREVIOUS_VERSION:?}"
[[ "$PF_PREVIOUS_VERSION" =~ ^[0-9]{14}$ ]] || exit 2

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

# Prova de leitura pública: como anon, nenhum dos UUIDs da preimage pode ser lido.
# Os UUIDs saem da própria migration; a contagem precisa bater com o readback.
anon_sql="$(python3 - "$migration" "$readback" <<'PY'
import pathlib, re, sys
mig, rb = (pathlib.Path(p).read_text() for p in sys.argv[1:3])
ids = re.findall(r"^\s*\('([0-9a-f-]{36})'::uuid, ", mig, re.M)
esperado = re.search(r"v_rows <> (\d+) OR", rb)
if not ids or not esperado or len(ids) != int(esperado.group(1)) or len(set(ids)) != len(ids):
    raise SystemExit('FAIL: UUIDs da preimage não batem com o readback')
lista = ",".join(f"'{i}'::uuid" for i in ids)
print(f"DO $anon$ BEGIN IF EXISTS (SELECT 1 FROM public.gastos_parlamentares WHERE id IN ({lista})) THEN RAISE EXCEPTION 'gastos-universo: anon ainda lê linha em quarentena'; END IF; END $anon$;")
PY
)"

# Segunda sessão, fora do texto embutido na transação do apply.
anon_session_sql() {
  echo 'BEGIN READ ONLY;'
  echo 'SET LOCAL ROLE anon;'
  echo "$anon_sql"
  echo 'COMMIT;'
}

readback_session_sql() {
  echo 'BEGIN READ ONLY;'
  cat "$readback"
  echo 'COMMIT;'
}

tx_sql() {
  PF_ANON_SQL="$anon_sql" python3 - "${PF_EXPECTED_SHA:-print-sql}" "$tx_mode" "$previous" "$version" "$digest" "$migration" "$readback" <<'PY'
import base64, os, pathlib, re, sys
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
# Mesma transação: como anon, as linhas marcadas já não aparecem (vale também no dry-run).
print('SET LOCAL ROLE anon;')
print(os.environ['PF_ANON_SQL'])
print('RESET ROLE;')
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = {lit(version)} AND idempotency_key = {lit(digest)}) <> 1 THEN RAISE EXCEPTION 'gastos-universo: ledger final divergiu'; END IF; END $ledger$;")
print('ROLLBACK;' if mode == 'dry-run' else 'COMMIT;')
PY
}

if [[ "$print_only" == tx ]]; then tx_sql; exit 0; fi
if [[ "$print_only" == anon ]]; then anon_session_sql; exit 0; fi

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

ledger="$(PGOPTIONS="$ro_opts" psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c \
  "select coalesce(max(version),'') || '|' || count(*) filter (where version='$previous') || '|' || coalesce(max(idempotency_key) filter (where version='$previous'),'') || '|' || count(*) filter (where version='$version') || '|' || coalesce(max(idempotency_key) filter (where version='$version'),'') from supabase_migrations.schema_migrations")"
IFS='|' read -r top prior_count prior_key target_count target_key <<<"$ledger"

if [[ "$target_count" == 1 && "$target_key" == "$digest" ]]; then
  readback_session_sql | PGOPTIONS="$ro_opts" psql -X -v ON_ERROR_STOP=1 -f -
  anon_session_sql | PGOPTIONS="$ro_opts" psql -X -v ON_ERROR_STOP=1 -f -
  echo 'PASS: quarentena ampliada já aplicada; ledger, readback e leitura anon conferidos'
  exit 0
fi
# O ledger antigo não tem idempotency_key em toda linha; a anterior basta existir uma vez.
[[ "$top" == "$previous" && "$prior_count" == 1 && "$target_count" == 0 ]] || {
  echo "FAIL: ledger inicial divergente: $ledger" >&2; exit 1;
}
[[ -z "$prior_key" || "$prior_key" == "$prior_digest" ]] || { echo 'FAIL: digest da migration anterior divergiu' >&2; exit 1; }

tx_sql | PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -

if [[ "$mode" == 'apply' ]]; then
  readback_session_sql | PGOPTIONS="$ro_opts" psql -X -v ON_ERROR_STOP=1 -f -
  anon_session_sql | PGOPTIONS="$ro_opts" psql -X -v ON_ERROR_STOP=1 -f -
fi
echo "PASS: $mode, migration, ledger, readback e leitura anon conferidos"
