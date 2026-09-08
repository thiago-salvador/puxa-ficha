-- Destructive rollback: exports of the two H12 tables must be retained first.
BEGIN;
DROP VIEW public.verified_candidate_updates_public;
DROP FUNCTION public.observe_verified_candidate_change(uuid,text,integer,text,text,text);
DROP TABLE public.verified_candidate_updates;
DROP TABLE public.verified_candidate_observations;
DO $$ BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    DELETE FROM supabase_migrations.schema_migrations WHERE version='20260908160000';
  END IF;
END $$;
COMMIT;
