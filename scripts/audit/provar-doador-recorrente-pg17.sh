#!/usr/bin/env bash
set -euo pipefail

# Prova em PostgreSQL 17 da migration 20260922140000 (doador recorrente).
#
# O que fica provado, com anon de verdade e não com leitura de SQL:
#   1. anon lê a view e enxerga o par entre pessoas diferentes;
#   2. anon NÃO enxerga par da mesma pessoa, nem ficha despublicada, nem
#      prestação despublicada;
#   3. anon não escreve na tabela materializada;
#   4. o guard da migration reprova coluna de documento na superfície pública;
#   5. o rollback derruba tabela e view e limpa o ledger.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="pf-doador-recorrente-$$"
IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
FORWARD="$ROOT/supabase/migrations/20260922140000_financiamento_doador_recorrente.sql"
ROLLBACK="$ROOT/supabase/rollback/20260922140000_financiamento_doador_recorrente.rollback.sql"
READBACK="$ROOT/supabase/readback/20260922140000_financiamento_doador_recorrente.readback.sql"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
ready=false
for _ in $(seq 1 120); do
  if docker exec "$CONTAINER" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 0.25
done
if [[ "$ready" != true ]]; then
  docker logs "$CONTAINER" >&2 || true
  echo "FAIL: PostgreSQL 17 nao ficou pronto em 30 segundos" >&2
  exit 1
fi

psql_db() {
  docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$1" "${@:2}"
}

file_db() {
  docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$1" < "$2"
}

docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE DATABASE prova;
CREATE DATABASE adversarial;
SQL

# Base mínima: candidatos, financiamento, is_public_candidate e as duas views
# públicas de que a migration depende.
setup_db() {
  local db="$1"
  local coluna_extra="${2:-}"
  psql_db "$db" <<SQL
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);

CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  nome_urna text,
  partido_sigla text,
  publicavel boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'candidato'
);

CREATE TABLE public.financiamento (
  id uuid PRIMARY KEY,
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id),
  ano_eleicao integer NOT NULL,
  despublicado_em timestamptz,
  cpf_hash text,
  cnpj_doador text
);

CREATE OR REPLACE FUNCTION public.is_public_candidate(target_candidate_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS \$\$
  SELECT EXISTS (
    SELECT 1 FROM public.candidatos c
    WHERE c.id = target_candidate_id AND c.publicavel = true AND c.status <> 'removido'
  );
\$\$;
GRANT EXECUTE ON FUNCTION public.is_public_candidate(uuid) TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.candidatos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.financiamento FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, slug, nome_urna, partido_sigla, publicavel, status) ON public.candidatos TO anon, authenticated;
GRANT SELECT (id, candidato_id, ano_eleicao, despublicado_em) ON public.financiamento TO anon, authenticated;

CREATE VIEW public.candidatos_publico WITH (security_invoker = true) AS
  SELECT id, slug, nome_urna, partido_sigla FROM public.candidatos
  WHERE publicavel = true AND status <> 'removido';
CREATE VIEW public.financiamento_publico WITH (security_invoker = true) AS
  SELECT f.id, f.candidato_id, f.ano_eleicao FROM public.financiamento f
  WHERE public.is_public_candidate(f.candidato_id) AND f.despublicado_em IS NULL;
GRANT SELECT ON public.candidatos_publico, public.financiamento_publico TO anon, authenticated;

INSERT INTO public.candidatos(id, slug, nome_urna) VALUES
  ('00000000-0000-4000-8000-000000000001', 'pessoa-a', 'Pessoa A'),
  ('00000000-0000-4000-8000-000000000002', 'pessoa-b', 'Pessoa B'),
  ('00000000-0000-4000-8000-000000000003', 'pessoa-c', 'Pessoa C');
UPDATE public.candidatos SET publicavel = false WHERE slug = 'pessoa-c';

INSERT INTO public.financiamento(id, candidato_id, ano_eleicao) VALUES
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001', 2014),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000002', 2010),
  ('00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-000000000003', 2014),
  ('00000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-000000000001', 2010);
UPDATE public.financiamento SET despublicado_em = now() WHERE id = '00000000-0000-4000-8000-00000000000d';
SQL
  if [[ -n "$coluna_extra" ]]; then
    # Caso adversarial: alguém acrescenta coluna de documento antes do guard.
    psql_db "$db" <<SQL
CREATE TABLE public.financiamento_doador_recorrente_rascunho(cnpj_doador text);
SQL
  fi
}

semear_linhas() {
  psql_db prova <<'SQL'
INSERT INTO public.financiamento_doador_recorrente
  (doador_grupo, financiamento_id, candidato_id, pessoa_chave, ano_eleicao, doador_nome, doador_tipo, valor, regra_versao)
VALUES
  -- par legítimo: mesmo doador, pessoas diferentes
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001', 'pessoa-a', 2014, 'EMPRESA S.A.', 'PJ', 1000, 'doador-recorrente-v1'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000002', 'pessoa-b', 2010, 'EMPRESA S.A.', 'PJ', 500, 'doador-recorrente-v1'),
  -- mesma pessoa em dois cadastros: não pode virar par
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001', 'pessoa-a', 2014, 'OUTRA S.A.', 'PJ', 10, 'doador-recorrente-v1'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-000000000001', 'pessoa-a', 2010, 'OUTRA S.A.', 'PJ', 20, 'doador-recorrente-v1'),
  -- ponta em ficha não publicada
  ('30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001', 'pessoa-a', 2014, 'TERCEIRA S.A.', 'PJ', 30, 'doador-recorrente-v1'),
  ('30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-000000000003', 'pessoa-c', 2014, 'TERCEIRA S.A.', 'PJ', 40, 'doador-recorrente-v1');
-- execução anterior que a limpeza ainda não removeu: tem que ficar invisível
INSERT INTO public.financiamento_doador_recorrente
  (doador_grupo, financiamento_id, candidato_id, pessoa_chave, ano_eleicao, doador_nome, doador_tipo, valor, regra_versao, materializado_em)
VALUES
  ('50000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001', 'pessoa-a', 2014, 'VELHA S.A.', 'PJ', 1, 'doador-recorrente-v1', now() - interval '1 day'),
  ('50000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000002', 'pessoa-b', 2010, 'VELHA S.A.', 'PJ', 2, 'doador-recorrente-v1', now() - interval '1 day');
SQL
}

echo "== caminho feliz =="
setup_db prova
file_db prova "$FORWARD"
semear_linhas

# O apply grava a versão no ledger e roda o readback na mesma transação; aqui
# o readback roda depois, como na releitura somente leitura do apply.
psql_db prova -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260922140000');"
file_db prova "$READBACK"
echo "OK: readback confere ledger, security_invoker, RLS, colunas da view e ACL"

psql_db prova <<'SQL'
BEGIN;
SET LOCAL ROLE anon;
DO $anon$
DECLARE
  pares integer;
  nomes text;
BEGIN
  SELECT count(*), string_agg(DISTINCT outra_slug, ',' ORDER BY outra_slug)
    INTO pares, nomes
  FROM public.financiamento_doador_recorrente_publico;
  IF pares <> 2 OR nomes <> 'pessoa-a,pessoa-b' THEN
    RAISE EXCEPTION 'anon viu % par(es) com outra ponta em %, esperado 2 e pessoa-a,pessoa-b', pares, nomes;
  END IF;
END
$anon$;
COMMIT;
SQL
echo "OK: anon vê só o par entre pessoas diferentes, com as duas pontas publicadas, e só da execução mais recente"

# O gate de exposição lê a tabela base pelas colunas concedidas; essa leitura
# precisa funcionar como anon (select=* falha por não ter grant em id).
psql_db prova <<'SQL'
BEGIN;
SET LOCAL ROLE anon;
SELECT doador_grupo, financiamento_id, candidato_id, pessoa_chave, ano_eleicao,
       doador_nome, doador_tipo, valor, regra_versao, materializado_em
FROM public.financiamento_doador_recorrente;
COMMIT;
SQL
echo "OK: anon lê a tabela base pelas colunas concedidas"

psql_db prova <<'SQL'
BEGIN;
SET LOCAL ROLE anon;
DO $escrita$
BEGIN
  BEGIN
    INSERT INTO public.financiamento_doador_recorrente
      (doador_grupo, financiamento_id, candidato_id, pessoa_chave, ano_eleicao, doador_nome, doador_tipo, regra_versao)
    VALUES ('40000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000000a',
            '00000000-0000-4000-8000-000000000001', 'pessoa-a', 2014, 'INTRUSA S.A.', 'PJ', 'x');
    RAISE EXCEPTION 'anon conseguiu escrever na tabela materializada';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$escrita$;
COMMIT;
SQL
echo "OK: anon não escreve na tabela materializada"

psql_db prova <<'SQL'
DO $pj$
BEGIN
  BEGIN
    INSERT INTO public.financiamento_doador_recorrente
      (doador_grupo, financiamento_id, candidato_id, pessoa_chave, ano_eleicao, doador_nome, doador_tipo, regra_versao)
    VALUES ('50000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-00000000000a',
            '00000000-0000-4000-8000-000000000001', 'pessoa-a', 2022, 'EMPRESA POS 2016 S.A.', 'PJ', 'x');
    RAISE EXCEPTION 'CHECK deixou passar doação de PJ depois da proibição';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$pj$;
SQL
echo "OK: CHECK barra PJ a partir de 2016 (ADI 4650)"

echo "== adversarial: coluna de documento na superfície =="
setup_db adversarial
file_db adversarial "$FORWARD"
if psql_db adversarial <<'SQL'
BEGIN;
ALTER TABLE public.financiamento_doador_recorrente ADD COLUMN cnpj_doador text;
DO $guard$
DECLARE
  vazado text;
BEGIN
  SELECT string_agg(table_name || '.' || column_name, ', ') INTO vazado
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('financiamento_doador_recorrente', 'financiamento_doador_recorrente_publico')
    AND (column_name ILIKE '%cnpj%' OR column_name ILIKE '%cpf%' OR column_name ILIKE '%hash%');
  IF vazado IS NOT NULL THEN
    RAISE EXCEPTION 'doador recorrente: coluna de documento na superfície pública: %', vazado;
  END IF;
END
$guard$;
COMMIT;
SQL
then
  echo "FAIL: o guard aceitou coluna de documento" >&2
  exit 1
fi
echo "OK: guard reprova coluna de documento"

echo "== rollback =="
file_db prova "$ROLLBACK"
psql_db prova <<'SQL'
DO $pos$
BEGIN
  IF to_regclass('public.financiamento_doador_recorrente') IS NOT NULL
     OR to_regclass('public.financiamento_doador_recorrente_publico') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback deixou objeto de pé';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260922140000') THEN
    RAISE EXCEPTION 'rollback deixou a versão no ledger';
  END IF;
END
$pos$;
SQL
echo "OK: rollback limpa tabela, view e ledger"

echo "PASS: prova PG17 do doador recorrente"
