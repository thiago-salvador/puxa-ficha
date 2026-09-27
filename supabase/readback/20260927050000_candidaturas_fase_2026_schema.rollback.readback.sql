BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
BEGIN
  IF to_regclass('public.candidaturas_fase_2026') IS NOT NULL OR to_regclass('public.candidaturas_fase_2026_publico') IS NOT NULL THEN
    RAISE EXCEPTION 'fase-2026 rollback readback: tabela ou view continua no banco';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260927050000') THEN
    RAISE EXCEPTION 'fase-2026 rollback readback: versão continua no ledger';
  END IF;
END
$readback$;
COMMIT;
