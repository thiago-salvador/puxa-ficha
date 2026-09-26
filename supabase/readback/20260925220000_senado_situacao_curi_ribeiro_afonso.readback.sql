BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260925220000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260925220000' AND volume = 2 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'senado-situacao-20260925 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260925220000';
  IF jsonb_array_length(r->'linhas') <> 2 THEN
    RAISE EXCEPTION 'senado-situacao-20260925 readback: recibo sem as duas linhas';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = linha->>'slug')
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'senado-situacao-20260925 readback: postimagem divergiu em %', linha->>'slug';
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'alexandre-curi'
      AND sq_candidato_2026 = '160002547963'
      AND situacao_candidatura = 'deferido'
      AND status = 'candidato'
      AND publicavel IS TRUE
  ) THEN
    RAISE EXCEPTION 'senado-situacao-20260925 readback: alexandre-curi nao esta como deferido';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'tse-2026-190002554290'
      AND sq_candidato_2026 = '190002554290'
      AND situacao_candidatura = 'indeferido'
      AND status = 'removido'
      AND publicavel IS FALSE
  ) THEN
    RAISE EXCEPTION 'senado-situacao-20260925 readback: tse-2026-190002554290 nao esta fora do ar como indeferido';
  END IF;

  -- Superficie publica: Curi continua publicada; a candidatura terminal sai.
  IF NOT EXISTS (SELECT 1 FROM public.candidatos_publico WHERE slug = 'alexandre-curi') THEN
    RAISE EXCEPTION 'senado-situacao-20260925 readback: alexandre-curi sumiu de candidatos_publico';
  END IF;
  IF EXISTS (SELECT 1 FROM public.candidatos_publico WHERE slug = 'tse-2026-190002554290') THEN
    RAISE EXCEPTION 'senado-situacao-20260925 readback: candidatura terminal ainda aparece em candidatos_publico';
  END IF;

  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'senado-situacao-20260925') <> 2 THEN
    RAISE EXCEPTION 'senado-situacao-20260925 readback: snapshot de quarentena ausente ou duplicado';
  END IF;
END
$readback$;
COMMIT;
