#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartavel de 20260903200000 (backfill de
# sq_candidato_2026 em well-macedo e rico-pinheiro).
#
# Prova, nesta ordem: readback recusando o pre-estado, forward, readback
# passando, recibo de pre-imagem gravado, colisao de SQ derrubando o readback,
# migration posterior bloqueando o rollback, rollback pela pre-imagem, e estado
# final igual byte a byte ao inicial.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260903200000"
PREVIOUS="20260903140000"
MIGRATION="supabase/migrations/${VERSION}_backfill_sq_candidato_ondas_agosto.sql"
READBACK="supabase/readback/${VERSION}_backfill_sq_candidato_ondas_agosto.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_backfill_sq_candidato_ondas_agosto.rollback.sql"
ROLLBACK_READBACK="supabase/readback/${VERSION}_backfill_sq_candidato_ondas_agosto.rollback.readback.sql"
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

# Fixture com a forma de producao: os dois alvos pelos UUID reais, uma terceira
# ficha para provar que nada fora do escopo se mexe, e os CHECKs de coleta_log
# copiados de producao (pg_get_constraintdef, 02/09/2026).
q -q <<SQL
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY, statements text[], name text,
  created_by text, idempotency_key text, rollback text[]
);
INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key)
VALUES ('${PREVIOUS}', 'sha256:fixture-previous');

CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  sq_candidato_2026 text,
  situacao_candidatura text
);
CREATE TABLE public.chapas_2026 (
  id bigserial PRIMARY KEY,
  titular_candidato_id uuid NOT NULL,
  titular_sq_candidato text NOT NULL
);
CREATE TABLE public.coleta_log (
  id bigserial PRIMARY KEY, fonte text NOT NULL, escopo text NOT NULL, alvo text NOT NULL,
  candidato_id uuid, executado_em timestamptz NOT NULL DEFAULT now(),
  resultado text NOT NULL, volume integer NOT NULL, detalhe text, url text,
  execucao text, natureza text NOT NULL DEFAULT 'coleta',
  CONSTRAINT coleta_log_escopo_check CHECK (escopo = ANY (ARRAY['candidato'::text, 'territorio'::text, 'global'::text])),
  CONSTRAINT coleta_log_resultado_check CHECK (resultado = ANY (ARRAY['encontrado'::text, 'vazio_confirmado'::text, 'sem_achado_no_escopo'::text, 'nao_aplicavel'::text, 'erro'::text, 'indeterminado'::text])),
  CONSTRAINT coleta_log_natureza_check CHECK (natureza = ANY (ARRAY['coleta'::text, 'escrita'::text])),
  CONSTRAINT coleta_log_volume_check CHECK (volume >= 0),
  CONSTRAINT coleta_log_candidato_id_so_em_escopo_candidato CHECK ((escopo = 'candidato'::text) OR (candidato_id IS NULL)),
  CONSTRAINT coleta_log_volume_coerente CHECK (
    CASE resultado
      WHEN 'encontrado'::text THEN (volume > 0)
      WHEN 'vazio_confirmado'::text THEN (volume = 0)
      WHEN 'sem_achado_no_escopo'::text THEN (volume = 0)
      WHEN 'nao_aplicavel'::text THEN (volume = 0)
      WHEN 'indeterminado'::text THEN (volume = 0)
      ELSE true
    END)
);

INSERT INTO public.candidatos(id, slug, sq_candidato_2026) VALUES
  ('fc3bec40-5a82-4794-aacf-86fc618751b4', 'well-macedo', NULL),
  ('4b8485ab-cbe3-4c58-99be-3dfc05d39c5d', 'rico-pinheiro', NULL),
  ('00000000-0000-4000-8000-000000000001', 'ficha-vizinha', '999999999999');
INSERT INTO public.chapas_2026(titular_candidato_id, titular_sq_candidato) VALUES
  ('fc3bec40-5a82-4794-aacf-86fc618751b4', '140002554108'),
  ('4b8485ab-cbe3-4c58-99be-3dfc05d39c5d', '70002553982');
SQL

before="$(q -Atq -c "SELECT md5(string_agg(id::text || '=' || coalesce(sq_candidato_2026, '<NULL>'), ',' ORDER BY id)) FROM public.candidatos")"

if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou o pre-estado" >&2; exit 1
fi

q -q < "$MIGRATION"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('$VERSION', 'sha256:fixture')"
q -q < "$READBACK"

gravados="$(q -Atq -F '/' -c "SELECT count(*) FILTER (WHERE sq_candidato_2026='140002554108'), count(*) FILTER (WHERE sq_candidato_2026='70002553982'), count(*) FILTER (WHERE sq_candidato_2026='999999999999') FROM public.candidatos")"
[[ "$gravados" == "1/1/1" ]] || { echo "FAIL: censo pos-migration $gravados, esperado 1/1/1" >&2; exit 1; }
volume="$(q -Atq -c "SELECT volume FROM public.coleta_log WHERE execucao='migration:$VERSION'")"
[[ "$volume" == "2" ]] || { echo "FAIL: recibo com volume $volume, esperado 2" >&2; exit 1; }
pre_nulo="$(q -Atq -c "SELECT count(*) FROM public.coleta_log r, jsonb_each(r.detalhe::jsonb) kv WHERE r.execucao='migration:$VERSION' AND kv.value = 'null'::jsonb")"
[[ "$pre_nulo" == "2" ]] || { echo "FAIL: recibo com $pre_nulo pre-imagens NULL, esperado 2" >&2; exit 1; }

# Adulteracao 1: uma ficha alheia passa a carregar o mesmo SQ. O readback tem de
# derrubar, porque SQ duplicado sequestra a ficha errada no resolver.
q -q -c "UPDATE public.candidatos SET sq_candidato_2026='140002554108' WHERE slug='ficha-vizinha'"
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou SQ duplicado em ficha alheia" >&2; exit 1
fi
q -q -c "UPDATE public.candidatos SET sq_candidato_2026='999999999999' WHERE slug='ficha-vizinha'"

# Adulteracao 2: chapas_2026 passa a discordar do numero gravado.
q -q -c "UPDATE public.chapas_2026 SET titular_sq_candidato='111111111111' WHERE titular_candidato_id='fc3bec40-5a82-4794-aacf-86fc618751b4'"
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou divergencia com chapas_2026" >&2; exit 1
fi
q -q -c "UPDATE public.chapas_2026 SET titular_sq_candidato='140002554108' WHERE titular_candidato_id='fc3bec40-5a82-4794-aacf-86fc618751b4'"
q -q < "$READBACK"

# Migration posterior bloqueia o rollback: reverter por baixo de trabalho mais
# novo e como o rollback corrompe o ledger.
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260904000000', 'sha256:future')"
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback aceitou migration posterior" >&2; exit 1
fi
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260904000000'"

q -q < "$ROLLBACK"
q -q < "$ROLLBACK_READBACK"

after="$(q -Atq -c "SELECT md5(string_agg(id::text || '=' || coalesce(sq_candidato_2026, '<NULL>'), ',' ORDER BY id)) FROM public.candidatos")"
[[ "$after" == "$before" ]] || { echo "FAIL: rollback nao devolveu a pre-imagem byte a byte" >&2; exit 1; }
ledger="$(q -Atq -c "SELECT coalesce(max(version),'') FROM supabase_migrations.schema_migrations")"
[[ "$ledger" == "$PREVIOUS" ]] || { echo "FAIL: ledger apos rollback = $ledger" >&2; exit 1; }

# Replay a partir de banco sem as fichas: a migration tem de virar no-op, nao
# reprovar. E o caminho que o gate linear exercita.
# O coleta_log e zerado ANTES: o recibo do primeiro forward sobrevive ao rollback
# de proposito (e a prova de que a pre-imagem existiu), entao conta-lo aqui
# mediria o ciclo anterior, nao este replay. Este bug apareceu na primeira
# execucao deste proprio arquivo.
q -q -c "DELETE FROM public.candidatos"
q -q -c "DELETE FROM public.coleta_log"
q -q < "$MIGRATION"
sobrou="$(q -Atq -c "SELECT count(*) FROM public.coleta_log WHERE execucao='migration:$VERSION'")"
[[ "$sobrou" == "0" ]] || { echo "FAIL: replay em banco sem fichas gravou recibo ($sobrou)" >&2; exit 1; }

echo "PASS: backfill de sq_candidato_2026 tem forward, recibo de pre-imagem, SQ duplicado, divergencia de chapa, migration posterior, rollback byte a byte e no-op de replay provados em PostgreSQL 17"
