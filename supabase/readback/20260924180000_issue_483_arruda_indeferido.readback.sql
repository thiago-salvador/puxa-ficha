BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260924180000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260924180000' AND volume = 1 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'issue-483 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260924180000';

  IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = 'jose-roberto-arruda')
       IS DISTINCT FROM r->'after' THEN
    RAISE EXCEPTION 'issue-483 readback: postimagem divergiu';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'jose-roberto-arruda'
      AND sq_candidato_2026 = '70002552586'
      AND situacao_candidatura = 'indeferido'
      AND status = 'candidato'
      AND publicavel IS TRUE
  ) THEN
    RAISE EXCEPTION 'issue-483 readback: ficha nao esta reconciliada como Indeferido';
  END IF;

  -- A superficie publica e a prova que interessa ao leitor: a ficha continua
  -- publicada: indeferimento sem inaptidao nao retira a ficha do ar.
  IF NOT EXISTS (SELECT 1 FROM public.candidatos_publico WHERE slug = 'jose-roberto-arruda') THEN
    RAISE EXCEPTION 'issue-483 readback: ficha nao aparece mais em candidatos_publico';
  END IF;

  -- Exatamente um: zero significa que a migration nao gravou a preimagem, e
  -- mais de um significa que alguem escreveu por outro caminho. Os dois
  -- quebram o rollback, que casa uma linha so.
  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'issue-483-arruda-indeferido') <> 1 THEN
    RAISE EXCEPTION 'issue-483 readback: snapshot de quarentena ausente ou duplicado';
  END IF;
END
$readback$;
COMMIT;
