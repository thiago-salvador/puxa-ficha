BEGIN;

-- Remove a superfície de doador recorrente inteira. A tabela é derivada de
-- financiamento por script; nada se perde que a materialização não refaça.

DROP VIEW IF EXISTS public.financiamento_doador_recorrente_publico;
DROP TABLE IF EXISTS public.financiamento_doador_recorrente;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922140000';

DO $guard$
BEGIN
  IF to_regclass('public.financiamento_doador_recorrente') IS NOT NULL
     OR to_regclass('public.financiamento_doador_recorrente_publico') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback doador recorrente: objeto ainda existe';
  END IF;
END
$guard$;

COMMIT;
