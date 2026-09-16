-- Rollback fechado somente da migration 20260915190000.
-- Recusa se alguma linha já tiver cargo_candidatura: remover a coluna apagaria
-- contexto oficial. Nesse caso o rollback precisa ser curado, nunca forçado.
-- A view pública é recriada sem a coluna e recebe de volta o mesmo dono e o
-- mesmo ACL que tinha no momento do rollback. RESTRICT recusa dependentes.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.financiamento IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260915190000' THEN
    RAISE EXCEPTION 'financiamento_cargo_candidatura rollback: ledger divergiu';
  END IF;
  IF EXISTS (SELECT 1 FROM public.financiamento WHERE cargo_candidatura IS NOT NULL) THEN
    RAISE EXCEPTION 'financiamento_cargo_candidatura rollback recusado: há cargo_candidatura preenchido; fazer rollback curado';
  END IF;
END $guard$;

CREATE TEMP TABLE pf_rollback_view_acl ON COMMIT DROP AS
SELECT pg_get_userbyid(c.relowner) AS owner, a.grantee, a.privilege_type, a.is_grantable
FROM pg_class c
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
WHERE c.oid = 'public.financiamento_publico'::regclass;

DROP VIEW public.financiamento_publico RESTRICT;
CREATE VIEW public.financiamento_publico WITH (security_invoker = true) AS
SELECT
  f.id,
  f.candidato_id,
  f.ano_eleicao,
  f.total_arrecadado,
  f.total_fundo_partidario,
  f.total_fundo_eleitoral,
  f.total_pessoa_fisica,
  f.total_recursos_proprios,
  f.maiores_doadores_publicos AS maiores_doadores,
  f.fonte,
  f.created_at,
  NULL::jsonb AS categorias_origem
FROM public.financiamento AS f
WHERE public.is_public_candidate(f.candidato_id) AND f.despublicado_em IS NULL;

DO $acl$
DECLARE
  r record;
  v_owner text;
BEGIN
  SELECT DISTINCT owner INTO STRICT v_owner FROM pg_temp.pf_rollback_view_acl;
  EXECUTE format('ALTER VIEW public.financiamento_publico OWNER TO %I', v_owner);
  REVOKE ALL ON public.financiamento_publico FROM PUBLIC, anon, authenticated, service_role;
  FOR r IN SELECT * FROM pg_temp.pf_rollback_view_acl LOOP
    EXECUTE format(
      'GRANT %s ON public.financiamento_publico TO %s%s',
      r.privilege_type,
      CASE WHEN r.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END,
      CASE WHEN r.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END
    );
  END LOOP;
END $acl$;

ALTER TABLE public.financiamento DROP COLUMN cargo_candidatura RESTRICT;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260915190000';
COMMIT;
