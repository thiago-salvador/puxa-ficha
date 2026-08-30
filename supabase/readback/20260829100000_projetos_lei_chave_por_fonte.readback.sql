-- Readback somente leitura da DDL da issue #138.
-- Esperado apos a aplicacao da DDL: indice por fonte presente e constraint
-- global antiga ausente. O readback do rollback e outro arquivo e fluxo.

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
  IF scoped_index <> 1 OR old_constraint <> 0 THEN
    RAISE EXCEPTION 'issue_138 schema readback falhou (scoped=%, antiga=%)', scoped_index, old_constraint;
  END IF;
END
$assert$;
