DO $readback$
DECLARE
  papel text;
  fn regprocedure;
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260915210000') THEN
    RAISE EXCEPTION 'rollback readback financiamento_verificacoes_contexto: versão ainda no ledger';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financiamento_verificacoes' AND column_name='cargo_candidatura'
  ) THEN
    RAISE EXCEPTION 'rollback readback financiamento_verificacoes_contexto: coluna permanece';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.financiamento_verificacoes'::regclass AND conname='financiamento_verificacoes_contexto_unique')
     OR NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid='public.financiamento_verificacoes'::regclass
         AND conname='financiamento_verificacoes_candidato_id_ano_eleicao_key'
         AND pg_get_constraintdef(oid) = 'UNIQUE (candidato_id, ano_eleicao)'
     ) THEN
    RAISE EXCEPTION 'rollback readback financiamento_verificacoes_contexto: chave por ano não restaurada';
  END IF;
  FOREACH fn IN ARRAY ARRAY[
    'public.financiamento_publicado_recusa_verificacao()'::regprocedure,
    'public.financiamento_verificacao_recusa_publicado()'::regprocedure
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE oid = fn
        AND proconfig @> ARRAY['search_path=""']
        AND prosrc NOT LIKE '%uf_candidatura%'
    ) THEN
      RAISE EXCEPTION 'rollback readback financiamento_verificacoes_contexto: função % não restaurada', fn;
    END IF;
  END LOOP;
  IF (SELECT array_agg(column_name::text ORDER BY ordinal_position)
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='financiamento_verificacoes_publico')
     IS DISTINCT FROM ARRAY['candidato_id','ano_eleicao','resultado','fonte_url','verificado_em','detalhe'] THEN
    RAISE EXCEPTION 'rollback readback financiamento_verificacoes_contexto: colunas da view não restauradas';
  END IF;
  FOREACH papel IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(papel,'public.financiamento_verificacoes_publico','SELECT')
       OR has_table_privilege(papel,'public.financiamento_verificacoes','SELECT') THEN
      RAISE EXCEPTION 'rollback readback financiamento_verificacoes_contexto: % com acesso ao contrato restrito', papel;
    END IF;
  END LOOP;
  RAISE NOTICE 'FINANCIAMENTO_VERIFICACOES_CONTEXTO_ROLLBACK_READBACK_OK';
END
$readback$;
