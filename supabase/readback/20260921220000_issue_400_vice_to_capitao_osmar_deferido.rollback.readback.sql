BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260921220000') <> 1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:20260921220000') <> 1
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260921220000') THEN
    RAISE EXCEPTION 'issue-400-vice-to rollback readback: recibos ou ledger divergiram';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260921220000';

  IF (SELECT to_jsonb(c) FROM public.chapas_2026 c WHERE c.chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375')
       IS DISTINCT FROM r->'before' THEN
    RAISE EXCEPTION 'issue-400-vice-to rollback readback: chapa nao voltou ao estado anterior';
  END IF;
END
$readback$;
COMMIT;
