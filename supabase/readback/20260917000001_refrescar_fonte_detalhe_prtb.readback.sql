BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260917000001' AND volume=1 AND resultado='encontrado')<>1 THEN
    RAISE EXCEPTION 'fonte-detalhe-prtb readback: recibo ausente ou invalido';
  END IF;
  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
         AND fonte_tipo = 'divulgacand_detalhe'
         AND fonte_detalhe->'titular'->>'descricao_situacao' = 'Pendente de julgamento'
         AND fonte_detalhe->'vice'->>'descricao_situacao' = 'Pendente de julgamento'
         AND tse_situacao_codigo = 'Pendente de julgamento'
         AND fonte_sha256 = '111536f42f57322e3948aa6db34a7d13236148fa3cde77e042574027835a080c')<>1
  THEN
    RAISE EXCEPTION 'fonte-detalhe-prtb readback: valor divergiu';
  END IF;
END
$readback$;
COMMIT;
