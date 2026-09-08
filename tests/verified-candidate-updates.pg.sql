-- Run only in an empty disposable PostgreSQL database, from repository root:
-- psql -X -v ON_ERROR_STOP=1 -f tests/verified-candidate-updates.pg.sql
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
INSERT INTO supabase_migrations.schema_migrations VALUES ('20260908160000');
CREATE TABLE public.candidatos(id uuid PRIMARY KEY,slug text,nome_urna text,publicavel boolean,status text);
CREATE TABLE public.patrimonio(candidato_id uuid,ano_eleicao integer,despublicado_em timestamptz);
INSERT INTO patrimonio VALUES ('00000000-0000-0000-0000-000000000001',2026,null);
CREATE FUNCTION public.is_public_candidate(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public AS 'SELECT EXISTS(SELECT 1 FROM candidatos WHERE id=$1 AND publicavel AND status <> ''removido'')';
-- Reproduce Supabase's permissive defaults to test explicit revocation.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
INSERT INTO candidatos VALUES ('00000000-0000-0000-0000-000000000001','public-test','Public test',true,'candidato'),
('00000000-0000-0000-0000-000000000002','private-test','Private test',false,'candidato');
\ir ../supabase/migrations/20260908160000_verified_candidate_updates.sql
SET ROLE service_role;
DO $$
DECLARE result text; candidate uuid := '00000000-0000-0000-0000-000000000001'; bad_url text;
BEGIN
  result := public.observe_verified_candidate_change(candidate,'patrimonio',2026,'0','https://divulgacandcontas.tse.jus.br/divulga/','election-2026');
  ASSERT result='baseline';
  ASSERT (SELECT count(*)=0 FROM public.verified_candidate_updates);
  result := public.observe_verified_candidate_change(candidate,'patrimonio',2026,'0','https://divulgacandcontas.tse.jus.br/divulga/','election-2026');
  ASSERT result='unchanged';
  result := public.observe_verified_candidate_change(candidate,'patrimonio',2026,'100','https://divulgacandcontas.tse.jus.br/divulga/','election-2026');
  ASSERT result='changed';
  ASSERT (SELECT count(*)=1 FROM public.verified_candidate_updates WHERE before_value='0.00' AND after_value='100.00' AND detected_at<=clock_timestamp() AND before_source_url='https://divulgacandcontas.tse.jus.br/divulga/' AND source_identity='election-2026');
  result := public.observe_verified_candidate_change(candidate,'patrimonio',2026,'100','https://tse.jus.br','election-2026');
  ASSERT result='unchanged';
  ASSERT (SELECT source_url='https://tse.jus.br' FROM public.verified_candidate_observations WHERE candidate_id=candidate AND field='patrimonio' AND year=2026);
  result := public.observe_verified_candidate_change(candidate,'patrimonio',2022,'20','https://tse.jus.br','election-2022');
  ASSERT result='baseline';
  FOREACH bad_url IN ARRAY ARRAY['https://tse.jus.br.evil.com/x','http://tse.jus.br','https://tse.jus.br@evil.com','https://evil.com/tse.jus.br','https://tse.jus.br\@evil.com','https://tse.jus.br/'||chr(10)||'bad'] LOOP
    BEGIN
      PERFORM public.observe_verified_candidate_change(candidate,'partido',2026,'TEST',bad_url,'source');
      RAISE EXCEPTION 'Invalid URL accepted: %',bad_url;
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  BEGIN
    PERFORM public.observe_verified_candidate_change(candidate,'unknown',2026,'x','https://tse.jus.br','source');
    RAISE EXCEPTION 'Invalid field accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.observe_verified_candidate_change(candidate,'partido',2026,'  ','https://tse.jus.br','source');
    RAISE EXCEPTION 'Empty value accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  FOREACH bad_url IN ARRAY ARRAY['-1','NaN','1.234','Infinity'] LOOP
    BEGIN
      PERFORM public.observe_verified_candidate_change(candidate,'patrimonio',2026,bad_url,'https://tse.jus.br','source');
      RAISE EXCEPTION 'Invalid wealth accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  BEGIN
    PERFORM public.observe_verified_candidate_change(candidate,'situacao',2026,'inventado','https://tse.jus.br','source');
    RAISE EXCEPTION 'Invalid status accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000002','situacao',2026,'aguardando julgamento','https://tse.jus.br','private');
  PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000002','situacao',2026,'deferido','https://tse.jus.br','private');
END $$;
RESET ROLE;
DO $$
DECLARE role_name text; privilege_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    ASSERT NOT has_function_privilege(role_name,'public.observe_verified_candidate_change(uuid,text,integer,text,text,text)','EXECUTE');
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      ASSERT NOT has_table_privilege(role_name,'public.verified_candidate_observations',privilege_name);
      ASSERT NOT has_table_privilege(role_name,'public.verified_candidate_updates',privilege_name);
      IF privilege_name <> 'SELECT' THEN
        ASSERT NOT has_table_privilege(role_name,'public.verified_candidate_updates_public',privilege_name);
      END IF;
    END LOOP;
  END LOOP;
  ASSERT (SELECT count(*)=10 FROM information_schema.columns WHERE table_name='verified_candidate_updates_public');
END $$;
SET ROLE anon;
DO $$ BEGIN
  ASSERT (SELECT count(*)=1 FROM public.verified_candidate_updates_public);
  ASSERT (SELECT candidate_slug='public-test' FROM public.verified_candidate_updates_public);
  BEGIN
    PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000001','partido',2026,'x','https://tse.jus.br','source');
    RAISE EXCEPTION 'Anon RPC accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE patrimonio SET despublicado_em=clock_timestamp();
SET ROLE anon;
DO $$ BEGIN ASSERT (SELECT count(*)=0 FROM public.verified_candidate_updates_public); END $$;
RESET ROLE;
UPDATE patrimonio SET despublicado_em=null;
INSERT INTO patrimonio VALUES ('00000000-0000-0000-0000-000000000001',2026,clock_timestamp());
SET ROLE anon;
DO $$ BEGIN ASSERT (SELECT count(*)=0 FROM public.verified_candidate_updates_public); END $$;
RESET ROLE;
DELETE FROM patrimonio WHERE despublicado_em IS NOT NULL;
SET ROLE anon;
DO $$ BEGIN ASSERT (SELECT count(*)=1 FROM public.verified_candidate_updates_public); END $$;
RESET ROLE;
UPDATE candidatos SET publicavel=false;
SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*)=0 FROM public.verified_candidate_updates_public); END $$;
RESET ROLE;
\ir ../supabase/readback/20260908160000_verified_candidate_updates.readback.sql
\ir ../supabase/rollback/20260908160000_verified_candidate_updates.rollback.sql
\ir ../supabase/readback/20260908160000_verified_candidate_updates.rollback.readback.sql
DO $$ BEGIN
  ASSERT to_regclass('public.verified_candidate_updates') IS NULL;
  ASSERT to_regclass('public.verified_candidate_observations') IS NULL;
  ASSERT to_regclass('public.verified_candidate_updates_public') IS NULL;
END $$;
SELECT 'PASS baseline, duplicate, change, validation, publication gate, privileges, rollback' AS result;
