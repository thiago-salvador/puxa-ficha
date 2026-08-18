DO $$
DECLARE
  v_ledger integer;
  v_colunas integer;
  v_indices integer;
  v_snapshot integer;
  v_view text;
BEGIN
  SELECT count(*) INTO v_ledger FROM supabase_migrations.schema_migrations WHERE version='20260811102000';
  SELECT count(*) INTO v_colunas
  FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name IN ('mudancas_partido','patrimonio','financiamento')
    AND column_name IN ('despublicado_em','despublicacao_motivo');
  SELECT count(*) INTO v_indices FROM pg_indexes
  WHERE schemaname='public' AND indexname IN (
    'idx_mudancas_partido_despublicado','idx_patrimonio_despublicado','idx_financiamento_despublicado'
  );
  SELECT count(*) INTO v_snapshot FROM information_schema.tables
  WHERE table_schema='public' AND table_name='identidade_timeline_quarentena_snapshot';
  SELECT pg_get_viewdef('public.financiamento_publico'::regclass, true) INTO v_view;
  IF v_ledger <> 1 OR v_colunas <> 6 OR v_indices <> 3 OR v_snapshot <> 1 OR v_view NOT ILIKE '%despublicado_em IS NULL%' THEN
    RAISE EXCEPTION 'readback 20260811102000 divergente: ledger=% colunas=% indices=% snapshot=% view=%',
      v_ledger, v_colunas, v_indices, v_snapshot, v_view;
  END IF;
END $$;

SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260811102000') AS ledger,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('mudancas_partido','patrimonio','financiamento') AND column_name IN ('despublicado_em','despublicacao_motivo')) AS colunas,
  (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('idx_mudancas_partido_despublicado','idx_patrimonio_despublicado','idx_financiamento_despublicado')) AS indices,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='identidade_timeline_quarentena_snapshot') AS snapshot;
