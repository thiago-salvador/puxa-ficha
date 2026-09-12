BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$ BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260912160200' THEN RAISE EXCEPTION 'chapas public grants rollback: ledger divergiu'; END IF;
END $rollback$;
REVOKE SELECT (titular_sq_candidato, vice_sq_candidato, vice_situacao_divulgacand) ON TABLE public.chapas_2026 FROM anon, authenticated;
DELETE FROM supabase_migrations.schema_migrations WHERE version='20260912160200';
COMMIT;
