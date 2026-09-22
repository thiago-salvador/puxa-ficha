-- Readback somente leitura da migration 20260922120000.
BEGIN READ ONLY;

DO $readback$
DECLARE
  aplicada boolean;
  colunas_documento integer;
  anon_escreve boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260922120000'
  ) INTO aplicada;
  IF NOT aplicada THEN
    RAISE EXCEPTION 'readback: 20260922120000 ausente do ledger';
  END IF;

  SELECT count(*) INTO colunas_documento
  FROM information_schema.column_privileges
  WHERE grantee IN ('anon', 'authenticated')
    AND table_schema = 'public'
    AND table_name IN ('financiamento_doador_recorrente', 'financiamento_doador_recorrente_publico')
    AND (column_name ILIKE '%cnpj%' OR column_name ILIKE '%cpf%' OR column_name ILIKE '%hash%');
  IF colunas_documento > 0 THEN
    RAISE EXCEPTION 'readback: anon com coluna de documento na superfície de doador recorrente';
  END IF;

  SELECT has_table_privilege('anon', 'public.financiamento_doador_recorrente', 'INSERT')
      OR has_table_privilege('anon', 'public.financiamento_doador_recorrente', 'UPDATE')
      OR has_table_privilege('anon', 'public.financiamento_doador_recorrente', 'DELETE')
    INTO anon_escreve;
  IF anon_escreve THEN
    RAISE EXCEPTION 'readback: anon com escrita na tabela materializada';
  END IF;
END
$readback$;

SET LOCAL ROLE anon;
SELECT count(*) AS pares_publicos FROM public.financiamento_doador_recorrente_publico;
RESET ROLE;

ROLLBACK;
