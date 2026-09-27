BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260927040200')
     OR EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'pedro-cunha-lima-senado-20260927')
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:20260927040200' AND volume = 33) <> 1
     OR (SELECT count(*) FROM public.projetos_lei
       WHERE candidato_id = 'aa9ca0e4-794c-409d-91fe-4d18c13a449a'
         AND metadata->>'codigo_parlamentar_senado' = '1757'
         AND despublicado_em IS NULL) <> 33 THEN
    RAISE EXCEPTION 'pedro-cunha-lima-senado-20260927 rollback readback: preimagem divergiu';
  END IF;
END
$readback$;
COMMIT;
