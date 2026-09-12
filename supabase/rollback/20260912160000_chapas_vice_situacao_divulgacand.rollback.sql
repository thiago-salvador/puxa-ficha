-- Reverter o app antes. RESTRICT recusa dependências desconhecidas; nunca CASCADE.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.chapas_2026 IN ACCESS EXCLUSIVE MODE;
DO $guard$ BEGIN
IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260912160000'
OR EXISTS (SELECT 1 FROM public.chapas_2026 WHERE vice_situacao_divulgacand IS NOT NULL)
OR (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.chapas_2026_publico'::regclass)<>'postgres'
OR (SELECT relacl::text FROM pg_class WHERE oid='public.chapas_2026_publico'::regclass) IS DISTINCT FROM '{postgres=arwdDxtm/postgres,anon=r/postgres,authenticated=r/postgres,service_role=arwdDxtm/postgres}'
THEN RAISE EXCEPTION 'vice schema rollback: estado divergiu'; END IF;
END $guard$;
DROP VIEW public.chapas_2026_publico RESTRICT;
CREATE VIEW public.chapas_2026_publico WITH (security_invoker=true) AS
SELECT ch.chave, ch.eleicao_codigo, ch.eleicao_data, ch.uf, ch.cargo_titular,
ch.identidade_status, ch.vinculo_titular_status, ch.tse_situacao_codigo,
ch.titular_candidato_id, titular.slug AS titular_slug, ch.titular_nome_completo,
ch.titular_nome_urna, ch.titular_partido_sigla, ch.vice_candidato_id, vice.slug AS vice_slug,
ch.vice_nome_completo, ch.vice_nome_urna, ch.vice_partido_sigla, ch.fonte_url,
ch.fonte_sha256, ch.snapshot_em
FROM public.chapas_2026 ch
LEFT JOIN public.candidatos_publico titular ON titular.id=ch.titular_candidato_id
LEFT JOIN public.candidatos_publico vice ON vice.id=ch.vice_candidato_id
WHERE ch.identidade_status='confirmada' AND titular.id IS NOT NULL;
ALTER VIEW public.chapas_2026_publico OWNER TO postgres;
REVOKE ALL ON public.chapas_2026_publico FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.chapas_2026_publico TO anon, authenticated;
GRANT ALL ON public.chapas_2026_publico TO service_role;
COMMENT ON VIEW public.chapas_2026_publico IS 'Chapas confirmadas de titulares públicos. Histórico e chapas substituídas preservados na base.';
ALTER TABLE public.chapas_2026 DROP COLUMN vice_situacao_divulgacand;
DELETE FROM supabase_migrations.schema_migrations WHERE version='20260912160000';
COMMIT;
