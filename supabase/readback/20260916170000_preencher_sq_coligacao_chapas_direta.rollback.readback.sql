BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260916170000')<>1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao='rollback:20260916170000')<>1
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260916170000') THEN
    RAISE EXCEPTION 'sq-coligacao-chapas-direta rollback readback: recibos/ledger divergiu';
  END IF;
  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave IN ('2026:BR:pablo-henrique-costa-marcal','2026:TO:jose-wilson-siqueira-campos-junior:270002554375')
         AND sq_coligacao IS NULL)<>2
  THEN
    RAISE EXCEPTION 'sq-coligacao-chapas-direta rollback readback: preservacao divergiu';
  END IF;
END
$readback$;
COMMIT;
