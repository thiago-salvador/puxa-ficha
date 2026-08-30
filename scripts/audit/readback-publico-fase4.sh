#!/usr/bin/env bash
# Fase 4 final, somente leitura e fail-closed, depois do deploy e das coletas.
set -euo pipefail
case $- in *x*) set +x ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/audit/lib/configure-libpq-from-url.sh"

: "${PF_DATABASE_URL:?PF_DATABASE_URL e obrigatoria}"
: "${PF_PUBLIC_SITE_URL:?PF_PUBLIC_SITE_URL e obrigatoria}"
: "${PF_EXPECTED_DEPLOY_SHA:?PF_EXPECTED_DEPLOY_SHA e obrigatoria}"

# Impede que configuração herdada altere confiança TLS de Node ou libpq.
unset NODE_TLS_REJECT_UNAUTHORIZED NODE_EXTRA_CA_CERTS NODE_OPTIONS
unset SSL_CERT_FILE SSL_CERT_DIR
unset GIT_SSL_NO_VERIFY GIT_SSL_CAINFO GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR
unset GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES

if [[ "${PF_DRY_RUN:-}" != "1" ]]; then
  echo "FAIL: PF_DRY_RUN=1 e obrigatorio" >&2
  exit 2
fi

if [[ ! "$PF_EXPECTED_DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "FAIL: PF_EXPECTED_DEPLOY_SHA deve ser um SHA Git completo" >&2
  exit 2
fi

if ! PF_URL_PARA_VALIDAR="$PF_PUBLIC_SITE_URL" node <<'NODE'
const raw = process.env.PF_URL_PARA_VALIDAR ?? ""
let url
try { url = new URL(raw) } catch { process.exit(1) }
if (
  url.protocol !== "https:" || url.hostname !== "puxaficha.com.br" || url.port ||
  url.username || url.password || (url.pathname !== "/" && url.pathname !== "") ||
  url.search || url.hash
) process.exit(1)
NODE
then
  echo "FAIL: PF_PUBLIC_SITE_URL deve ser exatamente https://puxaficha.com.br" >&2
  exit 2
fi

assert_checkout_exato() {
  local head_sha status_output flags_output
  if ! head_sha="$(git -C "$ROOT" rev-parse HEAD)"; then
    echo "FAIL: nao foi possivel ler o HEAD do checkout" >&2
    exit 1
  fi
  if [[ "$head_sha" != "$PF_EXPECTED_DEPLOY_SHA" ]]; then
    echo "FAIL: checkout $head_sha difere do SHA publicado esperado $PF_EXPECTED_DEPLOY_SHA" >&2
    exit 1
  fi
  if ! status_output="$(git -C "$ROOT" status --porcelain=v1 --untracked-files=normal)"; then
    echo "FAIL: nao foi possivel provar a limpeza do checkout" >&2
    exit 1
  fi
  if [[ -n "$status_output" ]]; then
    echo "FAIL: checkout precisa estar limpo para o readback final" >&2
    exit 1
  fi
  if ! flags_output="$(git -C "$ROOT" ls-files -v)"; then
    echo "FAIL: nao foi possivel auditar flags do indice" >&2
    exit 1
  fi
  if [[ -n "$flags_output" ]] && printf '%s\n' "$flags_output" | LC_ALL=C grep -Ev '^H ' >/dev/null; then
    echo "FAIL: checkout usa assume-unchanged, skip-worktree ou flag de indice nao canonica" >&2
    exit 1
  fi
}
assert_checkout_exato
main_remote="$(
  GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_CONFIG_COUNT=0 \
    GIT_ALLOW_PROTOCOL=https \
    node scripts/audit/lib/run-with-timeout.mjs 20 \
      git -C / -c http.sslVerify=true -c http.followRedirects=false \
      ls-remote https://github.com/thiago-salvador/puxa-ficha.git refs/heads/main
)" || {
  echo "FAIL: nao foi possivel confirmar refs/heads/main no origin" >&2
  exit 1
}
if [[ "$main_remote" != "$PF_EXPECTED_DEPLOY_SHA"$'\trefs/heads/main' ]]; then
  echo "FAIL: SHA publicado esperado ainda nao e o head protegido de origin/main" >&2
  exit 1
fi

# Liga o psql ao projeto de producao antes de cruzar ledger, API e DOM. A URL
# nunca vai no argv: o parser e o psql a recebem pelo ambiente.
database_ref="$({
  node <<'NODE'
const raw = process.env.PF_DATABASE_URL ?? ""
let url
try { url = new URL(raw) } catch { process.exit(2) }
if (!/^(?:postgres|postgresql):$/.test(url.protocol) || url.search || url.hash) process.exit(2)
if (url.pathname !== "/postgres") process.exit(2)
const host = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]
const user = decodeURIComponent(url.username).match(/^postgres\.([a-z0-9]+)$/)?.[1]
const pooler = /(?:^|\.)pooler\.supabase\.com$/.test(url.hostname)
if ((host && url.port !== "5432") || (pooler && !["5432", "6543"].includes(url.port))) process.exit(2)
if (host && user && host !== user) process.exit(3)
if (!host && !(pooler && user)) process.exit(4)
if (host && user && host !== user) process.exit(5)
const ref = host ?? (pooler ? user : undefined)
if (!ref) process.exit(4)
process.stdout.write(ref)
NODE
} 2>/dev/null)" || {
  echo "FAIL: PF_DATABASE_URL nao identifica inequivocamente um projeto Supabase" >&2
  exit 2
}
if [[ "$database_ref" != "wskpzsobvqwhnbsdsmok" ]]; then
  echo "FAIL: PF_DATABASE_URL nao aponta para o projeto de producao do Puxa Ficha" >&2
  exit 2
fi

# Nenhuma variável libpq herdada pode trocar o alvo ou as opções da conexão.
unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE
unset PGSERVICE PGSERVICEFILE PGOPTIONS
unset PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCRLDIR
export PGCONNECT_TIMEOUT=10
export PGSSLMODE=verify-full
export PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt"
pf_configure_libpq_from_url

supabase_ref="$({
  node --import tsx --input-type=module <<'NODE'
import { supabaseProjectRefParaAuditoria } from "./scripts/lib/supabase.ts"
process.stdout.write(supabaseProjectRefParaAuditoria())
NODE
} 2>/dev/null)" || {
  echo "FAIL: cliente Supabase dos auditores nao identifica um projeto valido" >&2
  exit 2
}
if [[ "$supabase_ref" != "$database_ref" ]]; then
  echo "FAIL: cliente Supabase e PF_DATABASE_URL apontam para projetos diferentes" >&2
  exit 2
fi

run_with_timeout() {
  local segundos="$1"
  shift
  node scripts/audit/lib/run-with-timeout.mjs "$segundos" "$@"
}

OUT="${PF_OUTPUT_DIR:-$ROOT/output/pf-ajustes-fase4-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT"

# Primeiro congela a identidade INTEGRAL do ledger. O gate do repo recusa uma
# versao inesperada ou a troca de uma migration historica por outra com a mesma
# cardinalidade. As cinco retidas de 07/08 sao a unica excecao versionada.
PGCONNECT_TIMEOUT=10 \
PGSSLMODE=verify-full \
PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt" \
PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000" \
  psql -X -v ON_ERROR_STOP=1 -Atq \
    -c 'select version from supabase_migrations.schema_migrations order by version' \
    > "$OUT/ledger-versions.txt" || {
  echo "FAIL: leitura do ledger falhou" >&2
  exit 1
}
npm run audit:ledger:gate -- --remotas="$OUT/ledger-versions.txt" > "$OUT/ledger-gate.log" 2>&1 || {
  echo "FAIL: identidade integral do ledger divergiu" >&2
  exit 1
}

# O readback usa o predecessor e o manifesto do próprio run. Não há uma
# cardinalidade ou topo histórico embutido aqui, portanto migrations novas como
# 30002 entram sem alterar este script.
ledger_predecessor="${PF_LEDGER_PREDECESSOR:-}"
ledger_manifest="${PF_LEDGER_MANIFEST:-}"
if [[ -z "$ledger_manifest" || ! -f "$ledger_manifest" ]]; then
  echo "FAIL: PF_LEDGER_MANIFEST e obrigatorio e deve existir" >&2
  exit 2
fi
manifest_versions="$({
  node - "$ledger_manifest" <<'NODE'
const fs = require("node:fs")
const raw = fs.readFileSync(process.argv[2], "utf8")
let value = raw
try { value = JSON.parse(raw) } catch {}
const predecessor = typeof value?.predecessor === "string" ? value.predecessor : ""
const versions = Array.isArray(value)
  ? value
  : Array.isArray(value?.versions)
    ? value.versions
    : raw.split(/\r?\n/).map((v) => v.trim()).filter(Boolean)
if (!Array.isArray(versions) || versions.some((v) => typeof v !== "string" || !/^\d{14}$/.test(v))) process.exit(2)
process.stdout.write(predecessor + "\n" + [...new Set(versions)].sort().join("\n"))
NODE
} 2>/dev/null)" || {
  echo "FAIL: PF_LEDGER_MANIFEST deve conter versoes de 14 digitos" >&2
  exit 2
}
manifest_predecessor="$(printf '%s\n' "$manifest_versions" | sed -n '1p')"
if [[ -z "$ledger_predecessor" ]]; then ledger_predecessor="$manifest_predecessor"; fi
release_versions=()
while IFS= read -r version; do
  [[ -n "$version" ]] && release_versions+=("$version")
done < <(printf '%s\n' "$manifest_versions" | sed '1d' | sed '/^$/d')
if [[ "${#release_versions[@]}" == "0" ]]; then
  echo "FAIL: PF_LEDGER_MANIFEST nao pode ser vazio" >&2
  exit 2
fi
if [[ -n "$ledger_predecessor" && ! "$ledger_predecessor" =~ ^[0-9]{14}$ ]]; then
  echo "FAIL: PF_LEDGER_PREDECESSOR deve ser uma versao de 14 digitos" >&2
  exit 2
fi
ledger_total="$(wc -l < "$OUT/ledger-versions.txt" | tr -d '[:space:]')"
ledger_top="$(tail -n 1 "$OUT/ledger-versions.txt")"
if [[ -n "$ledger_predecessor" ]] && ! grep -Fxq "$ledger_predecessor" "$OUT/ledger-versions.txt"; then
  echo "FAIL: ledger nao contem o predecessor do run $ledger_predecessor" >&2
  exit 1
fi
for version in "${release_versions[@]}"; do
  if ! grep -Fxq "$version" "$OUT/ledger-versions.txt"; then
    echo "FAIL: ledger nao contem a migration do release $version" >&2
    exit 1
  fi
done
if [[ -n "$ledger_predecessor" && "$ledger_top" < "$ledger_predecessor" ]]; then
  echo "FAIL: topo do ledger ($ledger_top) anterior ao predecessor ($ledger_predecessor)" >&2
  exit 1
fi
printf '%s|%s|%s|predecessor=%s|manifest=%s\n' \
  "$ledger_total" "$ledger_top" "${#release_versions[@]}" \
  "${ledger_predecessor:-none}" "${ledger_manifest:-legacy-fallback}" > "$OUT/ledger.txt"

# O readback final repete todos os contratos, porque o banco pode sofrer drift
# depois do readback imediato de uma migration. Cada runner abre transacao
# read-only, valida ledger proprio e compara o payload/DDL exatos.
for version in "${release_versions[@]}"; do
  PF_DATABASE_URL="$PF_DATABASE_URL" \
    bash scripts/audit/readback-release-pf-ajustes.sh "$version" \
    > "$OUT/readback-$version.log" 2>&1 || {
      echo "FAIL: readback final da migration $version divergiu" >&2
      exit 1
    }
done

assert_checkout_exato
run_with_timeout 600 node --import tsx scripts/audit/readback-destaques-ficha.ts \
  --expect-final --json="$OUT/destaques-194.json"

assert_checkout_exato
run_with_timeout 600 node --import tsx scripts/audit/readback-honestidade-superficie.ts \
  --json="$OUT/honestidade-194.json"

assert_checkout_exato
run_with_timeout 600 node --import ./scripts/audit/lib/server-only-preload.mjs --import tsx \
  scripts/audit/gerar-fixture-cards-dinheiro.ts \
  --output="$OUT/dinheiro-db-194.json"

assert_checkout_exato
run_with_timeout 900 node --import tsx scripts/audit/readback-financiamento-universo.ts \
  --public-url="$PF_PUBLIC_SITE_URL" > "$OUT/financiamento-194x2.json"

assert_checkout_exato
run_with_timeout 900 node --import tsx scripts/audit/readback-publico-fase4.ts \
  --public-url="$PF_PUBLIC_SITE_URL" \
  --expected-sha="$PF_EXPECTED_DEPLOY_SHA" \
  --expect-final \
  --json="$OUT/publico-194x2.json"

assert_checkout_exato
run_with_timeout 30 node --import tsx scripts/audit/comparar-destaques-publicos.ts \
  "$OUT/destaques-194.json" "$OUT/dinheiro-db-194.json" "$OUT/publico-194x2.json"

assert_checkout_exato
main_remote_final="$(
  GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_CONFIG_COUNT=0 \
    GIT_ALLOW_PROTOCOL=https \
    node scripts/audit/lib/run-with-timeout.mjs 20 \
      git -C / -c http.sslVerify=true -c http.followRedirects=false \
      ls-remote https://github.com/thiago-salvador/puxa-ficha.git refs/heads/main
)" || {
  echo "FAIL: nao foi possivel reconfirmar refs/heads/main no origin" >&2
  exit 1
}
if [[ "$main_remote_final" != "$PF_EXPECTED_DEPLOY_SHA"$'\trefs/heads/main' ]]; then
  echo "FAIL: origin/main mudou durante o readback" >&2
  exit 1
fi

echo "PASS: Fase 4, ledger + banco/API/DTO/DOM/cache/SHA, 194 fichas x 2 viewports"
echo "Evidencias: $OUT"
