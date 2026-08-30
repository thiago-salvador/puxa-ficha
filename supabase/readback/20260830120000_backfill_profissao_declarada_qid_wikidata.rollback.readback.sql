\set ON_ERROR_STOP on
SET default_transaction_read_only=on;
DO $$ DECLARE qids integer; ledger integer; receipts integer; BEGIN
  SELECT count(*) INTO qids FROM public.candidatos WHERE profissao_declarada ~ '^Q[0-9]+$';
  SELECT count(*) INTO ledger FROM supabase_migrations.schema_migrations WHERE version='20260830120000';
  SELECT count(*) INTO receipts FROM public.coleta_log WHERE execucao='migration:20260830120000:profissao-qid-tse-2026';
  IF qids<>63 OR ledger<>0 OR receipts<>0 THEN RAISE EXCEPTION 'profissao QID rollback readback qids=% ledger=% receipts=%',qids,ledger,receipts; END IF;
END $$;
SELECT 63 AS restored_qids;
