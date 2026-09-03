#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartavel do PAR de situacao_candidatura:
# 20260903100000 (dado) + 20260903100100 (CHECK). Fixture com o censo exato
# medido em producao em 02/09/2026 (328 linhas, 13 grafias), para exercitar
# tambem o bloco de censo exato da migration. Prova: readback contra
# pre-estado, forward com censo, CHECK mordendo (SQLSTATE 23514), migration
# posterior bloqueando rollback, rollback pela pre-imagem, e pre-imagem igual
# byte a byte ao estado inicial.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION_A="20260903100000"
VERSION_B="20260903100100"
PREVIOUS="20260902200000"
PREVIOUS_DIGEST="sha256:15418497551ce486a7d77c429783e4a647ed8a4dc61f712ec34c0a5f369228c7"
MIGRATION_A="supabase/migrations/${VERSION_A}_vocabulario_situacao_candidatura.sql"
MIGRATION_B="supabase/migrations/${VERSION_B}_vocabulario_situacao_candidatura_check.sql"
READBACK="supabase/readback/${VERSION_B}_vocabulario_situacao_candidatura.readback.sql"
ROLLBACK="supabase/rollback/${VERSION_B}_vocabulario_situacao_candidatura.rollback.sql"
ROLLBACK_READBACK="supabase/readback/${VERSION_B}_vocabulario_situacao_candidatura.rollback.readback.sql"
CONTAINER_ID="$(docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE")"

cleanup() {
  docker stop "$CONTAINER_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_ID" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 \
     && docker exec "$CONTAINER_ID" psql -U postgres -h 127.0.0.1 -d postgres -Atqc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

q() {
  docker exec -i "$CONTAINER_ID" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

# Fixture: censo de producao de 02/09/2026 (total / publicaveis por grafia) e o
# CHECK de publicacao minima reduzido a clausula que interessa aqui.
q -q <<SQL
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text,
  created_by text,
  idempotency_key text,
  rollback text[]
);
INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key)
VALUES ('${PREVIOUS}', '${PREVIOUS_DIGEST}');

CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'candidato',
  publicavel boolean NOT NULL DEFAULT false,
  situacao_candidatura text,
  ultima_atualizacao timestamptz NOT NULL DEFAULT '2026-08-01T00:00:00Z',
  CONSTRAINT candidatos_publicacao_minima_2026_check
    CHECK (publicavel IS DISTINCT FROM true OR coalesce(btrim(situacao_candidatura), '') <> '')
);
CREATE TABLE public.coleta_log (
  id bigserial PRIMARY KEY,
  fonte text NOT NULL,
  escopo text NOT NULL,
  alvo text NOT NULL,
  candidato_id uuid,
  executado_em timestamptz NOT NULL DEFAULT now(),
  resultado text NOT NULL,
  volume integer NOT NULL,
  detalhe text,
  url text,
  execucao text,
  natureza text NOT NULL DEFAULT 'coleta'
);

CREATE OR REPLACE FUNCTION pg_temp.seed(prefixo text, valor text, total integer, publicaveis integer, st text) RETURNS void
LANGUAGE plpgsql AS \$\$
BEGIN
  INSERT INTO public.candidatos(slug, status, publicavel, situacao_candidatura)
  SELECT prefixo || '-' || g, st, g <= publicaveis, valor FROM generate_series(1, total) g;
END \$\$;

SELECT pg_temp.seed('registrada', 'registrada, aguardando julgamento', 163, 163, 'candidato');
SELECT pg_temp.seed('precand', 'pre-candidato', 53, 0, 'pre-candidato');
SELECT pg_temp.seed('nulo', NULL, 31, 0, 'pre-candidato');
SELECT pg_temp.seed('aguardando', 'aguardando julgamento', 28, 28, 'candidato');
SELECT pg_temp.seed('incerto', 'incerto', 18, 3, 'candidato');
SELECT pg_temp.seed('snapshot', 'pedido de registro no TSE; situação não informada no snapshot', 17, 10, 'candidato');
SELECT pg_temp.seed('apto22', 'APTO [2022]', 7, 0, 'pre-candidato');
SELECT pg_temp.seed('apto20', 'APTO [2020]', 3, 0, 'pre-candidato');
SELECT pg_temp.seed('deferido', 'deferido', 3, 3, 'pre-candidato');
SELECT pg_temp.seed('inapto22', 'INAPTO [2022]', 1, 0, 'pre-candidato');
INSERT INTO public.candidatos(slug, status, publicavel, situacao_candidatura) VALUES
  ('rico-pinheiro', 'candidato', true, 'pedido de registro no TSE; código oficial -3 (#NE) no snapshot de 27/08/2026'),
  ('well-macedo', 'candidato', true, 'pedido de registro no TSE; código oficial -3 (#NE) no snapshot de 27/08/2026'),
  ('cleber-rabelo', 'removido', false, 'renúncia'),
  ('wilson-witzel', 'desistente', false, 'desistente');
SQL

total="$(q -Atq -c "SELECT count(*) FROM public.candidatos")"
[[ "$total" == "328" ]] || { echo "FAIL: fixture com $total linhas, esperado 328" >&2; exit 1; }
before="$(q -Atq -c "SELECT md5(string_agg(id::text || '=' || coalesce(situacao_candidatura, '<NULL>'), ',' ORDER BY id)) FROM public.candidatos")"
before_ts="$(q -Atq -c "SELECT md5(string_agg(id::text || '=' || ultima_atualizacao::text, ',' ORDER BY id)) FROM public.candidatos")"

if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: forward readback aceitou o pre-estado" >&2
  exit 1
fi

q -q < "$MIGRATION_A"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('$VERSION_A', 'sha256:fixture-a')"
q -q < "$MIGRATION_B"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('$VERSION_B', 'sha256:fixture-b')"
q -q < "$READBACK"

censo="$(q -Atq -F '/' -c "SELECT count(*) FILTER (WHERE situacao_candidatura='aguardando julgamento'), count(*) FILTER (WHERE situacao_candidatura='candidatura declarada'), count(*) FILTER (WHERE situacao_candidatura='incerto'), count(*) FILTER (WHERE situacao_candidatura IS NULL) FROM public.candidatos")"
[[ "$censo" == "213/53/18/44" ]] || { echo "FAIL: censo pos-migration $censo, esperado 213/53/18/44" >&2; exit 1; }
censo_pub="$(q -Atq -F '/' -c "SELECT count(*) FILTER (WHERE situacao_candidatura='aguardando julgamento'), count(*) FILTER (WHERE situacao_candidatura='candidatura declarada'), count(*) FILTER (WHERE situacao_candidatura='incerto') FROM public.candidatos WHERE publicavel AND status <> 'removido'")"
[[ "$censo_pub" == "206/0/3" ]] || { echo "FAIL: censo publicavel $censo_pub, esperado 206/0/3" >&2; exit 1; }
volume="$(q -Atq -c "SELECT volume FROM public.coleta_log WHERE execucao='migration:$VERSION_A'")"
[[ "$volume" == "251" ]] || { echo "FAIL: pre-imagem com $volume linhas, esperado 251" >&2; exit 1; }
after_ts="$(q -Atq -c "SELECT md5(string_agg(id::text || '=' || ultima_atualizacao::text, ',' ORDER BY id)) FROM public.candidatos")"
[[ "$after_ts" == "$before_ts" ]] || { echo "FAIL: ultima_atualizacao foi carimbada" >&2; exit 1; }

# O CHECK morde: valor aposentado nao entra mais (SQLSTATE 23514).
sqlstate="$(docker exec -i "$CONTAINER_ID" psql -X -U postgres -d postgres -Atq -c "UPDATE public.candidatos SET situacao_candidatura='deferido' WHERE slug='rico-pinheiro'" 2>&1 | grep -oE 'violates check constraint "candidatos_situacao_candidatura_dominio"' || true)"
[[ -n "$sqlstate" ]] || { echo "FAIL: CHECK nao rejeitou 'deferido'" >&2; exit 1; }

# Adulteracao: uma linha fora do dominio sem o CHECK derruba o readback.
q -q -c "ALTER TABLE public.candidatos DROP CONSTRAINT candidatos_situacao_candidatura_dominio"
q -q -c "UPDATE public.candidatos SET situacao_candidatura='deferido' WHERE slug='rico-pinheiro'"
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: forward readback aceitou linha fora do dominio" >&2
  exit 1
fi
q -q -c "UPDATE public.candidatos SET situacao_candidatura='aguardando julgamento' WHERE slug='rico-pinheiro'"
q -q -c "ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_situacao_candidatura_dominio CHECK (situacao_candidatura IN ('aguardando julgamento', 'candidatura declarada', 'incerto'))"
q -q < "$READBACK"

q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260904000000', 'sha256:future')"
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback aceitou migration posterior" >&2
  exit 1
fi
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260904000000'"

q -q < "$ROLLBACK"
q -q < "$ROLLBACK_READBACK"

after="$(q -Atq -c "SELECT md5(string_agg(id::text || '=' || coalesce(situacao_candidatura, '<NULL>'), ',' ORDER BY id)) FROM public.candidatos")"
[[ "$after" == "$before" ]] || { echo "FAIL: rollback nao devolveu a pre-imagem byte a byte" >&2; exit 1; }
ledger="$(q -Atq -c "SELECT coalesce(max(version),'') FROM supabase_migrations.schema_migrations")"
[[ "$ledger" == "$PREVIOUS" ]] || { echo "FAIL: ledger apos rollback = $ledger" >&2; exit 1; }

echo "PASS: par de situacao_candidatura tem forward com censo 213/53/18/44, CHECK mordendo, adulteracao, migration posterior, rollback pela pre-imagem e ledger provados em PostgreSQL 17"
