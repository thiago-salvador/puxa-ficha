BEGIN READ ONLY;
DO $readback$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260923175946')
     OR EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot
        WHERE migration_version = '20260923175946')
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:20260923175946') <> 1
     OR (SELECT count(*) FROM public.candidatos
         WHERE slug = 'tse-2026-100002541459' AND sq_candidato_2026 = '100002541459'
           AND numero_urna = '133' AND partido_sigla = 'PSD' AND partido_atual = 'PSD') <> 1 THEN
    RAISE EXCEPTION 'eliziane partido rollback readback: estado anterior nao restaurado';
  END IF;
END
$readback$;
SELECT 'eliziane partido rollback readback ok' AS status;
COMMIT;
