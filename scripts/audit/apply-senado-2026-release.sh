#!/usr/bin/env bash
# Aplica somente as seis migrations de schema do release do Senado 2026.
# Não carrega dado e não muda publicavel: o gerador recusa DML e cada transação
# prova que a assinatura (id, publicavel) de candidatos ficou idêntica.
set -euo pipefail
case $- in *x*) set +x ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/audit/lib/configure-libpq-from-url.sh
source "$ROOT/scripts/audit/lib/configure-libpq-from-url.sh"

: "${PF_DATABASE_URL:?PF_DATABASE_URL e obrigatoria}"
: "${PF_EXPECTED_SHA:?PF_EXPECTED_SHA e obrigatoria}"

if [[ ! "$PF_EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "FAIL: PF_EXPECTED_SHA invalido" >&2
  exit 2
fi
if [[ "$(git rev-parse HEAD)" != "$PF_EXPECTED_SHA" ]]; then
  echo "FAIL: checkout nao corresponde ao SHA autorizado" >&2
  exit 2
fi
if [[ -n "$(git status --porcelain=v1 --untracked-files=normal)" ]]; then
  echo "FAIL: checkout possui alteracoes" >&2
  exit 2
fi
if [[ "${GITHUB_REF:-refs/heads/main}" != "refs/heads/main" ]]; then
  echo "FAIL: aplicacao autorizada somente a partir de main" >&2
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
let decodedUser
try { decodedUser = decodeURIComponent(url.username) } catch { process.exit(2) }
const user = decodedUser.match(/^postgres\.([a-z0-9]+)$/)?.[1]
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
  echo "FAIL: PF_DATABASE_URL nao aponta para producao" >&2
  exit 2
fi

unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE
unset PGSERVICE PGSERVICEFILE PGOPTIONS
unset PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCRLDIR
pf_configure_libpq_from_url
export PGCONNECT_TIMEOUT=10
export PGSSLMODE=verify-full
export PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt"

versions=(20260914000000 20260915090000 20260915190000 20260915210000 20260915210100 20260915220000)

unique_file() {
  local dir="$1" version="$2" suffix="$3"
  local matches=("$dir/${version}_"*"$suffix")
  if [[ ! -f "${matches[0]}" || "${#matches[@]}" -ne 1 ]]; then
    echo "FAIL: esperado exatamente um arquivo $suffix para $version" >&2
    return 2
  fi
  printf '%s' "${matches[0]}"
}

# O diretório de migrations não pode ter duas migrations com a mesma versão
# dentro do conjunto; a antiga colisão 20260915210000 foi renomeada para 210100.
for version in "${versions[@]}"; do
  unique_file "$ROOT/supabase/migrations" "$version" .sql >/dev/null
  unique_file "$ROOT/supabase/readback" "$version" .rollback.readback.sql >/dev/null
done

state="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -c \
  "select coalesce(max(version),'') || '|' || count(*) filter (where version in ('20260914000000','20260915090000','20260915190000','20260915210000','20260915210100','20260915220000')) from supabase_migrations.schema_migrations")"
if [[ "$state" != "20260912160200|0" ]]; then
  echo "FAIL: ledger inicial divergiu: $state, esperado 20260912160200|0" >&2
  exit 1
fi

release_args=("$PF_EXPECTED_SHA")
for version in "${versions[@]}"; do
  migration="$(unique_file "$ROOT/supabase/migrations" "$version" .sql)"
  rollback="$(unique_file "$ROOT/supabase/rollback" "$version" .rollback.sql)"
  # O glob de unique_file casaria também o .rollback.readback.sql; o readback de
  # aplicação é derivado do nome exato da migration.
  readback="$ROOT/supabase/readback/$(basename "$migration" .sql).readback.sql"
  if [[ ! -f "$readback" ]]; then
    echo "FAIL: readback ausente para $version" >&2
    exit 2
  fi
  release_args+=("$version" "$migration" "$rollback" "$readback")
done

# Gera o SQL inteiro antes de conectar para escrita: erro de validação no
# gerador nunca deixa psql executar um prefixo parcial.
release_sql="$(python3 "$ROOT/scripts/audit/lib/senado-2026-release-sql.py" "${release_args[@]}")"

printf '%s\n' "$release_sql" \
  | PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' \
      psql -X -v ON_ERROR_STOP=1 -f -

echo "PASS: migrations 20260914000000, 20260915090000, 20260915190000, 20260915210000, 20260915210100 e 20260915220000 aplicadas com readback"
