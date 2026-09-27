-- Remove a CHECK de número CNJ em processos e a função que ela usa. Não toca
-- em dado.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260926190100' THEN
    RAISE EXCEPTION 'processo-cnj-check rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;
END
$rollback$;
ALTER TABLE public.processos DROP CONSTRAINT IF EXISTS processos_numero_processo_cnj_check;
DROP FUNCTION IF EXISTS public.processo_numero_cnj_valido(text);
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260926190100';
COMMIT;
