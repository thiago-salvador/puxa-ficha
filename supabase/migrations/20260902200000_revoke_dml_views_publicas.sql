-- Retira os grants de escrita que anon e authenticated carregam em duas views
-- publicas. Schema puro: nenhuma linha de conteudo e tocada.
--
-- O que foi medido em producao em 02/09/2026 (information_schema.role_table_grants):
--
--   candidatos_identidade_tier1_auditavel
--     anon, authenticated: DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE
--     (SELECT ja havia sido revogado em 20260603013042)
--   financiamento_publico
--     anon, authenticated: REFERENCES, SELECT, TRIGGER, TRUNCATE
--
-- De onde vem: os default privileges do projeto Supabase concedem ALL para
-- anon, authenticated e service_role em todo objeto que `postgres` cria em
-- `public`. As migrations que criaram as views so cuidaram do SELECT
-- (20260417193000 e sucessoras deram SELECT em financiamento_publico;
-- 20260603013042 revogou SELECT da view tier1), e o resto do ACL padrao ficou.
--
-- Por que importa: as duas views sao `security_invoker` e nao sao atualizaveis
-- (is_updatable = NO), e o RLS das tabelas base protege a escrita. O grant e
-- letra morta hoje, mas contradiz a intencao declarada e vira porta aberta no
-- dia em que uma das views for recriada de forma atualizavel. A postura do
-- projeto e fail-closed: papel publico so tem o que usa, e o que usa e SELECT
-- em financiamento_publico.
--
-- O que NAO muda: SELECT de anon e authenticated em financiamento_publico
-- (superficie publica de financiamento) e todos os privilegios de service_role
-- e postgres. A conferencia abaixo prova o SELECT publico antes do COMMIT; o
-- readback e a prova em PG17 provam service_role intacto.
--
-- Atencao para o futuro: CREATE OR REPLACE VIEW preserva o ACL; DROP + CREATE
-- reaplica os default privileges e desfaz esta migration em silencio. O
-- readback deste arquivo fica como prova reexecutavel.
BEGIN;

REVOKE ALL ON public.candidatos_identidade_tier1_auditavel FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.financiamento_publico FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conferencia: papel publico sem nenhum privilegio na view tier1, so SELECT em
-- financiamento_publico, e service_role intacto.
DO $$
DECLARE
  papel text;
  priv text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(papel, 'public.candidatos_identidade_tier1_auditavel', priv) THEN
        RAISE EXCEPTION 'revoke_dml_views_publicas: % ainda tem % em candidatos_identidade_tier1_auditavel', papel, priv;
      END IF;
    END LOOP;
    FOREACH priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(papel, 'public.financiamento_publico', priv) THEN
        RAISE EXCEPTION 'revoke_dml_views_publicas: % ainda tem % em financiamento_publico', papel, priv;
      END IF;
    END LOOP;
    IF NOT has_table_privilege(papel, 'public.financiamento_publico', 'SELECT') THEN
      RAISE EXCEPTION 'revoke_dml_views_publicas: % perdeu SELECT em financiamento_publico; a superficie publica quebraria', papel;
    END IF;
  END LOOP;
  -- service_role nao e conferido aqui de proposito: no replay em banco vazio
  -- ele nunca recebeu os default privileges do Supabase, e a conferencia
  -- reprovaria por ambiente, nao por defeito. O readback da aplicacao em
  -- producao e a prova em PG17 e que provam service_role intacto.
END $$;

COMMIT;

-- Verificacao pos-aplicacao (rodar manualmente, read-only):
--
--   select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('candidatos_identidade_tier1_auditavel', 'financiamento_publico')
--      and grantee in ('anon', 'authenticated')
--    group by 1, 2 order by 1, 2;
--
--   esperado: somente financiamento_publico | anon | SELECT
--             e       financiamento_publico | authenticated | SELECT
