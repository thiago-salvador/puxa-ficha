-- ============================================
-- Fluxo 5C Fase 2 - Schema uplift parlamentar
-- ALTER projetos_lei: coverage_id, coverage_scope, metadata
-- ============================================
-- DRAFT: nao aplicar ao Supabase remoto sem dry-run estreito e autorizacao
-- explicita do usuario.
--
-- Objetivo: habilitar UI a renderizar 'Inventario completo da autoria
-- parlamentar' quando um slug parlamentar tem cobertura provada em
-- projetos_lei, sem promover indevidamente para 'Inventario completo do
-- mandato' (label reservado para Executivo) e sem chamar de 'completude do
-- candidato'.
--
-- Auditoria de referencia:
--   fonte interna de curadoria
--
-- Politica:
--   - coverage_id: TEXT NULL. Etiqueta de cobertura por slug+orgao+janela.
--     Analogo ao metadata.coverage_id de legislacao_mandato_executivo, mas
--     promovido a coluna propria para suportar query direta sem JSON cast.
--   - coverage_scope: TEXT NULL. Escopo formal (ex.:
--     'inventario_completo_camara_autoria_1991_2014_20260430'). Distingue
--     orgao+janela sem precisar parsear coverage_id.
--   - metadata: JSONB DEFAULT '{}'. Provenance auditavel (data_apresentacao,
--     ordem_assinatura, total_autores, origem_lote, etc.) sem poluir colunas.
--
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO contem DELETE.
-- Esta migration NAO atualiza dados de nenhum slug existente (so schema).
-- ============================================

ALTER TABLE public.projetos_lei
  ADD COLUMN IF NOT EXISTS coverage_id TEXT,
  ADD COLUMN IF NOT EXISTS coverage_scope TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_projetos_lei_coverage_id
  ON public.projetos_lei (coverage_id)
  WHERE coverage_id IS NOT NULL;

-- Verificacao pos-apply: as 3 colunas existem e o index foi criado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projetos_lei' AND column_name = 'coverage_id'
  ) THEN
    RAISE EXCEPTION 'Pos-apply: coluna projetos_lei.coverage_id nao foi criada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projetos_lei' AND column_name = 'coverage_scope'
  ) THEN
    RAISE EXCEPTION 'Pos-apply: coluna projetos_lei.coverage_scope nao foi criada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projetos_lei' AND column_name = 'metadata'
  ) THEN
    RAISE EXCEPTION 'Pos-apply: coluna projetos_lei.metadata nao foi criada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'projetos_lei' AND indexname = 'idx_projetos_lei_coverage_id'
  ) THEN
    RAISE EXCEPTION 'Pos-apply: index idx_projetos_lei_coverage_id nao foi criado';
  END IF;
  RAISE NOTICE 'projetos_lei schema uplift OK: coverage_id, coverage_scope, metadata + index';
END $$;
