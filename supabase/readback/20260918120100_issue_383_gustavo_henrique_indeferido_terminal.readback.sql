BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log
       WHERE execucao = 'migration:20260918120100' AND volume = 1 AND resultado = 'encontrado') <> 1 THEN
    RAISE EXCEPTION 'issue-383 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260918120100';

  IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = 'gustavo-henrique')
       IS DISTINCT FROM r->'after' THEN
    RAISE EXCEPTION 'issue-383 readback: postimagem divergiu';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'gustavo-henrique'
      AND sq_candidato_2026 = '180002550421'
      AND situacao_candidatura = 'indeferido'
      AND status = 'removido'
      AND publicavel IS FALSE
  ) THEN
    RAISE EXCEPTION 'issue-383 readback: ficha nao esta reconciliada e fora do ar';
  END IF;

  -- A superficie publica e a prova que interessa ao leitor.
  IF EXISTS (SELECT 1 FROM public.candidatos_publico WHERE slug = 'gustavo-henrique') THEN
    RAISE EXCEPTION 'issue-383 readback: ficha ainda aparece em candidatos_publico';
  END IF;

  -- Exatamente um: zero significa que a migration nao gravou a preimagem, e
  -- mais de um significa que alguem escreveu por outro caminho. Os dois
  -- quebram o rollback, que casa uma linha so.
  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'issue-383-gustavo-henrique-terminal') <> 1 THEN
    RAISE EXCEPTION 'issue-383 readback: snapshot de quarentena ausente ou duplicado';
  END IF;
END
$readback$;
COMMIT;
