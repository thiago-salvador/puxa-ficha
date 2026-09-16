DO $readback$
DECLARE
  papel text;
  fn regprocedure;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260915210000') <> 1 THEN
    RAISE EXCEPTION 'readback financiamento_verificacoes_contexto: ledger divergiu';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financiamento_verificacoes'
      AND column_name='cargo_candidatura' AND data_type='text'
  ) THEN
    RAISE EXCEPTION 'readback financiamento_verificacoes_contexto: coluna cargo_candidatura ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.financiamento_verificacoes'::regclass
      AND conname='financiamento_verificacoes_contexto_unique' AND contype='u'
      AND pg_get_constraintdef(oid) = 'UNIQUE NULLS NOT DISTINCT (candidato_id, ano_eleicao, sq_candidato, uf_candidatura)'
  ) THEN
    RAISE EXCEPTION 'readback financiamento_verificacoes_contexto: chave de contexto ausente';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.financiamento_verificacoes'::regclass
      AND conname='financiamento_verificacoes_candidato_id_ano_eleicao_key'
  ) THEN
    RAISE EXCEPTION 'readback financiamento_verificacoes_contexto: chave antiga por ano permanece';
  END IF;
  FOREACH fn IN ARRAY ARRAY[
    'public.financiamento_publicado_recusa_verificacao()'::regprocedure,
    'public.financiamento_verificacao_recusa_publicado()'::regprocedure
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE oid = fn
        AND proconfig @> ARRAY['search_path=""']
        AND prosrc LIKE '%uf_candidatura IS NOT DISTINCT FROM NEW.uf_candidatura%'
    ) THEN
      RAISE EXCEPTION 'readback financiamento_verificacoes_contexto: função % sem contexto ou search_path fixo', fn;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgfoid IN ('public.financiamento_publicado_recusa_verificacao()'::regprocedure,
                       'public.financiamento_verificacao_recusa_publicado()'::regprocedure)) <> 2 THEN
    RAISE EXCEPTION 'readback financiamento_verificacoes_contexto: triggers de exclusão mútua ausentes';
  END IF;
  IF (SELECT array_agg(column_name::text ORDER BY ordinal_position)
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='financiamento_verificacoes_publico')
     IS DISTINCT FROM ARRAY['candidato_id','ano_eleicao','sq_candidato','uf_candidatura','cargo_candidatura','resultado','fonte_url','verificado_em','detalhe'] THEN
    RAISE EXCEPTION 'readback financiamento_verificacoes_contexto: colunas da view divergiram';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid='public.financiamento_verificacoes_publico'::regclass
      AND 'security_invoker=true' = ANY(COALESCE(reloptions, '{}'::text[]))
  ) THEN
    RAISE EXCEPTION 'readback financiamento_verificacoes_contexto: view sem security_invoker';
  END IF;
  FOREACH papel IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(papel,'public.financiamento_verificacoes','SELECT')
       OR has_table_privilege(papel,'public.financiamento_verificacoes','INSERT')
       OR has_table_privilege(papel,'public.financiamento_verificacoes_publico','SELECT') THEN
      RAISE EXCEPTION 'readback financiamento_verificacoes_contexto: % com acesso ao contrato restrito', papel;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role','public.financiamento_verificacoes_publico','SELECT')
     OR has_table_privilege('service_role','public.financiamento_verificacoes_publico','INSERT')
     OR NOT has_table_privilege('service_role','public.financiamento_verificacoes','INSERT') THEN
    RAISE EXCEPTION 'readback financiamento_verificacoes_contexto: ACL de service_role divergiu';
  END IF;
  RAISE NOTICE 'FINANCIAMENTO_VERIFICACOES_CONTEXTO_READBACK_OK';
END
$readback$;
