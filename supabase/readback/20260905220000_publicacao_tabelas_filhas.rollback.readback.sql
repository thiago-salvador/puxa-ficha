BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260905220000')
    OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('mudancas_partido','patrimonio','pontos_atencao')
      AND policyname='publicacao_sem_despublicados') THEN
    RAISE EXCEPTION 'publicacao: rollback incompleto';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('mudancas_partido','patrimonio','pontos_atencao')
    AND policyname='Leitura pública' AND cmd='SELECT' AND permissive='PERMISSIVE') <> 3 THEN
    RAISE EXCEPTION 'publicacao: policies anteriores ausentes';
  END IF;
END $$;
ROLLBACK;
