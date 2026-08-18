#!/usr/bin/env bash
set -euo pipefail

IMAGE="${PF_REPLAY_POSTGRES_IMAGE:-postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317}"
CONTAINER="pf-patrimonio-ac-pos-registro-$$"
MIGRATION="supabase/migrations/20260816010000_backfill_patrimonio_onda_g_ac_2026.sql"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

q() {
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq "$@"
}

apply_migration() {
  { echo "BEGIN;"; cat "$MIGRATION"; echo "COMMIT;"; } | q -f -
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
CREATE TABLE public.patrimonio_ausencia_oficial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id),
  ano_eleicao integer NOT NULL,
  sq_candidato text NOT NULL,
  fonte_url text,
  verificado_em timestamptz,
  detalhe text,
  UNIQUE (candidato_id, ano_eleicao)
);
INSERT INTO public.candidatos(slug) VALUES
  ('alan-rick'),
  ('dr-luisinho'),
  ('thor-dantas'),
  ('eudo-raffael'),
  ('mailza-assis'),
  ('tiao-bocalom');
SQL

# F1: coorte completa aplica cinco patrimônios e duas ausências oficiais.
apply_migration
igual "F1 cinco patrimônios" "$(q -c "SELECT COUNT(*) FROM public.patrimonio WHERE ano_eleicao=2026")" "5"
igual "F1 total agregado" "$(q -c "SELECT SUM(valor_total) FROM public.patrimonio WHERE ano_eleicao=2026")" "7555013.42"
igual "F1 duas ausências" "$(q -c "SELECT COUNT(*) FROM public.patrimonio_ausencia_oficial")" "2"

# F2: replay real preserva o payload byte a byte.
hash_antes="$(q -c "SELECT md5(string_agg(x, ';' ORDER BY x)) FROM (SELECT c.slug || '|p|' || p.ano_eleicao || '|' || p.valor_total || '|' || p.bens::text || '|' || p.fonte AS x FROM public.patrimonio p JOIN public.candidatos c ON c.id=p.candidato_id UNION ALL SELECT c.slug || '|a|' || a.ano_eleicao || '|' || a.sq_candidato || '|' || a.fonte_url || '|' || a.detalhe FROM public.patrimonio_ausencia_oficial a JOIN public.candidatos c ON c.id=a.candidato_id) s")"
apply_migration
hash_depois="$(q -c "SELECT md5(string_agg(x, ';' ORDER BY x)) FROM (SELECT c.slug || '|p|' || p.ano_eleicao || '|' || p.valor_total || '|' || p.bens::text || '|' || p.fonte AS x FROM public.patrimonio p JOIN public.candidatos c ON c.id=p.candidato_id UNION ALL SELECT c.slug || '|a|' || a.ano_eleicao || '|' || a.sq_candidato || '|' || a.fonte_url || '|' || a.detalhe FROM public.patrimonio_ausencia_oficial a JOIN public.candidatos c ON c.id=a.candidato_id) s")"
igual "F2 replay byte-estavel" "$hash_depois" "$hash_antes"

# F3: banco integrado com ledger e coorte parcial aborta sem escrita.
q -c "TRUNCATE public.patrimonio_ausencia_oficial, public.patrimonio, public.candidatos CASCADE"
q -c "INSERT INTO public.candidatos(slug) VALUES ('alan-rick'),('dr-luisinho'),('thor-dantas')"
if apply_migration >/dev/null 2>&1; then
  echo "FAIL F3 coorte parcial com ledger deveria abortar" >&2
  exit 1
fi
igual "F3 aborto sem escrita" "$(q -c "SELECT COUNT(*) FROM public.patrimonio")" "0"

# F4: replay parcial sem ledger é no-op.
q -c "DROP TABLE supabase_migrations.schema_migrations"
apply_migration
igual "F4 replay parcial sem patrimônio" "$(q -c "SELECT COUNT(*) FROM public.patrimonio")" "0"
igual "F4 replay parcial sem ausência" "$(q -c "SELECT COUNT(*) FROM public.patrimonio_ausencia_oficial")" "0"

# F5: uma célula contraditória preexistente aborta antes de materializar.
q -c "TRUNCATE public.patrimonio_ausencia_oficial, public.patrimonio, public.candidatos CASCADE"
q -c "CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY)"
q -c "INSERT INTO public.candidatos(slug) VALUES ('alan-rick'),('dr-luisinho'),('thor-dantas'),('eudo-raffael'),('mailza-assis'),('tiao-bocalom')"
q -c "INSERT INTO public.patrimonio(candidato_id,ano_eleicao,valor_total,bens,fonte) SELECT id,2026,1,'[]','fixture' FROM public.candidatos WHERE slug='dr-luisinho'"
q -c "INSERT INTO public.patrimonio_ausencia_oficial(candidato_id,ano_eleicao,sq_candidato,fonte_url,detalhe) SELECT id,2026,'10002533539','fixture','fixture' FROM public.candidatos WHERE slug='dr-luisinho'"
if apply_migration >/dev/null 2>&1; then
  echo "FAIL F5 contradição patrimônio/ausência deveria abortar" >&2
  exit 1
fi
igual "F5 sem writes parciais" "$(q -c "SELECT COUNT(*) FROM public.patrimonio WHERE fonte <> 'fixture'")" "0"

# F6: ausência preexistente com evidência divergente aborta e faz rollback.
q -c "TRUNCATE public.patrimonio_ausencia_oficial, public.patrimonio"
q -c "INSERT INTO public.patrimonio_ausencia_oficial(candidato_id,ano_eleicao,sq_candidato,fonte_url,detalhe) SELECT id,2020,'40000972144','fixture','evidência divergente' FROM public.candidatos WHERE slug='dr-luisinho'"
if apply_migration >/dev/null 2>&1; then
  echo "FAIL F6 ausência divergente deveria abortar" >&2
  exit 1
fi
igual "F6 rollback de patrimônios" "$(q -c "SELECT COUNT(*) FROM public.patrimonio")" "0"

echo "PASS P-AC-POS-REGISTRO patrimônio replay local"
