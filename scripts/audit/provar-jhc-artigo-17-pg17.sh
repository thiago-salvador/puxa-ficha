#!/usr/bin/env bash
# Prova forward e rollback da migration de JHC em PostgreSQL 17 descartavel.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
MIGRATION="supabase/migrations/20260830143500_jhc_voto_artigo_17.sql"
ROLLBACK="supabase/rollback/20260830143500_jhc_voto_artigo_17.rollback.sql"
FORWARD_READBACK="supabase/readback/20260830143500_jhc_voto_artigo_17.readback.sql"
ROLLBACK_READBACK="supabase/readback/20260830143500_jhc_voto_artigo_17.rollback.readback.sql"

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
  docker exec -i "$CONTAINER_ID" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

q -q <<'SQL'
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
CREATE TABLE public.candidatos (id uuid PRIMARY KEY, slug text NOT NULL UNIQUE);
CREATE TABLE public.votacoes_chave (
  id uuid PRIMARY KEY,
  fonte text,
  votacao_id_api text
);
CREATE TABLE public.votos_candidato (
  id uuid PRIMARY KEY,
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id),
  votacao_id uuid NOT NULL REFERENCES public.votacoes_chave(id),
  voto text NOT NULL,
  contradicao boolean DEFAULT false,
  contradicao_descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidato_id, votacao_id)
);
CREATE TABLE public.coleta_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fonte text NOT NULL,
  escopo text NOT NULL,
  alvo text NOT NULL,
  candidato_id uuid,
  executado_em timestamptz NOT NULL DEFAULT now(),
  resultado text NOT NULL,
  volume integer NOT NULL,
  detalhe text,
  url text,
  execucao text
);

INSERT INTO public.candidatos (id, slug) VALUES
  ('ba62f5d0-3e39-40a7-a0af-ee1d86e97e75', 'jhc'),
  ('11111111-1111-4111-8111-111111111111', 'controle');
INSERT INTO public.votacoes_chave (id, fonte, votacao_id_api) VALUES
  ('274f2ae4-58dc-43bb-b98c-c170b0fb132c', 'camara', '2123843-93'),
  ('22222222-2222-4222-8222-222222222222', 'camara', 'controle-1');
INSERT INTO public.votos_candidato
  (id, candidato_id, votacao_id, voto, contradicao, contradicao_descricao, created_at)
VALUES
  ('be44d3a0-492b-4e68-9ed7-d812d7ce0e48',
   'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75',
   '274f2ae4-58dc-43bb-b98c-c170b0fb132c',
   'ausente', false, NULL, '2026-08-15T14:10:32.481313Z'),
  ('44444444-4444-4444-8444-444444444444',
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   'sim', true, 'linha-controle', '2026-08-01T10:00:00Z');
SQL

before_control="$(q -Atq -c "select row_to_json(v)::text from public.votos_candidato v where id='44444444-4444-4444-8444-444444444444'")"

if q -q < "$FORWARD_READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback forward aceitou estado anterior" >&2
  exit 1
fi

q -q -c "update public.votos_candidato set created_at='2026-08-15T14:10:33Z' where id='be44d3a0-492b-4e68-9ed7-d812d7ce0e48'"
if q -q < "$MIGRATION" >/dev/null 2>&1; then
  echo "FAIL: migration aceitou linha alvo diferente do snapshot de produção" >&2
  exit 1
fi
[[ "$(q -Atq -c "select voto from public.votos_candidato where id='be44d3a0-492b-4e68-9ed7-d812d7ce0e48'")" == "ausente" ]]
[[ "$(q -Atq -c "select count(*) from public.coleta_log")" == "0" ]]
q -q -c "update public.votos_candidato set created_at='2026-08-15T14:10:32.481313Z' where id='be44d3a0-492b-4e68-9ed7-d812d7ce0e48'"

q -q < "$MIGRATION"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260830143500')"
q -q < "$FORWARD_READBACK"

after_control="$(q -Atq -c "select row_to_json(v)::text from public.votos_candidato v where id='44444444-4444-4444-8444-444444444444'")"
[[ "$before_control" == "$after_control" ]] || {
  echo "FAIL: linha-controle mudou no forward" >&2
  exit 1
}
[[ "$(q -Atq -c "select count(*) from public.votos_candidato where voto='artigo_17'")" == "1" ]]
[[ "$(q -Atq -c "select count(*) from public.votos_candidato")" == "2" ]]

q -q < "$ROLLBACK"
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260830143500'"
q -q < "$ROLLBACK_READBACK"

rollback_control="$(q -Atq -c "select row_to_json(v)::text from public.votos_candidato v where id='44444444-4444-4444-8444-444444444444'")"
[[ "$before_control" == "$rollback_control" ]] || {
  echo "FAIL: linha-controle mudou no rollback" >&2
  exit 1
}
[[ "$(q -Atq -c "select count(*) from public.votos_candidato where voto='ausente'")" == "1" ]]
[[ "$(q -Atq -c "select count(*) from public.coleta_log where execucao in ('migration:20260830143500','rollback:20260830143500')")" == "2" ]]

echo "PASS: JHC artigo_17 forward, ledger, receipt, rollback e linha-controle provados em PostgreSQL 17"
