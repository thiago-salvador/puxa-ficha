#!/usr/bin/env bash
# Aplicador transacional da migration que troca CPF por "[CPF removido]" no motivo de despublicacao da #378, predecessor 20260929110000 (G5), com ledger, dry-run e readback.
set -euo pipefail
case $- in *x*) set +x ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/audit/lib/configure-libpq-from-url.sh
source "$ROOT/scripts/audit/lib/configure-libpq-from-url.sh"

: "${PF_DATABASE_URL:?PF_DATABASE_URL e obrigatoria}"
: "${PF_EXPECTED_SHA:?PF_EXPECTED_SHA e obrigatoria}"
: "${GITHUB_REF:?GITHUB_REF e obrigatoria}"
[[ "$PF_EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'FAIL: SHA invalido' >&2; exit 2; }
[[ "$(git rev-parse HEAD)" == "$PF_EXPECTED_SHA" ]] || { echo 'FAIL: checkout divergiu' >&2; exit 2; }
[[ -z "$(git status --porcelain=v1 --untracked-files=normal)" ]] || { echo 'FAIL: checkout sujo' >&2; exit 2; }
[[ "$GITHUB_REF" == 'refs/heads/main' ]] || { echo 'FAIL: somente main' >&2; exit 2; }
[[ "$(git ls-remote https://github.com/thiago-salvador/puxa-ficha.git refs/heads/main | cut -f1)" == "$PF_EXPECTED_SHA" ]] || {
  echo 'FAIL: SHA nao e o topo remoto de main' >&2; exit 2;
}

database_ref="$(node 2>/dev/null <<'NODE'
const raw = process.env.PF_DATABASE_URL ?? ''
let url
try { url = new URL(raw) } catch { process.exit(2) }
if (!/^(?:postgres|postgresql):$/.test(url.protocol) || url.search || url.hash || url.pathname !== '/postgres') process.exit(2)
const host = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]
const user = decodeURIComponent(url.username).match(/^postgres\.([a-z0-9]+)$/)?.[1]
const pooler = /(?:^|\.)pooler\.supabase\.com$/.test(url.hostname)
if ((host && url.port !== '5432') || (pooler && !['5432', '6543'].includes(url.port))) process.exit(2)
if (host && user && host !== user) process.exit(3)
if (!host && !(pooler && user)) process.exit(4)
process.stdout.write(host ?? user)
NODE
)" || { echo 'FAIL: URL nao identifica projeto Supabase' >&2; exit 2; }
[[ "$database_ref" == 'wskpzsobvqwhnbsdsmok' ]] || { echo 'FAIL: banco nao e producao' >&2; exit 2; }

unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE PGOPTIONS
unset PGSERVICE PGSERVICEFILE PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCRLDIR
pf_configure_libpq_from_url
export PGCONNECT_TIMEOUT=10 PGSSLMODE=verify-full
export PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt"

base_version=20260929110000
base_migration="$ROOT/supabase/migrations/${base_version}_g5_processo_hana_helder.sql"
version=20261001100000
name=cpf_removido_motivo_trajetoria
migration="$ROOT/supabase/migrations/${version}_${name}.sql"
readback="$ROOT/supabase/readback/${version}_${name}.readback.sql"
[[ -f "$base_migration" && -f "$migration" && -f "$readback" ]] || {
  echo 'FAIL: predecessor ou artefato da migration ausente' >&2; exit 2;
}
base_digest="sha256:$(shasum -a 256 "$base_migration" | cut -d' ' -f1)"
digest="sha256:$(shasum -a 256 "$migration" | cut -d' ' -f1)"

mode="${1:-dry-run}"
case "$mode" in dry-run|apply) ;; *) echo 'FAIL: use dry-run ou apply' >&2; exit 2 ;; esac

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
[[ "${#campos[@]}" == 6 && "${campos[5]}" == 'FIM' ]] || { echo 'FAIL: ledger incompleto' >&2; exit 1; }
topo="${campos[0]}"; base_count="${campos[1]}"; base_key="${campos[2]}"
applied_count="${campos[3]}"; applied_key="${campos[4]}"
if [[ "$applied_count" == 1 && "$applied_key" == "$digest" ]]; then
  [[ "$topo" == "$version" ]] || { echo 'FAIL: migration aplicada fora do topo' >&2; exit 1; }
  ler_readback
  echo 'PASS: migration ja aplicada, ledger e readback conferem'
  exit 0
fi
if [[ "$applied_count" != 0 || "$topo" != "$base_version" || "$base_count" != 1 || "$base_key" != "$base_digest" ]]; then
  echo 'FAIL: estado inicial do ledger inesperado' >&2; exit 1
fi

gerar_sql() {
  local fin="$1"
  python3 - "$PF_EXPECTED_SHA" "$fin" "$base_version" "$base_digest" "$version" "$name" "$digest" "$migration" "$readback" <<'PY'
import base64, pathlib, re, sys

sha, fin, previous, previous_digest, version, name, digest, migration_path, readback_path = sys.argv[1:]
def lit(value): return "'" + value.replace("'", "''") + "'"
raw = pathlib.Path(migration_path).read_bytes()
body = raw.decode('utf-8')
if len(re.findall(r'(?im)^\s*(?:BEGIN|COMMIT);\s*$', body)) != 2:
    raise SystemExit('FAIL: migration deve conter BEGIN e COMMIT unicos')
body = re.sub(r'(?im)^\s*(?:BEGIN|COMMIT);\s*$', '', body)
readback = pathlib.Path(readback_path).read_text(encoding='utf-8')
created_by = 'Thiago Salvador <contato.thiagosalvador@gmail.com> via github-actions:' + sha
print('BEGIN;')
print('SET LOCAL TIME ZONE \'UTC\';')
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));")
print('LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;')
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(previous)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(previous)} AND idempotency_key={lit(previous_digest)}) <> 1 OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version={lit(version)}) THEN RAISE EXCEPTION 'ledger divergiu antes de {version}'; END IF; END $ledger$;")
print(body)
print('INSERT INTO supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback) VALUES (')
print(f"  {lit(version)}, ARRAY[convert_from(decode({lit(base64.b64encode(raw).decode('ascii'))}, 'base64'), 'UTF8')], {lit(name)}, {lit(created_by)}, {lit(digest)}, ARRAY[]::text[]);")
print(readback)
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)}) <> 1 THEN RAISE EXCEPTION 'ledger final divergiu em {version}'; END IF; END $ledger$;")
print(fin + ';')
PY
}

if [[ "$mode" == 'dry-run' ]]; then
  gerar_sql ROLLBACK | PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
  echo 'PASS: dry-run executou migration e readback e desfez tudo'
  exit 0
fi

gerar_sql ROLLBACK | PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
echo 'PASS: ensaio pre-apply conferido; gravando'
gerar_sql COMMIT | PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
ler_readback
echo 'PASS: migration aplicada, ledger e readback concluidos'
