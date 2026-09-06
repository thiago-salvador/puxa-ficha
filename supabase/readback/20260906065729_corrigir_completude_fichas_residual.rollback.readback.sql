DO $rollback_readback$
DECLARE quantidade integer;
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260906065729') THEN
    RAISE EXCEPTION 'rollback readback completude: ledger ainda contém a migration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug='well-macedo') THEN RETURN; END IF;

  SELECT count(*) INTO quantidade
  FROM public.historico_politico
  WHERE id IN ('2b33e15d-6b33-436e-99a5-226c67c060ec','9c6854c4-089a-44bf-a09d-ae48feb96255','5a716ae8-8a1b-45ab-a81c-f868715e3c75','de255556-c398-4c53-a6a3-7939e5b3e187')
    AND despublicado_em IS NULL;
  IF quantidade<>4 THEN RAISE EXCEPTION 'rollback readback completude: históricos restaurados=%',quantidade; END IF;

  SELECT count(*) INTO quantidade
  FROM public.mudancas_partido
  WHERE id IN ('510ffa5a-6ec6-42bd-b428-88b096cc6d77','d1a236de-7683-4c43-ace6-116b6582c46a','734a1523-5331-4523-b1fd-4b550f92f3cf')
    AND despublicado_em IS NULL;
  IF quantidade<>3 THEN RAISE EXCEPTION 'rollback readback completude: mudanças restauradas=%',quantidade; END IF;

  SELECT count(*) INTO quantidade
  FROM public.financiamento
  WHERE id IN ('b789aa06-bd9e-4b42-8e25-5aafab3835d0','72ca421b-3446-4749-a867-3bf348a9debf','aa19bdf1-4361-4fe5-86b2-b2e64d2ab513','5480105f-901a-48db-9f1d-d3065ae72255')
    AND despublicado_em IS NULL;
  IF quantidade<>4 THEN RAISE EXCEPTION 'rollback readback completude: financiamentos restaurados=%',quantidade; END IF;

  IF EXISTS (SELECT 1 FROM public.patrimonio_ausencia_oficial WHERE execucao='migration:20260906065729')
     OR EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot WHERE migration_version='20260906065729')
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao LIKE 'migration:20260906065729:%') THEN
    RAISE EXCEPTION 'rollback readback completude: resíduo forward encontrado';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='rollback:20260906065729')<>1 THEN
    RAISE EXCEPTION 'rollback readback completude: recibo rollback ausente';
  END IF;

  RAISE NOTICE 'ROLLBACK_READBACK_OK completude_residual restaurados=11 ausencias_removidas=4';
END
$rollback_readback$;
