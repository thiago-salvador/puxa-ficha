BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE
  ids uuid[];
  affected integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260923233000'
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260923233000') <> 1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260923233000')
     OR (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
         WHERE migration_version = '20260923233000' AND tabela = 'mudancas_partido') <> 4 THEN
    RAISE EXCEPTION 'eliziane mudancas rollback: ledger ou recibos divergiram';
  END IF;
  SELECT array_agg(row_id) INTO ids FROM public.identidade_timeline_quarentena_snapshot
   WHERE migration_version = '20260923233000' AND tabela = 'mudancas_partido';
  IF EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot s
             WHERE s.migration_version = '20260923233000'
               AND s.postimage IS DISTINCT FROM
                   (SELECT to_jsonb(m) FROM public.mudancas_partido m WHERE m.id = s.row_id)) THEN
    RAISE EXCEPTION 'eliziane mudancas rollback: estado atual divergiu da posimagem';
  END IF;

  -- @write tabela=mudancas_partido slug=tse-2026-100002541459 campos=id
  DELETE FROM public.mudancas_partido
   WHERE id = ANY (ids) AND candidato_id = 'b8e8b3d1-1e2e-482f-b0dd-dbf927c5c681';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 4 THEN RAISE EXCEPTION 'eliziane mudancas rollback: DELETE afetou % linhas', affected; END IF;

  -- @write tabela=candidate_changes ref=20260923233000 campos=id
  DELETE FROM public.candidate_changes
   WHERE registro_id = ANY (ids) AND tabela_origem = 'mudancas_partido';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 4 THEN RAISE EXCEPTION 'eliziane mudancas rollback: candidate_changes afetou % linhas', affected; END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=20260923233000 campos=migration_version,tabela,row_id
  DELETE FROM public.identidade_timeline_quarentena_snapshot
   WHERE migration_version = '20260923233000' AND tabela = 'mudancas_partido' AND row_id = ANY (ids);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 4 THEN RAISE EXCEPTION 'eliziane mudancas rollback: snapshot afetou % linhas', affected; END IF;

  -- @write tabela=coleta_log ref=rollback:20260923233000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log
    (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  VALUES ('senado-filiacoes','candidato','tse-2026-100002541459','b8e8b3d1-1e2e-482f-b0dd-dbf927c5c681',
          'encontrado',4,jsonb_build_object('removidos',to_jsonb(ids))::text,
          'https://legis.senado.leg.br/dadosabertos/senador/5718/filiacoes',
          'rollback:20260923233000','escrita');

  -- @write tabela=schema_migrations ref=20260923233000 campos=version
  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260923233000';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'eliziane mudancas rollback: ledger afetou % linhas', affected; END IF;
END
$rollback$;
COMMIT;
