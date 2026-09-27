-- Remove a tabela de fase e a view pública. Só vale com esta migration no topo
-- do ledger e com a tabela vazia: resultado gravado sai antes, pelo rollback
-- da migration de resultado correspondente.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260927050000' THEN
    RAISE EXCEPTION 'fase-2026 rollback: ledger divergiu (rollback só vale com esta migration no topo)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.candidaturas_fase_2026) THEN
    RAISE EXCEPTION 'fase-2026 rollback: tabela tem resultado gravado; reverter antes a migration de resultado';
  END IF;
END
$rollback$;
DROP VIEW public.candidaturas_fase_2026_publico;
DROP TABLE public.candidaturas_fase_2026;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260927050000';
COMMIT;
