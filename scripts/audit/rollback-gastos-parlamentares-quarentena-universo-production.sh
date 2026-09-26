#!/usr/bin/env bash
# Reverte a quarentena ampliada de gastos (20260925221042) numa transação só:
# rollback versionado, readback de rollback e conferência do ledger sob lock.
# Molde de rollback-dados-no-ar-senado-claims-production.sh.
#
#   scripts/audit/rollback-gastos-parlamentares-quarentena-universo-production.sh dry-run   # ensaio, não grava
#   scripts/audit/rollback-gastos-parlamentares-quarentena-universo-production.sh apply     # grava
#   scripts/audit/rollback-gastos-parlamentares-quarentena-universo-production.sh print-sql dry-run|apply
#     # só lê o checkout e imprime o SQL; usado pela prova descartável em PG17
set -euo pipefail
case $- in *x*) set +x ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

modo="${1:-dry-run}"
case "$modo" in
  dry-run|apply) print_only='' ;;
  print-sql) print_only=1; modo="${2:-}"; [[ "$modo" == dry-run || "$modo" == apply ]] || exit 2 ;;
  *) echo "FAIL: modo inválido: use dry-run, apply ou print-sql <modo>" >&2; exit 2 ;;
esac

version=20260925221042
name=quarentena_gastos_parlamentares_universo
# Topo esperado do ledger depois do rollback (a migration anterior em ordem de arquivo).
previous="${PF_PREVIOUS_VERSION:-20260925220200}"
[[ "$previous" =~ ^[0-9]{14}$ && "$previous" < "$version" ]] || { echo "FAIL: previous_version inválida: $previous" >&2; exit 2; }
expected_prior="$(ls "$ROOT"/supabase/migrations/*.sql | sed 's#.*/##' | sort | awk -v v="$version" '$0 < v' | tail -1)"
[[ "$expected_prior" == "${previous}_"* ]] || { echo "FAIL: previous_version não é a migration anterior em ordem de arquivo ($expected_prior)" >&2; exit 2; }
migration="$ROOT/supabase/migrations/${version}_${name}.sql"
rollback="$ROOT/supabase/rollback/${version}_${name}.rollback.sql"
rollback_readback="$ROOT/supabase/readback/${version}_${name}.rollback.readback.sql"
for f in "$migration" "$rollback" "$rollback_readback"; do
  [[ -f "$f" ]] || { echo "FAIL: artefato ausente: $f" >&2; exit 2; }
done
digest="sha256:$(shasum -a 256 "$migration" | cut -d' ' -f1)"
fecho=ROLLBACK
[[ "$modo" == "apply" ]] && fecho=COMMIT

rollback_sql() {
  python3 - "$fecho" "$version" "$digest" "$rollback" "$rollback_readback" "$previous" <<'PY'
import pathlib, re, sys
fecho, version, digest, rollback, readback, previous = sys.argv[1:]
def lit(value): return "'" + value.replace("'", "''") + "'"
text = pathlib.Path(rollback).read_text(encoding="utf-8")
begins = list(re.finditer(r"(?im)^\s*BEGIN;\s*$", text))
commits = list(re.finditer(r"(?im)^\s*COMMIT;\s*$", text))
if len(begins) != 1 or len(commits) != 1 or begins[0].end() >= commits[0].start():
    raise SystemExit(f"{rollback}: rollback deve ter BEGIN/COMMIT externos únicos")
rb = pathlib.Path(readback).read_text(encoding="utf-8")
if re.search(r"(?im)^\s*(BEGIN(\s+READ\s+ONLY)?\s*;|COMMIT\s*;|ROLLBACK\s*;|SET\s+(LOCAL\s+)?ROLE)", rb):
    raise SystemExit(f"{readback}: readback de rollback não pode ter fronteira transacional nem troca de papel")
print("BEGIN;")
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));")
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)}) <> 1 THEN RAISE EXCEPTION 'rollback gastos-universo: ledger divergiu sob lock'; END IF; END $ledger$;")
print(text[begins[0].end():commits[0].start()])
print(rb)
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM {lit(previous)} THEN RAISE EXCEPTION 'rollback gastos-universo: topo final não é o predecessor {previous}'; END IF; END $ledger$;")
print(fecho + ";")
PY
}

if [[ -n "$print_only" ]]; then rollback_sql; exit 0; fi

# shellcheck source=scripts/audit/lib/configure-libpq-from-url.sh
source "$ROOT/scripts/audit/lib/configure-libpq-from-url.sh"
: "${PF_DATABASE_URL:?PF_DATABASE_URL é obrigatória}"
: "${PF_EXPECTED_SHA:?PF_EXPECTED_SHA é obrigatória}"
: "${GITHUB_REF:?GITHUB_REF é obrigatória}"
[[ "$PF_EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "FAIL: SHA inválido" >&2; exit 2; }
[[ "$(git rev-parse HEAD)" == "$PF_EXPECTED_SHA" ]] || { echo "FAIL: checkout divergiu" >&2; exit 2; }
[[ -z "$(git status --porcelain=v1 --untracked-files=normal)" ]] || { echo "FAIL: checkout sujo" >&2; exit 2; }
[[ "$GITHUB_REF" == "refs/heads/main" ]] || { echo "FAIL: somente main" >&2; exit 2; }
[[ "$(git ls-remote https://github.com/thiago-salvador/puxa-ficha.git refs/heads/main | cut -f1)" == "$PF_EXPECTED_SHA" ]] || {
  echo "FAIL: SHA não é o topo remoto de main" >&2
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
} 2>/dev/null)" || { echo "FAIL: URL não identifica projeto Supabase" >&2; exit 2; }
[[ "$database_ref" == "wskpzsobvqwhnbsdsmok" ]] || { echo "FAIL: banco não é produção" >&2; exit 2; }

unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE PGOPTIONS
unset PGSERVICE PGSERVICEFILE PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCRLDIR
pf_configure_libpq_from_url
export PGCONNECT_TIMEOUT=10 PGSSLMODE=verify-full
export PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt"

estado="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c \
  "select coalesce(max(version),'') || '|' || count(*) filter (where version='$version') || '|' || coalesce(max(idempotency_key) filter (where version='$version'),'') from supabase_migrations.schema_migrations")"
IFS='|' read -r -a campos <<<"${estado}|FIM"
if [[ "${#campos[@]}" != 4 || "${campos[3]}" != "FIM" ]]; then
  echo "FAIL: leitura do ledger com ${#campos[@]} campos, esperados 4: $estado" >&2
  exit 1
fi
topo="${campos[0]}" contagem="${campos[1]}" chave="${campos[2]}"
[[ "$topo" == "$version" && "$contagem" == 1 && "$chave" == "$digest" ]] || {
  echo "FAIL: rollback exige $version no topo do ledger com o digest do checkout: $estado" >&2
  exit 1
}

rollback_sql | PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -

if [[ "$modo" == "dry-run" ]]; then
  echo "PASS: dry-run do rollback gastos-universo rodou rollback e readback e desfez tudo"
else
  echo "PASS: rollback gastos-universo concluído"
fi
