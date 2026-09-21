BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260921200000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260921200000' AND volume = 1 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'issue-400 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260921200000';

  IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = 'policial-edjane')
       IS DISTINCT FROM r->'after' THEN
    RAISE EXCEPTION 'issue-400 readback: postimagem divergiu';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'policial-edjane'
      AND sq_candidato_2026 = '250002548080'
      AND situacao_candidatura = 'indeferido'
      AND status = 'removido'
      AND publicavel IS FALSE
  ) THEN
    RAISE EXCEPTION 'issue-400 readback: ficha nao esta reconciliada e fora do ar';
  END IF;

  -- A superficie publica e a prova que interessa ao leitor.
  IF EXISTS (SELECT 1 FROM public.candidatos_publico WHERE slug = 'policial-edjane') THEN
    RAISE EXCEPTION 'issue-400 readback: ficha ainda aparece em candidatos_publico';
  END IF;

  -- Exatamente um: zero significa que a migration nao gravou a preimagem, e
  -- mais de um significa que alguem escreveu por outro caminho. Os dois
  -- quebram o rollback, que casa uma linha so.
  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'issue-400-policial-edjane-terminal') <> 1 THEN
    RAISE EXCEPTION 'issue-400 readback: snapshot de quarentena ausente ou duplicado';
  END IF;
END
$readback$;
COMMIT;
