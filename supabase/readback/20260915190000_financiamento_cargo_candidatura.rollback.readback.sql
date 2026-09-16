DO $readback$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260915190000') THEN
    RAISE EXCEPTION 'rollback readback financiamento_cargo_candidatura: versão ainda no ledger';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('financiamento','financiamento_publico')
      AND column_name='cargo_candidatura'
  ) THEN
    RAISE EXCEPTION 'rollback readback financiamento_cargo_candidatura: coluna permanece';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid='public.financiamento_publico'::regclass
      AND 'security_invoker=true' = ANY(COALESCE(reloptions, '{}'::text[]))
  ) THEN
    RAISE EXCEPTION 'rollback readback financiamento_cargo_candidatura: view sem security_invoker';
  END IF;
  IF pg_get_viewdef('public.financiamento_publico'::regclass, true) NOT LIKE '%is_public_candidate(%'
     OR pg_get_viewdef('public.financiamento_publico'::regclass, true) NOT LIKE '%despublicado_em IS NULL%' THEN
    RAISE EXCEPTION 'rollback readback financiamento_cargo_candidatura: view perdeu filtros de publicação';
  END IF;
  IF NOT has_table_privilege('anon','public.financiamento_publico','SELECT')
     OR NOT has_table_privilege('authenticated','public.financiamento_publico','SELECT') THEN
    RAISE EXCEPTION 'rollback readback financiamento_cargo_candidatura: SELECT público da view perdido';
  END IF;
  RAISE NOTICE 'FINANCIAMENTO_CARGO_CANDIDATURA_ROLLBACK_READBACK_OK';
END $readback$;
