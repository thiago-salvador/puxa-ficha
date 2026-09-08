DO $$
DECLARE role_name text; privilege_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(role_name,'public.observe_verified_candidate_change(uuid,text,integer,text,text,text)','EXECUTE') THEN
      RAISE EXCEPTION 'H12: public RPC execution granted';
    END IF;
    IF NOT has_table_privilege(role_name,'public.verified_candidate_updates_public','SELECT') THEN
      RAISE EXCEPTION 'H12: public feed cannot be read';
    END IF;
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(role_name,'public.verified_candidate_observations',privilege_name)
        OR has_table_privilege(role_name,'public.verified_candidate_updates',privilege_name)
        OR (privilege_name <> 'SELECT' AND has_table_privilege(role_name,'public.verified_candidate_updates_public',privilege_name)) THEN
        RAISE EXCEPTION 'H12: unexpected public privilege % %',role_name,privilege_name;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT has_function_privilege('service_role','public.observe_verified_candidate_change(uuid,text,integer,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'H12: collector RPC denied';
  END IF;
  IF EXISTS (SELECT 1 FROM public.verified_candidate_updates_public WHERE NOT public.is_public_candidate(candidate_id)) THEN
    RAISE EXCEPTION 'H12: private candidate exposed';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.verified_candidate_observations'::regclass,'public.verified_candidate_updates'::regclass) AND NOT relrowsecurity) THEN
    RAISE EXCEPTION 'H12: private table RLS disabled';
  END IF;
END $$;
SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name IN ('verified_candidate_updates_public','verified_candidate_updates','verified_candidate_observations')
ORDER BY table_name,grantee,privilege_type;
SELECT count(*) AS private_candidates_exposed FROM public.verified_candidate_updates_public
WHERE NOT public.is_public_candidate(candidate_id);
SELECT has_function_privilege('anon','public.observe_verified_candidate_change(uuid,text,integer,text,text,text)','EXECUTE') AS anon_can_write,
has_function_privilege('authenticated','public.observe_verified_candidate_change(uuid,text,integer,text,text,text)','EXECUTE') AS authenticated_can_write,
has_function_privilege('service_role','public.observe_verified_candidate_change(uuid,text,integer,text,text,text)','EXECUTE') AS collector_can_write;
