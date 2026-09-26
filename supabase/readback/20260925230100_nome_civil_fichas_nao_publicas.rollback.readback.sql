BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; b jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260925230100') <> 1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:20260925230100') <> 1
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260925230100') THEN
    RAISE EXCEPTION 'nome-civil-20260925 rollback readback: recibos ou ledger divergiram';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260925230100';
  SELECT detalhe::jsonb INTO b FROM public.coleta_log WHERE execucao = 'rollback:20260925230100';

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = linha->>'slug')
         IS DISTINCT FROM linha->'before'
       OR (SELECT x->'candidato' FROM jsonb_array_elements(b->'linhas') x WHERE x->>'slug' = linha->>'slug')
         IS DISTINCT FROM linha->'before' THEN
      RAISE EXCEPTION 'nome-civil-20260925 rollback readback: % nao voltou a preimagem', linha->>'slug';
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot
             WHERE migration_version = 'nome-civil-20260925') THEN
    RAISE EXCEPTION 'nome-civil-20260925 rollback readback: snapshot de quarentena nao foi removido';
  END IF;
END
$readback$;
COMMIT;
