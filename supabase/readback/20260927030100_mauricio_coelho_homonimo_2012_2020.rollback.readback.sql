BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; b jsonb; linha jsonb; atual jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260927030100') <> 1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:20260927030100') <> 1
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260927030100') THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926 rollback readback: recibos ou ledger divergiram';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260927030100';
  SELECT detalhe::jsonb INTO b FROM public.coleta_log WHERE execucao = 'rollback:20260927030100';

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF linha->>'tabela' = 'patrimonio' THEN
      SELECT to_jsonb(p) INTO atual FROM public.patrimonio p WHERE p.id = (linha->>'id')::uuid;
    ELSE
      SELECT to_jsonb(f) INTO atual FROM public.financiamento f WHERE f.id = (linha->>'id')::uuid;
    END IF;
    IF atual IS DISTINCT FROM linha->'before'
       OR (SELECT x->'linha' FROM jsonb_array_elements(b->'linhas') x WHERE x->>'id' = linha->>'id')
         IS DISTINCT FROM linha->'before' THEN
      RAISE EXCEPTION 'mauricio-homonimo-20260926 rollback readback: linha % nao voltou a preimagem', linha->>'id';
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot
             WHERE migration_version = 'mauricio-homonimo-20260926') THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926 rollback readback: snapshot nao foi removido';
  END IF;
END
$readback$;
COMMIT;
