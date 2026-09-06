DO $readback$
DECLARE quantidade integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug='well-macedo') THEN
    RAISE NOTICE 'completude residual readback: replay sem dados; conferência ignorada';
    RETURN;
  END IF;

  SELECT count(*) INTO quantidade
  FROM public.identidade_timeline_quarentena_snapshot
  WHERE migration_version='20260906065729';
  IF quantidade<>11 THEN RAISE EXCEPTION 'readback completude: snapshot esperado=11 atual=%',quantidade; END IF;

  SELECT count(*) INTO quantidade
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260906065729' AND NOT (
    CASE s.tabela
      WHEN 'historico_politico' THEN EXISTS(SELECT 1 FROM public.historico_politico t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage AND t.despublicado_em IS NOT NULL)
      WHEN 'mudancas_partido' THEN EXISTS(SELECT 1 FROM public.mudancas_partido t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage AND t.despublicado_em IS NOT NULL)
      WHEN 'financiamento' THEN EXISTS(SELECT 1 FROM public.financiamento t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage AND t.despublicado_em IS NOT NULL)
      ELSE false
    END
  );
  IF quantidade<>0 THEN RAISE EXCEPTION 'readback completude: postimage divergente em % linha(s)',quantidade; END IF;

  SELECT count(*) INTO quantidade
  FROM public.patrimonio_ausencia_oficial a
  JOIN (VALUES
    ('20e8b8cd-54a6-4e85-89c2-386ef12d2cc8'::uuid,2020,'250001263474'),
    ('851a0be1-4c2b-4d95-b483-4c67a51860d8'::uuid,2020,'250000881915'),
    ('4e3828f3-33c9-4206-9aff-7b869a466baa'::uuid,2014,'10000000002'),
    ('4164ed87-4b75-4f33-9edb-8f12c38086e5'::uuid,2014,'70000000161')
  ) e(candidato_id,ano,sq)
    ON a.candidato_id=e.candidato_id AND a.ano_eleicao=e.ano AND a.sq_candidato=e.sq
  WHERE a.execucao='migration:20260906065729'
    AND a.fonte_url LIKE 'https://divulgacandcontas.tse.jus.br/%'
    AND a.verificado_em=timestamptz '2026-09-06 06:58:40+00';
  IF quantidade<>4 THEN RAISE EXCEPTION 'readback completude: ausências oficiais esperadas=4 atuais=%',quantidade; END IF;

  SELECT count(*) INTO quantidade FROM public.coleta_log
  WHERE execucao LIKE 'migration:20260906065729:%';
  IF quantidade<>5 THEN RAISE EXCEPTION 'readback completude: recibos esperados=5 atuais=%',quantidade; END IF;

  IF EXISTS (
    SELECT 1 FROM public.historico_politico
    WHERE id IN ('2b33e15d-6b33-436e-99a5-226c67c060ec','9c6854c4-089a-44bf-a09d-ae48feb96255','5a716ae8-8a1b-45ab-a81c-f868715e3c75','de255556-c398-4c53-a6a3-7939e5b3e187')
      AND despublicado_em IS NULL
    UNION ALL
    SELECT 1 FROM public.mudancas_partido
    WHERE id IN ('510ffa5a-6ec6-42bd-b428-88b096cc6d77','d1a236de-7683-4c43-ace6-116b6582c46a','734a1523-5331-4523-b1fd-4b550f92f3cf')
      AND despublicado_em IS NULL
    UNION ALL
    SELECT 1 FROM public.financiamento
    WHERE id IN ('b789aa06-bd9e-4b42-8e25-5aafab3835d0','72ca421b-3446-4749-a867-3bf348a9debf','aa19bdf1-4361-4fe5-86b2-b2e64d2ab513','5480105f-901a-48db-9f1d-d3065ae72255')
      AND despublicado_em IS NULL
  ) THEN RAISE EXCEPTION 'readback completude: linha de homônimo ainda pública'; END IF;

  RAISE NOTICE 'READBACK_OK completude_residual snapshots=11 ausencias=4 recibos=5';
END
$readback$;
