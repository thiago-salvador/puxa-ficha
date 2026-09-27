#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartável do schema vazio de fase eleitoral 2026,
# seus readbacks de ida/volta e rollback estrutural. Nenhum acesso externo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
V="20260927030000_candidaturas_fase_2026_schema"
VERSION="${V%%_*}"
for f in \
  "supabase/migrations/$V.sql" \
  "supabase/readback/$V.readback.sql" \
  "supabase/rollback/$V.rollback.sql" \
  "supabase/readback/$V.rollback.readback.sql"; do
  [[ -f "$f" ]] || { echo "FAIL: artefato ausente: $f" >&2; exit 2; }
done

CONTAINER_ID="$(docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE")"
cleanup() { docker stop "$CONTAINER_ID" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_ID" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; then break; fi
  sleep 1
done

q() { docker exec -i "$CONTAINER_ID" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
falha_esperada() {
  local rotulo="$1" arquivo="$2"
  if q -q < "$arquivo" >/dev/null 2>&1; then
    echo "FAIL: $rotulo" >&2
    exit 1
  fi
}

q -q <<'SQL'
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, idempotency_key text);
CREATE TABLE public.candidatos(id uuid PRIMARY KEY, slug text NOT NULL UNIQUE, publicavel boolean NOT NULL DEFAULT false);
CREATE VIEW public.candidatos_publico AS
  SELECT id, slug FROM public.candidatos WHERE publicavel;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
SQL

q -q < "supabase/migrations/$V.sql"
q -q <<SQL
INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key)
VALUES ('$VERSION'::text, 'sha256:pg17-fixture');
SQL
q -q < "supabase/readback/$V.readback.sql"

# A table with a recorded result cannot be structurally dropped by this rollback.
q -q <<'SQL'
INSERT INTO public.candidatos(id, slug, publicavel) VALUES ('00000000-0000-4000-8000-000000000001', 'fase-pg17-fixture', true);
INSERT INTO public.candidaturas_fase_2026(candidato_id, sq_candidato_2026, cargo_disputado,
  fase_eleitoral, fase_turno, situacao_tse, fonte_url, fonte_sha256, migration_version)
VALUES ('00000000-0000-4000-8000-000000000001', '123456789012', 'Governador', 'segundo_turno', 1,
  'Fixture PG17', 'https://resultados.tse.jus.br/oficial/fixture.json', repeat('a', 64), '20260927010001');
SQL
falha_esperada "rollback permitiu apagar fase eleitoral com dado" "supabase/rollback/$V.rollback.sql"
q -q -c 'DELETE FROM public.candidaturas_fase_2026; DELETE FROM public.candidatos;'

q -q < "supabase/rollback/$V.rollback.sql"
q -q < "supabase/readback/$V.rollback.readback.sql"

echo 'PASS PG17: schema, privilégios, readback, guarda contra rollback com dados e rollback estrutural.'
