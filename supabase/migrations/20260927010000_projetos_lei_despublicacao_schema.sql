-- projetos_lei ganha o mesmo mecanismo de despublicação das outras tabelas
-- públicas da ficha (historico_politico, gastos_parlamentares, patrimonio,
-- financiamento, mudancas_partido, pontos_atencao): colunas despublicado_em e
-- despublicacao_motivo, leitura pública só de linha não despublicada e índice
-- parcial nas despublicadas. A linha despublicada continua no banco com o
-- motivo, então a correção é reversível.
--
-- A política "Leitura pública" passa a exigir despublicado_em IS NULL, como em
-- historico_politico e gastos_parlamentares. O site lê projetos_lei com a chave
-- anon, sujeita a RLS, então nenhuma consulta do app precisa mudar para
-- esconder a linha.
--
-- identidade_timeline_quarentena_snapshot passa a aceitar tabela
-- 'projetos_lei', para que a curadoria grave a preimagem das linhas que
-- despublicar.
--
-- Schema só. A curadoria que usa as colunas é a 20260927010100.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-projetos-lei-despublicacao-production.
BEGIN;
LOCK TABLE public.projetos_lei IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projetos_lei'
      AND policyname = 'Leitura pública' AND cmd = 'SELECT'
      AND qual = 'is_public_candidate(candidato_id)'
  ) OR (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projetos_lei'
      AND cmd IN ('SELECT', 'ALL')
  ) <> 1 THEN
    RAISE EXCEPTION 'política pública de projetos_lei divergiu do preflight';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projetos_lei'
      AND column_name IN ('despublicado_em', 'despublicacao_motivo')
  ) THEN
    RAISE EXCEPTION 'projetos_lei já tem coluna de despublicação';
  END IF;
END $$;

ALTER TABLE public.projetos_lei
  ADD COLUMN despublicado_em timestamptz,
  ADD COLUMN despublicacao_motivo text;

ALTER POLICY "Leitura pública" ON public.projetos_lei
  USING (public.is_public_candidate(candidato_id) AND despublicado_em IS NULL);

CREATE INDEX idx_projetos_lei_despublicado
  ON public.projetos_lei USING btree (despublicado_em)
  WHERE despublicado_em IS NOT NULL;

ALTER TABLE public.identidade_timeline_quarentena_snapshot
  DROP CONSTRAINT identidade_timeline_quarentena_snapshot_tabela_check,
  ADD CONSTRAINT identidade_timeline_quarentena_snapshot_tabela_check
    CHECK (tabela IN (
      'candidatos',
      'historico_politico',
      'mudancas_partido',
      'patrimonio',
      'financiamento',
      'pontos_atencao',
      'chapas_2026',
      'projetos_lei'
    ));

COMMIT;
