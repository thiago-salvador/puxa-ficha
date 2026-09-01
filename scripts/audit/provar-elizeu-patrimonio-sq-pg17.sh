#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260831215407"
MIGRATION="supabase/migrations/${VERSION}_corrigir_elizeu_patrimonio_sq.sql"
READBACK="supabase/readback/${VERSION}_corrigir_elizeu_patrimonio_sq.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_corrigir_elizeu_patrimonio_sq.rollback.sql"
ROLLBACK_READBACK="supabase/readback/${VERSION}_corrigir_elizeu_patrimonio_sq.rollback.readback.sql"
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

q -q <<'SQL'
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
VALUES ('20260830151500', 'sha256:59c212dd68c913a2e98836cf109ad32fa9bc21b40826bb67035a277589ab095a');

CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  sq_candidato_2026 text,
  nome text NOT NULL
);
CREATE TABLE public.patrimonio (
  candidato_id uuid NOT NULL,
  ano_eleicao integer NOT NULL,
  valor_total numeric NOT NULL,
  bens jsonb NOT NULL,
  fonte text NOT NULL,
  PRIMARY KEY (candidato_id, ano_eleicao)
);
CREATE TABLE public.patrimonio_ausencia_oficial (
  id uuid PRIMARY KEY,
  candidato_id uuid NOT NULL,
  ano_eleicao integer NOT NULL,
  sq_candidato text NOT NULL,
  fonte_url text NOT NULL,
  verificado_em timestamptz NOT NULL,
  detalhe text NOT NULL,
  execucao text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE public.chapas_2026 (
  chave text PRIMARY KEY,
  titular_candidato_id uuid NOT NULL,
  identidade_status text NOT NULL,
  vinculo_titular_status text NOT NULL,
  titular_sq_candidato text NOT NULL
);
CREATE TABLE public.coleta_log (
  id bigserial PRIMARY KEY,
  fonte text NOT NULL,
  escopo text NOT NULL,
  alvo text NOT NULL,
  candidato_id uuid,
  resultado text NOT NULL,
  volume integer NOT NULL,
  detalhe text NOT NULL,
  url text NOT NULL,
  execucao text NOT NULL,
  executado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.candidatos(id, slug, sq_candidato_2026, nome) VALUES
  ('914d9904-1c6a-47f9-a25f-017138dc1cef', 'elizeu-aguiar', NULL, 'Elizeu Aguiar'),
  ('c9c117e4-ea81-433d-b8c0-a01c8d831bae', 'dr-luisinho', '10002533539', 'Dr. Luisinho'),
  ('11111111-1111-4111-8111-111111111111', 'sentinela', 'sentinela-sq', 'Sentinela');

INSERT INTO public.patrimonio(candidato_id, ano_eleicao, valor_total, bens, fonte) VALUES
  ('914d9904-1c6a-47f9-a25f-017138dc1cef', 2026, 872808.00,
   '[{"tipo":"Casa","descricao":"RUA TORQUATO NETO, 2400 - SÃO CRISTÓVÃO","valor":750000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TOYOTA COROLLA","valor":82808},{"tipo":"Terreno","descricao":"TERRENO RUA ARMANDO CAJUBÁ, BAIRRO SABIAZAL, PARNAÍBA (50 X 80)","valor":40000}]',
   'TSE Dados Abertos bem_candidato_2026 SQ 180002533958 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
  ('11111111-1111-4111-8111-111111111111', 2026, 123.45, '[{"tipo":"sentinela","descricao":"não alterar","valor":123.45}]', 'sentinela');

INSERT INTO public.patrimonio_ausencia_oficial
  (id, candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe, execucao, created_at)
VALUES
  ('07f80302-9048-49f7-9b13-5a992f48e6c0', 'c9c117e4-ea81-433d-b8c0-a01c8d831bae', 2026, '10002533539',
   'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip',
   '2026-08-16T19:05:36.504318+00:00',
   'Pacote oficial bem_candidato_2026 do TSE lido de ponta a ponta sem bens para o SQ 10002533539; snapshot 2026-08-15 16:35 BRT; SHA-256 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1. Reverificado em 16/08/2026 no zip estabilizado (last-modified 16/08/2026 15:36:15 GMT, content-length 3755162, sha256 bda6d7a4ed6842e9...): segue 0 bens e 0 linhas mascaradas para o SQ.',
   'A2B-ausencias-oficiais-20260807', '2026-08-16T06:07:19.982513+00:00'),
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 2026, 'sentinela-sq',
   'https://example.invalid/sentinela', '2026-08-01T00:00:00+00:00', 'sentinela', 'sentinela', '2026-08-01T00:00:00+00:00');

INSERT INTO public.chapas_2026(chave, titular_candidato_id, identidade_status, vinculo_titular_status, titular_sq_candidato)
VALUES ('2026:PI:elizeu-morais-de-aguiar', '914d9904-1c6a-47f9-a25f-017138dc1cef', 'confirmada', 'confirmado', '180002549920');
SQL

before_candidates="$(q -Atq -c "SELECT md5(string_agg(row_to_json(c)::text,'' ORDER BY c.id)) FROM public.candidatos c WHERE c.id <> '914d9904-1c6a-47f9-a25f-017138dc1cef'")"
before_patrimonio="$(q -Atq -c "SELECT md5(string_agg(row_to_json(p)::text,'' ORDER BY p.candidato_id,p.ano_eleicao)) FROM public.patrimonio p WHERE NOT (p.candidato_id='914d9904-1c6a-47f9-a25f-017138dc1cef' AND p.ano_eleicao=2026)")"
before_absences="$(q -Atq -c "SELECT md5(string_agg(row_to_json(a)::text,'' ORDER BY a.id)) FROM public.patrimonio_ausencia_oficial a WHERE a.id <> '07f80302-9048-49f7-9b13-5a992f48e6c0'")"

if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: forward readback aceitou o pre-estado" >&2
  exit 1
fi

q -q -c "UPDATE public.patrimonio SET valor_total=1 WHERE candidato_id='914d9904-1c6a-47f9-a25f-017138dc1cef' AND ano_eleicao=2026"
if q -q < "$MIGRATION" >/dev/null 2>&1; then
  echo "FAIL: migration aceitou patrimonio anterior adulterado" >&2
  exit 1
fi
q -q -c "UPDATE public.patrimonio SET valor_total=872808.00 WHERE candidato_id='914d9904-1c6a-47f9-a25f-017138dc1cef' AND ano_eleicao=2026"

q -q < "$MIGRATION"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('$VERSION', 'sha256:fixture')"
q -q < "$READBACK"

forward_state="$(q -Atq -F '|' -c "SELECT c.sq_candidato_2026,p.valor_total,jsonb_array_length(p.bens),(SELECT count(*) FROM public.patrimonio_ausencia_oficial WHERE id='07f80302-9048-49f7-9b13-5a992f48e6c0') FROM public.candidatos c JOIN public.patrimonio p ON p.candidato_id=c.id AND p.ano_eleicao=2026 WHERE c.id='914d9904-1c6a-47f9-a25f-017138dc1cef'")"
[[ "$forward_state" == "180002549920|1592808.00|3|0" ]] || {
  echo "FAIL: forward inesperado $forward_state" >&2
  exit 1
}

q -q -c "UPDATE public.patrimonio SET valor_total=1592809 WHERE candidato_id='914d9904-1c6a-47f9-a25f-017138dc1cef' AND ano_eleicao=2026"
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: forward readback aceitou patrimonio adulterado" >&2
  exit 1
fi
q -q -c "UPDATE public.patrimonio SET valor_total=1592808.00 WHERE candidato_id='914d9904-1c6a-47f9-a25f-017138dc1cef' AND ano_eleicao=2026"

q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260901000000', 'sha256:future')"
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback aceitou migration posterior" >&2
  exit 1
fi
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260901000000'"

q -q < "$ROLLBACK"
q -q < "$ROLLBACK_READBACK"

after_candidates="$(q -Atq -c "SELECT md5(string_agg(row_to_json(c)::text,'' ORDER BY c.id)) FROM public.candidatos c WHERE c.id <> '914d9904-1c6a-47f9-a25f-017138dc1cef'")"
after_patrimonio="$(q -Atq -c "SELECT md5(string_agg(row_to_json(p)::text,'' ORDER BY p.candidato_id,p.ano_eleicao)) FROM public.patrimonio p WHERE NOT (p.candidato_id='914d9904-1c6a-47f9-a25f-017138dc1cef' AND p.ano_eleicao=2026)")"
after_absences="$(q -Atq -c "SELECT md5(string_agg(row_to_json(a)::text,'' ORDER BY a.id)) FROM public.patrimonio_ausencia_oficial a WHERE a.id <> '07f80302-9048-49f7-9b13-5a992f48e6c0'")"
[[ "$after_candidates" == "$before_candidates" ]]
[[ "$after_patrimonio" == "$before_patrimonio" ]]
[[ "$after_absences" == "$before_absences" ]]

rollback_state="$(q -Atq -F '|' -c "SELECT coalesce(c.sq_candidato_2026,'NULL'),p.valor_total,jsonb_array_length(p.bens),(SELECT count(*) FROM public.patrimonio_ausencia_oficial WHERE id='07f80302-9048-49f7-9b13-5a992f48e6c0'),(SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='$VERSION') FROM public.candidatos c JOIN public.patrimonio p ON p.candidato_id=c.id AND p.ano_eleicao=2026 WHERE c.id='914d9904-1c6a-47f9-a25f-017138dc1cef'")"
[[ "$rollback_state" == "NULL|872808.00|3|1|0" ]] || {
  echo "FAIL: rollback inesperado $rollback_state" >&2
  exit 1
}

echo "PASS: patrimônio Elizeu e ausência Dr. Luisinho têm forward, adulteração, migration posterior, rollback e sentinelas provados em PostgreSQL 17"
