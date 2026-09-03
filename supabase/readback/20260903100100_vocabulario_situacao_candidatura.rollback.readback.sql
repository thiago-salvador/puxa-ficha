DO $readback$
DECLARE
  ledger_count integer;
  tem_constraint boolean;
  divergentes integer;
  rollback_receipt_count integer;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version IN ('20260903100000', '20260903100100');
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback readback vocabulario_situacao: par ainda no ledger';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidatos'::regclass
       AND conname = 'candidatos_situacao_candidatura_dominio'
  ) INTO tem_constraint;
  IF tem_constraint THEN
    RAISE EXCEPTION 'rollback readback vocabulario_situacao: CHECK ainda presente';
  END IF;

  SELECT count(*) INTO divergentes
  FROM public.coleta_log r,
       jsonb_each_text(r.detalhe::jsonb) AS kv
  JOIN public.candidatos c ON c.id = (kv.key)::uuid
  WHERE r.execucao = 'migration:20260903100000'
    AND c.situacao_candidatura IS DISTINCT FROM kv.value;
  IF divergentes <> 0 THEN
    RAISE EXCEPTION 'rollback readback vocabulario_situacao: % linha(s) diferentes da pre-imagem', divergentes;
  END IF;

  SELECT count(*) INTO rollback_receipt_count
  FROM public.coleta_log
  WHERE execucao = 'rollback:20260903100000';
  IF rollback_receipt_count <> 1 THEN
    RAISE EXCEPTION 'rollback readback vocabulario_situacao: recibo de rollback ausente ou duplicado (%)', rollback_receipt_count;
  END IF;
END
$readback$;
