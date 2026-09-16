DO $readback$
DECLARE
  v_view_def text;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260915190000') <> 1 THEN
    RAISE EXCEPTION 'readback financiamento_cargo_candidatura: ledger divergiu';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financiamento'
      AND column_name='cargo_candidatura' AND data_type='text' AND is_nullable='YES'
  ) THEN
    RAISE EXCEPTION 'readback financiamento_cargo_candidatura: coluna ausente ou não nullable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financiamento_publico' AND column_name='cargo_candidatura'
  ) THEN
    RAISE EXCEPTION 'readback financiamento_cargo_candidatura: view pública sem cargo_candidatura';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid='public.financiamento_publico'::regclass
      AND 'security_invoker=true' = ANY(COALESCE(reloptions, '{}'::text[]))
  ) THEN
    RAISE EXCEPTION 'readback financiamento_cargo_candidatura: view pública sem security_invoker';
  END IF;
  SELECT pg_get_viewdef('public.financiamento_publico'::regclass, true) INTO v_view_def;
  IF v_view_def NOT LIKE '%is_public_candidate(%' OR v_view_def NOT LIKE '%despublicado_em IS NULL%' THEN
    RAISE EXCEPTION 'readback financiamento_cargo_candidatura: view pública perdeu filtros de publicação';
  END IF;
  IF NOT has_table_privilege('anon','public.financiamento_publico','SELECT')
     OR NOT has_table_privilege('authenticated','public.financiamento_publico','SELECT')
     OR NOT has_column_privilege('anon','public.financiamento','cargo_candidatura','SELECT')
     OR NOT has_column_privilege('authenticated','public.financiamento','cargo_candidatura','SELECT') THEN
    RAISE EXCEPTION 'readback financiamento_cargo_candidatura: grants públicos ausentes';
  END IF;
  IF has_table_privilege('anon','public.financiamento','SELECT')
     OR has_table_privilege('authenticated','public.financiamento','SELECT') THEN
    RAISE EXCEPTION 'readback financiamento_cargo_candidatura: tabela base aberta além das colunas públicas';
  END IF;
  RAISE NOTICE 'FINANCIAMENTO_CARGO_CANDIDATURA_READBACK_OK';
END
$readback$;
