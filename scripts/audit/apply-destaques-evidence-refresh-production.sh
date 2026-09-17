#!/usr/bin/env bash
# Aplica o refresh de evidência de destaques-votacoes (INSERT em
# public.coleta_log) contra o projeto de produção do Puxa Ficha. Não toca
# supabase_migrations.schema_migrations: só insere os recibos gerados por
# scripts/audit/generate-destaques-evidence-refresh.ts, que já embute os
# guards de deriva, escopo e idempotência em apply.sql/readback.sql. Este
# script só confirma host/produção e chama psql — a lógica de negócio vive
# inteira no SQL gerado (testado em tests/generate-destaques-evidence-refresh.test.ts).
set -euo pipefail
case $- in *x*) set +x ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/audit/lib/configure-libpq-from-url.sh
source "$ROOT/scripts/audit/lib/configure-libpq-from-url.sh"

: "${PF_DATABASE_URL:?PF_DATABASE_URL e obrigatoria}"
: "${PF_APPLY_SQL:?PF_APPLY_SQL e obrigatoria}"
: "${PF_READBACK_SQL:?PF_READBACK_SQL e obrigatoria}"
: "${GITHUB_REF:?GITHUB_REF e obrigatoria}"
[[ "$GITHUB_REF" == "refs/heads/main" ]] || { echo "FAIL: somente main" >&2; exit 2; }
[[ -f "$PF_APPLY_SQL" ]] || { echo "FAIL: apply.sql ausente: $PF_APPLY_SQL" >&2; exit 2; }
[[ -f "$PF_READBACK_SQL" ]] || { echo "FAIL: readback.sql ausente: $PF_READBACK_SQL" >&2; exit 2; }

# Mesma checagem de projeto usada em apply-destaques-freshness-reconciliation-production.sh:
# a URL declara host direto (db.<ref>.supabase.co) ou pooler com usuario
# postgres.<ref>; os dois precisam concordar quando ambos presentes, e o
# <ref> resolvido precisa ser exatamente o projeto de produção declarado.
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

PGOPTIONS='-c statement_timeout=60000 -c lock_timeout=10000' \
  psql -X -v ON_ERROR_STOP=1 -f "$PF_APPLY_SQL"
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -f "$PF_READBACK_SQL"
echo "PASS: evidência de destaques-votacoes publicada e readback conferido"
