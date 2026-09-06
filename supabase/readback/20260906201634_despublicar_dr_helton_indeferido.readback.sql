DO $readback$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.candidatos_publico WHERE slug='dr-helton-monteiro'
  ) THEN
    RAISE EXCEPTION 'dr-helton: ficha terminal ainda está pública';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE id='86ffacf8-e5d4-4f9b-a808-0f0cb551d832'::uuid
      AND slug='dr-helton-monteiro'
      AND sq_candidato_2026='260002547415'
      AND status='removido'
      AND publicavel IS FALSE
      AND situacao_candidatura='indeferido'
      AND (verificacao_campos->'candidate_registration'->>'situacao')='indeferido'
  ) THEN
    RAISE EXCEPTION 'dr-helton: estado reconciliado ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.identidade_timeline_quarentena_snapshot
    WHERE migration_version='freshness-dr-helton-20260906'
      AND tabela='candidatos'
      AND row_id='86ffacf8-e5d4-4f9b-a808-0f0cb551d832'::uuid
  ) THEN
    RAISE EXCEPTION 'dr-helton: snapshot ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.coleta_log
    WHERE execucao='migration:freshness-dr-helton-20260906'
      AND candidato_id='86ffacf8-e5d4-4f9b-a808-0f0cb551d832'::uuid
  ) THEN
    RAISE EXCEPTION 'dr-helton: recibo de coleta ausente';
  END IF;
END
$readback$;
