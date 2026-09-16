DO $$
DECLARE
  v_ledger integer;
  v_column integer;
  v_resultado integer;
  v_sha integer;
  v_contract integer;
  v_view integer;
BEGIN
  SELECT count(*) INTO v_ledger FROM supabase_migrations.schema_migrations
   WHERE version = '20260915090000';
  IF v_ledger <> 1 THEN RAISE EXCEPTION 'readback nao_aplicavel: ledger=%', v_ledger; END IF;

  SELECT count(*) INTO v_column FROM information_schema.columns
   WHERE table_schema='public' AND table_name='financiamento_verificacoes'
     AND column_name='fonte_sha256' AND data_type='text';
  SELECT count(*) INTO v_resultado FROM pg_constraint
   WHERE conname='financiamento_verificacoes_resultado_check' AND convalidated
     AND pg_get_constraintdef(oid) LIKE '%nao_aplicavel%';
  SELECT count(*) INTO v_sha FROM pg_constraint
   WHERE conname='financiamento_verificacoes_fonte_sha256_check' AND convalidated;
  SELECT count(*) INTO v_contract FROM pg_constraint
   WHERE conname='financiamento_verificacoes_nao_aplicavel_check' AND convalidated;
  SELECT count(*) INTO v_view FROM information_schema.views
   WHERE table_schema='public' AND table_name='financiamento_verificacoes_publico';

  IF v_column <> 1 OR v_resultado <> 1 OR v_sha <> 1 OR v_contract <> 1 OR v_view <> 1 THEN
    RAISE EXCEPTION 'readback nao_aplicavel: column=% resultado=% sha=% contract=% view=%',
      v_column, v_resultado, v_sha, v_contract, v_view;
  END IF;
  RAISE NOTICE 'FINANCIAMENTO_NAO_APLICAVEL_READBACK_OK';
END
$$;
