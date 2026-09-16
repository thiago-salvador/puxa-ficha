DO $readback$
DECLARE
  v_def text;
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260915210100') THEN
    RAISE EXCEPTION 'rollback readback historico_politico_proveniencia_senado: versão ainda no ledger';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid='public.historico_politico'::regclass
    AND conname='historico_politico_proveniencia_check' AND convalidated;
  IF v_def IS NULL OR v_def LIKE '%senado%' OR v_def NOT LIKE '%''unknown''::text%' THEN
    RAISE EXCEPTION 'rollback readback historico_politico_proveniencia_senado: CHECK não restaurado: %', v_def;
  END IF;
  IF COALESCE(col_description('public.historico_politico'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid='public.historico_politico'::regclass AND attname='proveniencia')), '')
     LIKE '%senado%' THEN
    RAISE EXCEPTION 'rollback readback historico_politico_proveniencia_senado: comentário não restaurado';
  END IF;
  RAISE NOTICE 'HISTORICO_POLITICO_PROVENIENCIA_SENADO_ROLLBACK_READBACK_OK';
END
$readback$;
