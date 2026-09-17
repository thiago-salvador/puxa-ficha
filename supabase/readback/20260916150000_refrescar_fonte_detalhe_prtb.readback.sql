DO $readback$
DECLARE
  ledger_count integer;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations WHERE version = '20260916150000';
  IF ledger_count <> 1 THEN
    RAISE EXCEPTION 'readback fonte-detalhe-prtb: ledger sem a migration (count=%)', ledger_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chapas_2026
     WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
       AND fonte_detalhe->'titular'->>'descricao_situacao' = 'Pendente de julgamento'
       AND fonte_detalhe->'titular'->>'sha256' = '111536f42f57322e3948aa6db34a7d13236148fa3cde77e042574027835a080c'
       AND fonte_detalhe->'vice'->>'descricao_situacao' = 'Pendente de julgamento'
       AND fonte_detalhe->'vice'->>'sha256' = 'a8e4d5713cf8f2fe7ab354b48c52777b807c83437187aeed61ff28d8261e80f2'
       AND fonte_sha256 = '111536f42f57322e3948aa6db34a7d13236148fa3cde77e042574027835a080c'
  ) THEN
    RAISE EXCEPTION 'readback fonte-detalhe-prtb: fonte_detalhe nao refrescado';
  END IF;
END
$readback$;
