#!/usr/bin/env bash
# Reverte, em ordem inversa, as migrations 20260925230100 (nome civil) e
# 20260925230000 (historico de mandatos federais) que estiverem no topo do
# ledger, numa transacao so, com os rollbacks versionados e os readbacks de
# rollback. Molde de rollback-dados-no-ar-senado-claims-production.sh.
#
#   scripts/audit/rollback-historico-mandatos-federais-production.sh dry-run   # ensaio, nao grava
#   scripts/audit/rollback-historico-mandatos-federais-production.sh apply     # grava
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

base_version=20260925221042
versions=(20260925230000 20260925230100)
names=(historico_mandatos_federais_sem_fonte nome_civil_fichas_nao_publicas)

digests=()
for i in "${!versions[@]}"; do
  v="${versions[$i]}"; n="${names[$i]}"
  for f in "supabase/migrations/${v}_${n}.sql" "supabase/rollback/${v}_${n}.rollback.sql" "supabase/readback/${v}_${n}.rollback.readback.sql"; do
    [[ -f "$ROOT/$f" ]] || { echo "FAIL: artefato ausente: $f" >&2; exit 2; }
  done
  digests+=("sha256:$(shasum -a 256 "$ROOT/supabase/migrations/${v}_${n}.sql" | cut -d' ' -f1)")
done

modo="${1:-dry-run}"
case "$modo" in dry-run|apply) ;; *) echo "FAIL: modo invalido: use dry-run ou apply" >&2; exit 2 ;; esac

cols="coalesce(max(version),'')"
for v in "${versions[@]}"; do
  cols+=" || '|' || count(*) filter (where version='$v')"
  cols+=" || '|' || coalesce(max(idempotency_key) filter (where version='$v'),'')"
done
estado="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c "select $cols from supabase_migrations.schema_migrations")"
# read -a descarta campos vazios no fim da linha (idempotency_key vazio quando a
# versão ainda não está no ledger); a sentinela preserva todos os campos.
IFS='|' read -r -a campos <<<"${estado}|FIM"
esperados=$((1 + 2 * ${#versions[@]} + 1))
if [[ "${#campos[@]}" != "$esperados" || "${campos[${#campos[@]}-1]}" != "FIM" ]]; then
  echo "FAIL: leitura do ledger com ${#campos[@]} campos, esperados $esperados: $estado" >&2
  exit 1
fi
topo="${campos[0]}"

# O conjunto aplicado tem de ser um prefixo com digest conferido, e o topo do
# ledger tem de ser a ultima versao aplicada dele.
aplicadas=0
for i in "${!versions[@]}"; do
  c="${campos[$((1 + 2 * i))]}"; k="${campos[$((2 + 2 * i))]}"
  if [[ "$c" == "1" && "$k" == "${digests[$i]}" && "$aplicadas" == "$i" ]]; then
    aplicadas=$((i + 1))
  elif [[ "$c" != "0" ]]; then
    echo "FAIL: ledger inesperado para rollback: $estado" >&2
    exit 1
  fi
done
[[ "$aplicadas" -gt 0 ]] || { echo "FAIL: nenhuma migration do conjunto no ledger: $estado" >&2; exit 1; }
[[ "$topo" == "${versions[$((aplicadas - 1))]}" ]] || { echo "FAIL: o topo do ledger e $topo, nao a ultima do conjunto" >&2; exit 1; }

args=()
for ((i = aplicadas - 1; i >= 0; i--)); do
  args+=("${versions[$i]}" "${names[$i]}" "${digests[$i]}")
done

fecho=ROLLBACK
[[ "$modo" == "apply" ]] && fecho=COMMIT

python3 - "$fecho" "$ROOT" "$base_version" "${args[@]}" <<'PY' | \
  PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
import pathlib, re, sys

fecho, root, base = sys.argv[1:4]
resto = sys.argv[4:]

def corpo(path, externo):
    text = pathlib.Path(path).read_text(encoding="utf-8")
    if externo:
        begins = list(re.finditer(r"(?im)^\s*BEGIN;\s*$", text))
        commits = list(re.finditer(r"(?im)^\s*COMMIT;\s*$", text))
        if len(begins) != 1 or len(commits) != 1 or begins[0].end() >= commits[0].start():
            raise SystemExit(f"{path}: rollback deve ter BEGIN/COMMIT externos unicos")
        return text[begins[0].end():commits[0].start()]
    text = re.sub(r"(?im)^\s*BEGIN READ ONLY;\s*$", "", text)
    return re.sub(r"(?im)^\s*COMMIT;\s*$", "", text)

def lit(value): return "'" + value.replace("'", "''") + "'"

print("BEGIN;")
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));")
triplas = [resto[i:i + 3] for i in range(0, len(resto), 3)]
for n, (version, name, digest) in enumerate(triplas):
    print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)}) <> 1 THEN RAISE EXCEPTION 'rollback historico-federal: ledger divergiu sob lock em {version}'; END IF; END $ledger$;")
    b = corpo(f"{root}/supabase/rollback/{version}_{name}.rollback.sql", True)
    print(b, end="" if b.endswith("\n") else "\n")
    rb = corpo(f"{root}/supabase/readback/{version}_{name}.rollback.readback.sql", False)
    print(rb, end="" if rb.endswith("\n") else "\n")
    print(f"DO $ledger$ BEGIN IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version={lit(version)}) THEN RAISE EXCEPTION 'rollback historico-federal: {version} continua no ledger'; END IF; END $ledger$;")

print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(base)} THEN RAISE EXCEPTION 'rollback historico-federal: topo final nao e o predecessor {base}'; END IF; END $ledger$;" if len(triplas) and triplas[-1][0] == "20260925230000" else "")
print(fecho + ";")
PY

if [[ "$modo" == "dry-run" ]]; then
  echo "PASS: dry-run do rollback historico-federal rodou rollbacks e readbacks e desfez tudo"
else
  echo "PASS: rollback historico-federal concluido"
fi
