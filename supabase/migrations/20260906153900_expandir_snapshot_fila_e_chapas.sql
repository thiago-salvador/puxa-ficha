-- Expande o vocabulário técnico do snapshot antes das curadorias que registram
-- pontos de atenção e vínculos de chapas. Schema puro, sem alteração de dados.

BEGIN;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

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
      'chapas_2026'
    ));

COMMIT;
