-- Read-only deployment prerequisite. No quota consumption or raw identifiers.
BEGIN READ ONLY;
DO $$
DECLARE v_role text;
BEGIN
  IF to_regprocedure('public.reserve_request_ip_quota(text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Request quota RPC missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.request_ip_quotas'::regclass) THEN
    RAISE EXCEPTION 'Request quota RLS disabled';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.reserve_request_ip_quota(text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Request quota service role grant missing';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(v_role, 'public.reserve_request_ip_quota(text,integer,integer)', 'EXECUTE')
      OR has_table_privilege(v_role, 'public.request_ip_quotas', 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Request quota public grant drift: %', v_role;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.reserve_request_ip_quota(text,integer,integer)'::regprocedure
    AND prosecdef AND proconfig @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'Request quota function security drift';
  END IF;
END $$;
SELECT to_regprocedure('public.reserve_request_ip_quota(text,integer,integer)') IS NOT NULL AS rpc_present,
  has_function_privilege('service_role', 'public.reserve_request_ip_quota(text,integer,integer)', 'EXECUTE') AS service_can_execute,
  has_function_privilege('anon', 'public.reserve_request_ip_quota(text,integer,integer)', 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', 'public.reserve_request_ip_quota(text,integer,integer)', 'EXECUTE') AS authenticated_can_execute;
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.request_ip_quotas'::regclass;
SELECT count(*) AS buckets, count(*) FILTER (WHERE reset_at < now()) AS expired_buckets FROM public.request_ip_quotas;
ROLLBACK;
