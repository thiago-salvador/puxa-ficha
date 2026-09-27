-- Remove as colunas de despublicação de projetos_lei, devolve a política e o
-- CHECK do snapshot à forma anterior. Recusa se ainda houver linha despublicada
-- ou snapshot de projetos_lei, para não republicar nem perder dado em silêncio.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.projetos_lei IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260927040000' THEN
    RAISE EXCEPTION 'projetos-lei-despublicacao rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.projetos_lei WHERE despublicado_em IS NOT NULL OR despublicacao_motivo IS NOT NULL) THEN
    RAISE EXCEPTION 'projetos-lei-despublicacao rollback: ha proposicao despublicada; reverta a curadoria antes';
  END IF;
  IF EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot WHERE tabela = 'projetos_lei') THEN
    RAISE EXCEPTION 'projetos-lei-despublicacao rollback: ha snapshot de projetos_lei';
  END IF;
END
$rollback$;
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
DROP INDEX public.idx_projetos_lei_despublicado;
ALTER POLICY "Leitura pública" ON public.projetos_lei
  USING (public.is_public_candidate(candidato_id));
ALTER TABLE public.projetos_lei
  DROP COLUMN despublicado_em,
  DROP COLUMN despublicacao_motivo;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260927040000';
COMMIT;
