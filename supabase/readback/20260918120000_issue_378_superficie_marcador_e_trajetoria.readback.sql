BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; actual_after jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log
       WHERE execucao = 'migration:20260918120000' AND volume = 8 AND resultado = 'encontrado') <> 1 THEN
    RAISE EXCEPTION 'issue-378 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260918120000';

  actual_after := jsonb_build_object(
    'financiamento', (SELECT to_jsonb(f) FROM public.financiamento f
                       WHERE f.id = '7e5a0eb4-86e2-4ffb-af34-f5136ec16fc7'),
    'trajetoria', (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.ano, m.id)
                     FROM public.mudancas_partido m
                     JOIN public.candidatos c ON c.id = m.candidato_id
                    WHERE c.slug = 'andre-do-prado')
  );
  IF actual_after IS DISTINCT FROM r->'after' THEN
    RAISE EXCEPTION 'issue-378 readback: postimagem divergiu';
  END IF;

  -- O que a issue #378 exige, medido direto e nao pelo recibo.
  IF EXISTS (
    SELECT 1 FROM public.financiamento_publico f
    JOIN public.candidatos c ON c.id = f.candidato_id
    WHERE c.slug = 'dr-fernando-maximo'
      AND f.maiores_doadores::text ~* '#(NULO|NE)#?'
  ) THEN
    RAISE EXCEPTION 'issue-378 readback: marcador tecnico ainda visivel no financiamento publicado';
  END IF;

  IF (SELECT count(*) FROM public.mudancas_partido m
      JOIN public.candidatos c ON c.id = m.candidato_id
      WHERE c.slug = 'andre-do-prado' AND m.despublicado_em IS NOT NULL) <> 7
     OR EXISTS (
       SELECT 1 FROM public.mudancas_partido m
       JOIN public.candidatos c ON c.id = m.candidato_id
       WHERE c.slug = 'andre-do-prado' AND m.despublicado_em IS NULL
     ) THEN
    RAISE EXCEPTION 'issue-378 readback: trajetoria de andre-do-prado nao esta integralmente fora do ar';
  END IF;
END
$readback$;
COMMIT;
