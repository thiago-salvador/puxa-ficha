#!/usr/bin/env bash
# Applies the reopened Senate exercise migration (issue #470) after its predecessor.
# The predecessor digest is computed from the file and must equal the ledger key.
set -euo pipefail
case $- in *x*) set +x ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/audit/lib/configure-libpq-from-url.sh
source "$ROOT/scripts/audit/lib/configure-libpq-from-url.sh"

: "${PF_DATABASE_URL:?PF_DATABASE_URL is required}"
: "${PF_EXPECTED_SHA:?PF_EXPECTED_SHA is required}"
: "${GITHUB_REF:?GITHUB_REF is required}"
[[ "$PF_EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "FAIL: invalid SHA" >&2; exit 2; }
[[ "$(git rev-parse HEAD)" == "$PF_EXPECTED_SHA" ]] || { echo "FAIL: checkout SHA differs" >&2; exit 2; }
[[ -z "$(git status --porcelain=v1 --untracked-files=normal)" ]] || { echo "FAIL: checkout is dirty" >&2; exit 2; }
[[ "$GITHUB_REF" == "refs/heads/main" ]] || { echo "FAIL: main is required" >&2; exit 2; }
remote_url="$(git remote get-url origin)"
case "$remote_url" in
  https://github.com/thiago-salvador/puxa-ficha|https://github.com/thiago-salvador/puxa-ficha.git|git@github.com:thiago-salvador/puxa-ficha.git) ;;
  *) echo "FAIL: origin is not the expected repository" >&2; exit 2 ;;
esac
[[ "$(git ls-remote "$remote_url" refs/heads/main | cut -f1)" == "$PF_EXPECTED_SHA" ]] || {
  echo "FAIL: SHA is not the remote main tip" >&2
  exit 2
}

database_ref="$(
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
)" || { echo "FAIL: database URL does not identify a Supabase project" >&2; exit 2; }
[[ "$database_ref" == "wskpzsobvqwhnbsdsmok" ]] || { echo "FAIL: database is not production" >&2; exit 2; }

unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE PGOPTIONS
unset PGSERVICE PGSERVICEFILE PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCRLDIR
pf_configure_libpq_from_url
export PGCONNECT_TIMEOUT=10 PGSSLMODE=verify-full
export PGSSLROOTCERT="$ROOT/scripts/audit/certs/supabase-root-2021.crt"

version=20260924003000
previous_version=20260923233000
previous_migration="$ROOT/supabase/migrations/${previous_version}_eliziane_mudancas_partido.sql"
migration="$ROOT/supabase/migrations/${version}_senado_exercicio_reaberto.sql"
rollback="$ROOT/supabase/rollback/${version}_senado_exercicio_reaberto.rollback.sql"
readback="$ROOT/supabase/readback/${version}_senado_exercicio_reaberto.readback.sql"
[[ -f "$previous_migration" && -f "$migration" && -f "$rollback" && -f "$readback" ]] || {
  echo "FAIL: required migration artifacts are missing" >&2
  exit 2
}
previous_digest="sha256:$(shasum -a 256 "$previous_migration" | cut -d' ' -f1)"
[[ "$previous_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "FAIL: predecessor digest is malformed" >&2; exit 2; }

digest="sha256:$(shasum -a 256 "$migration" | cut -d' ' -f1)"
state="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c \
  "select coalesce(max(version),'') || '|' || count(*) filter(where version='$previous_version') || '|' || coalesce(max(idempotency_key) filter(where version='$previous_version'),'') || '|' || count(*) filter(where version='$version') || '|' || coalesce(max(idempotency_key) filter(where version='$version'),'') from supabase_migrations.schema_migrations")"
IFS='|' read -r ledger_top previous_count previous_key version_count version_key <<<"$state"

if [[ "$ledger_top" == "$version" && "$version_count" == "1" && "$version_key" == "$digest" && "$previous_count" == "1" && "$previous_key" == "$previous_digest" ]]; then
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
    psql -X -v ON_ERROR_STOP=1 -f "$readback"
  echo "PASS: migration, ledger and readback agree"
  exit 0
fi
if [[ "$ledger_top" != "$previous_version" || "$previous_count" != "1" || "$previous_key" != "$previous_digest" || "$version_count" != "0" ]]; then
  echo "FAIL: unexpected initial ledger state: $state" >&2
  exit 1
fi

# The ledger and the ten candidates have to match before the workflow may write.
# The migration repeats the exact preimage check under the candidate row locks.
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -c "
DO \$preflight\$
DECLARE
  alvos jsonb := '[
    [\"tse-2026-100002537338\",\"63776260-c37b-4112-8eca-eb338e88abf5\",\"e0f072e8-2c69-40d3-8754-7c1c97092b91\",2022],
    [\"tse-2026-100002541459\",\"b8e8b3d1-1e2e-482f-b0dd-dbf927c5c681\",\"a9fed6c6-7402-42fd-81b8-44b1b62ff246\",2024],
    [\"tse-2026-10002535804\",\"13814e66-c5d3-4dbc-94cb-4e5b7e38bfc4\",\"59c27149-9d84-491a-a810-4d03ac9f0418\",2022],
    [\"tse-2026-10002548050\",\"84869313-07bc-4cf9-affb-87e0e65ce97f\",\"14dc2eaa-b08b-4a02-9ae3-c30ffaf8a9db\",2022],
    [\"tse-2026-130002545590\",\"6e07376d-ea69-4d9d-b850-a073ac17e764\",\"145d429b-6a6f-487b-b92a-ba6062381ee4\",2024],
    [\"tse-2026-150002544905\",\"54d10672-5b58-4382-a64e-a13fdb320f5f\",\"55f20f2b-284e-443c-932f-05a1e3f5c954\",2021],
    [\"tse-2026-180002540446\",\"bd861326-b9f3-4a6f-a255-fc770ed2b78b\",\"68e8b267-4d07-4a36-9003-fccffc588b8e\",2022],
    [\"tse-2026-230002550794\",\"94de7156-47d5-4158-9710-e44ad4c27910\",\"1a58e138-d673-443f-bdab-c950508b65c9\",2021],
    [\"tse-2026-30002530069\",\"bdcf63e1-ee6c-4d02-8aef-9938b9dbdde5\",\"bac83c09-ff82-4485-9a01-7c8b1937751d\",2020],
    [\"tse-2026-90002543215\",\"b106cbcf-101f-41a8-8fb5-7b2d86e1a683\",\"a3a26ee1-0795-4a29-8dfe-6b136ab24bb2\",2025]
  ]'::jsonb;
BEGIN
  IF (SELECT count(*) FROM jsonb_array_elements(alvos) a
      JOIN public.candidatos c ON c.id = (a->>1)::uuid AND c.slug = a->>0
      WHERE c.cargo_disputado = 'Senador' AND c.publicavel IS TRUE AND c.status <> 'removido') <> 10
     OR (SELECT count(*) FROM jsonb_array_elements(alvos) a
         JOIN public.historico_politico h ON h.id = (a->>2)::uuid AND h.candidato_id = (a->>1)::uuid
         WHERE h.cargo = 'Senador' AND h.periodo_inicio = 2019 AND h.proveniencia = 'senado'
           AND h.tipo_evento = 'mandato' AND h.despublicado_em IS NULL) <> 10
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(alvos) a
                JOIN public.historico_politico h ON h.candidato_id = (a->>1)::uuid
                WHERE h.cargo = 'Senador' AND h.periodo_inicio = (a->>3)::int)
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260924003000')
     OR EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot
                 WHERE migration_version = '20260924003000') THEN
    RAISE EXCEPTION 'senado exercicio reaberto: preimagem ou recibo divergiu';
  END IF;
END \$preflight\$;"

python3 - "$PF_EXPECTED_SHA" "$version" "$previous_version" "$digest" "$previous_digest" "$migration" "$rollback" "$readback" <<'PY' | \
  PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
import base64, pathlib, re, sys

sha, version, previous, digest, previous_digest, migration_path, rollback_path, readback_path = sys.argv[1:]

def split_body(path):
    raw = pathlib.Path(path).read_bytes()
    text = raw.decode("utf-8")
    begins = list(re.finditer(r"(?im)^\s*BEGIN(?: READ ONLY)?;\s*$", text))
    commits = list(re.finditer(r"(?im)^\s*COMMIT;\s*$", text))
    if len(begins) != 1 or len(commits) != 1 or begins[0].end() >= commits[0].start():
        raise SystemExit(f"{path}: expected one outer BEGIN and COMMIT")
    return raw, text[begins[0].end():commits[0].start()]

def lit(value): return "'" + value.replace("'", "''") + "'"
def b64(value): return base64.b64encode(value).decode("ascii")

raw, body = split_body(migration_path)
rollback = pathlib.Path(rollback_path).read_bytes()
_, readback_body = split_body(readback_path)
name = pathlib.Path(migration_path).stem.removeprefix(version + "_")
created_by = "github-actions:" + sha

print("BEGIN;")
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));")
print("LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;")
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(previous)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(previous)} AND idempotency_key={lit(previous_digest)}) <> 1 OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version={lit(version)}) THEN RAISE EXCEPTION 'senado exercicio reaberto: ledger diverged under lock'; END IF; END $ledger$;")
print(body, end="" if body.endswith("\n") else "\n")
print("INSERT INTO supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback) VALUES (")
print(f"  {lit(version)}, ARRAY[convert_from(decode({lit(b64(raw))}, 'base64'), 'UTF8')], {lit(name)}, {lit(created_by)}, {lit(digest)}, ARRAY[convert_from(decode({lit(b64(rollback))}, 'base64'), 'UTF8')]);")
print(readback_body, end="" if readback_body.endswith("\n") else "\n")
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)}) <> 1 THEN RAISE EXCEPTION 'senado exercicio reaberto: final ledger diverged'; END IF; END $ledger$;")
print("COMMIT;")
PY

PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -f "$readback"
echo "PASS: migration, ledger and transactional readback completed"
