-- Run only in an empty disposable PostgreSQL database, from repository root:
-- psql -X -v ON_ERROR_STOP=1 -f tests/verified-candidate-updates-security-invoker.pg.sql
--
-- Proves that 20260916120000 keeps the exact public row set of the owner-executed
-- view from 20260908160000 for every publication state, under the RLS and column
-- ACLs that production has on candidatos and patrimonio.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
INSERT INTO supabase_migrations.schema_migrations VALUES ('20260908160000');
-- Reproduce Supabase's permissive defaults to test explicit revocation.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
CREATE TABLE public.candidatos(id uuid PRIMARY KEY,slug text,nome_urna text,cpf text,publicavel boolean,status text);
CREATE TABLE public.patrimonio(candidato_id uuid,ano_eleicao integer,despublicado_em timestamptz);
CREATE FUNCTION public.is_public_candidate(target_candidate_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public AS 'SELECT EXISTS(SELECT 1 FROM public.candidatos c WHERE c.id=target_candidate_id AND c.publicavel=true AND c.status <> ''removido'')';
-- Production ACL and RLS of the parent tables.
REVOKE ALL ON public.candidatos FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, slug, nome_urna, publicavel, status) ON public.candidatos TO anon, authenticated;
ALTER TABLE public.candidatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON public.candidatos FOR SELECT USING (publicavel = true AND status <> 'removido');
ALTER TABLE public.patrimonio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON public.patrimonio FOR SELECT USING (public.is_public_candidate(candidato_id));
CREATE POLICY publicacao_sem_despublicados ON public.patrimonio AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (despublicado_em IS NULL);
INSERT INTO public.candidatos VALUES
('00000000-0000-0000-0000-000000000001','public-one','Public one','00000000000',true,'candidato'),
('00000000-0000-0000-0000-000000000002','private-two','Private two','00000000000',false,'candidato'),
('00000000-0000-0000-0000-000000000003','public-three','Public three','00000000000',true,'candidato');

\ir ../supabase/migrations/20260908160000_verified_candidate_updates.sql

SET ROLE service_role;
DO $$
DECLARE url text := 'https://divulgacandcontas.tse.jus.br/divulga/';
BEGIN
  PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000001','situacao',2026,'aguardando julgamento',url,'s1');
  PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000001','situacao',2026,'deferido',url,'s1');
  PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000002','situacao',2026,'aguardando julgamento',url,'s2');
  PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000002','situacao',2026,'deferido',url,'s2');
  PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000001','patrimonio',2026,'10',url,'p1');
  PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000001','patrimonio',2026,'20',url,'p1');
  PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000003','patrimonio',2022,'5',url,'p3');
  PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000003','patrimonio',2022,'6',url,'p3');
  PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000003','partido',2026,'AAA',url,'r3');
  PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000003','partido',2026,'BBB',url,'r3');
END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT count(*)=5 FROM public.verified_candidate_updates); END $$;

CREATE SCHEMA proof;
CREATE TABLE proof.visible(phase text, scenario text, role_name text, events text, PRIMARY KEY (phase, scenario, role_name));
-- Events are labelled by slug and field, so expectations do not depend on uuids.
CREATE FUNCTION proof.record(p_phase text, p_view text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE scenario text; role_name text; seen text;
BEGIN
  FOREACH scenario IN ARRAY ARRAY['baseline','sibling_quarantined','all_quarantined','second_year_visible','candidate_unpublished','candidate_removed'] LOOP
    UPDATE public.candidatos SET publicavel = (id <> '00000000-0000-0000-0000-000000000002'), status = 'candidato';
    DELETE FROM public.patrimonio;
    INSERT INTO public.patrimonio VALUES ('00000000-0000-0000-0000-000000000001',2026,null);
    IF scenario = 'sibling_quarantined' THEN
      INSERT INTO public.patrimonio VALUES ('00000000-0000-0000-0000-000000000001',2026,clock_timestamp());
    ELSIF scenario = 'all_quarantined' THEN
      UPDATE public.patrimonio SET despublicado_em = clock_timestamp();
    ELSIF scenario = 'second_year_visible' THEN
      INSERT INTO public.patrimonio VALUES ('00000000-0000-0000-0000-000000000003',2022,null);
    ELSIF scenario = 'candidate_unpublished' THEN
      UPDATE public.candidatos SET publicavel = false WHERE id = '00000000-0000-0000-0000-000000000001';
    ELSIF scenario = 'candidate_removed' THEN
      UPDATE public.candidatos SET status = 'removido' WHERE id = '00000000-0000-0000-0000-000000000003';
    END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','postgres'] LOOP
      PERFORM set_config('role', CASE WHEN role_name = 'postgres' THEN 'none' ELSE role_name END, true);
      EXECUTE format('SELECT coalesce(string_agg(candidate_slug || '':'' || field, '','' ORDER BY candidate_slug, field), '''') FROM %s', p_view) INTO seen;
      PERFORM set_config('role', 'none', true);
      INSERT INTO proof.visible VALUES (p_phase, scenario, role_name, seen);
    END LOOP;
  END LOOP;
END $$;

-- Phase 1: owner-executed view as deployed by 20260908160000.
SELECT proof.record('definer', 'public.verified_candidate_updates_public');
DO $$ BEGIN
  ASSERT NOT EXISTS (
    SELECT scenario, events FROM proof.visible WHERE phase = 'definer'
    EXCEPT
    SELECT * FROM (VALUES
      ('baseline', 'public-one:patrimonio,public-one:situacao,public-three:partido'),
      ('sibling_quarantined', 'public-one:situacao,public-three:partido'),
      ('all_quarantined', 'public-one:situacao,public-three:partido'),
      ('second_year_visible', 'public-one:patrimonio,public-one:situacao,public-three:partido,public-three:patrimonio'),
      ('candidate_unpublished', 'public-three:partido'),
      ('candidate_removed', 'public-one:patrimonio,public-one:situacao')
    ) AS expected(scenario, events)
  ), 'definer view baseline differs from the documented publication gate';
  ASSERT (SELECT count(*) = 24 FROM proof.visible WHERE phase = 'definer');
END $$;

-- Negative control: flipping the view to security_invoker alone leaks history of
-- a quarantined record, because anon cannot see the quarantined sibling row.
-- It also needs base-table grants and a policy, so it runs in a rolled-back transaction.
BEGIN;
GRANT SELECT (id, candidate_id, field, year, before_value, after_value, source_url, detected_at) ON public.verified_candidate_updates TO anon, authenticated;
CREATE POLICY naive_read ON public.verified_candidate_updates FOR SELECT TO anon, authenticated USING (public.is_public_candidate(candidate_id));
ALTER VIEW public.verified_candidate_updates_public SET (security_invoker = true);
SELECT proof.record('naive_invoker', 'public.verified_candidate_updates_public');
DO $$ BEGIN
  ASSERT (SELECT events = 'public-one:patrimonio,public-one:situacao,public-three:partido' FROM proof.visible
    WHERE phase = 'naive_invoker' AND scenario = 'sibling_quarantined' AND role_name = 'anon'),
    'expected the naive invoker view to leak the quarantined record';
END $$;
ROLLBACK;

\ir ../supabase/migrations/20260916120000_verified_candidate_updates_security_invoker.sql
INSERT INTO supabase_migrations.schema_migrations VALUES ('20260916120000');

-- Phase 2: invoker view must match phase 1 for every scenario and role.
SELECT proof.record('invoker', 'public.verified_candidate_updates_public');
DO $$ BEGIN
  ASSERT (SELECT count(*) = 24 FROM proof.visible WHERE phase = 'invoker');
  ASSERT NOT EXISTS (
    (SELECT scenario, role_name, events FROM proof.visible WHERE phase = 'definer'
     EXCEPT SELECT scenario, role_name, events FROM proof.visible WHERE phase = 'invoker')
    UNION ALL
    (SELECT scenario, role_name, events FROM proof.visible WHERE phase = 'invoker'
     EXCEPT SELECT scenario, role_name, events FROM proof.visible WHERE phase = 'definer')
  ), 'invoker view row set diverged from the owner-executed view';
END $$;

-- Invoker semantics, column ACL and direct base-table access through the API roles.
DO $$ BEGIN
  ASSERT (SELECT reloptions @> ARRAY['security_invoker=true'] FROM pg_class WHERE oid = 'public.verified_candidate_updates_public'::regclass);
  ASSERT (SELECT count(*) = 10 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'verified_candidate_updates_public');
END $$;
UPDATE public.candidatos SET publicavel = (id <> '00000000-0000-0000-0000-000000000002'), status = 'candidato';
DELETE FROM public.patrimonio;
INSERT INTO public.patrimonio VALUES ('00000000-0000-0000-0000-000000000001',2026,null);
SET ROLE anon;
DO $$ BEGIN
  ASSERT (SELECT count(*) = 3 FROM public.verified_candidate_updates_public);
  -- The site query: explicit columns, recent first, limited.
  ASSERT (SELECT count(*) = 3 FROM (
    SELECT id, candidate_slug, candidate_name, field, year, before_value, after_value, source_url, detected_at
    FROM public.verified_candidate_updates_public ORDER BY detected_at DESC, id DESC LIMIT 6) s);
  ASSERT (SELECT count(*) = 3 FROM public.verified_candidate_updates);
  BEGIN
    PERFORM source_identity FROM public.verified_candidate_updates;
    RAISE EXCEPTION 'anon read source_identity';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM before_source_url FROM public.verified_candidate_updates;
    RAISE EXCEPTION 'anon read before_source_url';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM 1 FROM public.verified_candidate_observations;
    RAISE EXCEPTION 'anon read observations';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.verified_candidate_updates(candidate_id, field, year, source_identity, before_source_url, before_value, after_value, source_url)
    VALUES ('00000000-0000-0000-0000-000000000001','partido',2026,'x','https://tse.jus.br','A','B','https://tse.jus.br');
    RAISE EXCEPTION 'anon inserted an event';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000001','partido',2026,'x','https://tse.jus.br','source');
    RAISE EXCEPTION 'anon RPC accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- The gate answers only for existing public events.
  ASSERT NOT public.is_public_verified_candidate_update('00000000-0000-0000-0000-00000000ffff');
END $$;
RESET ROLE;
-- The collector keeps writing through its owner-executed RPC after the policy exists.
SET ROLE service_role;
DO $$ BEGIN
  ASSERT public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000003','partido',2026,'CCC','https://tse.jus.br','r3') = 'changed';
END $$;
RESET ROLE;
DELETE FROM public.verified_candidate_updates WHERE after_value = 'CCC';
UPDATE public.verified_candidate_observations SET value = 'BBB' WHERE source_identity = 'r3';

\ir ../supabase/readback/20260916120000_verified_candidate_updates_security_invoker.readback.sql
\ir ../supabase/rollback/20260916120000_verified_candidate_updates_security_invoker.rollback.sql
\ir ../supabase/readback/20260916120000_verified_candidate_updates_security_invoker.rollback.readback.sql

-- Phase 3: rollback restores the owner-executed behavior.
SELECT proof.record('rollback', 'public.verified_candidate_updates_public');
DO $$ BEGIN
  ASSERT NOT EXISTS (
    (SELECT scenario, role_name, events FROM proof.visible WHERE phase = 'definer'
     EXCEPT SELECT scenario, role_name, events FROM proof.visible WHERE phase = 'rollback')
    UNION ALL
    (SELECT scenario, role_name, events FROM proof.visible WHERE phase = 'rollback'
     EXCEPT SELECT scenario, role_name, events FROM proof.visible WHERE phase = 'definer')
  ), 'rollback did not restore the owner-executed row set';
  ASSERT (SELECT count(*) = 24 FROM proof.visible WHERE phase = 'rollback');
END $$;
\ir ../supabase/readback/20260908160000_verified_candidate_updates.readback.sql
SELECT 'PASS invoker parity across publication states, column ACL, collector, readback and rollback' AS result;
