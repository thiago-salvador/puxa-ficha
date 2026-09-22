BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260922150000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260922150000' AND volume = 1 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'issue-433 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260922150000';

  IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = 'dimas-cassimiro')
       IS DISTINCT FROM r->'after' THEN
    RAISE EXCEPTION 'issue-433 readback: postimagem divergiu';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'dimas-cassimiro'
      AND sq_candidato_2026 = '100002552700'
      AND situacao_candidatura = 'deferido'
      AND status = 'candidato'
      AND publicavel IS TRUE
  ) THEN
    RAISE EXCEPTION 'issue-433 readback: ficha nao esta reconciliada como Deferido';
  END IF;

  -- A superficie publica e a prova que interessa ao leitor: a ficha continua
  -- publicada, diferente da issue #400 (que retirava a ficha do ar).
  IF NOT EXISTS (SELECT 1 FROM public.candidatos_publico WHERE slug = 'dimas-cassimiro') THEN
    RAISE EXCEPTION 'issue-433 readback: ficha nao aparece mais em candidatos_publico';
  END IF;

  -- Exatamente um: zero significa que a migration nao gravou a preimagem, e
  -- mais de um significa que alguem escreveu por outro caminho. Os dois
  -- quebram o rollback, que casa uma linha so.
  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'issue-433-dimas-cassimiro-deferido') <> 1 THEN
    RAISE EXCEPTION 'issue-433 readback: snapshot de quarentena ausente ou duplicado';
  END IF;
END
$readback$;
COMMIT;
