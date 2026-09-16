DO $$
DECLARE role_name text; privilege_name text; column_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.verified_candidate_updates_public'::regclass
      AND reloptions @> ARRAY['security_invoker=true', 'security_barrier=true']
  ) THEN
    RAISE EXCEPTION 'verified updates invoker: view is not security_invoker';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.is_public_verified_candidate_update(uuid)'::regprocedure
      AND prosecdef AND provolatile = 's' AND proconfig = ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'verified updates invoker: gate function drifted';
  END IF;
  IF has_function_privilege('public', 'public.is_public_verified_candidate_update(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'verified updates invoker: gate executable by PUBLIC';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'verified_candidate_updates'
      AND policyname = 'verified_candidate_updates_public_read'
      AND permissive = 'PERMISSIVE' AND cmd = 'SELECT'
      AND roles = ARRAY['anon', 'authenticated']::name[]
      AND qual IN ('is_public_verified_candidate_update(id)', 'public.is_public_verified_candidate_update(id)')
  ) OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'verified_candidate_updates') <> 1 THEN
    RAISE EXCEPTION 'verified updates invoker: public read policy drifted';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'verified_candidate_observations') THEN
    RAISE EXCEPTION 'verified updates invoker: observations gained a policy';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT has_function_privilege(role_name, 'public.is_public_verified_candidate_update(uuid)', 'EXECUTE')
      OR has_function_privilege(role_name, 'public.observe_verified_candidate_change(uuid,text,integer,text,text,text)', 'EXECUTE')
      OR NOT has_table_privilege(role_name, 'public.verified_candidate_updates_public', 'SELECT') THEN
      RAISE EXCEPTION 'verified updates invoker: function or view privilege drifted for %', role_name;
    END IF;
    FOREACH column_name IN ARRAY ARRAY['id', 'candidate_id', 'field', 'year', 'before_value', 'after_value', 'source_url', 'detected_at'] LOOP
      IF NOT has_column_privilege(role_name, 'public.verified_candidate_updates', column_name, 'SELECT') THEN
        RAISE EXCEPTION 'verified updates invoker: % cannot read column %', role_name, column_name;
      END IF;
    END LOOP;
    FOREACH column_name IN ARRAY ARRAY['source_identity', 'before_source_url'] LOOP
      IF has_column_privilege(role_name, 'public.verified_candidate_updates', column_name, 'SELECT') THEN
        RAISE EXCEPTION 'verified updates invoker: % can read private column %', role_name, column_name;
      END IF;
    END LOOP;
    FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(role_name, 'public.verified_candidate_updates', privilege_name)
        OR has_table_privilege(role_name, 'public.verified_candidate_observations', privilege_name)
        OR has_any_column_privilege(role_name, 'public.verified_candidate_observations', 'SELECT')
        OR (privilege_name <> 'SELECT' AND has_table_privilege(role_name, 'public.verified_candidate_updates_public', privilege_name)) THEN
        RAISE EXCEPTION 'verified updates invoker: unexpected % privilege for %', privilege_name, role_name;
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.verified_candidate_observations'::regclass, 'public.verified_candidate_updates'::regclass) AND NOT relrowsecurity) THEN
    RAISE EXCEPTION 'verified updates invoker: private table RLS disabled';
  END IF;
  IF EXISTS (SELECT 1 FROM public.verified_candidate_updates_public WHERE NOT public.is_public_candidate(candidate_id)) THEN
    RAISE EXCEPTION 'verified updates invoker: private candidate exposed';
  END IF;
  IF (SELECT count(*) FROM public.verified_candidate_updates_public)
    <> (SELECT count(*) FROM public.verified_candidate_updates u WHERE public.is_public_verified_candidate_update(u.id)) THEN
    RAISE EXCEPTION 'verified updates invoker: view rows diverge from publication gate';
  END IF;
END $$;
SELECT c.reloptions AS view_options FROM pg_class c WHERE c.oid = 'public.verified_candidate_updates_public'::regclass;
SELECT grantee, privilege_type, string_agg(column_name, ',' ORDER BY column_name) AS columns
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'verified_candidate_updates' AND grantee IN ('anon', 'authenticated')
GROUP BY grantee, privilege_type ORDER BY grantee, privilege_type;
SELECT (SELECT count(*) FROM public.verified_candidate_updates) AS base_events,
  (SELECT count(*) FROM public.verified_candidate_updates_public) AS public_events,
  (SELECT count(*) FROM public.verified_candidate_updates_public WHERE NOT public.is_public_candidate(candidate_id)) AS private_candidates_exposed;
