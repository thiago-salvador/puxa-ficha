#!/usr/bin/env bash
# Executa readbacks SQL do PF Ajustes em modo read-only e fail-closed.
set -euo pipefail
case $- in *x*) set +x ;; esac

unset NODE_TLS_REJECT_UNAUTHORIZED NODE_EXTRA_CA_CERTS NODE_OPTIONS
unset SSL_CERT_FILE SSL_CERT_DIR

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
READBACK_DIR="$ROOT/supabase/readback"
source "$ROOT/scripts/audit/lib/configure-libpq-from-url.sh"

if [[ -z "${PF_DATABASE_URL:-}" ]]; then
  echo "FAIL: PF_DATABASE_URL e obrigatoria" >&2
  exit 2
fi

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
process.stdout.write(host ?? user)
NODE
} 2>/dev/null)" || {
  echo "FAIL: PF_DATABASE_URL nao identifica inequivocamente um projeto Supabase" >&2
  exit 2
}
if [[ "$database_ref" != "wskpzsobvqwhnbsdsmok" ]]; then
  echo "FAIL: PF_DATABASE_URL nao aponta para o projeto de producao do Puxa Ficha" >&2
  exit 2
fi

unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE
unset PGSERVICE PGSERVICEFILE PGOPTIONS
unset PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCRLDIR
if [[ "$#" -ne 1 ]]; then
  echo "uso: $0 VERSION" >&2
  exit 2
fi

version="$1"
if [[ ! "$version" =~ ^[0-9]{14}$ ]]; then
  echo "FAIL: versao invalida: $version" >&2
  exit 2
fi
matches=("$READBACK_DIR/${version}_"*.readback.sql)
if [[ ! -f "${matches[0]}" || "${#matches[@]}" -ne 1 ]]; then
  echo "FAIL: esperado exatamente um readback para $version" >&2
  exit 2
fi
echo "== readback $version: ${matches[0]#$ROOT/}"
pf_configure_libpq_from_url
PGCONNECT_TIMEOUT=10 \
PGSSLMODE=verify-full \
PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt" \
PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000" \
  psql -X -v ON_ERROR_STOP=1 --single-transaction -f "${matches[0]}"
