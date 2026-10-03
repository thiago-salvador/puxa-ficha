-- Disposable PG17 database only. No production connection.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
INSERT INTO supabase_migrations.schema_migrations VALUES ('20260908160000'), ('20260924003000');
CREATE TABLE public.candidatos(
  id uuid PRIMARY KEY, slug text, nome_urna text, publicavel boolean, status text,
  situacao_candidatura text,
  CONSTRAINT candidatos_situacao_candidatura_dominio CHECK (situacao_candidatura IN (
    'aguardando julgamento',
    'candidatura declarada',
    'incerto',
    'deferido',
    'deferido com recurso',
    'indeferido',
    'indeferido com recurso',
    'pendente de julgamento'
  ))
);
CREATE TABLE public.patrimonio(candidato_id uuid,ano_eleicao integer,despublicado_em timestamptz);
CREATE FUNCTION public.is_public_candidate(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public AS 'SELECT EXISTS(SELECT 1 FROM candidatos WHERE id=$1 AND publicavel AND status <> ''removido'')';
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
INSERT INTO candidatos VALUES
  ('00000000-0000-0000-0000-000000000001','public-test','Public test',true,'candidato','pendente de julgamento');
\ir ../supabase/migrations/20260908160000_verified_candidate_updates.sql

\ir ../supabase/migrations/20260924120000_verified_history_situacao_dominio.sql
CREATE TEMP TABLE rpc_acl_before AS SELECT proacl,prosecdef,proconfig FROM pg_proc WHERE oid='public.observe_verified_candidate_change(uuid,text,integer,text,text,text)'::regprocedure;
\ir ../supabase/migrations/20261002180000_vocabulario_situacao_renuncia.sql
DO $$ BEGIN
  ASSERT (SELECT (p.proacl,p.prosecdef,p.proconfig) IS NOT DISTINCT FROM (b.proacl,b.prosecdef,b.proconfig) FROM pg_proc p CROSS JOIN rpc_acl_before b WHERE p.oid='public.observe_verified_candidate_change(uuid,text,integer,text,text,text)'::regprocedure), 'RPC ACL or security changed';
END $$;
SET ROLE service_role;
DO $$
DECLARE candidate uuid := '00000000-0000-0000-0000-000000000001'; value text; n integer := 0;
BEGIN
  FOREACH value IN ARRAY ARRAY['aguardando julgamento','candidatura declarada','incerto','deferido','deferido com recurso','indeferido','indeferido com recurso','pendente de julgamento','renuncia'] LOOP
    n := n+1;
    ASSERT public.observe_verified_candidate_change(candidate,'situacao',2026,value,'https://tse.jus.br','domain:'||n) = 'baseline', value;
  END LOOP;
  ASSERT public.observe_verified_candidate_change(candidate,'situacao',2026,'deferido','https://tse.jus.br','transition') = 'baseline';
  ASSERT public.observe_verified_candidate_change(candidate,'situacao',2026,'renuncia','https://tse.jus.br','transition') = 'changed';
  ASSERT public.observe_verified_candidate_change(candidate,'situacao',2026,' RENUNCIA ','https://tse.jus.br','transition') = 'unchanged';
  ASSERT (SELECT count(*)=1 FROM verified_candidate_updates WHERE source_identity='transition' AND before_value='deferido' AND after_value='renuncia');
  FOREACH value IN ARRAY ARRAY['cancelado','falecido','cassado','apto','pendente','inventado','pre-candidato'] LOOP
    BEGIN
      PERFORM public.observe_verified_candidate_change(candidate,'situacao',2026,value,'https://tse.jus.br','rejected');
      RAISE EXCEPTION 'unsupported status accepted: %',value;
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000001','situacao',2026,'renuncia','https://tse.jus.br','anon');
    RAISE EXCEPTION 'anon unexpectedly executed collector RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
\ir ../supabase/readback/20261002180000_vocabulario_situacao_renuncia.readback.sql
SELECT 'ISSUE646_RPC_DOMAIN_ACL_READBACK_PASS' AS status;
