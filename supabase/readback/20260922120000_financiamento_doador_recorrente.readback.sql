-- Readback da migration 20260922120000 (doador recorrente).
--
-- Roda dentro da transação do apply, antes do COMMIT, e de novo sozinho em
-- modo somente leitura. Por isso não abre nem fecha transação e não troca de
-- papel: os privilégios de anon são conferidos por função, não por SET ROLE.
DO $readback$
DECLARE
  colunas_documento integer;
  colunas_view text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260922120000'
  ) THEN
    RAISE EXCEPTION 'doador recorrente: 20260922120000 ausente do ledger';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.financiamento_doador_recorrente_publico'::regclass
      AND reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'doador recorrente: view pública não é security_invoker';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.financiamento_doador_recorrente'::regclass) THEN
    RAISE EXCEPTION 'doador recorrente: tabela materializada sem RLS';
  END IF;

  SELECT count(*) INTO colunas_documento
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('financiamento_doador_recorrente', 'financiamento_doador_recorrente_publico')
    AND (column_name ILIKE '%cnpj%' OR column_name ILIKE '%cpf%' OR column_name ILIKE '%hash%'
         OR column_name ILIKE '%documento%');
  IF colunas_documento > 0 THEN
    RAISE EXCEPTION 'doador recorrente: coluna de documento na superfície pública';
  END IF;

  SELECT string_agg(column_name, ',' ORDER BY column_name) INTO colunas_view
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'financiamento_doador_recorrente_publico';
  IF colunas_view IS DISTINCT FROM
     'ano_eleicao,candidato_id,doador_grupo,doador_nome,doador_tipo,materializado_em,outra_ano_eleicao,outra_nome_urna,outra_partido_sigla,outra_pessoa_chave,outra_slug,outra_valor,regra_versao,valor' THEN
    RAISE EXCEPTION 'doador recorrente: colunas da view divergiram: %', colunas_view;
  END IF;

  IF has_table_privilege('anon', 'public.financiamento_doador_recorrente', 'INSERT')
     OR has_table_privilege('anon', 'public.financiamento_doador_recorrente', 'UPDATE')
     OR has_table_privilege('anon', 'public.financiamento_doador_recorrente', 'DELETE')
     OR has_table_privilege('authenticated', 'public.financiamento_doador_recorrente', 'INSERT')
     OR has_table_privilege('authenticated', 'public.financiamento_doador_recorrente', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.financiamento_doador_recorrente', 'DELETE') THEN
    RAISE EXCEPTION 'doador recorrente: papel público com escrita na tabela materializada';
  END IF;

  IF NOT has_table_privilege('anon', 'public.financiamento_doador_recorrente_publico', 'SELECT') THEN
    RAISE EXCEPTION 'doador recorrente: anon sem SELECT na view pública';
  END IF;
END
$readback$;
