BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260917000001')<>1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao='rollback:20260917000001')<>1
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260917000001') THEN
    RAISE EXCEPTION 'fonte-detalhe-prtb rollback readback: recibos/ledger divergiu';
  END IF;
  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
         AND fonte_detalhe->'titular'->>'descricao_situacao' = 'Aguardando julgamento'
         AND fonte_detalhe->'vice'->>'descricao_situacao' = 'Aguardando julgamento'
         AND tse_situacao_codigo = 'Aguardando julgamento'
         AND fonte_sha256 = '6350130e0a337d698eb30c86d053bb15317cfa7f7c31a496c5c89f4d0eb82dad')<>1
  THEN
    RAISE EXCEPTION 'fonte-detalhe-prtb rollback readback: preservacao divergiu';
  END IF;
END
$readback$;
COMMIT;
