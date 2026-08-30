-- Readback somente leitura do rollback manual de schema da issue #138.
-- Este arquivo nao autoriza o rollback, apenas prova o estado depois dele.

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
    AND ementa IS NOT DISTINCT FROM 'Regulamenta o uso de agrotoxicos e altera a lei de defensivos agricolas'
    AND situacao IS NOT DISTINCT FROM 'tramitando'
    AND url_inteiro_teor IS NULL
    AND tema IS NOT DISTINCT FROM 'Agronegocio'
    AND destaque IS TRUE
    AND destaque_motivo IS NOT DISTINCT FROM 'Conhecido como ''PL do Veneno'', amplia permissao de agrotoxicos'
    AND coverage_id IS NULL
    AND metadata IS NOT DISTINCT FROM '{}'::jsonb;
  SELECT count(*) INTO ddl_ledger
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260829100000';
  SELECT max(version) INTO ledger_top
  FROM supabase_migrations.schema_migrations;
  IF scoped_index <> 0 OR old_constraint <> 1 OR senado_sem_id <> 1
     OR ddl_ledger <> 0 OR ledger_top IS DISTINCT FROM '20260829030002' THEN
    RAISE EXCEPTION 'issue_138 schema rollback readback falhou (scoped=%, antiga=%, Senado_sem_id=%, ddl_ledger=%, topo=%)', scoped_index, old_constraint, senado_sem_id, ddl_ledger, ledger_top;
  END IF;
END
$assert$;
