DO $readback$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260915090000') THEN
    RAISE EXCEPTION 'rollback readback nao_aplicavel: versão ainda no ledger';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financiamento_verificacoes' AND column_name='fonte_sha256'
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.financiamento_verificacoes'::regclass
      AND conname IN ('financiamento_verificacoes_nao_aplicavel_check','financiamento_verificacoes_fonte_sha256_check')
  ) THEN
    RAISE EXCEPTION 'rollback readback nao_aplicavel: coluna ou constraints permanecem';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.financiamento_verificacoes'::regclass
      AND conname='financiamento_verificacoes_resultado_check' AND convalidated
      AND pg_get_constraintdef(oid) NOT LIKE '%nao_aplicavel%'
  ) THEN
    RAISE EXCEPTION 'rollback readback nao_aplicavel: CHECK de resultado não restaurado';
  END IF;
  RAISE NOTICE 'FINANCIAMENTO_NAO_APLICAVEL_ROLLBACK_READBACK_OK';
END $readback$;
