DO $readback$
DECLARE
  ledger_count integer;
  divergentes integer;
  rollback_receipt_count integer;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260903200000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback readback backfill sq ondas agosto: migration ainda no ledger';
  END IF;

  SELECT count(*) INTO divergentes
  FROM public.coleta_log r,
       jsonb_each_text(r.detalhe::jsonb) AS kv
  JOIN public.candidatos c ON c.id = (kv.key)::uuid
  WHERE r.execucao = 'migration:20260903200000'
    AND c.sq_candidato_2026 IS DISTINCT FROM kv.value;
  IF divergentes <> 0 THEN
    RAISE EXCEPTION 'rollback readback backfill sq ondas agosto: % linha(s) diferentes da pre-imagem', divergentes;
  END IF;

  SELECT count(*) INTO rollback_receipt_count
  FROM public.coleta_log
  WHERE execucao = 'rollback:20260903200000';
  IF rollback_receipt_count <> 1 THEN
    RAISE EXCEPTION 'rollback readback backfill sq ondas agosto: recibo de rollback ausente ou duplicado (%)', rollback_receipt_count;
  END IF;
END
$readback$;
