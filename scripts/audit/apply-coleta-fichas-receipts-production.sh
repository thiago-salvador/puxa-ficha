#!/usr/bin/env bash
# Aplica uma migration de recibos da coleta de fichas por despacho nomeado:
#   sites: 20260924204852, predecessor issue #483
#   situacao: 20260924205031, predecessor sites
# Cada alvo exige um dispatch e roda apenas sua propria migration.
#
# Ordem obrigatoria de .coderabbit.yaml para script que escreve em producao:
# dry-run, apply, readback e recibo. Os dois modos geram a MESMA transacao; o
# dry-run fecha em ROLLBACK e o apply em COMMIT.
#
#   scripts/audit/apply-coleta-fichas-receipts-production.sh sites dry-run
#   scripts/audit/apply-coleta-fichas-receipts-production.sh situacao apply
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

case "${1:-}" in
  sites)
    base_version=20260924180000
    base_name=issue_483_arruda_indeferido
    version=20260924204852
    name=sites_tse_2026_receipts
    ;;
  situacao)
    base_version=20260924204852
    base_name=sites_tse_2026_receipts
    version=20260924205031
    name=situacao_tse_2026_receipts
    ;;
  *) echo "FAIL: alvo invalido: use sites ou situacao" >&2; exit 2 ;;
esac
base_migration="$ROOT/supabase/migrations/${base_version}_${base_name}.sql"
[[ -f "$base_migration" ]] || { echo "FAIL: predecessor ${base_version} ausente" >&2; exit 2; }
base_digest="sha256:$(shasum -a 256 "$base_migration" | cut -d' ' -f1)"

versions=("$version")
names=("$name")

for i in "${!versions[@]}"; do
  v="${versions[$i]}"; n="${names[$i]}"
  for f in "supabase/migrations/${v}_${n}.sql" "supabase/rollback/${v}_${n}.rollback.sql" "supabase/readback/${v}_${n}.readback.sql"; do
    [[ -f "$ROOT/$f" ]] || { echo "FAIL: artefato ausente: $f" >&2; exit 2; }
  done
done

modo="${2:-dry-run}"
case "$modo" in dry-run|apply) ;; *) echo "FAIL: modo invalido: use dry-run ou apply" >&2; exit 2 ;; esac

digest0="sha256:$(shasum -a 256 "$ROOT/supabase/migrations/${versions[0]}_${names[0]}.sql" | cut -d' ' -f1)"

ler_ledger() {
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
    psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c \
    "select coalesce(max(version),'')
       || '|' || count(*) filter (where version='$base_version')
       || '|' || coalesce(max(idempotency_key) filter (where version='$base_version'),'')
       || '|' || count(*) filter (where version='${versions[0]}')
       || '|' || coalesce(max(idempotency_key) filter (where version='${versions[0]}'),'')
     from supabase_migrations.schema_migrations"
}

rodar_readbacks() {
  for i in "${!versions[@]}"; do
    PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
      psql -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/readback/${versions[$i]}_${names[$i]}.readback.sql"
  done
}

estado="$(ler_ledger)"
IFS='|' read -r topo base_count base_key c0 k0 <<<"$estado"

# Reaplicacao: com a migration ja no ledger e o digest conferindo, so os
# readbacks rodam.
if [[ "$c0" == "1" && "$k0" == "$digest0" && "$base_count" == "1" && "$base_key" == "$base_digest" ]]; then
  [[ "$topo" == "${versions[0]}" ]] || { echo "FAIL: a migration esta no ledger mas o topo e $topo" >&2; exit 1; }
  rodar_readbacks
  echo "PASS: recibo ${1} ja aplicado, ledger e readback conferem"
  exit 0
fi

# O predecessor versionado foi gravado por outro apply, que sempre
# escreve digest; aqui a exigencia e estrita.
if ! [[ "$c0" == "0" && "$topo" == "$base_version" && "$base_count" == "1" && "$base_key" == "$base_digest" ]]; then
  echo "FAIL: ledger inicial inesperado: $estado" >&2
  exit 1
fi

gerar_sql() {
  local fecho="$1"; shift
  python3 - "$PF_EXPECTED_SHA" "$fecho" "$ROOT" "$@" <<'PYGEN'
import base64, pathlib, re, sys

sha, fecho, root = sys.argv[1:4]
resto = sys.argv[4:]

def split_body(path):
    raw = pathlib.Path(path).read_bytes()
    text = raw.decode("utf-8")
    begins = list(re.finditer(r"(?im)^\s*BEGIN;\s*$", text))
    commits = list(re.finditer(r"(?im)^\s*COMMIT;\s*$", text))
    if len(begins) != 1 or len(commits) != 1 or begins[0].end() >= commits[0].start():
        raise SystemExit(f"{path}: migration deve ter exatamente um BEGIN e um COMMIT externos")
    return raw, text[begins[0].end():commits[0].start()]

def lit(value): return "'" + value.replace("'", "''") + "'"
def b64(value): return base64.b64encode(value).decode("ascii")

print("BEGIN;")
# Mesma chave global do rollback versionado: apply e rollback de qualquer
# migration de producao se serializam entre si, e o ledger fica travado ate o
# fim da transacao.
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));")
print("LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;")

for i in range(0, len(resto), 5):
    version, name, previous, previous_digest, digest = resto[i:i + 5]
    migration_path = f"{root}/supabase/migrations/{version}_{name}.sql"
    rollback_path = f"{root}/supabase/rollback/{version}_{name}.rollback.sql"
    readback_path = f"{root}/supabase/readback/{version}_{name}.readback.sql"
    raw, body = split_body(migration_path)
    rollback = pathlib.Path(rollback_path).read_bytes()
    readback = pathlib.Path(readback_path).read_bytes()
    created_by = "github-actions:" + sha

    # Mesma regra da checagem fora do lock: digest do predecessor so vale como
    # gate quando existe. Divergencia de digest presente continua reprovando.
    print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(previous)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(previous)} AND (idempotency_key={lit(previous_digest)})) <> 1 OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version={lit(version)}) THEN RAISE EXCEPTION 'coleta-fichas: ledger divergiu sob lock antes de {version}'; END IF; END $ledger$;")
    print(body, end="" if body.endswith("\n") else "\n")
    print("INSERT INTO supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback) VALUES (")
    print(f"  {lit(version)}, ARRAY[convert_from(decode({lit(b64(raw))}, 'base64'), 'UTF8')], {lit(name)}, {lit(created_by)}, {lit(digest)}, ARRAY[convert_from(decode({lit(b64(rollback))}, 'base64'), 'UTF8')]);")
    # O readback roda DENTRO da transacao. No dry-run ele e a unica prova
    # possivel: depois do ROLLBACK nao sobra estado nenhum para conferir de
    # fora. BEGIN/COMMIT proprios do arquivo saem, senao o COMMIT interno
    # fecharia a transacao externa no meio do conjunto.
    corpo = readback.decode("utf-8")
    corpo = re.sub(r"(?im)^\s*BEGIN READ ONLY;\s*$", "", corpo)
    corpo = re.sub(r"(?im)^\s*COMMIT;\s*$", "", corpo)
    print(corpo, end="" if corpo.endswith("\n") else "\n")
    print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)}) <> 1 THEN RAISE EXCEPTION 'coleta-fichas: ledger final divergiu em {version}'; END IF; END $ledger$;")

print(fecho + ";")
PYGEN
}

args=("${versions[0]}" "${names[0]}" "$base_version" "$base_digest" "$digest0")

if [[ "$modo" == "dry-run" ]]; then
  gerar_sql ROLLBACK "${args[@]}" | \
    PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
  echo "PASS: dry-run de ${1} rodou migration, ledger e readback e desfez tudo"
  exit 0
fi

# O apply nao confia num dry-run de outra execucao: ensaia aqui, contra o
# estado atual do banco e os mesmos artefatos, e so grava se o ensaio passar.
gerar_sql ROLLBACK "${args[@]}" | \
  PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
echo "PASS: ensaio pre-apply de ${1} conferido; gravando"

gerar_sql COMMIT "${args[@]}" | \
  PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -

rodar_readbacks
echo "PASS: recibo ${1} aplicado, ledger e readbacks concluidos"
