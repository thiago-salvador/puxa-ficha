BEGIN READ ONLY;
DO $readback$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260923233000')
     OR EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot
        WHERE migration_version = '20260923233000')
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:20260923233000') <> 1
     OR EXISTS (SELECT 1 FROM public.mudancas_partido
        WHERE candidato_id = 'b8e8b3d1-1e2e-482f-b0dd-dbf927c5c681')
     OR EXISTS (SELECT 1 FROM public.candidate_changes
        WHERE tabela_origem = 'mudancas_partido' AND registro_id IN (
          'df84c415-5e7b-4dc9-8696-cdda6eb2e674','c5b68881-4a02-4500-944e-92a72fd32aac',
          '39a7246c-1de5-47ea-a654-77905b219528',
          'b39655c8-8172-413e-94cb-611bf16ed69e')) THEN
    RAISE EXCEPTION 'eliziane mudancas rollback readback: estado anterior nao restaurado';
  END IF;
END
$readback$;
SELECT 'eliziane mudancas rollback readback ok' AS status;
COMMIT;
