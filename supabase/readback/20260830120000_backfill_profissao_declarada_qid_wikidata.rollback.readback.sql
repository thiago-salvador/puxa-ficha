-- Readback somente leitura APOS o rollback de 20260830120000.
-- Esperado: os 63 registros de volta ao QID medido e a versao fora do ledger.

DO $assert$
DECLARE
  com_qid integer;
  ainda_no_ledger integer;
BEGIN
  SELECT count(*) INTO com_qid
  FROM public.candidatos
  WHERE profissao_declarada ~ '^Q[0-9]+$';
  IF com_qid <> 63 THEN
    RAISE EXCEPTION 'profissao QID rollback readback: % registros com QID, esperado 63', com_qid;
  END IF;

  SELECT count(*) INTO ainda_no_ledger
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260830120000';
  IF ainda_no_ledger <> 0 THEN
    RAISE EXCEPTION 'profissao QID rollback readback: versao ainda no ledger';
  END IF;
END
$assert$;

SELECT
  (SELECT count(*) FROM public.candidatos WHERE profissao_declarada ~ '^Q[0-9]+$') AS com_qid,
  (SELECT max(version) FROM supabase_migrations.schema_migrations) AS ledger_top;
