DO $readback$
DECLARE
  v_def text;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260915210100') <> 1 THEN
    RAISE EXCEPTION 'readback historico_politico_proveniencia_senado: ledger divergiu';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid='public.historico_politico'::regclass
    AND conname='historico_politico_proveniencia_check' AND contype='c' AND convalidated;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'readback historico_politico_proveniencia_senado: CHECK ausente ou não validado';
  END IF;
  IF v_def NOT LIKE '%''senado''::text%'
     OR v_def NOT LIKE '%''tse''::text%'
     OR v_def NOT LIKE '%''wikidata''::text%'
     OR v_def NOT LIKE '%''manual''::text%'
     OR v_def NOT LIKE '%''misto''::text%'
     OR v_def NOT LIKE '%''unknown''::text%'
     OR v_def NOT LIKE '%proveniencia IS NULL%' THEN
    RAISE EXCEPTION 'readback historico_politico_proveniencia_senado: domínio divergiu: %', v_def;
  END IF;
  IF COALESCE(col_description('public.historico_politico'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid='public.historico_politico'::regclass AND attname='proveniencia')), '')
     NOT LIKE '%senado%' THEN
    RAISE EXCEPTION 'readback historico_politico_proveniencia_senado: comentário da coluna sem senado';
  END IF;
  RAISE NOTICE 'HISTORICO_POLITICO_PROVENIENCIA_SENADO_READBACK_OK';
END
$readback$;
