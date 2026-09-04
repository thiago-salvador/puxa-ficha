#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartavel de 20260903210000 (alargamento do CHECK de
# situacao_candidatura para os quatro estados de julgamento).
#
# Prova, nesta ordem: readback recusando o pre-estado, forward, CHECK aceitando
# os quatro novos valores E recusando um quinto, adulteracao derrubando o
# readback, migration posterior bloqueando o rollback, rollback RECUSANDO
# quando ja existe linha com julgamento gravado (a propriedade de seguranca que
# mais importa aqui), rollback limpo, CHECK estreito voltando a morder, e no-op
# de replay quando o dominio nunca foi instalado.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260903210000"
PREVIOUS="20260903200000"
MIGRATION="supabase/migrations/${VERSION}_vocabulario_situacao_julgamento_publicado.sql"
READBACK="supabase/readback/${VERSION}_vocabulario_situacao_julgamento_publicado.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_vocabulario_situacao_julgamento_publicado.rollback.sql"
ROLLBACK_READBACK="supabase/readback/${VERSION}_vocabulario_situacao_julgamento_publicado.rollback.readback.sql"
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
# Estado pos-20260903100100: dominio de TRES valores instalado.
q -q <<SQL
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY, statements text[], name text,
  created_by text, idempotency_key text, rollback text[]
);
INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key)
VALUES ('${PREVIOUS}', 'sha256:fixture-previous');

CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  situacao_candidatura text,
  CONSTRAINT candidatos_situacao_candidatura_dominio
    CHECK (situacao_candidatura IN ('aguardando julgamento', 'candidatura declarada', 'incerto'))
);
INSERT INTO public.candidatos(slug, situacao_candidatura) VALUES
  ('subtenente-luiz-carlos', 'aguardando julgamento'),
  ('ficha-declarada', 'candidatura declarada'),
  ('ficha-incerta', 'incerto'),
  ('ficha-sem-situacao', NULL);
SQL

before="$(q -Atq -c "SELECT md5(string_agg(slug || '=' || coalesce(situacao_candidatura, '<NULL>'), ',' ORDER BY slug)) FROM public.candidatos")"

if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou o pre-estado (dominio estreito)" >&2; exit 1
fi

q -q < "$MIGRATION"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('$VERSION', 'sha256:fixture')"
q -q < "$READBACK"

# A migration e DDL pura: nao pode ter tocado dado nenhum.
depois_forward="$(q -Atq -c "SELECT md5(string_agg(slug || '=' || coalesce(situacao_candidatura, '<NULL>'), ',' ORDER BY slug)) FROM public.candidatos")"
[[ "$depois_forward" == "$before" ]] || { echo "FAIL: o alargamento mexeu em dado" >&2; exit 1; }

# Os QUATRO novos valores passam a ser aceitos, um a um.
for estado in 'deferido' 'deferido com recurso' 'indeferido' 'indeferido com recurso'; do
  q -q -c "UPDATE public.candidatos SET situacao_candidatura='$estado' WHERE slug='ficha-declarada'" \
    || { echo "FAIL: CHECK alargado recusou '$estado'" >&2; exit 1; }
done
# E um quinto estado, que a fonte nao emite para esta coorte, continua barrado.
barrado="$(docker exec -i "$CONTAINER_ID" psql -X -U postgres -d postgres -Atq -c "UPDATE public.candidatos SET situacao_candidatura='cassado' WHERE slug='ficha-declarada'" 2>&1 | grep -c 'violates check constraint "candidatos_situacao_candidatura_dominio"' || true)"
[[ "$barrado" == "1" ]] || { echo "FAIL: CHECK alargado aceitou 'cassado', que nao esta no dominio" >&2; exit 1; }

# Rollback tem de RECUSAR enquanto existe julgamento gravado: estreitar o
# dominio nesse estado apagaria fato publicado pelo TSE.
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback aceitou estreitar o dominio com linha em 'indeferido com recurso'" >&2; exit 1
fi
q -q -c "UPDATE public.candidatos SET situacao_candidatura='candidatura declarada' WHERE slug='ficha-declarada'"

# Adulteracao: sem a constraint, o readback tem de derrubar.
q -q -c "ALTER TABLE public.candidatos DROP CONSTRAINT candidatos_situacao_candidatura_dominio"
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou tabela sem o CHECK" >&2; exit 1
fi
# Adulteracao 2: CHECK presente, mas incompleto (perdeu 'indeferido').
q -q -c "ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_situacao_candidatura_dominio CHECK (situacao_candidatura IN ('aguardando julgamento', 'candidatura declarada', 'incerto', 'deferido', 'deferido com recurso', 'indeferido com recurso'))"
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou CHECK sem 'indeferido'" >&2; exit 1
fi
q -q -c "ALTER TABLE public.candidatos DROP CONSTRAINT candidatos_situacao_candidatura_dominio"
q -q -c "ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_situacao_candidatura_dominio CHECK (situacao_candidatura IN ('aguardando julgamento', 'candidatura declarada', 'incerto', 'deferido', 'deferido com recurso', 'indeferido', 'indeferido com recurso'))"
q -q < "$READBACK"

q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260904000000', 'sha256:future')"
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback aceitou migration posterior" >&2; exit 1
fi
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260904000000'"

q -q < "$ROLLBACK"
q -q < "$ROLLBACK_READBACK"

# O CHECK estreito volta a morder.
voltou="$(docker exec -i "$CONTAINER_ID" psql -X -U postgres -d postgres -Atq -c "UPDATE public.candidatos SET situacao_candidatura='deferido' WHERE slug='ficha-declarada'" 2>&1 | grep -c 'violates check constraint "candidatos_situacao_candidatura_dominio"' || true)"
[[ "$voltou" == "1" ]] || { echo "FAIL: apos o rollback o CHECK estreito nao rejeitou 'deferido'" >&2; exit 1; }
after="$(q -Atq -c "SELECT md5(string_agg(slug || '=' || coalesce(situacao_candidatura, '<NULL>'), ',' ORDER BY slug)) FROM public.candidatos")"
[[ "$after" == "$before" ]] || { echo "FAIL: o ciclo mexeu em dado" >&2; exit 1; }
ledger="$(q -Atq -c "SELECT coalesce(max(version),'') FROM supabase_migrations.schema_migrations")"
[[ "$ledger" == "$PREVIOUS" ]] || { echo "FAIL: ledger apos rollback = $ledger" >&2; exit 1; }

# Replay a partir de banco onde o dominio nunca foi instalado: no-op, nao falha.
q -q -c "ALTER TABLE public.candidatos DROP CONSTRAINT candidatos_situacao_candidatura_dominio"
q -q < "$MIGRATION"
sem_dominio="$(q -Atq -c "SELECT count(*) FROM pg_constraint WHERE conrelid='public.candidatos'::regclass AND conname='candidatos_situacao_candidatura_dominio'")"
[[ "$sem_dominio" == "0" ]] || { echo "FAIL: replay sem dominio instalado criou a constraint do zero" >&2; exit 1; }

echo "PASS: alargamento do vocabulario tem forward sem tocar dado, os 4 estados aceitos, um quinto barrado, CHECK incompleto reprovado, rollback recusado sobre julgamento gravado, rollback limpo, CHECK estreito remordendo e no-op de replay provados em PostgreSQL 17"
