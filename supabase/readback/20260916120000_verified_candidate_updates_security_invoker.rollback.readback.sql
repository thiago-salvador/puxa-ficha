DO $$
DECLARE role_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.verified_candidate_updates_public'::regclass
      AND reloptions = ARRAY['security_barrier=true']
  ) THEN
    RAISE EXCEPTION 'verified updates invoker rollback: view options not restored';
  END IF;
  IF to_regprocedure('public.is_public_verified_candidate_update(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'verified updates invoker rollback: gate function remains';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'verified_candidate_updates') THEN
    RAISE EXCEPTION 'verified updates invoker rollback: policy remains';
  END IF;
  IF to_regprocedure('public.observe_verified_candidate_change(uuid,text,integer,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'verified updates invoker rollback: collector RPC missing';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_any_column_privilege(role_name, 'public.verified_candidate_updates', 'SELECT')
      OR NOT has_table_privilege(role_name, 'public.verified_candidate_updates_public', 'SELECT') THEN
      RAISE EXCEPTION 'verified updates invoker rollback: privileges not restored for %', role_name;
    END IF;
  END LOOP;
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260916120000') THEN
      RAISE EXCEPTION 'verified updates invoker rollback: version remains in ledger';
    END IF;
  END IF;
END $$;
SELECT c.reloptions AS view_options,
  to_regprocedure('public.is_public_verified_candidate_update(uuid)') IS NULL AS gate_function_removed
FROM pg_class c WHERE c.oid = 'public.verified_candidate_updates_public'::regclass;
