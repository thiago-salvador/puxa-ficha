BEGIN READ ONLY;
DO $readback$
DECLARE
  ledger_count integer;
  definicao text;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260917000000';
  IF ledger_count <> 1 THEN
    RAISE EXCEPTION 'pendente-julgamento-fonte-detalhe-check readback: ledger sem a migration (count=%)', ledger_count;
  END IF;

  SELECT pg_get_constraintdef(oid)
    INTO definicao
    FROM pg_constraint
   WHERE conrelid = 'public.chapas_2026'::regclass
     AND conname = 'chapas_2026_fonte_detalhe_check'
     AND contype = 'c'
     AND convalidated;
  IF definicao IS NULL THEN
    RAISE EXCEPTION 'pendente-julgamento-fonte-detalhe-check readback: CHECK ausente ou NOT VALID';
  END IF;
  IF definicao NOT LIKE '%Pendente de julgamento%' THEN
    RAISE EXCEPTION 'pendente-julgamento-fonte-detalhe-check readback: dominio nao alargado';
  END IF;
END
$readback$;
COMMIT;
