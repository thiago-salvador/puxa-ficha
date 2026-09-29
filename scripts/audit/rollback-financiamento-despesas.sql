BEGIN;

-- Remove a superfície de despesas de campanha inteira (view, policy e tabela)
-- e a versão 20260929100000 do ledger. As linhas são derivadas da prestação de
-- contas do TSE pelo coletor; nada se perde que uma nova coleta não refaça.

DROP VIEW IF EXISTS public.financiamento_despesas_publico;
DROP TABLE IF EXISTS public.financiamento_despesas;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260929100000';

DO $guard$
BEGIN
  IF to_regclass('public.financiamento_despesas') IS NOT NULL
     OR to_regclass('public.financiamento_despesas_publico') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback despesas: objeto ainda existe';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260929100000') THEN
    RAISE EXCEPTION 'rollback despesas: versao ainda no ledger';
  END IF;
END
$guard$;

COMMIT;
