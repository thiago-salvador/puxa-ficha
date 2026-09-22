-- Run only in an empty disposable PostgreSQL database, from repository root:
-- psql -X -v ON_ERROR_STOP=1 -f tests/compromisso-evidencia.pg.sql
--
-- Proves that 20260922130000 keeps compromisso_evidencia private, that the public
-- view only returns verified 'sustenta'/'relacionada' rows of public candidates,
-- that a verified row requires a review record, and that rollback removes everything.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
-- Reproduce Supabase's permissive defaults to test explicit revocation.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
CREATE TABLE public.candidatos(id uuid PRIMARY KEY,slug text,publicavel boolean,status text);
CREATE FUNCTION public.is_public_candidate(target_candidate_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public AS 'SELECT EXISTS(SELECT 1 FROM public.candidatos c WHERE c.id=target_candidate_id AND c.publicavel=true AND c.status <> ''removido'')';
GRANT EXECUTE ON FUNCTION public.is_public_candidate(uuid) TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
INSERT INTO public.candidatos VALUES
('00000000-0000-0000-0000-000000000001','publico',true,'candidato'),
('00000000-0000-0000-0000-000000000002','privado',false,'candidato');

\ir ../supabase/migrations/20260922130000_compromisso_evidencia.sql

SET ROLE service_role;
INSERT INTO public.compromisso_evidencia
  (candidato_id, programa_chave, frase_id, tema_id, tipo_evidencia, evidencia_ref, relacao, origem, probabilidade, verificado, revisado_por, revisado_em, motivo)
VALUES
  ('00000000-0000-0000-0000-000000000001','2026:PRESIDENTE:BR:280002542548','0123456789abcdef','economia','votacao_chave','v-sustenta','sustenta','jev_sombra',0.91,true,'revisor','2026-09-22T12:00:00Z','voto nominal trata do mesmo compromisso'),
  ('00000000-0000-0000-0000-000000000001','2026:PRESIDENTE:BR:280002542548',NULL,'economia','fala','f-relacionada','relacionada','curadoria',NULL,true,'revisor','2026-09-22T12:00:00Z','fala trata do tema, sem medir cumprimento'),
  ('00000000-0000-0000-0000-000000000001','2026:PRESIDENTE:BR:280002542548',NULL,'economia','projeto_lei','p-contradiz','contradiz','jev_sombra',0.80,true,'revisor','2026-09-22T12:00:00Z','contradiz fica restrito a revisao na v1'),
  ('00000000-0000-0000-0000-000000000001','2026:PRESIDENTE:BR:280002542548',NULL,'economia','posicao_declarada','pd-pendente','sustenta','jev_sombra',0.70,false,NULL,NULL,NULL),
  ('00000000-0000-0000-0000-000000000002','2026:GOVERNADOR:SP:250002500000',NULL,'saude','fala','f-privado','sustenta','curadoria',NULL,true,'revisor','2026-09-22T12:00:00Z','candidato despublicado nao aparece');
DO $$ BEGIN ASSERT (SELECT count(*) = 5 FROM public.compromisso_evidencia); END $$;
DO $$ BEGIN
  ASSERT (SELECT array_agg(evidencia_ref ORDER BY evidencia_ref) = ARRAY['f-relacionada','v-sustenta']
          FROM public.compromisso_evidencia_publica), 'view publica para service_role';
END $$;
RESET ROLE;

-- Constraints: verified row needs review; shadow row needs probability; target required; duplicate rejected.
DO $$
DECLARE failures int := 0;
BEGIN
  BEGIN
    INSERT INTO public.compromisso_evidencia (candidato_id, programa_chave, tema_id, tipo_evidencia, evidencia_ref, relacao, origem, verificado)
    VALUES ('00000000-0000-0000-0000-000000000001','2026:PRESIDENTE:BR:280002542548','economia','fala','x1','sustenta','curadoria',true);
  EXCEPTION WHEN check_violation THEN failures := failures + 1; END;
  BEGIN
    INSERT INTO public.compromisso_evidencia (candidato_id, programa_chave, tema_id, tipo_evidencia, evidencia_ref, relacao, origem)
    VALUES ('00000000-0000-0000-0000-000000000001','2026:PRESIDENTE:BR:280002542548','economia','fala','x2','sustenta','jev_sombra');
  EXCEPTION WHEN check_violation THEN failures := failures + 1; END;
  BEGIN
    INSERT INTO public.compromisso_evidencia (candidato_id, programa_chave, tipo_evidencia, evidencia_ref, relacao, origem)
    VALUES ('00000000-0000-0000-0000-000000000001','2026:PRESIDENTE:BR:280002542548','fala','x3','sustenta','curadoria');
  EXCEPTION WHEN check_violation THEN failures := failures + 1; END;
  BEGIN
    INSERT INTO public.compromisso_evidencia (candidato_id, programa_chave, tema_id, tipo_evidencia, evidencia_ref, relacao, origem)
    VALUES ('00000000-0000-0000-0000-000000000001','2026:PRESIDENTE:BR:280002542548','economia','fala','f-relacionada','sustenta','curadoria');
  EXCEPTION WHEN unique_violation THEN failures := failures + 1; END;
  BEGIN
    INSERT INTO public.compromisso_evidencia (candidato_id, programa_chave, tema_id, tipo_evidencia, evidencia_ref, relacao, origem)
    VALUES ('00000000-0000-0000-0000-000000000001','2026:PRESIDENTE:BR:280002542548','economia','fala','x5','cumpriu','curadoria');
  EXCEPTION WHEN check_violation THEN failures := failures + 1; END;
  ASSERT failures = 5, format('esperava 5 rejeicoes, veio %s', failures);
END $$;

-- anon and authenticated cannot read the table nor, while closed, the view.
CREATE SCHEMA proof;
CREATE FUNCTION proof.negado(p_role text, p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  EXECUTE p_sql;
  RESET ROLE;
  RETURN false;
EXCEPTION WHEN insufficient_privilege THEN
  RESET ROLE;
  RETURN true;
END $$;
DO $$ BEGIN
  ASSERT proof.negado('anon', 'SELECT count(*) FROM public.compromisso_evidencia'), 'anon leu a tabela';
  ASSERT proof.negado('authenticated', 'SELECT count(*) FROM public.compromisso_evidencia'), 'authenticated leu a tabela';
  ASSERT proof.negado('anon', 'SELECT count(*) FROM public.compromisso_evidencia_publica'), 'view aberta antes da migration de abertura';
  ASSERT proof.negado('anon', 'INSERT INTO public.compromisso_evidencia (candidato_id, programa_chave, tema_id, tipo_evidencia, evidencia_ref, relacao, origem) VALUES (''00000000-0000-0000-0000-000000000001'',''2026:PRESIDENTE:BR:280002542548'',''economia'',''fala'',''anon'',''sustenta'',''curadoria'')'), 'anon escreveu';
END $$;

-- Simulated opening (the shape a later migration would use): even with column grant
-- and a policy on the same filter, anon sees only the two publishable rows.
BEGIN;
GRANT SELECT (id, candidato_id, programa_chave, frase_id, tema_id, tipo_evidencia, evidencia_ref, relacao, revisado_em)
  ON public.compromisso_evidencia TO anon;
CREATE POLICY abertura_simulada ON public.compromisso_evidencia FOR SELECT TO anon
  USING (public.is_public_compromisso_evidencia(id));
SET LOCAL ROLE anon;
DO $$ BEGIN
  ASSERT (SELECT array_agg(evidencia_ref ORDER BY evidencia_ref) = ARRAY['f-relacionada','v-sustenta']
          FROM public.compromisso_evidencia_publica), 'view publica para anon apos abertura';
  ASSERT (SELECT count(*) = 2 FROM public.compromisso_evidencia), 'tabela aberta vaza linha fora do filtro';
END $$;
ROLLBACK;

\ir ../supabase/readback/20260922130000_compromisso_evidencia.readback.sql
\ir ../supabase/rollback/20260922130000_compromisso_evidencia.rollback.sql
\ir ../supabase/readback/20260922130000_compromisso_evidencia.rollback.readback.sql
SELECT 'PASS compromisso_evidencia: tabela privada, view filtrada, constraints, readback e rollback' AS result;
