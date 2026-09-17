DO $readback$
DECLARE
  ledger_count integer;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations WHERE version = '20260916150000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback readback fonte-detalhe-prtb: migration ainda no ledger';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chapas_2026
     WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
       AND fonte_detalhe->'titular'->>'descricao_situacao' = 'Aguardando julgamento'
       AND fonte_detalhe->'titular'->>'sha256' = '6350130e0a337d698eb30c86d053bb15317cfa7f7c31a496c5c89f4d0eb82dad'
       AND fonte_detalhe->'vice'->>'descricao_situacao' = 'Aguardando julgamento'
       AND fonte_detalhe->'vice'->>'sha256' = 'e2a45d22429fb28baa6d075592de32ceba85f9eccec4c309bf564c6ee8360e02'
       AND fonte_sha256 = '6350130e0a337d698eb30c86d053bb15317cfa7f7c31a496c5c89f4d0eb82dad'
  ) THEN
    RAISE EXCEPTION 'rollback readback fonte-detalhe-prtb: fonte_detalhe nao voltou ao texto antigo';
  END IF;
END
$readback$;
