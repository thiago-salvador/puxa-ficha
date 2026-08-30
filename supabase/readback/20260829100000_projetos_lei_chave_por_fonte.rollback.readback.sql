-- Readback somente leitura do rollback manual de schema da issue #138.
-- Este arquivo nao autoriza o rollback, apenas prova o estado depois dele.

DO $assert$
DECLARE
  scoped_index integer;
  old_constraint integer;
  senado_sem_id integer;
BEGIN
  SELECT count(*) INTO scoped_index
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'projetos_lei'
    AND indexname = 'uq_projetos_lei_candidato_fonte_proposicao';
  SELECT count(*) INTO old_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.projetos_lei'::regclass
    AND conname = 'uq_projetos_lei_candidato_proposicao';
  SELECT count(*) INTO senado_sem_id
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Senado'
    AND proposicao_id_api IS NULL
    AND tipo = 'PL'
    AND numero = '4444'
    AND ano = 2015;
  IF scoped_index <> 0 OR old_constraint <> 1 OR senado_sem_id <> 1 THEN
    RAISE EXCEPTION 'issue_138 schema rollback readback falhou (scoped=%, antiga=%, Senado_sem_id=%)', scoped_index, old_constraint, senado_sem_id;
  END IF;
END
$assert$;
