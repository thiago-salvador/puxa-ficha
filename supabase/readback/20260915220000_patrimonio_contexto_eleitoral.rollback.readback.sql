DO $readback$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260915220000') THEN
    RAISE EXCEPTION 'rollback readback patrimonio_contexto_eleitoral: versão ainda no ledger';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND ((table_name='patrimonio' AND column_name IN ('ano_arquivo','sq_candidato','uf_candidatura','cargo_candidatura','data_eleicao','tipo_eleicao'))
        OR (table_name='patrimonio_ausencia_oficial' AND column_name IN ('ano_arquivo','uf_candidatura','cargo_candidatura','data_eleicao','tipo_eleicao')))
  ) THEN
    RAISE EXCEPTION 'rollback readback patrimonio_contexto_eleitoral: colunas de contexto permanecem';
  END IF;
  IF to_regclass('public.uq_patrimonio_contexto_eleitoral') IS NOT NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname='public' AND tablename='patrimonio' AND indexname='uq_patrimonio_candidato_ano_eleicao'
         AND indexdef = 'CREATE UNIQUE INDEX uq_patrimonio_candidato_ano_eleicao ON public.patrimonio USING btree (candidato_id, ano_eleicao)'
     ) THEN
    RAISE EXCEPTION 'rollback readback patrimonio_contexto_eleitoral: índice por ano não restaurado';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.patrimonio_ausencia_oficial'::regclass AND conname='patrimonio_ausencia_oficial_contexto_unique')
     OR NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid='public.patrimonio_ausencia_oficial'::regclass
         AND conname='patrimonio_ausencia_oficial_candidato_id_ano_eleicao_key'
         AND pg_get_constraintdef(oid) = 'UNIQUE (candidato_id, ano_eleicao)'
     ) THEN
    RAISE EXCEPTION 'rollback readback patrimonio_contexto_eleitoral: chave por ano da ausência não restaurada';
  END IF;
  RAISE NOTICE 'PATRIMONIO_CONTEXTO_ELEITORAL_ROLLBACK_READBACK_OK';
END $readback$;
