#!/usr/bin/env bash
set -euo pipefail

IMAGE="${PF_REPLAY_POSTGRES_IMAGE:-postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317}"
CONTAINER="pf-patrimonio-presidenciaveis-$$"
MIGRATION="supabase/migrations/20260815223000_backfill_patrimonio_presidenciaveis_2026.sql"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

q() {
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq "$@"
}

apply_migration() {
  q -f - <"$MIGRATION"
}

igual() {
  local nome="$1" atual="$2" esperado="$3"
  if [[ "$atual" != "$esperado" ]]; then
    echo "FAIL $nome: atual=$atual esperado=$esperado" >&2
    exit 1
  fi
  echo "PASS $nome"
}

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

q <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE
);
CREATE TABLE public.patrimonio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id),
  ano_eleicao integer NOT NULL,
  valor_total numeric NOT NULL,
  bens jsonb NOT NULL,
  fonte text NOT NULL,
  UNIQUE (candidato_id, ano_eleicao)
);
INSERT INTO public.candidatos(slug) VALUES
  ('samara-martins'),
  ('renan-filho'),
  ('wilson-grassi-junior'),
  ('clariana-barao'),
  ('romeu-zema'),
  ('ronaldo-caiado'),
  ('edmilson-costa'),
  ('flavio-bolsonaro'),
  ('lula'),
  ('augusto-cury');
SQL

# F1: coorte completa aplica as dez linhas e as pos-condicoes da migration.
apply_migration
igual "F1 dez linhas" "$(q -c "SELECT COUNT(*) FROM public.patrimonio WHERE ano_eleicao=2026")" "10"
igual "F1 total agregado" "$(q -c "SELECT SUM(valor_total) FROM public.patrimonio WHERE ano_eleicao=2026")" "539612244.91"

# F2: replay real nao duplica nem altera o payload materializado.
hash_antes="$(q -c "SELECT md5(string_agg(c.slug || '|' || p.valor_total || '|' || p.bens::text || '|' || p.fonte, ';' ORDER BY c.slug)) FROM public.patrimonio p JOIN public.candidatos c ON c.id=p.candidato_id WHERE p.ano_eleicao=2026")"
apply_migration
hash_depois="$(q -c "SELECT md5(string_agg(c.slug || '|' || p.valor_total || '|' || p.bens::text || '|' || p.fonte, ';' ORDER BY c.slug)) FROM public.patrimonio p JOIN public.candidatos c ON c.id=p.candidato_id WHERE p.ano_eleicao=2026")"
igual "F2 replay byte-estavel" "$hash_depois" "$hash_antes"
igual "F2 sem duplicacao" "$(q -c "SELECT COUNT(*) FROM public.patrimonio WHERE ano_eleicao=2026")" "10"

# F3: banco integrado com ledger e coorte parcial aborta antes de escrever.
q -c "TRUNCATE public.patrimonio, public.candidatos CASCADE"
q -c "INSERT INTO public.candidatos(slug) VALUES ('samara-martins'),('renan-filho'),('romeu-zema'),('lula')"
if apply_migration >/tmp/p-patrimonio-2026-partial-ledger.log 2>&1; then
  echo "FAIL F3 coorte parcial com ledger deveria abortar" >&2
  exit 1
fi
igual "F3 aborto sem escrita" "$(q -c "SELECT COUNT(*) FROM public.patrimonio")" "0"

# F4: replay vazio sem ledger aceita a coorte parcial como no-op e nao grava.
q -c "DROP TABLE supabase_migrations.schema_migrations"
apply_migration
igual "F4 replay parcial sem escrita" "$(q -c "SELECT COUNT(*) FROM public.patrimonio")" "0"

echo "PASS P-PATRIMONIO-2026 replay local"
