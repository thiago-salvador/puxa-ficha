-- Applied to production 2026-06-02 (Supabase project <projeto-supabase>) during security review.
--
-- Administrative proof (has_table_privilege + aclexplode) showed anon and authenticated held
-- direct INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on public.candidatos and
-- public.candidatos_publico (not via PUBLIC), today blocked only by RLS default-deny. The public
-- site reads via the anon client and writes only through service_role, so removing these write
-- privileges is non-breaking and removes RLS-default-deny as the sole barrier. SELECT is preserved
-- (anon keeps read access to the public view). service_role is untouched. Idempotent.
--
-- Verified post-apply: has_table_privilege(anon, candidatos, INSERT/UPDATE/DELETE)=false;
-- candidatos_publico SELECT for anon still true; service_role unchanged.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON public.candidatos FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON public.candidatos_publico FROM anon, authenticated;
