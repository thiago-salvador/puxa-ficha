BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE
  ids uuid[];
  affected integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260924003000'
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260924003000') <> 10
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260924003000')
     OR (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
         WHERE migration_version = '20260924003000' AND tabela = 'historico_politico') <> 10 THEN
    RAISE EXCEPTION 'senado exercicio reaberto rollback: ledger ou recibos divergiram';
  END IF;
  SELECT array_agg(row_id) INTO ids FROM public.identidade_timeline_quarentena_snapshot
   WHERE migration_version = '20260924003000' AND tabela = 'historico_politico';
  IF EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot s
             WHERE s.migration_version = '20260924003000'
               AND s.postimage IS DISTINCT FROM
                   (SELECT to_jsonb(h) FROM public.historico_politico h WHERE h.id = s.row_id)) THEN
    RAISE EXCEPTION 'senado exercicio reaberto rollback: estado atual divergiu da posimagem';
  END IF;

  -- Recibo por candidato antes do DELETE, com a linha removida.
  -- @write tabela=coleta_log ref=rollback:20260924003000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log
    (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'senado','candidato',c.slug,h.candidato_id,'encontrado',1,
         jsonb_build_object('issue',470,'removida',to_jsonb(h))::text,
         l.url,'rollback:20260924003000','escrita'
  FROM public.historico_politico h
  JOIN public.candidatos c ON c.id = h.candidato_id
  JOIN public.coleta_log l ON l.execucao = 'migration:20260924003000' AND l.candidato_id = h.candidato_id
  WHERE h.id = ANY (ids);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 10 THEN RAISE EXCEPTION 'senado exercicio reaberto rollback: recibo afetou % linhas', affected; END IF;

  -- @write tabela=historico_politico ref=20260924003000 campos=id
  DELETE FROM public.historico_politico
   WHERE id = ANY (ids) AND cargo = 'Senador' AND proveniencia = 'senado';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 10 THEN RAISE EXCEPTION 'senado exercicio reaberto rollback: DELETE afetou % linhas', affected; END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=20260924003000 campos=migration_version,tabela,row_id
  DELETE FROM public.identidade_timeline_quarentena_snapshot
   WHERE migration_version = '20260924003000' AND tabela = 'historico_politico' AND row_id = ANY (ids);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 10 THEN RAISE EXCEPTION 'senado exercicio reaberto rollback: snapshot afetou % linhas', affected; END IF;

  -- @write tabela=schema_migrations ref=20260924003000 campos=version
  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260924003000';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'senado exercicio reaberto rollback: ledger afetou % linhas', affected; END IF;
END
$rollback$;
COMMIT;
