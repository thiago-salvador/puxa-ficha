BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE
  r jsonb;
  s record;
  affected integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260923175946'
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260923175946') <> 1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260923175946')
     OR (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
         WHERE migration_version = '20260923175946' AND tabela = 'candidatos') <> 1 THEN
    RAISE EXCEPTION 'eliziane partido rollback: ledger ou recibos divergiram';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260923175946';
  SELECT preimage,postimage,row_id INTO s FROM public.identidade_timeline_quarentena_snapshot
    WHERE migration_version = '20260923175946' AND tabela = 'candidatos';
  IF r->'before' IS DISTINCT FROM s.preimage OR r->'after' IS DISTINCT FROM s.postimage
     OR (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.id = s.row_id) IS DISTINCT FROM s.postimage THEN
    RAISE EXCEPTION 'eliziane partido rollback: estado atual divergiu da posimagem';
  END IF;

  -- @write tabela=candidatos slug=tse-2026-100002541459 campos=partido_sigla,partido_atual
  UPDATE public.candidatos c
     SET partido_sigla = s.preimage->>'partido_sigla',
         partido_atual = s.preimage->>'partido_atual'
   WHERE c.id = s.row_id AND to_jsonb(c) = s.postimage;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'eliziane partido rollback: UPDATE afetou % linhas', affected; END IF;
  IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.id = s.row_id) IS DISTINCT FROM s.preimage THEN
    RAISE EXCEPTION 'eliziane partido rollback: preimagem nao foi restaurada';
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=20260923175946 campos=migration_version,tabela,row_id
  DELETE FROM public.identidade_timeline_quarentena_snapshot
   WHERE migration_version = '20260923175946' AND tabela = 'candidatos' AND row_id = s.row_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'eliziane partido rollback: snapshot afetou % linhas', affected; END IF;

  -- @write tabela=coleta_log ref=rollback:20260923175946 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log
    (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  VALUES ('tse-consulta-cand-2026','candidato','tse-2026-100002541459',s.row_id,
          'encontrado',1,jsonb_build_object('before',s.postimage,'after',s.preimage)::text,
          'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
          'rollback:20260923175946','escrita');

  -- @write tabela=schema_migrations ref=20260923175946 campos=version
  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260923175946';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'eliziane partido rollback: ledger afetou % linhas', affected; END IF;
END
$rollback$;
COMMIT;
