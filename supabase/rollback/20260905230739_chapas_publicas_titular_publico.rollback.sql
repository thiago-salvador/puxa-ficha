-- Separate approved rollback. CAS rejects an intervening view definition.
BEGIN;
CREATE TEMP VIEW freshness_expected_view AS
SELECT ch.chave,ch.eleicao_codigo,ch.eleicao_data,ch.uf,ch.cargo_titular,
       ch.identidade_status,ch.vinculo_titular_status,ch.tse_situacao_codigo,
       ch.titular_candidato_id,titular.slug AS titular_slug,ch.titular_nome_completo,
       ch.titular_nome_urna,ch.titular_partido_sigla,ch.vice_candidato_id,
       vice.slug AS vice_slug,ch.vice_nome_completo,ch.vice_nome_urna,
       ch.vice_partido_sigla,ch.fonte_url,ch.fonte_sha256,ch.snapshot_em
FROM public.chapas_2026 ch
LEFT JOIN public.candidatos_publico titular ON titular.id=ch.titular_candidato_id
LEFT JOIN public.candidatos_publico vice ON vice.id=ch.vice_candidato_id
WHERE ch.identidade_status = 'confirmada' AND titular.id IS NOT NULL;
DO $$ BEGIN
  IF pg_get_viewdef('public.chapas_2026_publico'::regclass,true) IS DISTINCT FROM pg_get_viewdef('pg_temp.freshness_expected_view'::regclass,true)
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.chapas_2026_publico'::regclass AND reloptions @> ARRAY['security_invoker=true']) THEN
    RAISE EXCEPTION 'freshness-closeout: chapa view drift; refused';
  END IF;
END $$;
DROP VIEW pg_temp.freshness_expected_view;
CREATE OR REPLACE VIEW public.chapas_2026_publico WITH(security_invoker=true) AS
SELECT ch.chave,ch.eleicao_codigo,ch.eleicao_data,ch.uf,ch.cargo_titular,
       ch.identidade_status,ch.vinculo_titular_status,ch.tse_situacao_codigo,
       ch.titular_candidato_id,titular.slug AS titular_slug,ch.titular_nome_completo,
       ch.titular_nome_urna,ch.titular_partido_sigla,ch.vice_candidato_id,
       vice.slug AS vice_slug,ch.vice_nome_completo,ch.vice_nome_urna,
       ch.vice_partido_sigla,ch.fonte_url,ch.fonte_sha256,ch.snapshot_em
FROM public.chapas_2026 ch
LEFT JOIN public.candidatos_publico titular ON titular.id=ch.titular_candidato_id
LEFT JOIN public.candidatos_publico vice ON vice.id=ch.vice_candidato_id
WHERE ch.identidade_status = 'confirmada';
COMMENT ON VIEW public.chapas_2026_publico IS 'Chapas 2026 com identidade confirmada. Duplicidades oficiais e substituições não resolvidas ficam fail-closed fora da superfície pública.';
COMMIT;
