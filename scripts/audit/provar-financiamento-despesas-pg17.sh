#!/usr/bin/env bash
set -euo pipefail

# Prova em PostgreSQL 17 da migration 20260929100000 (despesas de campanha).
#
# O que fica provado, com anon de verdade e não com leitura de SQL:
#   1. a migration aplica e reaplica sem erro (idempotente), com a pós-condição;
#   2. o readback passa depois do ledger, como no apply;
#   3. anon lê a view e a tabela base pelas colunas concedidas, e só vê linha
#      de ficha publicada e não despublicada;
#   4. anon não lê coluna operacional nem select * da tabela base;
#   5. anon não escreve na tabela nem na view;
#   6. os CHECKs reprovam documento no JSONB, JSONB fora de array, total
#      negativo e estado de coleta fora do domínio;
#   7. o rollback derruba tabela e view e limpa o ledger.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="pf-financiamento-despesas-$$"
IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
FORWARD="$ROOT/supabase/migrations/20260929100000_financiamento_despesas.sql"
ROLLBACK="$ROOT/scripts/audit/rollback-financiamento-despesas.sql"
READBACK="$ROOT/scripts/audit/readback-financiamento-despesas.sql"

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
SQL

# Base mínima: ledger, candidatos e is_public_candidate. Os privilégios padrão
# imitam o Supabase (ALL para anon em tabela nova), para provar que o REVOKE
# da migration fecha a escrita herdada na tabela e na view.
psql_db prova <<'SQL'
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  publicavel boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'candidato'
);

CREATE OR REPLACE FUNCTION public.is_public_candidate(target_candidate_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.candidatos c
    WHERE c.id = target_candidate_id AND c.publicavel = true AND c.status <> 'removido'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_public_candidate(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON TABLE public.candidatos FROM PUBLIC, anon, authenticated;

INSERT INTO public.candidatos(id, slug, publicavel) VALUES
  ('00000000-0000-4000-8000-000000000001', 'pessoa-a', true),
  ('00000000-0000-4000-8000-000000000002', 'pessoa-b', false);
SQL

echo "== caminho feliz =="
file_db prova "$FORWARD"
file_db prova "$FORWARD"
echo "OK: migration aplica e reaplica com a pos-condicao verde"

psql_db prova <<'SQL'
INSERT INTO public.financiamento_despesas
  (candidato_id, ano_eleicao, sq_candidato, uf, estado_coleta, total_despesas_contratadas,
   concentracao_despesas, maiores_fornecedores, doacoes_a_terceiros, fonte, coletado_em)
VALUES
  -- publicada
  ('00000000-0000-4000-8000-000000000001', 2022, '250001600000', 'SP', 'declarado', 1234.56,
   '[{"tipo":"Publicidade","quantidade":2,"valor":1234.56}]',
   '[{"tipo":"PJ","nome":"GRAFICA EXEMPLO LTDA","quantidade":1,"valor":1000.00},{"tipo":"PF_agregado","quantidade_prestadores":3,"quantidade":3,"valor":234.56}]',
   '[]', 'TSE', now()),
  -- despublicada
  ('00000000-0000-4000-8000-000000000001', 2018, '250000600000', 'SP', 'sem_prestacao', NULL,
   '[]', '[]', '[]', 'TSE', now()),
  -- candidato não publicável
  ('00000000-0000-4000-8000-000000000002', 2022, '250001600001', 'RJ', 'declarado', 10,
   '[]', '[]', '[]', 'TSE', now());
UPDATE public.financiamento_despesas SET despublicado_em = now() WHERE ano_eleicao = 2018;
INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260929100000');
SQL

file_db prova "$READBACK"
echo "OK: readback confere ledger, security_invoker, RLS, colunas, ACL e leitura como anon"

psql_db prova <<'SQL'
BEGIN;
SET LOCAL ROLE anon;
DO $anon$
DECLARE
  n_view integer;
  n_base integer;
BEGIN
  SELECT count(*) INTO n_view FROM public.financiamento_despesas_publico;
  SELECT count(*) INTO n_base FROM (
    SELECT id, candidato_id, ano_eleicao, sq_candidato, uf, municipio_codigo,
           cargo_candidatura, estado_coleta, total_despesas_contratadas,
           total_despesas_pagas, total_doacoes_a_terceiros, recursos_financeiros,
           recursos_estimaveis, divida_campanha, sobra_financeira,
           concentracao_despesas, maiores_fornecedores, doacoes_a_terceiros,
           prestacao_parcial, data_entrega, fonte, fonte_url, coletado_em, despublicado_em
      FROM public.financiamento_despesas
  ) AS t;
  IF n_view <> 1 OR n_base <> 1 THEN
    RAISE EXCEPTION 'anon viu % linha(s) na view e % na base, esperado 1 e 1', n_view, n_base;
  END IF;
END
$anon$;
COMMIT;
SQL
echo "OK: anon ve so a candidatura publicada e nao despublicada, pela view e pela base"

psql_db prova <<'SQL'
BEGIN;
SET LOCAL ROLE anon;
DO $negado$
DECLARE
  v_sql text;
BEGIN
  FOREACH v_sql IN ARRAY ARRAY[
    'SELECT updated_at FROM public.financiamento_despesas',
    'SELECT created_at FROM public.financiamento_despesas',
    'SELECT id_ultima_entrega FROM public.financiamento_despesas',
    'SELECT tipo_entrega FROM public.financiamento_despesas',
    'SELECT * FROM public.financiamento_despesas',
    'INSERT INTO public.financiamento_despesas (candidato_id, ano_eleicao, sq_candidato, estado_coleta, fonte, coletado_em) VALUES (''00000000-0000-4000-8000-000000000001'', 2024, ''1'', ''declarado'', ''x'', now())',
    'UPDATE public.financiamento_despesas SET fonte = ''x''',
    'DELETE FROM public.financiamento_despesas',
    'INSERT INTO public.financiamento_despesas_publico (candidato_id, ano_eleicao, sq_candidato, estado_coleta, fonte, coletado_em) VALUES (''00000000-0000-4000-8000-000000000001'', 2024, ''1'', ''declarado'', ''x'', now())',
    'UPDATE public.financiamento_despesas_publico SET fonte = ''x''',
    'DELETE FROM public.financiamento_despesas_publico',
    'TRUNCATE public.financiamento_despesas'
  ] LOOP
    BEGIN
      EXECUTE v_sql;
      RAISE EXCEPTION 'anon executou: %', v_sql;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
END
$negado$;
COMMIT;
SQL
echo "OK: anon nao le coluna operacional nem select *, e nao escreve na tabela nem na view"

psql_db prova <<'SQL'
DO $checks$
DECLARE
  v_json text;
BEGIN
  FOREACH v_json IN ARRAY ARRAY[
    '[{"tipo":"PJ","nome":"FORNECEDOR","cnpj":"x","quantidade":1,"valor":1}]',
    '[{"tipo":"PJ","nome":"FORNECEDOR","cpf_hash":"x","quantidade":1,"valor":1}]',
    '[{"tipo":"PJ","nome":"FORNECEDOR","documento":"x","quantidade":1,"valor":1}]',
    '[{"tipo":"PJ","nome":"JOAO DA SILVA 12345678909","quantidade":1,"valor":1}]',
    '[{"tipo":"PJ","nome":"MEI 123.456.789-09","quantidade":1,"valor":1}]',
    '[{"tipo":"PJ","nome":"EMPRESA 12.345.678/0001-90","quantidade":1,"valor":1}]',
    '[{"tipo":"PJ","nome":"MEI 123 456 789 09","quantidade":1,"valor":1}]',
    '[{"tipo":"PJ","nome":"MEI 123.456.789/09","quantidade":1,"valor":1}]',
    '[{"tipo":"PJ","nome":"EMPRESA 12 345 678 0001 90","quantidade":1,"valor":1}]',
    '{"tipo":"PJ"}'
  ] LOOP
    BEGIN
      INSERT INTO public.financiamento_despesas
        (candidato_id, ano_eleicao, sq_candidato, estado_coleta, maiores_fornecedores, fonte, coletado_em)
      VALUES ('00000000-0000-4000-8000-000000000001', 2024, '250002000000', 'declarado', v_json::jsonb, 'TSE', now());
      RAISE EXCEPTION 'CHECK aceitou JSONB proibido: %', v_json;
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;
  END LOOP;

  -- Valor decimal grande é legítimo: o ponto decimal não é separador de
  -- documento, e só as folhas de texto passam pelo colapso. A inserção é
  -- desfeita pela exceção de controle do próprio bloco.
  BEGIN
    INSERT INTO public.financiamento_despesas
      (candidato_id, ano_eleicao, sq_candidato, estado_coleta, maiores_fornecedores, fonte, coletado_em)
    VALUES ('00000000-0000-4000-8000-000000000001', 2024, '250002000009', 'declarado',
      '[{"tipo":"PJ","nome":"GRAFICA 2024 LTDA","quantidade":1,"valor":123456789.12}]'::jsonb, 'TSE', now());
    RAISE EXCEPTION 'valor_decimal_aceito';
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION 'CHECK recusou valor decimal grande legitimo';
    WHEN raise_exception THEN
      IF SQLERRM <> 'valor_decimal_aceito' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.financiamento_despesas
      (candidato_id, ano_eleicao, sq_candidato, estado_coleta, total_despesas_pagas, fonte, coletado_em)
    VALUES ('00000000-0000-4000-8000-000000000001', 2024, '250002000000', 'declarado', -1, 'TSE', now());
    RAISE EXCEPTION 'CHECK aceitou total negativo';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.financiamento_despesas
      (candidato_id, ano_eleicao, sq_candidato, estado_coleta, fonte, coletado_em)
    VALUES ('00000000-0000-4000-8000-000000000001', 2024, '250002000000', 'parcial', 'TSE', now());
    RAISE EXCEPTION 'CHECK aceitou estado_coleta fora do dominio';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$checks$;
SQL
echo "OK: CHECKs reprovam documento no JSONB, objeto no lugar de array, total negativo e estado invalido"

echo "== rollback =="
file_db prova "$ROLLBACK"
psql_db prova <<'SQL'
DO $pos$
BEGIN
  IF to_regclass('public.financiamento_despesas') IS NOT NULL
     OR to_regclass('public.financiamento_despesas_publico') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback deixou objeto de pe';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260929100000') THEN
    RAISE EXCEPTION 'rollback deixou a versao no ledger';
  END IF;
END
$pos$;
SQL
echo "OK: rollback limpa tabela, view e ledger"

echo "PASS: prova PG17 das despesas de campanha"
