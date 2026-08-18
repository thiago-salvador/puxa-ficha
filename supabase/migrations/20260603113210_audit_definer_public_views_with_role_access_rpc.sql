-- Applied to production 2026-06-03 (Supabase project <projeto-supabase>) during security review.
--
-- Read-only audit RPC powering the Supabase security-advisor CI gate (scripts/check-supabase-advisors.ts).
-- Returns public VIEWS that are SECURITY DEFINER (no security_invoker=true) AND readable (SELECT) by
-- the anon or authenticated role -- the exact leak shape that exposed
-- candidatos_identidade_tier1_auditavel. SECURITY DEFINER so it can read pg_catalog; pinned
-- search_path; locked to service_role (the gate runs with the service role). Read-only, no side effects.
-- Idempotent (CREATE OR REPLACE + REVOKE/GRANT).
CREATE OR REPLACE FUNCTION public.audit_definer_public_views_with_role_access()
RETURNS TABLE(view_name text, anon_select boolean, authenticated_select boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT c.relname::text AS view_name,
         pg_catalog.has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
         pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'v'
    AND COALESCE(array_to_string(c.reloptions, ','), '') NOT LIKE '%security_invoker=true%'
    AND (
      pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')
      OR pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
    )
  ORDER BY c.relname;
$$;

REVOKE ALL ON FUNCTION public.audit_definer_public_views_with_role_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_definer_public_views_with_role_access() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_definer_public_views_with_role_access() TO service_role;
