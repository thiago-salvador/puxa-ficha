#!/usr/bin/env bash
# Prova local das migrations da Frente 3 em PostgreSQL 17 descartavel.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
IMAGE='postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317'

case "${1:-}" in
  roster)
    version=20260923120000
    name=candidatos_roster_2026
    ;;
  colinha)
    version=20260923130000
    name=analytics_colinha_share
    ;;
  *) echo "Uso: $0 roster|colinha" >&2; exit 2 ;;
esac

migration="supabase/migrations/${version}_${name}.sql"
readback="supabase/readback/${version}_${name}.readback.sql"
rollback="supabase/rollback/${version}_${name}.rollback.sql"
for file in "$migration" "$readback" "$rollback"; do
  [[ -f "$file" ]] || { echo "FAIL: artefato ausente: $file" >&2; exit 2; }
done

container_id="$(docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE")"
cleanup() { docker stop "$container_id" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
for _ in $(seq 1 60); do
  if docker exec "$container_id" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; then break; fi
  sleep 1
done
q() { docker exec -i "$container_id" psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

if [[ "${1}" == roster ]]; then
  q <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
SQL
  if q < "$readback" >/dev/null 2>&1; then
    echo 'FAIL: readback do roster aceitou estado anterior' >&2; exit 1
  fi
  q < "$migration"
  q < "$readback"
  q -Atqc "SELECT CASE WHEN has_table_privilege('anon', 'public.candidatos_roster_2026', 'INSERT') THEN 1 ELSE 0 END" | grep -qx 0
  q -c 'GRANT INSERT ON public.candidatos_roster_2026 TO anon'
  if q < "$readback" >/dev/null 2>&1; then
    echo 'FAIL: readback do roster aceitou INSERT publico' >&2; exit 1
  fi
  q -c 'REVOKE INSERT ON public.candidatos_roster_2026 FROM anon'
  q < "$readback"
  q -c "INSERT INTO public.candidatos_roster_2026(ano,sq_candidato,uf,cargo,nome_urna,nome_completo,numero_urna,partido_sigla,situacao_registro,fonte_url,sha256_pacote,coletado_em) VALUES (2026,'123','SP','senador','Teste','Teste','123','ABC','deferido','https://tse.jus.br/',repeat('a',64),now())"
  if q < "$rollback" >/dev/null 2>&1; then
    echo 'FAIL: rollback do roster aceitou tabela com dados' >&2; exit 1
  fi
  q -c 'DELETE FROM public.candidatos_roster_2026'
  q < "$rollback"
  if q < "$readback" >/dev/null 2>&1; then
    echo 'FAIL: readback do roster aceitou rollback' >&2; exit 1
  fi
else
  q <<'SQL'
CREATE TABLE public.analytics_launch_events (
  event_name text NOT NULL,
  CONSTRAINT analytics_launch_events_event_name_check CHECK (event_name IN (
    'Candidate Click', 'Comparison Start', 'Quiz Complete',
    'External Source Click', 'Search Zero Results'
  ))
);
SQL
  if q < "$readback" >/dev/null 2>&1; then
    echo 'FAIL: readback da colinha aceitou CHECK anterior' >&2; exit 1
  fi
  q < "$migration"
  q < "$readback"
  q -c "INSERT INTO public.analytics_launch_events(event_name) VALUES ('Colinha Share')"
  if q < "$rollback" >/dev/null 2>&1; then
    echo 'FAIL: rollback da colinha aceitou evento gravado' >&2; exit 1
  fi
  q -c "DELETE FROM public.analytics_launch_events WHERE event_name = 'Colinha Share'"
  q < "$rollback"
  if q < "$readback" >/dev/null 2>&1; then
    echo 'FAIL: readback da colinha aceitou CHECK apos rollback' >&2; exit 1
  fi
  if q -c "INSERT INTO public.analytics_launch_events(event_name) VALUES ('Colinha Share')" >/dev/null 2>&1; then
    echo 'FAIL: CHECK apos rollback aceitou Colinha Share' >&2; exit 1
  fi
fi

echo "PASS: ${name} tem forward, readback, adulteracao ou dado impeditivo e rollback seguro em PostgreSQL 17"
