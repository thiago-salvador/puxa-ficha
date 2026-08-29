-- Readback somente leitura do rollback manual de schema da issue #138.
-- Este arquivo nao autoriza o rollback, apenas prova o estado depois dele.

DO $assert$
DECLARE
  scoped_index integer;
  old_constraint integer;
BEGIN
  SELECT count(*) INTO scoped_index
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'projetos_lei'
    AND indexname = 'uq_projetos_lei_candidato_fonte_proposicao';
  SELECT count(*) INTO old_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.projetos_lei'::regclass
    AND conname = 'uq_projetos_lei_candidato_proposicao';
  IF scoped_index <> 0 OR old_constraint <> 1 THEN
    RAISE EXCEPTION 'issue_138 schema rollback readback falhou (scoped=%, antiga=%)', scoped_index, old_constraint;
  END IF;
END
$assert$;
