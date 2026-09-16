DO $readback$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260914000000') THEN
    RAISE EXCEPTION 'rollback readback senado roster: versão ainda no ledger';
  END IF;
  IF to_regclass('public.senado_suplencias_2026') IS NOT NULL
     OR to_regclass('public.senado_suplencias_publico') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback readback senado roster: tabela ou view permanece';
  END IF;
  IF has_column_privilege('anon','public.candidatos','sq_candidato_2026','SELECT')
     OR has_column_privilege('authenticated','public.candidatos','sq_candidato_2026','SELECT') THEN
    RAISE EXCEPTION 'rollback readback senado roster: grant de sq_candidato_2026 permanece';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.candidatos'::regclass
      AND conname='candidatos_publicacao_minima_2026_check'
      AND convalidated
      AND pg_get_constraintdef(oid) NOT LIKE '%Senador%'
  ) THEN
    RAISE EXCEPTION 'rollback readback senado roster: contrato de publicação mínima não restaurado';
  END IF;
  RAISE NOTICE 'SENADO_ROSTER_ROLLBACK_READBACK_OK';
END $readback$;
