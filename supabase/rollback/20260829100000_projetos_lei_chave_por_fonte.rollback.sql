-- Rollback separado e manual somente do schema da issue #138.
-- NAO e chamado pelo rollback do backfill. Antes de executar, o codigo dos
-- writers triple-key deve ter sido revertido e a compatibilidade com writers
-- antigos deve ser explicitamente aprovada na mesma sessao:
--   SET pf.issue_138_schema_rollback_compatibility = 'approved';
-- Sem esse marcador nomeado, este arquivo falha fechado.

BEGIN;

DO $precondition$
DECLARE
  camara_alvos integer;
BEGIN
  IF current_setting('pf.issue_138_schema_rollback_compatibility', true) IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'issue_138 schema rollback: compatibilidade com writers antigos nao foi aprovada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'projetos_lei'
      AND indexname = 'uq_projetos_lei_candidato_fonte_proposicao'
  ) THEN
    RAISE EXCEPTION 'issue_138 schema rollback: indice scoped ausente';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projetos_lei'::regclass
      AND conname = 'uq_projetos_lei_candidato_proposicao'
  ) THEN
    RAISE EXCEPTION 'issue_138 schema rollback: constraint antiga ja existe';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.projetos_lei
    WHERE proposicao_id_api IS NOT NULL
    GROUP BY candidato_id, proposicao_id_api
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'issue_138 schema rollback: ainda existem colisoes cross-source';
  END IF;
  SELECT count(*) INTO camara_alvos
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara'
    AND proposicao_id_api IN ('123202', '123149', '123094', '121483');
  IF camara_alvos <> 0 THEN
    RAISE EXCEPTION 'issue_138 schema rollback: rollback de dados incompleto, alvos Camara=%', camara_alvos;
  END IF;
  IF EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260829100100'
  ) THEN
    RAISE EXCEPTION 'issue_138 schema rollback: backfill ainda esta no ledger';
  END IF;
END
$precondition$;

ALTER TABLE public.projetos_lei
  ADD CONSTRAINT uq_projetos_lei_candidato_proposicao
  UNIQUE (candidato_id, proposicao_id_api);

DROP INDEX public.uq_projetos_lei_candidato_fonte_proposicao;

COMMIT;
