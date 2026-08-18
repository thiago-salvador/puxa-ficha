-- Supabase Advisor hardening and public profile query indexes.
--
-- Scope:
-- - Fix function search_path warnings.
-- - Remove public execution from trigger-only SECURITY DEFINER function.
-- - Convert is_public_candidate to SECURITY INVOKER with minimal column grants
--   needed for public RLS checks.
-- - Move pg_trgm out of public when present.
-- - Drop non-constraint duplicate indexes.
-- - Add composite indexes proven by EXPLAIN to avoid candidate-scoped sorts.
--
-- Intentionally not included here:
-- - Setting public profile views to security_invoker. Those views depend on
--   sanitized access to raw tables and need a separate public surface redesign.

ALTER FUNCTION public.alert_subscribers_set_updated_at()
  SET search_path TO public;

ALTER FUNCTION public.normalize_for_search(text)
  SET search_path TO public;

REVOKE EXECUTE ON FUNCTION public.alert_subscribers_set_updated_at()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alert_subscribers_set_updated_at()
  TO postgres, service_role;

REVOKE EXECUTE ON FUNCTION public.log_candidate_change()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_candidate_change()
  TO postgres, service_role;

GRANT SELECT (id, publicavel, status) ON TABLE public.candidatos
  TO anon, authenticated;

ALTER FUNCTION public.is_public_candidate(uuid)
  SECURITY INVOKER;

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm'
      AND n.nspname <> 'extensions'
  ) THEN
    EXECUTE 'ALTER EXTENSION pg_trgm SET SCHEMA extensions';
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_noticias_candidato_url;
DROP INDEX IF EXISTS public.idx_projetos_candidato_propid;

CREATE INDEX IF NOT EXISTS idx_noticias_candidato_id_data_publicacao_desc
  ON public.noticias_candidato (candidato_id, data_publicacao DESC);

CREATE INDEX IF NOT EXISTS idx_projetos_lei_candidato_ano_desc
  ON public.projetos_lei (candidato_id, ano DESC);
