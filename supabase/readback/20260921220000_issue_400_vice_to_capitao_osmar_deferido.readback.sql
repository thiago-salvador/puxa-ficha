BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260921220000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260921220000' AND volume = 1 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'issue-400-vice-to readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260921220000';

  IF (SELECT to_jsonb(c) FROM public.chapas_2026 c WHERE c.chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375')
       IS DISTINCT FROM r->'after' THEN
    RAISE EXCEPTION 'issue-400-vice-to readback: postimagem divergiu';
  END IF;

  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375'
         AND fonte_detalhe->'vice'->>'descricao_situacao' = 'Deferido'
         AND fonte_detalhe->'vice'->>'sha256' = '7511e9c8be401f12314de6d6951b305ec2c32e58a069624aee22e1086065579a') <> 1 THEN
    RAISE EXCEPTION 'issue-400-vice-to readback: vice nao esta Deferido';
  END IF;
END
$readback$;
COMMIT;
