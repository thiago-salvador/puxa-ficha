#!/usr/bin/env bash
# Aplica, em ordem de arquivo, as tres migrations de dado de 25/09/2026:
#   20260925220000  situacao de alexandre-curi (Deferido) e tse-2026-190002554290 (Indeferido, terminal)
#   20260925220100  claim de carreira de hana-ghassan sem contar secretaria como mandato
#   20260925220200  cargo_atual de nove fichas que nao exercem mandato no Senado
# com predecessor, hash, lock, ledger e readback fechados para o projeto de
# producao do Puxa Ficha. Molde de apply-issue-483-arruda-production.sh, com a
# lista de versoes em laco (aceita prefixo do conjunto ja aplicado).
#
# Ordem obrigatoria de .coderabbit.yaml para script que escreve em producao:
# dry-run, apply, readback e recibo. Os dois modos geram a MESMA transacao; o
# dry-run fecha em ROLLBACK e o apply em COMMIT.
#
#   scripts/audit/apply-dados-no-ar-senado-claims-production.sh dry-run   # ensaio, nao grava
#   scripts/audit/apply-dados-no-ar-senado-claims-production.sh apply     # grava
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

# Predecessor comum: o topo do ledger antes deste conjunto. Gravado por
# apply-gastos-parlamentares-quarentena-production, que sempre escreve digest.
base_version=20260925163543
base_migration="$ROOT/supabase/migrations/${base_version}_quarentena_gastos_parlamentares_57_linhas.sql"
[[ -f "$base_migration" ]] || { echo "FAIL: predecessor ${base_version} ausente" >&2; exit 2; }
base_digest="sha256:$(shasum -a 256 "$base_migration" | cut -d' ' -f1)"

versions=(20260925220000 20260925220100 20260925220200)
names=(senado_situacao_curi_ribeiro_afonso claims_contagem_mandatos cargo_atual_ex_senadores)

digests=()
for i in "${!versions[@]}"; do
  v="${versions[$i]}"; n="${names[$i]}"
  for f in "supabase/migrations/${v}_${n}.sql" "supabase/rollback/${v}_${n}.rollback.sql" "supabase/readback/${v}_${n}.readback.sql"; do
    [[ -f "$ROOT/$f" ]] || { echo "FAIL: artefato ausente: $f" >&2; exit 2; }
  done
  digests+=("sha256:$(shasum -a 256 "$ROOT/supabase/migrations/${v}_${n}.sql" | cut -d' ' -f1)")
done

modo="${1:-dry-run}"
case "$modo" in dry-run|apply) ;; *) echo "FAIL: modo invalido: use dry-run ou apply" >&2; exit 2 ;; esac

ler_ledger() {
  local cols="coalesce(max(version),'')"
  cols+=" || '|' || count(*) filter (where version='$base_version')"
  cols+=" || '|' || coalesce(max(idempotency_key) filter (where version='$base_version'),'')"
  for v in "${versions[@]}"; do
    cols+=" || '|' || count(*) filter (where version='$v')"
    cols+=" || '|' || coalesce(max(idempotency_key) filter (where version='$v'),'')"
  done
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
    psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c "select $cols from supabase_migrations.schema_migrations"
}

rodar_readbacks() {
  for i in "${!versions[@]}"; do
    PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
      psql -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/readback/${versions[$i]}_${names[$i]}.readback.sql"
  done
}

estado="$(ler_ledger)"
# read -a descarta campos vazios no fim da linha (idempotency_key vazio quando a
# versão ainda não está no ledger); a sentinela preserva todos os campos.
IFS='|' read -r -a campos <<<"${estado}|FIM"
esperados=$((3 + 2 * ${#versions[@]} + 1))
if [[ "${#campos[@]}" != "$esperados" || "${campos[${#campos[@]}-1]}" != "FIM" ]]; then
  echo "FAIL: leitura do ledger com ${#campos[@]} campos, esperados $esperados: $estado" >&2
  exit 1
fi
topo="${campos[0]}"; base_count="${campos[1]}"; base_key="${campos[2]}"

# Quantas versoes do conjunto ja estao no ledger, em prefixo e com digest.
aplicadas=0
for i in "${!versions[@]}"; do
  c="${campos[$((3 + 2 * i))]}"; k="${campos[$((4 + 2 * i))]}"
  if [[ "$c" == "1" && "$k" == "${digests[$i]}" && "$aplicadas" == "$i" ]]; then
    aplicadas=$((i + 1))
  elif [[ "$c" != "0" ]]; then
    echo "FAIL: ledger inicial inesperado (versao ${versions[$i]} fora de ordem ou com digest divergente): $estado" >&2
    exit 1
  fi
done

if [[ "$aplicadas" == "${#versions[@]}" ]]; then
  [[ "$topo" == "${versions[${#versions[@]}-1]}" ]] || { echo "FAIL: o conjunto esta no ledger mas o topo e $topo" >&2; exit 1; }
  rodar_readbacks
  echo "PASS: conjunto dados-no-ar ja aplicado, ledger e readbacks conferem"
  exit 0
fi

if [[ "$aplicadas" == "0" ]]; then
  # O predecessor foi gravado por outro apply, que sempre escreve digest; aqui
  # a exigencia e estrita.
  if ! [[ "$topo" == "$base_version" && "$base_count" == "1" && "$base_key" == "$base_digest" ]]; then
    echo "FAIL: ledger inicial inesperado: $estado" >&2
    exit 1
  fi
else
  [[ "$topo" == "${versions[$((aplicadas - 1))]}" ]] || { echo "FAIL: prefixo aplicado mas o topo e $topo" >&2; exit 1; }
fi

args=()
for ((i = aplicadas; i < ${#versions[@]}; i++)); do
  if [[ "$i" == "0" ]]; then
    anterior="$base_version"; digest_anterior="$base_digest"
  else
    anterior="${versions[$((i - 1))]}"; digest_anterior="${digests[$((i - 1))]}"
  fi
  args+=("${versions[$i]}" "${names[$i]}" "$anterior" "$digest_anterior" "${digests[$i]}")
done

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
    created_by = "Thiago Salvador <contato.thiagosalvador@gmail.com> via github-actions:" + sha

    print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(previous)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(previous)} AND idempotency_key={lit(previous_digest)}) <> 1 OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version={lit(version)}) THEN RAISE EXCEPTION 'dados-no-ar: ledger divergiu sob lock antes de {version}'; END IF; END $ledger$;")
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
    print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)}) <> 1 THEN RAISE EXCEPTION 'dados-no-ar: ledger final divergiu em {version}'; END IF; END $ledger$;")

print(fecho + ";")
PYGEN
}

if [[ "$modo" == "dry-run" ]]; then
  gerar_sql ROLLBACK "${args[@]}" | \
    PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
  echo "PASS: dry-run do conjunto dados-no-ar rodou migrations, ledger e readbacks e desfez tudo"
  exit 0
fi

# O apply nao confia num dry-run de outra execucao: ensaia aqui, contra o
# estado atual do banco e os mesmos artefatos, e so grava se o ensaio passar.
gerar_sql ROLLBACK "${args[@]}" | \
  PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
echo "PASS: ensaio pre-apply do conjunto dados-no-ar conferido; gravando"

gerar_sql COMMIT "${args[@]}" | \
  PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -

rodar_readbacks
echo "PASS: conjunto dados-no-ar aplicado, ledger e readbacks concluidos"
