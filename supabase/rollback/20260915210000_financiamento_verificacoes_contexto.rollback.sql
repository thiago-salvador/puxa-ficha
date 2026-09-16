-- Rollback fechado somente da migration 20260915210000.
-- Recusa se houver cargo_candidatura preenchido ou mais de uma verificação por
-- candidato e ano: nesses casos a chave antiga não cabe sem apagar evidência.
-- A view restrita volta às seis colunas anteriores, com o mesmo dono e ACL do
-- momento do rollback; as funções voltam à exclusão mútua por candidato e ano.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.financiamento_verificacoes IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.financiamento IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260915210000' THEN
    RAISE EXCEPTION 'financiamento_verificacoes_contexto rollback: ledger divergiu';
  END IF;
  IF EXISTS (SELECT 1 FROM public.financiamento_verificacoes WHERE cargo_candidatura IS NOT NULL) THEN
    RAISE EXCEPTION 'financiamento_verificacoes_contexto rollback recusado: há cargo_candidatura preenchido; fazer rollback curado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.financiamento_verificacoes
    GROUP BY candidato_id, ano_eleicao HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'financiamento_verificacoes_contexto rollback recusado: há mais de um contexto por candidato e ano; fazer rollback curado';
  END IF;
END $guard$;

CREATE TEMP TABLE pf_rollback_view_acl ON COMMIT DROP AS
SELECT pg_get_userbyid(c.relowner) AS owner, a.grantee, a.privilege_type, a.is_grantable
FROM pg_class c
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
WHERE c.oid = 'public.financiamento_verificacoes_publico'::regclass;

DROP VIEW public.financiamento_verificacoes_publico RESTRICT;
CREATE VIEW public.financiamento_verificacoes_publico
WITH (security_invoker = true) AS
SELECT
  candidato_id,
  ano_eleicao,
  resultado,
  fonte_url,
  verificado_em,
  detalhe
FROM public.financiamento_verificacoes;

DO $acl$
DECLARE
  r record;
  v_owner text;
BEGIN
  SELECT DISTINCT owner INTO STRICT v_owner FROM pg_temp.pf_rollback_view_acl;
  EXECUTE format('ALTER VIEW public.financiamento_verificacoes_publico OWNER TO %I', v_owner);
  REVOKE ALL ON public.financiamento_verificacoes_publico FROM PUBLIC, anon, authenticated, service_role;
  FOR r IN SELECT * FROM pg_temp.pf_rollback_view_acl LOOP
    EXECUTE format(
      'GRANT %s ON public.financiamento_verificacoes_publico TO %s%s',
      r.privilege_type,
      CASE WHEN r.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END,
      CASE WHEN r.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END
    );
  END LOOP;
END $acl$;

COMMENT ON VIEW public.financiamento_verificacoes_publico IS
  'Proveniencia publica para ausencia oficial, nao coletado e erro de financiamento.';

CREATE OR REPLACE FUNCTION public.financiamento_publicado_recusa_verificacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.candidato_id::text || ':' || NEW.ano_eleicao::text, 0)
  );
  IF EXISTS (
    SELECT 1
    FROM public.financiamento_verificacoes
    WHERE candidato_id = NEW.candidato_id
      AND ano_eleicao = NEW.ano_eleicao
  ) THEN
    RAISE EXCEPTION
      'financiamento: pleito %/% ja possui verificacao sem dado publicado',
      NEW.candidato_id,
      NEW.ano_eleicao;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.financiamento_verificacao_recusa_publicado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.candidato_id::text || ':' || NEW.ano_eleicao::text, 0)
  );
  IF EXISTS (
    SELECT 1
    FROM public.financiamento
    WHERE candidato_id = NEW.candidato_id
      AND ano_eleicao = NEW.ano_eleicao
  ) THEN
    RAISE EXCEPTION
      'financiamento_verificacoes: pleito %/% ja possui dado publicado',
      NEW.candidato_id,
      NEW.ano_eleicao;
  END IF;
  RETURN NEW;
END
$function$;

ALTER TABLE public.financiamento_verificacoes
  DROP CONSTRAINT financiamento_verificacoes_contexto_unique;
ALTER TABLE public.financiamento_verificacoes
  ADD CONSTRAINT financiamento_verificacoes_candidato_id_ano_eleicao_key
  UNIQUE (candidato_id, ano_eleicao);
ALTER TABLE public.financiamento_verificacoes DROP COLUMN cargo_candidatura RESTRICT;

COMMENT ON TABLE public.financiamento_verificacoes IS
  'Desfecho por pleito sem linha financeira. nao_aplicavel preserva a consulta quando não houve candidatura no ano.';

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260915210000';
COMMIT;
