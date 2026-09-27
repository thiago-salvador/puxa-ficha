BEGIN READ ONLY;
DO $readback$
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:20260927010100') <> 1
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260927010100')
     OR EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot WHERE migration_version = 'dr-daniel-camara-20260927') THEN
    RAISE EXCEPTION 'dr-daniel-camara-20260927 rollback readback: recibo, ledger ou snapshot divergiram';
  END IF;
  IF EXISTS (SELECT 1 FROM public.projetos_lei
             WHERE candidato_id = 'dcc4a93e-4114-43e9-b067-4581ed12cfd5'
               AND (despublicado_em IS NOT NULL OR despublicacao_motivo IS NOT NULL))
     OR (SELECT verificacao_campos->'projetos-de-lei'->>'estado' FROM public.candidatos WHERE slug = 'dr-daniel') IS DISTINCT FROM 'encontrado' THEN
    RAISE EXCEPTION 'dr-daniel-camara-20260927 rollback readback: proposicoes ou verificacao_campos nao voltaram';
  END IF;
END
$readback$;
COMMIT;
