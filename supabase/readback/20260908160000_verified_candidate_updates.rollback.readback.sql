DO $$ BEGIN
  IF to_regclass('public.verified_candidate_updates_public') IS NOT NULL
    OR to_regclass('public.verified_candidate_updates') IS NOT NULL
    OR to_regclass('public.verified_candidate_observations') IS NOT NULL
    OR to_regprocedure('public.observe_verified_candidate_change(uuid,text,integer,text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'H12: rollback incomplete';
  END IF;
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260908160000') THEN
      RAISE EXCEPTION 'H12: version remains in ledger';
    END IF;
  END IF;
END $$;
SELECT to_regclass('public.verified_candidate_updates_public') IS NULL AS public_view_removed,
to_regclass('public.verified_candidate_updates') IS NULL AS updates_removed,
to_regclass('public.verified_candidate_observations') IS NULL AS observations_removed,
to_regprocedure('public.observe_verified_candidate_change(uuid,text,integer,text,text,text)') IS NULL AS collector_rpc_removed;
