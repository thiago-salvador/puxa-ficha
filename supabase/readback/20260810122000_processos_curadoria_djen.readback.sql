-- Wrapper operacional canonico. O payload vive no artefato QA gerado e testado;
-- este arquivo acrescenta o gate do ledger sem duplicar as 69 linhas.
DO $readback$
DECLARE v_ledger integer;
BEGIN
  SELECT count(*) INTO v_ledger
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810122000';
  IF v_ledger <> 1 THEN
    RAISE EXCEPTION 'readback 20260810122000: ledger=% (esperado 1)', v_ledger;
  END IF;
END
$readback$;

\ir ../../QA/evidencias/2026-08-10-item2-judicial/proposta-69-21/20260810122000_processos_curadoria_djen.readback.sql
