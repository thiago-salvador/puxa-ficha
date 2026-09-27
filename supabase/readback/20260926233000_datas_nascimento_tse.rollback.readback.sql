BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; b jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260926233000') <> 1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:20260926233000') <> 1
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260926233000') THEN
    RAISE EXCEPTION 'nascimento-tse-20260926 rollback readback: recibos ou ledger divergiram';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260926233000';
  SELECT detalhe::jsonb INTO b FROM public.coleta_log WHERE execucao = 'rollback:20260926233000';

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT jsonb_build_object('data_nascimento', to_jsonb(c)->'data_nascimento', 'biografia', to_jsonb(c)->'biografia', 'naturalidade', to_jsonb(c)->'naturalidade')
          FROM public.candidatos c WHERE c.id = (linha->>'id')::uuid)
         IS DISTINCT FROM linha->'before'
       OR (SELECT x->'linha' FROM jsonb_array_elements(b->'linhas') x WHERE x->>'id' = linha->>'id')
         IS DISTINCT FROM linha->'before' THEN
      RAISE EXCEPTION 'nascimento-tse-20260926 rollback readback: % nao voltou a preimagem', linha->>'slug';
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot
             WHERE migration_version = 'nascimento-tse-20260926') THEN
    RAISE EXCEPTION 'nascimento-tse-20260926 rollback readback: snapshot nao foi removido';
  END IF;
END
$readback$;
COMMIT;
