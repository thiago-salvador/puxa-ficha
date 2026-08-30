#!/usr/bin/env bash
# Rollback fechado somente da migration residual 20260829030002.
set -euo pipefail
case $- in *x*) set +x ;; esac
mode="${1:-rollback}"
[[ "$mode" == "rollback" || "$mode" == "--backup-only" ]] || { echo "FAIL: modo invalido" >&2; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/audit/lib/configure-libpq-from-url.sh
source "$ROOT/scripts/audit/lib/configure-libpq-from-url.sh"

: "${PF_DATABASE_URL:?PF_DATABASE_URL e obrigatoria}"
: "${PF_EXPECTED_SHA:?PF_EXPECTED_SHA e obrigatoria}"
: "${PF_BACKUP_PATH:?PF_BACKUP_PATH e obrigatoria}"
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

version=20260829030002
previous_version=20260829030001
migration="$ROOT/supabase/migrations/${version}_candidate_registration_structured_state.sql"
rollback="$ROOT/supabase/rollback/${version}_candidate_registration_structured_state.rollback.sql"
[[ -f "$migration" && -f "$rollback" ]] || { echo "FAIL: migration/rollback 30002 ausente" >&2; exit 2; }
digest="sha256:$(shasum -a 256 "$migration" | cut -d' ' -f1)"
state="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -F '|' -c \
  "select coalesce(max(version),'') || '|' || count(*) filter(where version='$version') || '|' || coalesce(max(idempotency_key) filter(where version='$version'),'') from supabase_migrations.schema_migrations")"
IFS='|' read -r ledger_top version_count version_key <<<"$state"
[[ "$ledger_top" == "$version" && "$version_count" == "1" && "$version_key" == "$digest" ]] || {
  echo "FAIL: rollback 30002 exige ledger exato no topo: $state" >&2
  exit 1
}

validate_backup() {
  node - "$PF_BACKUP_PATH" <<'NODE'
const fs = require("node:fs")
const backup = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
const registration = backup?.candidate?.candidate_registration
if (backup?.candidate?.slug !== "pablo-marcal" || !registration || typeof registration !== "object" || Array.isArray(registration)) process.exit(1)
if (registration.fonte !== "TSE DivulgaCand 2026" || registration.estado !== "publicado" || registration.verificado_em !== "2026-08-16T18:02:07.454221+00:00") process.exit(1)
if (backup?.ledger_row?.version !== "20260829030002") process.exit(1)
NODE
}

backup_state() {
  umask 077
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
    psql -X -v ON_ERROR_STOP=1 -Atq -c \
    "select json_build_object(
      'captured_at', clock_timestamp(),
      'candidate', (select json_build_object('slug',slug,'candidate_registration',verificacao_campos->'candidate_registration','ultima_atualizacao',ultima_atualizacao) from public.candidatos where slug='pablo-marcal'),
      'ledger_top', (select max(version) from supabase_migrations.schema_migrations),
      'ledger_row', (select json_build_object('version',version,'idempotency_key',idempotency_key) from supabase_migrations.schema_migrations where version='$version')
    )" > "$PF_BACKUP_PATH"
  validate_backup
  echo "BACKUP_SHA256=$(shasum -a 256 "$PF_BACKUP_PATH" | cut -d' ' -f1)"
}

if [[ "$mode" == "--backup-only" ]]; then
  backup_state
  echo "PASS: backup read-only do rollback 30002 capturado"
  exit 0
fi

[[ -s "$PF_BACKUP_PATH" ]] || { echo "FAIL: backup 30002 ausente antes do rollback" >&2; exit 1; }
validate_backup
backup_hash="$(shasum -a 256 "$PF_BACKUP_PATH" | cut -d' ' -f1)"

python3 - "$version" "$previous_version" "$digest" "$rollback" <<'PY' | \
  PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' psql -X -v ON_ERROR_STOP=1 -f -
import pathlib, re, sys

version, previous_version, digest, rollback_path = sys.argv[1:]
text = pathlib.Path(rollback_path).read_text(encoding="utf-8")
begins = list(re.finditer(r"(?im)^\s*BEGIN;\s*$", text))
commits = list(re.finditer(r"(?im)^\s*COMMIT;\s*$", text))
if len(begins) != 1 or len(commits) != 1 or begins[0].end() >= commits[0].start():
    raise SystemExit("rollback 30002 deve ter BEGIN/COMMIT unicos")
body = text[begins[0].end():commits[0].start()]
def lit(value): return "'" + value.replace("'", "''") + "'"

print("BEGIN;")
print("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:candidate-roster-integrity-production', 0));")
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(version)} OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)}) <> 1 THEN RAISE EXCEPTION 'rollback 30002: ledger divergiu sob lock'; END IF; END $ledger$;")
print(body, end="" if body.endswith("\n") else "\n")
print(f"DELETE FROM supabase_migrations.schema_migrations WHERE version={lit(version)} AND idempotency_key={lit(digest)};")
print(f"DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> {lit(previous_version)} OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version={lit(version)}) THEN RAISE EXCEPTION 'rollback 30002: ledger final divergiu'; END IF; END $ledger$;")
print("COMMIT;")
PY

post_count="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -c \
  "select count(*) from public.candidatos where slug='pablo-marcal' and verificacao_campos->'candidate_registration'=jsonb_build_object('fonte','TSE DivulgaCand 2026','verificado_em','2026-08-16T18:02:07.454221+00:00')")"
[[ "$post_count" == "1" ]] || { echo "FAIL: readback do rollback 30002 divergiu" >&2; exit 1; }
receipt_state="$(PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -Atq -c \
  "WITH locked AS MATERIALIZED (
     SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:candidate-roster-integrity-production', 0))
   ), existing AS MATERIALIZED (
     SELECT cl.id FROM public.coleta_log cl, locked
     WHERE cl.fonte='candidate-roster-integrity' AND cl.escopo='candidato' AND cl.alvo='pablo-marcal'
       AND cl.execucao='rollback:20260829030002:$PF_EXPECTED_SHA'
   ), inserted AS (
     INSERT INTO public.coleta_log
       (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao)
     SELECT 'candidate-roster-integrity','candidato','pablo-marcal',c.id,'encontrado',1,
       'Rollback 20260829030002 aplicado, readback aprovado, backup sha256:$backup_hash',NULL,
       'rollback:20260829030002:$PF_EXPECTED_SHA'
     FROM public.candidatos c, locked
     WHERE c.slug='pablo-marcal' AND NOT EXISTS (SELECT 1 FROM existing)
     RETURNING id
   ), receipt AS (
     SELECT id,true AS inserted FROM inserted UNION ALL SELECT id,false FROM existing
   )
   SELECT count(*) || '|' || count(*) FILTER (WHERE inserted) || '|' || coalesce(min(id)::text,'') FROM receipt")"
IFS='|' read -r receipt_count receipt_inserted receipt_id <<<"$receipt_state"
[[ "$receipt_count" == "1" && ( "$receipt_inserted" == "0" || "$receipt_inserted" == "1" ) && -n "$receipt_id" ]] || {
  echo "FAIL: receipt do rollback 30002 nao foi validado: $receipt_state" >&2
  exit 1
}
echo "PASS: rollback 30002 aplicado, ledger retornou a 30001 e estado anterior confere"
