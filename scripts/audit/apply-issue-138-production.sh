#!/usr/bin/env bash
# Rota fechada para aplicar a DDL e o backfill da issue #138.
# Este arquivo so e chamado pelo workflow manual protegido pelo ambiente
# production. Nao aceita nomes de migration, projeto ou SQL por input.
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

unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE
unset PGSERVICE PGSERVICEFILE PGOPTIONS
unset PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCRLDIR
pf_configure_libpq_from_url
export PGCONNECT_TIMEOUT=10 PGSSLMODE=verify-full
export PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt"

ddl_version=20260829100000
backfill_version=20260829100100
previous_version=20260829030002
ddl=("$ROOT/supabase/migrations/${ddl_version}_"*.sql)
backfill=("$ROOT/supabase/migrations-pendentes/${backfill_version}_"*.sql)
ddl_rollback=("$ROOT/supabase/rollback/${ddl_version}_"*.rollback.sql)
backfill_rollback=("$ROOT/supabase/rollback/${backfill_version}_"*.rollback.sql)
ddl_readback=("$ROOT/supabase/readback/${ddl_version}_"*.readback.sql)
readback=("$ROOT/supabase/readback/${backfill_version}_backfill_projetos_lei_camara_ronaldo_caiado.readback.sql")
[[ ${#ddl[@]} -eq 1 && -f ${ddl[0]} ]] || { echo "FAIL: DDL nao unica" >&2; exit 2; }
[[ ${#backfill[@]} -eq 1 && -f ${backfill[0]} ]] || { echo "FAIL: backfill nao unico" >&2; exit 2; }
[[ ${#ddl_rollback[@]} -eq 1 && -f ${ddl_rollback[0]} ]] || { echo "FAIL: rollback DDL nao unico" >&2; exit 2; }
[[ ${#backfill_rollback[@]} -eq 1 && -f ${backfill_rollback[0]} ]] || { echo "FAIL: rollback backfill nao unico" >&2; exit 2; }
[[ ${#ddl_readback[@]} -eq 1 && -f ${ddl_readback[0]} ]] || { echo "FAIL: readback DDL nao unico" >&2; exit 2; }
[[ ${#readback[@]} -eq 1 && -f ${readback[0]} ]] || { echo "FAIL: readback nao unico" >&2; exit 2; }

ddl_hash="sha256:$(shasum -a 256 "${ddl[0]}" | cut -d' ' -f1)"
backfill_hash="sha256:$(shasum -a 256 "${backfill[0]}" | cut -d' ' -f1)"
state="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c \
  "select coalesce(max(version),'') , count(*) filter(where version='$ddl_version'), coalesce(max(idempotency_key) filter(where version='$ddl_version'),'') , count(*) filter(where version='$backfill_version'), coalesce(max(idempotency_key) filter(where version='$backfill_version'),'') from supabase_migrations.schema_migrations")"
IFS='|' read -r ledger_top ddl_count ddl_key backfill_count backfill_key <<<"$state"

mode=both
if [[ "$ddl_count" == "1" && "$ddl_key" == "$ddl_hash" && "$backfill_count" == "1" && "$backfill_key" == "$backfill_hash" && "$ledger_top" == "$backfill_version" ]]; then
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f "${readback[0]}"
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f "${ddl_readback[0]}"
  echo "PASS: issue #138 ja aplicada, ledger e readback conferem"
  exit 0
fi
if [[ "$ddl_count" == "1" && "$ddl_key" == "$ddl_hash" && "$backfill_count" == "0" && "$ledger_top" == "$ddl_version" ]]; then
  mode=backfill
elif [[ "$ddl_count" != "0" || "$backfill_count" != "0" || "$ledger_top" != "$previous_version" ]]; then
  echo "FAIL: ledger inicial inesperado: $state" >&2
  exit 1
fi

python3 - "$PF_EXPECTED_SHA" "$mode" "$ddl_version" "$backfill_version" "$previous_version" "$ddl_hash" "$backfill_hash" "${ddl[0]}" "${backfill[0]}" "${ddl_rollback[0]}" "${backfill_rollback[0]}" "${ddl_readback[0]}" "${readback[0]}" <<'PY' \
  | PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
import base64, hashlib, pathlib, re, sys

sha, mode, ddl_version, backfill_version, previous, ddl_digest, backfill_digest, ddl_path, backfill_path, ddl_rollback_path, backfill_rollback_path, ddl_readback_path, readback_path = sys.argv[1:]

def body(path):
    raw = pathlib.Path(path).read_bytes()
    text = raw.decode("utf-8")
    begins = list(re.finditer(r"(?im)^\s*BEGIN;\s*$", text))
    commits = list(re.finditer(r"(?im)^\s*COMMIT;\s*$", text))
    if len(begins) != 1 or len(commits) != 1 or begins[0].end() >= commits[0].start():
        raise SystemExit(f"{path}: deve ter exatamente um BEGIN e um COMMIT externos")
    return raw, text[begins[0].end():commits[0].start()]

ddl_raw, ddl_body = body(ddl_path)
backfill_raw, backfill_body = body(backfill_path)
ddl_rollback = pathlib.Path(ddl_rollback_path).read_bytes()
backfill_rollback = pathlib.Path(backfill_rollback_path).read_bytes()
ddl_readback = pathlib.Path(ddl_readback_path).read_bytes()
readback = pathlib.Path(readback_path).read_bytes()

def lit(value):
    return "'" + value.replace("'", "''") + "'"

def b64(value):
    return base64.b64encode(value).decode("ascii")

def ledger_insert(version, digest, path, raw, rollback):
    name = pathlib.Path(path).stem.removeprefix(version + "_")
    created_by = "Thiago Salvador <contato.thiagosalvador@gmail.com> via github-actions:" + sha
    print("INSERT INTO supabase_migrations.schema_migrations")
    print("  (version, statements, name, created_by, idempotency_key, rollback)")
    print("VALUES (")
    print(f"  {lit(version)},")
    print(f"  ARRAY[convert_from(decode({lit(b64(raw))}, 'base64'), 'UTF8')],")
    print(f"  {lit(name)},")
    print(f"  {lit(created_by)},")
    print(f"  {lit(digest)},")
    print(f"  ARRAY[convert_from(decode({lit(b64(rollback))}, 'base64'), 'UTF8')]")
    print(");")

print("BEGIN;")
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:issue-138-proposicao-source-key', 0));")
if mode == "both":
    print("DO $ledger$ BEGIN")
    print(f"  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(previous)}")
    print(f"     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ({lit(ddl_version)}, {lit(backfill_version)})) THEN")
    print("    RAISE EXCEPTION 'issue #138: ledger divergiu sob lock antes da aplicacao';")
    print("  END IF;")
    print("END $ledger$;")
    print(ddl_body, end="" if ddl_body.endswith("\n") else "\n")
    print(ddl_readback.decode("utf-8"), end="" if ddl_readback.endswith(b"\n") else "\n")
    ledger_insert(ddl_version, ddl_digest, ddl_path, ddl_raw, ddl_rollback)
else:
    print("DO $ledger$ BEGIN")
    print(f"  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(ddl_version)}")
    print(f"     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(ddl_version)} AND idempotency_key={lit(ddl_digest)}) <> 1")
    print(f"     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version={lit(backfill_version)}) THEN")
    print("    RAISE EXCEPTION 'issue #138: ledger divergiu antes do backfill';")
    print("  END IF;")
    print("END $ledger$;")
print(backfill_body, end="" if backfill_body.endswith("\n") else "\n")
ledger_insert(backfill_version, backfill_digest, backfill_path, backfill_raw, backfill_rollback)
print(readback.decode("utf-8"), end="" if readback.endswith(b"\n") else "\n")
print("DO $ledger$ BEGIN")
print(f"  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(backfill_version)}")
print(f"     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(backfill_version)} AND idempotency_key={lit(backfill_digest)}) <> 1 THEN")
print("    RAISE EXCEPTION 'issue #138: ledger final divergiu';")
print("  END IF;")
print("END $ledger$;")
print("COMMIT;")
PY

PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f "${readback[0]}"
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f "${ddl_readback[0]}"
echo "PASS: issue #138 DDL, backfill, ledger e readback concluídos"
