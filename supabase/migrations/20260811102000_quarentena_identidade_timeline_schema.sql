-- Schema aditivo para quarentena reversível de linhas contaminadas por identidade.
-- Curadoria permanece na migration 20260811102100.
ALTER TABLE public.mudancas_partido
  ADD COLUMN IF NOT EXISTS despublicacao_motivo text,
  ADD COLUMN IF NOT EXISTS despublicado_em timestamptz;

ALTER TABLE public.patrimonio
  ADD COLUMN IF NOT EXISTS despublicacao_motivo text,
  ADD COLUMN IF NOT EXISTS despublicado_em timestamptz;

ALTER TABLE public.financiamento
  ADD COLUMN IF NOT EXISTS despublicacao_motivo text,
  ADD COLUMN IF NOT EXISTS despublicado_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_mudancas_partido_despublicado
  ON public.mudancas_partido (despublicado_em) WHERE despublicado_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patrimonio_despublicado
  ON public.patrimonio (despublicado_em) WHERE despublicado_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financiamento_despublicado
  ON public.financiamento (despublicado_em) WHERE despublicado_em IS NOT NULL;

CREATE TABLE public.identidade_timeline_quarentena_snapshot (
  migration_version text NOT NULL,
  tabela text NOT NULL CHECK (tabela IN (
    'candidatos', 'historico_politico', 'mudancas_partido', 'patrimonio', 'financiamento'
  )),
  row_id uuid NOT NULL,
  candidato_id uuid NOT NULL,
  preimage jsonb NOT NULL,
  postimage jsonb NOT NULL,
  registrado_em timestamptz NOT NULL,
  PRIMARY KEY (migration_version, tabela, row_id)
);

ALTER TABLE public.identidade_timeline_quarentena_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.identidade_timeline_quarentena_snapshot FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financiamento' AND column_name='categorias_origem'
  ) THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.financiamento_publico AS
      SELECT f.id, f.candidato_id, f.ano_eleicao, f.total_arrecadado,
             f.total_fundo_partidario, f.total_fundo_eleitoral, f.total_pessoa_fisica,
             f.total_recursos_proprios, f.maiores_doadores_publicos AS maiores_doadores,
             f.fonte, f.created_at, f.categorias_origem
      FROM public.financiamento AS f
      WHERE public.is_public_candidate(f.candidato_id) AND f.despublicado_em IS NULL
    $view$;
  ELSE
    -- Replay linear pode não reconstruir `categorias_origem` porque a curadoria
    -- A2 anterior aborta fail-closed. A view mantém a mesma assinatura pública.
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.financiamento_publico AS
      SELECT f.id, f.candidato_id, f.ano_eleicao, f.total_arrecadado,
             f.total_fundo_partidario, f.total_fundo_eleitoral, f.total_pessoa_fisica,
             f.total_recursos_proprios, f.maiores_doadores_publicos AS maiores_doadores,
             f.fonte, f.created_at, NULL::jsonb AS categorias_origem
      FROM public.financiamento AS f
      WHERE public.is_public_candidate(f.candidato_id) AND f.despublicado_em IS NULL
    $view$;
  END IF;
END $$;

ALTER VIEW public.financiamento_publico SET (security_invoker = true);
GRANT SELECT ON public.financiamento_publico TO anon, authenticated;
