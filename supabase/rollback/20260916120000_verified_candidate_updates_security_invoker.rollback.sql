-- Restaura a view executada pelo dono de 20260908160000. Não apaga dados.
BEGIN;
CREATE OR REPLACE VIEW public.verified_candidate_updates_public WITH (security_barrier = true) AS
SELECT u.id,u.candidate_id,c.slug AS candidate_slug,c.nome_urna AS candidate_name,
  u.field,u.year,u.before_value,u.after_value,u.source_url,u.detected_at
FROM public.verified_candidate_updates u JOIN public.candidatos c ON c.id=u.candidate_id
WHERE public.is_public_candidate(u.candidate_id)
AND (u.field <> 'patrimonio' OR EXISTS (
  SELECT 1 FROM public.patrimonio p WHERE p.candidato_id=u.candidate_id
  AND p.ano_eleicao=u.year AND p.despublicado_em IS NULL
) AND NOT EXISTS (
  -- A visible sibling row cannot authorize history from a quarantined record.
  SELECT 1 FROM public.patrimonio p WHERE p.candidato_id=u.candidate_id
  AND p.ano_eleicao=u.year AND p.despublicado_em IS NOT NULL
));
ALTER VIEW public.verified_candidate_updates_public RESET (security_invoker);
REVOKE ALL ON public.verified_candidate_updates_public FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.verified_candidate_updates_public TO anon, authenticated, service_role;
DROP POLICY verified_candidate_updates_public_read ON public.verified_candidate_updates;
REVOKE ALL ON public.verified_candidate_updates FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.is_public_verified_candidate_update(uuid);
DO $$ BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    DELETE FROM supabase_migrations.schema_migrations WHERE version='20260916120000';
  END IF;
END $$;
COMMIT;
