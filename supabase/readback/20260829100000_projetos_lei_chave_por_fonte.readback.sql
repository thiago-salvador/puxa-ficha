-- Readback somente leitura da DDL da issue #138.
-- Esperado apos a aplicacao da DDL: indice por fonte presente e constraint
-- global antiga ausente. O readback do rollback e outro arquivo e fluxo.

DO $assert$
DECLARE
  scoped_index integer;
  old_constraint integer;
  senado_sem_id integer;
  ddl_ledger integer;
  ledger_top text;
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
    AND ano = 2015
    AND ementa IS NOT DISTINCT FROM 'Senado sem identificador de proposicao'
    AND situacao IS NULL
    AND url_inteiro_teor IS NULL
    AND tema IS NULL
    AND destaque IS FALSE
    AND destaque_motivo IS NULL
    AND coverage_id IS NULL
    AND metadata IS NOT DISTINCT FROM '{}'::jsonb;
  SELECT count(*) INTO ddl_ledger
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260829100000'
    AND idempotency_key = 'sha256:f33549d5c58c1cb103b36426497d4c6e66f00e2573f0579c05c6f693ab94bba3';
  SELECT max(version) INTO ledger_top
  FROM supabase_migrations.schema_migrations;
  IF scoped_index <> 1 OR old_constraint <> 0 OR senado_sem_id <> 1
     OR ddl_ledger <> 1 OR ledger_top NOT IN ('20260829100000', '20260829100100') THEN
    RAISE EXCEPTION 'issue_138 schema readback falhou (scoped=%, antiga=%, Senado_sem_id=%, ddl_ledger=%, topo=%)', scoped_index, old_constraint, senado_sem_id, ddl_ledger, ledger_top;
  END IF;
END
$assert$;
