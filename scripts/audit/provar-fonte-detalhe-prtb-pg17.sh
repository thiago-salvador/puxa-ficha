#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartavel de 20260916150000 (refresca
# chapas_2026.fonte_detalhe da chapa presidencial do PRTB).
#
# Prova: no-op em banco vazio, forward com pos-condicao completa, abort sem
# escrita quando a preimagem diverge (linha de controle intacta), segunda
# execucao recusada, rollback restaurando o blob antigo, rollback duplicado
# recusado.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260916150000"
MIGRATION="supabase/migrations/${VERSION}_refrescar_fonte_detalhe_prtb.sql"
READBACK="supabase/readback/${VERSION}_refrescar_fonte_detalhe_prtb.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_refrescar_fonte_detalhe_prtb.rollback.sql"
ROLLBACK_READBACK="supabase/readback/${VERSION}_refrescar_fonte_detalhe_prtb.rollback.readback.sql"
for f in "$MIGRATION" "$READBACK" "$ROLLBACK" "$ROLLBACK_READBACK"; do
  [[ -f "$f" ]] || { echo "FAIL: artefato ausente: $f" >&2; exit 2; }
done

CONTAINER_ID="$(docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE")"
cleanup() { docker stop "$CONTAINER_ID" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_ID" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 \
     && docker exec "$CONTAINER_ID" psql -U postgres -h 127.0.0.1 -d postgres -Atqc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

q() { docker exec -i "$CONTAINER_ID" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
q_replay() {
  docker exec -e PGOPTIONS='-c pf.replay=true' -i "$CONTAINER_ID" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q --single-transaction -f -
}

schema() {
q -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY);
CREATE TABLE IF NOT EXISTS public.chapas_2026 (
  chave text PRIMARY KEY, fonte_tipo text, fonte_sha256 text, snapshot_em timestamptz,
  fonte_detalhe jsonb
);
CREATE TABLE IF NOT EXISTS public.coleta_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fonte text NOT NULL, escopo text, alvo text, candidato_id uuid,
  resultado text, volume integer, detalhe text, url text, execucao text, natureza text
);
SQL
}

seed() {
q -q <<'SQL'
INSERT INTO public.chapas_2026 (chave, fonte_tipo, fonte_sha256, snapshot_em, fonte_detalhe) VALUES
  ('2026:BR:pablo-henrique-costa-marcal', 'divulgacand_detalhe',
   '6350130e0a337d698eb30c86d053bb15317cfa7f7c31a496c5c89f4d0eb82dad',
   '2026-09-15T15:04:36.472Z',
   '{"titular":{"sq_candidato":"280002554479","descricao_situacao":"Aguardando julgamento","sha256":"6350130e0a337d698eb30c86d053bb15317cfa7f7c31a496c5c89f4d0eb82dad","checked_at":"2026-09-15T15:04:36.472Z"},"vice":{"sq_candidato":"280002554490","descricao_situacao":"Aguardando julgamento","sha256":"e2a45d22429fb28baa6d075592de32ceba85f9eccec4c309bf564c6ee8360e02","checked_at":"2026-09-15T15:04:36.528Z"}}'::jsonb),
  ('controle', 'legado', 'zzz', '2020-01-01T00:00:00Z', NULL);
SQL
}

M="$MIGRATION"

# 1) Banco vazio: no-op, nao falha.
schema
q -q < "$M"
vazio="$(q -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations")"
[[ "$vazio" == "0" ]] || { echo "FAIL: migration escreveu no ledger em coorte vazia" >&2; exit 1; }

seed

# 2) Preimagem errada: aborta sem escrita parcial.
q -q -c "UPDATE public.chapas_2026 SET fonte_sha256='errado' WHERE chave='2026:BR:pablo-henrique-costa-marcal'"
if q -q < "$M" >/dev/null 2>&1; then
  echo "FAIL: migration aplicou com preimagem divergente" >&2; exit 1
fi
parcial="$(q -Atq -c "SELECT count(*) FROM public.coleta_log")"
[[ "$parcial" == "0" ]] || { echo "FAIL: escrita parcial sobrou apos abort de preimagem" >&2; exit 1; }
q -q -c "UPDATE public.chapas_2026 SET fonte_sha256='6350130e0a337d698eb30c86d053bb15317cfa7f7c31a496c5c89f4d0eb82dad' WHERE chave='2026:BR:pablo-henrique-costa-marcal'"

# 3) Forward limpo.
q -q < "$M"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('$VERSION')"
q -q < "$READBACK"

titular_ok="$(q -Atq -c "SELECT fonte_detalhe->'titular'->>'descricao_situacao' FROM public.chapas_2026 WHERE chave='2026:BR:pablo-henrique-costa-marcal'")"
[[ "$titular_ok" == "Pendente de julgamento" ]] || { echo "FAIL: titular nao refrescado ($titular_ok)" >&2; exit 1; }
vice_ok="$(q -Atq -c "SELECT fonte_detalhe->'vice'->>'descricao_situacao' FROM public.chapas_2026 WHERE chave='2026:BR:pablo-henrique-costa-marcal'")"
[[ "$vice_ok" == "Pendente de julgamento" ]] || { echo "FAIL: vice nao refrescado ($vice_ok)" >&2; exit 1; }
controle_intacto="$(q -Atq -c "SELECT count(*) FROM public.chapas_2026 WHERE chave='controle' AND fonte_sha256='zzz'")"
[[ "$controle_intacto" == "1" ]] || { echo "FAIL: linha de controle foi tocada" >&2; exit 1; }

# 4) Segunda execucao: preimagem ja mudou, recusa.
if q -q < "$M" >/dev/null 2>&1; then
  echo "FAIL: migration aplicou de novo sobre estado ja migrado" >&2; exit 1
fi

# 5) Rollback restaura.
q -q < "$ROLLBACK"
q -q < "$ROLLBACK_READBACK"
apos_rollback="$(q -Atq -c "SELECT fonte_detalhe->'titular'->>'descricao_situacao' FROM public.chapas_2026 WHERE chave='2026:BR:pablo-henrique-costa-marcal'")"
[[ "$apos_rollback" == "Aguardando julgamento" ]] || { echo "FAIL: rollback nao restaurou o texto antigo ($apos_rollback)" >&2; exit 1; }
ledger_apos_rollback="$(q -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations")"
[[ "$ledger_apos_rollback" == "0" ]] || { echo "FAIL: ledger apos rollback = $ledger_apos_rollback" >&2; exit 1; }

# 6) Rollback duplicado: recusa.
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: segundo rollback nao foi recusado" >&2; exit 1
fi

echo "PASS: refresco de fonte_detalhe da chapa PRTB tem no-op de coorte vazia, abort sem escrita parcial em preimagem divergente, forward com pos-condicao completa, segunda execucao recusada, rollback restaurando o blob antigo e rollback duplicado recusado, provados em PostgreSQL 17"
