BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; b jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260926190000') <> 1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:20260926190000') <> 1
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260926190000') THEN
    RAISE EXCEPTION 'processo-cnj-20260926 rollback readback: recibos ou ledger divergiram';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260926190000';
  SELECT detalhe::jsonb INTO b FROM public.coleta_log WHERE execucao = 'rollback:20260926190000';
  linha := r->'linhas'->0;

  IF (SELECT to_jsonb(p) FROM public.processos p WHERE p.id = (linha->>'id')::uuid)
       IS DISTINCT FROM linha->'before'
     OR b->'linhas'->0->'processo' IS DISTINCT FROM linha->'before' THEN
    RAISE EXCEPTION 'processo-cnj-20260926 rollback readback: linha nao voltou a preimagem';
  END IF;
END
$readback$;
COMMIT;
