-- Applied to production 2026-06-02 (Supabase project <projeto-supabase>) during security review.
--
-- public.candidatos_identidade_tier1_auditavel was SECURITY DEFINER with SELECT granted to anon
-- and no `publicavel` filter, so anonymous clients could read 5 unpublished pre-candidatos
-- (publicavel=false: ciro-gomes, geraldo-alckmin, nikolas-ferreira, ratinho-junior, ricardo-nunes),
-- bypassing the candidatos RLS fail-closed gate. This view is a DB-direct audit/observability
-- surface (curadoria interna), consumed only by service_role (verify:tier1:parity), never public.
--
-- Fix: run the view under the querying role (security_invoker) AND remove anon/authenticated read
-- access; service_role retains access. Both statements are idempotent.
--
-- Verified post-apply: reloptions=[security_invoker=true]; has_table_privilege(anon, SELECT)=false;
-- has_table_privilege(service_role, SELECT)=true; security advisor security_definer_view ERROR cleared.

ALTER VIEW public.candidatos_identidade_tier1_auditavel SET (security_invoker = true);
REVOKE SELECT ON public.candidatos_identidade_tier1_auditavel FROM anon, authenticated;
