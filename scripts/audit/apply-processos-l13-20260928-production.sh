#!/usr/bin/env bash
# Aplica uma migration de dados com predecessor, hash, lock, ledger e readback.
# Uso: apply-processos-l13-20260928-production.sh dry-run|apply
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

database_ref="$(node 2>/dev/null <<'NODE'
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
)" || { echo "FAIL: URL nao identifica projeto Supabase" >&2; exit 2; }
[[ "$database_ref" == "wskpzsobvqwhnbsdsmok" ]] || { echo "FAIL: banco nao e producao" >&2; exit 2; }

unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE PGOPTIONS
unset PGSERVICE PGSERVICEFILE PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCRLDIR
pf_configure_libpq_from_url
export PGCONNECT_TIMEOUT=10 PGSSLMODE=verify-full
export PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt"

base_version=20260927095347
base_migration="$ROOT/supabase/migrations/${base_version}_patrimonio_cas_hash.sql"
version=20260928010000
name=processos_l13_senado
migration="$ROOT/supabase/migrations/${version}_${name}.sql"
rollback="$ROOT/supabase/rollback/${version}_${name}.rollback.sql"
readback="$ROOT/supabase/readback/${version}_${name}.readback.sql"
[[ -f "$base_migration" && -f "$migration" && -f "$rollback" && -f "$readback" ]] || {
  echo "FAIL: predecessor ou artefato da migration ausente" >&2; exit 2;
}
base_digest="sha256:$(shasum -a 256 "$base_migration" | cut -d' ' -f1)"
digest="sha256:$(shasum -a 256 "$migration" | cut -d' ' -f1)"

mode="${1:-dry-run}"
case "$mode" in dry-run|apply) ;; *) echo "FAIL: use dry-run ou apply" >&2; exit 2 ;; esac

ler_ledger() {
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
    psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c "select coalesce(max(version),'') || '|' || count(*) filter (where version='$base_version') || '|' || coalesce(max(idempotency_key) filter (where version='$base_version'),'') || '|' || count(*) filter (where version='$version') || '|' || coalesce(max(idempotency_key) filter (where version='$version'),'') from supabase_migrations.schema_migrations"
}

ler_readback() {
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
    psql -X -v ON_ERROR_STOP=1 -f "$readback"
}

estado="$(ler_ledger)"
IFS='|' read -r -a campos <<<"${estado}|FIM"
[[ "${#campos[@]}" == 6 && "${campos[5]}" == "FIM" ]] || {
  echo "FAIL: leitura do ledger incompleta: $estado" >&2; exit 1;
}
topo="${campos[0]}"; base_count="${campos[1]}"; base_key="${campos[2]}"
applied_count="${campos[3]}"; applied_key="${campos[4]}"
if [[ "$applied_count" == "1" && "$applied_key" == "$digest" ]]; then
  [[ "$topo" == "$version" ]] || { echo "FAIL: migration aplicada fora do topo: $estado" >&2; exit 1; }
  ler_readback
  echo "PASS: migration ja aplicada, ledger e readback conferem"
  exit 0
fi
if [[ "$applied_count" != "0" || "$topo" != "$base_version" || "$base_count" != "1" || "$base_key" != "$base_digest" ]]; then
  echo "FAIL: estado inicial do ledger inesperado: $estado" >&2
  exit 1
fi

gerar_sql() {
  local fin="$1"
  python3 - "$PF_EXPECTED_SHA" "$fin" "$base_version" "$base_digest" "$version" "$name" "$digest" "$migration" "$rollback" "$readback" <<'PY'
import base64, pathlib, re, sys

sha, fin, previous, previous_digest, version, name, digest, migration_path, rollback_path, readback_path = sys.argv[1:]
def lit(value): return "'" + value.replace("'", "''") + "'"
def b64(value): return base64.b64encode(value).decode("ascii")

raw = pathlib.Path(migration_path).read_bytes()
body = raw.decode("utf-8")
if re.search(r"(?im)^\s*(?:BEGIN|COMMIT);\s*$", body):
    raise SystemExit("FAIL: migration deve ser transacional pelo aplicador")
rollback = pathlib.Path(rollback_path).read_bytes()
readback = pathlib.Path(readback_path).read_text(encoding="utf-8")
readback = re.sub(r"(?im)^\s*(?:BEGIN READ ONLY|COMMIT);\s*$", "", readback)
created_by = "Thiago Salvador <contato.thiagosalvador@gmail.com> via github-actions:" + sha
print("BEGIN;")
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));")
print("LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;")
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(previous)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(previous)} AND idempotency_key={lit(previous_digest)}) <> 1 OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version={lit(version)}) THEN RAISE EXCEPTION 'ledger divergiu antes de {version}'; END IF; END $ledger$;")
print(body, end="" if body.endswith("\n") else "\n")
print("INSERT INTO supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback) VALUES (")
print(f"  {lit(version)}, ARRAY[convert_from(decode({lit(b64(raw))}, 'base64'), 'UTF8')], {lit(name)}, {lit(created_by)}, {lit(digest)}, ARRAY[convert_from(decode({lit(b64(rollback))}, 'base64'), 'UTF8')]);")
print(readback, end="" if readback.endswith("\n") else "\n")
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)}) <> 1 THEN RAISE EXCEPTION 'ledger final divergiu em {version}'; END IF; END $ledger$;")
print(fin + ";")
PY
}

if [[ "$mode" == "dry-run" ]]; then
  gerar_sql ROLLBACK | PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
  echo "PASS: dry-run rodou migration, ledger e readback e desfez tudo"
  exit 0
fi

# O apply repete o ensaio contra o estado atual e os mesmos artefatos.
gerar_sql ROLLBACK | PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
echo "PASS: ensaio pre-apply conferido; gravando"
gerar_sql COMMIT | PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
ler_readback
echo "PASS: migration aplicada, ledger e readback concluidos"
