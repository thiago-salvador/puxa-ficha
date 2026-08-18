#!/usr/bin/env bash
# Aplica somente a correção follow-up das seis biografias de chapa.
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

database_ref="$({ node <<'NODE'
const raw=process.env.PF_DATABASE_URL??''; let u; try{u=new URL(raw)}catch{process.exit(2)}
if(!/^(?:postgres|postgresql):$/.test(u.protocol)||u.search||u.hash||u.pathname!='/postgres')process.exit(2)
const host=u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]
const user=decodeURIComponent(u.username).match(/^postgres\.([a-z0-9]+)$/)?.[1]
const pooler=/(?:^|\.)pooler\.supabase\.com$/.test(u.hostname)
if((host&&u.port!='5432')||(pooler&&!['5432','6543'].includes(u.port)))process.exit(2)
if(host&&user&&host!==user)process.exit(3)
if(!host&&!(pooler&&user))process.exit(4)
process.stdout.write(host??user)
NODE
} 2>/dev/null)" || { echo "FAIL: URL nao identifica projeto" >&2; exit 2; }
[[ "$database_ref" == "wskpzsobvqwhnbsdsmok" ]] || { echo "FAIL: banco nao e producao" >&2; exit 2; }

unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS
unset PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCRLDIR
pf_configure_libpq_from_url
export PGCONNECT_TIMEOUT=10 PGSSLMODE=verify-full
export PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt"

version=20260813111700
migration=("$ROOT/supabase/migrations/${version}_"*.sql)
rollback=("$ROOT/supabase/rollback/${version}_"*.rollback.sql)
readback=("$ROOT/supabase/readback/${version}_"*.readback.sql)
[[ ${#migration[@]} -eq 1 && -f ${migration[0]} ]] || { echo "FAIL: migration nao unica" >&2; exit 2; }
[[ ${#rollback[@]} -eq 1 && -f ${rollback[0]} ]] || { echo "FAIL: rollback nao unico" >&2; exit 2; }
[[ ${#readback[@]} -eq 1 && -f ${readback[0]} ]] || { echo "FAIL: readback nao unico" >&2; exit 2; }

state="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -Atq -c "select coalesce(max(version),'') || '|' || count(*) filter(where version='$version') from supabase_migrations.schema_migrations")"
[[ "$state" == "20260813040200|0" ]] || { echo "FAIL: ledger inicial $state" >&2; exit 1; }

python3 - "$PF_EXPECTED_SHA" "$version" "${migration[0]}" "${rollback[0]}" "${readback[0]}" <<'PY' \
| PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
import base64,hashlib,pathlib,sys
sha,version,mp,bp,rp=sys.argv[1:]
m=pathlib.Path(mp).read_bytes(); b=pathlib.Path(bp).read_bytes(); r=pathlib.Path(rp).read_bytes()
def lit(s): return "'"+s.replace("'","''")+"'"
def b64(x): return base64.b64encode(x).decode()
name=pathlib.Path(mp).stem.removeprefix(version+'_')
print('BEGIN;')
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:chapas-2026-biografias',0));")
print("DO $$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> '20260813040200' OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260813111700') THEN RAISE EXCEPTION 'ledger divergiu sob lock'; END IF; END $$;")
print(m.decode(),end='' if m.endswith(b'\n') else '\n')
print(r.decode(),end='' if r.endswith(b'\n') else '\n')
print('INSERT INTO supabase_migrations.schema_migrations (version,statements,name,created_by,idempotency_key,rollback) VALUES (')
print(f"{lit(version)}, ARRAY[convert_from(decode({lit(b64(m))},'base64'),'UTF8')], {lit(name)}, {lit('github-actions:'+sha)}, {lit('sha256:'+hashlib.sha256(m).hexdigest())}, ARRAY[convert_from(decode({lit(b64(b))},'base64'),'UTF8')]);")
print("DO $$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> '20260813111700' THEN RAISE EXCEPTION 'ledger final divergiu'; END IF; END $$;")
print('COMMIT;')
PY

echo "PASS: migration 20260813111700 aplicada com readback"
