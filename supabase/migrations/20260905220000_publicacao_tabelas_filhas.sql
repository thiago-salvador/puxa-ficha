-- MR-01: quarentena preserva o acervo, mas nunca autoriza leitura pública.
-- Barreira AND adicional: não substitui gates de candidato, fonte ou curadoria.
-- Nenhuma linha, identidade, flag editorial ou grant é alterado.
BEGIN;
DO $$
DECLARE tabela text; p record;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['mudancas_partido','patrimonio','pontos_atencao'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=tabela AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'publicacao: RLS ausente em %', tabela;
    END IF;
    IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=tabela
      AND cmd IN ('SELECT','ALL') AND policyname <> 'publicacao_sem_despublicados') <> 1
      OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=tabela
        AND policyname='Leitura pública' AND cmd='SELECT' AND permissive='PERMISSIVE'
        AND qual LIKE '%is_public_candidate(candidato_id)%') THEN
      RAISE EXCEPTION 'publicacao: drift das policies anteriores em %', tabela;
    END IF;
    SELECT * INTO p FROM pg_policies WHERE schemaname='public' AND tablename=tabela
      AND policyname='publicacao_sem_despublicados';
    IF FOUND THEN
      IF p.permissive <> 'RESTRICTIVE' OR p.cmd <> 'SELECT'
        OR p.roles <> ARRAY['anon','authenticated']::name[]
        OR p.qual <> '(despublicado_em IS NULL)' THEN
        RAISE EXCEPTION 'publicacao: drift da barreira em %', tabela;
      END IF;
    ELSE
      -- DDL explícita para o classificador incluir a barreira no replay de schema.
      IF tabela = 'mudancas_partido' THEN
        CREATE POLICY publicacao_sem_despublicados ON public.mudancas_partido
          AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (despublicado_em IS NULL);
      ELSIF tabela = 'patrimonio' THEN
        CREATE POLICY publicacao_sem_despublicados ON public.patrimonio
          AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (despublicado_em IS NULL);
      ELSE
        CREATE POLICY publicacao_sem_despublicados ON public.pontos_atencao
          AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (despublicado_em IS NULL);
      END IF;
    END IF;
  END LOOP;
END $$;
COMMIT;
