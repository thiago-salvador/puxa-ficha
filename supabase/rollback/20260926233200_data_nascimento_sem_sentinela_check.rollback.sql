-- Remove a CHECK de data de nascimento sentinela em candidatos. Não toca em dado.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260926233200' THEN
    RAISE EXCEPTION 'nascimento-sentinela-check rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;
END
$rollback$;
ALTER TABLE public.candidatos DROP CONSTRAINT IF EXISTS candidatos_data_nascimento_sem_sentinela_check;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260926233200';
COMMIT;
