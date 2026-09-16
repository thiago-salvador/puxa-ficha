DO $readback$
DECLARE
  v_missing text;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260915220000') <> 1 THEN
    RAISE EXCEPTION 'readback patrimonio_contexto_eleitoral: ledger divergiu';
  END IF;
  SELECT string_agg(t.tabela || '.' || t.coluna, ', ') INTO v_missing
  FROM (VALUES
    ('patrimonio','ano_arquivo'), ('patrimonio','sq_candidato'), ('patrimonio','uf_candidatura'),
    ('patrimonio','cargo_candidatura'), ('patrimonio','data_eleicao'), ('patrimonio','tipo_eleicao'),
    ('patrimonio_ausencia_oficial','ano_arquivo'), ('patrimonio_ausencia_oficial','uf_candidatura'),
    ('patrimonio_ausencia_oficial','cargo_candidatura'), ('patrimonio_ausencia_oficial','data_eleicao'),
    ('patrimonio_ausencia_oficial','tipo_eleicao')
  ) AS t(tabela, coluna)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name=t.tabela AND c.column_name=t.coluna
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'readback patrimonio_contexto_eleitoral: colunas ausentes: %', v_missing;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='patrimonio' AND indexname='uq_patrimonio_contexto_eleitoral'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%(candidato_id, ano_eleicao, sq_candidato) NULLS NOT DISTINCT'
  ) THEN
    RAISE EXCEPTION 'readback patrimonio_contexto_eleitoral: índice único de contexto ausente';
  END IF;
  IF to_regclass('public.uq_patrimonio_candidato_ano_eleicao') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.patrimonio'::regclass AND conname='patrimonio_candidato_id_ano_eleicao_key')
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.patrimonio_ausencia_oficial'::regclass AND conname='patrimonio_ausencia_oficial_candidato_id_ano_eleicao_key') THEN
    RAISE EXCEPTION 'readback patrimonio_contexto_eleitoral: chave antiga por ano permanece';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.patrimonio_ausencia_oficial'::regclass
      AND conname='patrimonio_ausencia_oficial_contexto_unique' AND contype='u'
      AND pg_get_constraintdef(oid) = 'UNIQUE NULLS NOT DISTINCT (candidato_id, ano_eleicao, sq_candidato)'
  ) THEN
    RAISE EXCEPTION 'readback patrimonio_contexto_eleitoral: chave de contexto da ausência oficial ausente';
  END IF;
  IF COALESCE(col_description('public.patrimonio'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid='public.patrimonio'::regclass AND attname='ano_arquivo')), '') = '' THEN
    RAISE EXCEPTION 'readback patrimonio_contexto_eleitoral: comentário de ano_arquivo ausente';
  END IF;
  RAISE NOTICE 'PATRIMONIO_CONTEXTO_ELEITORAL_READBACK_OK';
END
$readback$;
