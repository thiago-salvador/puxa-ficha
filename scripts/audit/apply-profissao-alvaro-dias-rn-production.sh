#!/usr/bin/env bash
# Aplica a correcao SENADOR -> MEDICO com predecessor medido, digest, lock e recibo.
# Convenção operacional da 20260903220000; sem db push ou migration automática.
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

version=20260904220000
previous_version=20260903220000
migration="$ROOT/supabase/migrations/${version}_corrigir_profissao_alvaro_dias_rn.sql"
previous_migration="$ROOT/supabase/migrations/${previous_version}_despublicar_alvaro_dias_rn_homonimo.sql"
rollback="$ROOT/supabase/rollback/${version}_corrigir_profissao_alvaro_dias_rn.rollback.sql"
readback="$ROOT/supabase/readback/${version}_corrigir_profissao_alvaro_dias_rn.readback.sql"
[[ -f "$migration" && -f "$rollback" && -f "$readback" ]] || {
  echo "FAIL: artefato da correcao de profissao de alvaro-dias-rn ausente" >&2
  exit 2
}
# O digest do predecessor e CALCULADO do arquivo, nunca copiado para dentro deste
# script: um literal aqui seria uma segunda copia do mesmo hash, livre para
# divergir em silencio da migration real. Arquivo ausente aborta antes de
# qualquer conexao.
[[ -f "$previous_migration" ]] || {
  echo "FAIL: predecessor ${previous_version} ausente em supabase/migrations/; esta migration so aplica depois dele" >&2
  exit 2
}

digest="sha256:$(shasum -a 256 "$migration" | cut -d' ' -f1)"
previous_digest="sha256:$(shasum -a 256 "$previous_migration" | cut -d' ' -f1)"
state="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c \
  "select coalesce(max(version),'') || '|' || count(*) filter(where version='$previous_version') || '|' || coalesce(max(idempotency_key) filter(where version='$previous_version'),'') || '|' || count(*) filter(where version='$version') || '|' || coalesce(max(idempotency_key) filter(where version='$version'),'') from supabase_migrations.schema_migrations")"
IFS='|' read -r ledger_top previous_count previous_key version_count version_key <<<"$state"

if [[ "$ledger_top" == "$version" && "$version_count" == "1" && "$version_key" == "$digest" && "$previous_count" == "1" && "$previous_key" == "$previous_digest" ]]; then
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
    psql -X -v ON_ERROR_STOP=1 -f "$readback"
  echo "PASS: correcao de profissao de alvaro-dias-rn ja aplicada, ledger e readback conferem"
  exit 0
fi
if [[ "$ledger_top" != "$previous_version" || "$previous_count" != "1" || "$previous_key" != "$previous_digest" || "$version_count" != "0" ]]; then
  echo "FAIL: ledger inicial da correcao de profissao de alvaro-dias-rn inesperado: $state" >&2
  exit 1
fi

python3 - "$PF_EXPECTED_SHA" "$version" "$previous_version" "$digest" "$previous_digest" "$migration" "$rollback" "$readback" <<'PY' | \
  PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
import base64, pathlib, re, sys

sha, version, previous, digest, previous_digest, path, rollback_path, readback_path = sys.argv[1:]

raw = pathlib.Path(path).read_bytes()
text = raw.decode("utf-8")
begins = list(re.finditer(r"(?im)^\s*BEGIN;\s*$", text))
commits = list(re.finditer(r"(?im)^\s*COMMIT;\s*$", text))
if len(begins) != 1 or len(commits) != 1 or begins[0].end() >= commits[0].start():
    raise SystemExit(f"{path}: migration deve ter exatamente um BEGIN e um COMMIT externos")
body = text[begins[0].end():commits[0].start()]

rollback = pathlib.Path(rollback_path).read_bytes()
readback = pathlib.Path(readback_path).read_bytes()
name = pathlib.Path(path).stem.removeprefix(version + "_")
created_by = "Thiago Salvador <contato.thiagosalvador@gmail.com> via github-actions:" + sha

def lit(value): return "'" + value.replace("'", "''") + "'"
def b64(value): return base64.b64encode(value).decode("ascii")

print("BEGIN;")
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:profissao-alvaro-dias-rn-production', 0));")
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(previous)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(previous)} AND idempotency_key={lit(previous_digest)}) <> 1 OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version={lit(version)}) THEN RAISE EXCEPTION 'profissao alvaro-dias-rn: ledger divergiu sob lock'; END IF; END $ledger$;")
print(body, end="" if body.endswith("\n") else "\n")
print(
    "INSERT INTO supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback) VALUES ("
    f"  {lit(version)}, ARRAY[convert_from(decode({lit(b64(raw))}, 'base64'), 'UTF8')], {lit(name)}, {lit(created_by)}, {lit(digest)}, "
    f"ARRAY[convert_from(decode({lit(b64(rollback))}, 'base64'), 'UTF8')]);"
)
print(readback.decode("utf-8"), end="" if readback.endswith(b"\n") else "\n")
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)}) <> 1 THEN RAISE EXCEPTION 'profissao alvaro-dias-rn: ledger final divergiu'; END IF; END $ledger$;")
print("COMMIT;")
PY

PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -f "$readback"
echo "PASS: correcao de profissao de alvaro-dias-rn aplicada, ledger e readback concluidos"
