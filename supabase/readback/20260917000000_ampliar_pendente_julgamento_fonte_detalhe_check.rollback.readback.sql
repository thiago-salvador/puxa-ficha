BEGIN READ ONLY;
DO $readback$
DECLARE definicao text;
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260917000000') THEN
    RAISE EXCEPTION 'pendente-julgamento-fonte-detalhe-check rollback readback: ledger ainda tem a migration';
  END IF;
  SELECT pg_get_constraintdef(oid)
    INTO definicao
    FROM pg_constraint
   WHERE conrelid = 'public.chapas_2026'::regclass
     AND conname = 'chapas_2026_fonte_detalhe_check'
     AND contype = 'c'
     AND convalidated;
  IF definicao IS NULL THEN
    RAISE EXCEPTION 'pendente-julgamento-fonte-detalhe-check rollback readback: CHECK sumiu em vez de voltar ao estreito';
  END IF;
  IF definicao LIKE '%Pendente de julgamento%' THEN
    RAISE EXCEPTION 'pendente-julgamento-fonte-detalhe-check rollback readback: dominio nao restaurado';
  END IF;
END
$readback$;
COMMIT;
