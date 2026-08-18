DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260811102100') THEN
    RAISE EXCEPTION 'rollback schema recusado: migration 20260811102100 ainda aplicada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot) THEN
    RAISE EXCEPTION 'rollback schema recusado: snapshots de quarentena ainda existem';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mudancas_partido WHERE despublicado_em IS NOT NULL OR despublicacao_motivo IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.patrimonio WHERE despublicado_em IS NOT NULL OR despublicacao_motivo IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.financiamento WHERE despublicado_em IS NOT NULL OR despublicacao_motivo IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback schema recusado: valores de quarentena remanescentes';
  END IF;

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
      WHERE public.is_public_candidate(f.candidato_id)
    $view$;
  ELSE
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.financiamento_publico AS
      SELECT f.id, f.candidato_id, f.ano_eleicao, f.total_arrecadado,
             f.total_fundo_partidario, f.total_fundo_eleitoral, f.total_pessoa_fisica,
             f.total_recursos_proprios, f.maiores_doadores_publicos AS maiores_doadores,
             f.fonte, f.created_at, NULL::jsonb AS categorias_origem
      FROM public.financiamento AS f
      WHERE public.is_public_candidate(f.candidato_id)
    $view$;
  END IF;
END $$;
ALTER VIEW public.financiamento_publico SET (security_invoker = true);
GRANT SELECT ON public.financiamento_publico TO anon, authenticated;
ALTER TABLE public.mudancas_partido DROP COLUMN IF EXISTS despublicacao_motivo, DROP COLUMN IF EXISTS despublicado_em;
ALTER TABLE public.patrimonio DROP COLUMN IF EXISTS despublicacao_motivo, DROP COLUMN IF EXISTS despublicado_em;
ALTER TABLE public.financiamento DROP COLUMN IF EXISTS despublicacao_motivo, DROP COLUMN IF EXISTS despublicado_em;
DROP TABLE public.identidade_timeline_quarentena_snapshot;
-- @write tabela=schema_migrations ref=integridade-identidade-timeline-5 campos=version
DELETE FROM supabase_migrations.schema_migrations WHERE version='20260811102000';
