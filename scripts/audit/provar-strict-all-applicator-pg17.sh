#!/usr/bin/env bash
# Prova o aplicador strict-all em PostgreSQL 17 descartável, sem tocar produção.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260830170000"
BATCH="strict-all-proof"
EXECUTION="migration:${VERSION}:${BATCH}"
OUT="$(mktemp -d)"
CONTAINER_ID=""
cleanup() {
  [[ -z "$CONTAINER_ID" ]] || docker stop "$CONTAINER_ID" >/dev/null 2>&1 || true
  rm -rf "$OUT"
}
trap cleanup EXIT INT TERM

node --import tsx scripts/audit/apply-strict-all-review-decisions.ts \
  --queue=tests/fixtures/strict-all-proof-queue.json \
  --decisions=tests/fixtures/strict-all-proof-decisions.jsonl \
  --out="$OUT" --version="$VERSION" --batch="$BATCH" >/dev/null

jq -e '.actions | length == 3' "$OUT/apply-plan.json" >/dev/null
jq -e '.blocked | length == 0' "$OUT/apply-plan.json" >/dev/null
jq -e '.pending | length == 0' "$OUT/apply-plan.json" >/dev/null

MIGRATION="$OUT/${VERSION}_${BATCH}.proposta.sql"
READBACK="$OUT/${VERSION}_${BATCH}.readback.sql"
ROLLBACK="$OUT/${VERSION}_${BATCH}.rollback.sql"
CONTAINER_ID="$(docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE")"

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_ID" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 \
     && docker exec "$CONTAINER_ID" psql -U postgres -h 127.0.0.1 -d postgres -Atqc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

q() {
  docker exec -i "$CONTAINER_ID" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

q -q <<'SQL'
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  nome_urna text NOT NULL,
  cargo_disputado text NOT NULL,
  estado text,
  partido_sigla text,
  publicavel boolean NOT NULL DEFAULT true
);
CREATE TABLE public.coleta_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fonte text NOT NULL,
  escopo text NOT NULL,
  alvo text NOT NULL,
  candidato_id uuid REFERENCES public.candidatos(id),
  executado_em timestamptz NOT NULL,
  resultado text NOT NULL,
  volume integer NOT NULL,
  detalhe text,
  url text,
  execucao text,
  natureza text
);
INSERT INTO public.candidatos(id,slug,nome_urna,cargo_disputado,estado,partido_sigla) VALUES
  ('11111111-1111-4111-8111-111111111111','teste-p0','Teste P0','Governador','SP','TST'),
  ('22222222-2222-4222-8222-222222222222','teste-deps','Teste Dependências','Senador','RJ','TST'),
  ('33333333-3333-4333-8333-333333333333','controle','Controle','Prefeito','MG','CTL');
SQL

if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou estado anterior" >&2
  exit 1
fi

before_control="$(q -Atq -c "select row_to_json(c)::text from public.candidatos c where slug='controle'")"
q -q < "$MIGRATION"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('$VERSION')"
q -q < "$READBACK"
[[ "$(q -Atq -c "select count(*) from public.coleta_log where execucao='$EXECUTION'")" == "3" ]]
[[ "$(q -Atq -c "select count(*) from public.candidatos where slug='teste-p0' and publicavel=false")" == "1" ]]
[[ "$before_control" == "$(q -Atq -c "select row_to_json(c)::text from public.candidatos c where slug='controle'")" ]]

q -q -c "UPDATE public.coleta_log SET detalhe=detalhe || 'x' WHERE id=(SELECT min(id) FROM public.coleta_log WHERE execucao='$EXECUTION')"
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback aceitou receipt adulterado" >&2
  exit 1
fi
q -q -c "UPDATE public.coleta_log SET detalhe=left(detalhe,length(detalhe)-1) WHERE execucao='$EXECUTION' AND detalhe LIKE '%x'"
q -q < "$ROLLBACK"

[[ "$(q -Atq -c "select count(*) from public.coleta_log where execucao='$EXECUTION'")" == "0" ]]
[[ "$(q -Atq -c "select count(*) from supabase_migrations.schema_migrations where version='$VERSION'")" == "0" ]]
[[ "$(q -Atq -c "select count(*) from public.candidatos where slug='teste-p0' and publicavel=true")" == "1" ]]
[[ "$before_control" == "$(q -Atq -c "select row_to_json(c)::text from public.candidatos c where slug='controle'")" ]]

echo "PASS: strict-all actions=3 unpublished=1, readback, rollback fail-closed e controle provados em PostgreSQL 17"
