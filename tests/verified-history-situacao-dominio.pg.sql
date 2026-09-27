-- Run only in an empty disposable PostgreSQL database, from repository root,
-- through scripts/audit/provar-verified-history-situacao-dominio-pg17.sh:
--   fase=antes  monta o banco com a RPC original e reproduz a falha;
--   fase=depois confere a RPC trocada, o readback avulso e o rollback.
SELECT :'fase' = 'antes' AS antes \gset
\if :antes
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
SET ROLE service_role;
DO $$
DECLARE candidate uuid := '00000000-0000-0000-0000-000000000001'; mensagem text;
BEGIN
  ASSERT public.observe_verified_candidate_change(candidate,'situacao',2026,'aguardando julgamento','https://tse.jus.br','2026:1:RN') = 'baseline';
  -- A falha da coleta semanal: o valor já está no domínio da coluna e a RPC recusa.
  BEGIN
    PERFORM public.observe_verified_candidate_change(candidate,'situacao',2026,'pendente de julgamento','https://tse.jus.br','2026:1:RN');
    RAISE EXCEPTION 'original RPC unexpectedly accepted pendente de julgamento';
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS mensagem = MESSAGE_TEXT;
    ASSERT mensagem = 'Invalid verified registration status', mensagem;
  END;
END $$;
RESET ROLE;
SELECT 'PASS reproduced: original RPC rejects pendente de julgamento' AS status;
\else
SET ROLE service_role;
DO $$
DECLARE candidate uuid := '00000000-0000-0000-0000-000000000001'; valor text; mensagem text; n integer := 0;
BEGIN
  -- A transição que antes falhava vira evento do histórico.
  ASSERT public.observe_verified_candidate_change(candidate,'situacao',2026,'pendente de julgamento','https://tse.jus.br','2026:1:RN') = 'changed';
  ASSERT (SELECT count(*) = 1 FROM public.verified_candidate_updates
          WHERE candidate_id = candidate AND field = 'situacao'
            AND before_value = 'aguardando julgamento' AND after_value = 'pendente de julgamento');
  -- Normalização igual à original: caixa e espaços não criam evento.
  ASSERT public.observe_verified_candidate_change(candidate,'situacao',2026,'  Pendente de Julgamento ','https://tse.jus.br','2026:1:RN') = 'unchanged';
  -- Todo o domínio passa, cada valor numa identidade própria.
  FOREACH valor IN ARRAY ARRAY['aguardando julgamento','candidatura declarada','incerto','deferido','deferido com recurso','indeferido','indeferido com recurso','pendente de julgamento'] LOOP
    n := n + 1;
    ASSERT public.observe_verified_candidate_change(candidate,'situacao',2026,valor,'https://tse.jus.br','dominio:'||n) = 'baseline', valor;
  END LOOP;
  -- Fora do domínio continua rejeitado, pela mesma regra.
  FOREACH valor IN ARRAY ARRAY['renuncia','cancelado','falecido','cassado','apto','pendente','inventado','pre-candidato'] LOOP
    BEGIN
      PERFORM public.observe_verified_candidate_change(candidate,'situacao',2026,valor,'https://tse.jus.br','fora');
      RAISE EXCEPTION 'out-of-domain status accepted: %', valor;
    EXCEPTION WHEN invalid_parameter_value THEN
      GET STACKED DIAGNOSTICS mensagem = MESSAGE_TEXT;
      ASSERT mensagem = 'Invalid verified registration status', mensagem;
    END;
  END LOOP;
  ASSERT NOT EXISTS (SELECT 1 FROM public.verified_candidate_observations WHERE source_identity = 'fora');
  -- Os outros campos não mudaram de regra.
  ASSERT public.observe_verified_candidate_change(candidate,'patrimonio',2026,'10','https://tse.jus.br','p') = 'baseline';
  BEGIN
    PERFORM public.observe_verified_candidate_change(candidate,'partido',2026,'abc','https://tse.jus.br','x');
    RAISE EXCEPTION 'lowercase party accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.observe_verified_candidate_change(candidate,'situacao',2026,'deferido','https://evil.com/tse.jus.br','x');
    RAISE EXCEPTION 'untrusted URL accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    ASSERT NOT has_function_privilege(role_name,'public.observe_verified_candidate_change(uuid,text,integer,text,text,text)','EXECUTE');
  END LOOP;
  ASSERT has_function_privilege('service_role','public.observe_verified_candidate_change(uuid,text,integer,text,text,text)','EXECUTE');
  ASSERT (SELECT prosecdef AND proconfig = ARRAY['search_path=pg_catalog, public'] FROM pg_proc
          WHERE oid = 'public.observe_verified_candidate_change(uuid,text,integer,text,text,text)'::regprocedure);
END $$;
SELECT 'PASS fixed RPC accepts the whole domain and still rejects the rest' AS status;
-- Readback avulso, em transação somente leitura, como o runner roda no fim.
\ir ../supabase/readback/20260924120000_verified_history_situacao_dominio.readback.sql
-- Rollback e o readback dele.
\ir ../supabase/rollback/20260924120000_verified_history_situacao_dominio.rollback.sql
\ir ../supabase/readback/20260924120000_verified_history_situacao_dominio.rollback.readback.sql
-- O readback do apply reprova a RPC restaurada.
DO $$
BEGIN
  BEGIN
    PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000001','situacao',2026,'pendente de julgamento','https://tse.jus.br','2026:1:RN');
    RAISE EXCEPTION 'rolled back RPC accepted pendente de julgamento';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT 'PASS rollback restores the original list' AS status;
\endif
