BEGIN;

REVOKE ALL ON TABLE public.analytics_launch_events FROM PUBLIC;
REVOKE ALL ON TABLE public.analytics_launch_events FROM anon;
REVOKE ALL ON TABLE public.analytics_launch_events FROM authenticated;

GRANT SELECT, INSERT ON TABLE public.analytics_launch_events TO service_role;

COMMENT ON TABLE public.analytics_launch_events IS
  'Audit sink for launch-critical public analytics events. Insert/readback via Next API and service role only; anon/authenticated clients have no table grants.';

COMMIT;
