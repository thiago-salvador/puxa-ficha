#!/usr/bin/env bash
set -euo pipefail
: "${PF_DATABASE_URL:?PF_DATABASE_URL e obrigatoria}"
: "${PF_EXPECTED_SHA:?PF_EXPECTED_SHA e obrigatoria}"
: "${GITHUB_REF:?GITHUB_REF e obrigatoria}"
[[ "$PF_EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ "$GITHUB_REF" == refs/heads/main ]] || exit 2
[[ "$(git rev-parse HEAD)" == "$PF_EXPECTED_SHA" ]] || { echo 'FAIL: checkout divergiu' >&2; exit 2; }
[[ -z "$(git status --porcelain=v1 --untracked-files=normal)" ]] || { echo 'FAIL: checkout sujo' >&2; exit 2; }
[[ "$(git ls-remote https://github.com/thiago-salvador/puxa-ficha.git refs/heads/main | cut -f1)" == "$PF_EXPECTED_SHA" ]] || { echo 'FAIL: SHA nao e topo remoto de main' >&2; exit 2; }
mode="${1:-dry-run}"
case "$mode" in apply|dry-run|verify) ;; *) echo 'FAIL: modo inválido' >&2; exit 2 ;; esac
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
source scripts/audit/lib/configure-libpq-from-url.sh
pf_configure_libpq_from_url
export PGCONNECT_TIMEOUT=10 PGSSLMODE=verify-full PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt"
node --import tsx scripts/audit/apply-chapas-public-grants.ts "$mode" "$PF_EXPECTED_SHA" | psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=terse -f -
