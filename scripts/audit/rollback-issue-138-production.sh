#!/usr/bin/env bash
# Rota fechada para desfazer somente os quatro registros Camara da issue #138.
# Nao remove o indice scoped nem restaura a constraint antiga.
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
[[ "$(git ls-remote https://github.com/thiago-salvador/puxa-ficha.git refs/heads/main | cut -f1)" == "$PF_EXPECTED_SHA" ]] || { echo "FAIL: SHA nao e o topo remoto de main" >&2; exit 2; }

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

ddl_version=20260829100000
backfill_version=20260829100100
rollback=("$ROOT/supabase/rollback/${backfill_version}_"*.rollback.sql)
readback=("$ROOT/supabase/readback/${backfill_version}_backfill_projetos_lei_camara_ronaldo_caiado.rollback.readback.sql")
ddl=("$ROOT/supabase/migrations/${ddl_version}_"*.sql)
backfill=("$ROOT/supabase/migrations/${backfill_version}_"*.sql)
[[ ${#ddl[@]} -eq 1 && -f ${ddl[0]} ]] || { echo "FAIL: DDL nao unica" >&2; exit 2; }
[[ ${#backfill[@]} -eq 1 && -f ${backfill[0]} ]] || { echo "FAIL: backfill nao unico" >&2; exit 2; }
[[ ${#rollback[@]} -eq 1 && -f ${rollback[0]} ]] || { echo "FAIL: rollback nao unico" >&2; exit 2; }
[[ ${#readback[@]} -eq 1 && -f ${readback[0]} ]] || { echo "FAIL: readback de rollback nao unico" >&2; exit 2; }

ddl_hash="sha256:$(shasum -a 256 "${ddl[0]}" | cut -d' ' -f1)"
backfill_hash="sha256:$(shasum -a 256 "${backfill[0]}" | cut -d' ' -f1)"
rollback_hash="sha256:$(shasum -a 256 "${rollback[0]}" | cut -d' ' -f1)"
state="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c \
  "select coalesce(max(version),'') , count(*) filter(where version='$ddl_version'), coalesce(max(idempotency_key) filter(where version='$ddl_version'),'') , count(*) filter(where version='$backfill_version'), coalesce(max(idempotency_key) filter(where version='$backfill_version'),'') from supabase_migrations.schema_migrations")"
IFS='|' read -r ledger_top ddl_count ddl_key backfill_count backfill_key <<<"$state"
[[ "$ledger_top" == "$backfill_version" && "$ddl_count" == "1" && "$ddl_key" == "$ddl_hash" && "$backfill_count" == "1" && "$backfill_key" == "$backfill_hash" ]] || {
  echo "FAIL: rollback exige ledger DDL+backfill exatos no topo: $state" >&2
  exit 1
}

python3 "${rollback[0]}" "$backfill_version" "$backfill_hash" "$ddl_version" "$ddl_hash" "$ddl_version" "$rollback_hash" "${readback[0]}" <<'PY' \
  | PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
import hashlib, pathlib, re, sys

rollback_path, version, digest, ddl_version, ddl_digest, expected_top, rollback_digest, readback_path = sys.argv[1:]
raw = pathlib.Path(rollback_path).read_bytes()
if "sha256:" + hashlib.sha256(raw).hexdigest() != rollback_digest:
    raise SystemExit("rollback mudou durante a preparacao")
text = raw.decode("utf-8")
begins = list(re.finditer(r"(?im)^\s*BEGIN;\s*$", text))
commits = list(re.finditer(r"(?im)^\s*COMMIT;\s*$", text))
if len(begins) != 1 or len(commits) != 1 or begins[0].end() >= commits[0].start():
    raise SystemExit("rollback deve ter exatamente um BEGIN e um COMMIT externos")
body = text[begins[0].end():commits[0].start()]
readback = pathlib.Path(readback_path).read_text(encoding="utf-8")
def lit(value): return "'" + value.replace("'", "''") + "'"

print("BEGIN;")
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:issue-138-proposicao-source-key', 0));")
print("DO $ledger$ BEGIN")
print(f"  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)}")
print(f"     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(ddl_version)} AND idempotency_key={lit(ddl_digest)}) <> 1")
print(f"     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)}) <> 1 THEN")
print("    RAISE EXCEPTION 'issue #138 rollback: ledger divergiu sob lock';")
print("  END IF;")
print("END $ledger$;")
print(body, end="" if body.endswith("\n") else "\n")
print(f"DELETE FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)};")
print("DO $ledger$ BEGIN")
print(f"  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(expected_top)}")
print(f"     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version={lit(version)}) THEN")
print("    RAISE EXCEPTION 'issue #138 rollback: ledger final divergiu';")
print("  END IF;")
print("END $ledger$;")
print(readback, end="" if readback.endswith("\n") else "\n")
print("COMMIT;")
PY

PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f "${readback[0]}"
echo "PASS: rollback de dados da issue #138 aplicado, ledger removido e schema preservado"
