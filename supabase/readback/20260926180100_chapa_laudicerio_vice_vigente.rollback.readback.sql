BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; b jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260926180100') <> 1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:20260926180100') <> 1
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260926180100') THEN
    RAISE EXCEPTION 'chapa-laudicerio-20260926 rollback readback: recibos ou ledger divergiram';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260926180100';
  SELECT detalhe::jsonb INTO b FROM public.coleta_log WHERE execucao = 'rollback:20260926180100';

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(ch) FROM public.chapas_2026 ch WHERE ch.chave = linha->>'chave')
         IS DISTINCT FROM linha->'before'
       OR (SELECT x->'chapa' FROM jsonb_array_elements(b->'linhas') x WHERE x->>'chave' = linha->>'chave')
         IS DISTINCT FROM linha->'before' THEN
      RAISE EXCEPTION 'chapa-laudicerio-20260926 rollback readback: % nao voltou a preimagem', linha->>'chave';
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot
             WHERE migration_version = 'chapa-laudicerio-20260926') THEN
    RAISE EXCEPTION 'chapa-laudicerio-20260926 rollback readback: snapshot de quarentena nao foi removido';
  END IF;
END
$readback$;
COMMIT;
