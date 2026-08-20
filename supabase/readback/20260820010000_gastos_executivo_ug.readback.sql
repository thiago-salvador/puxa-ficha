DO $$
BEGIN
  IF to_regclass('public.gastos_executivo') IS NULL THEN
    RAISE EXCEPTION 'gastos_executivo não existe';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'gastos_executivo'
      AND column_name = 'ug_codigo'
  ) THEN
    RAISE EXCEPTION 'coluna ug_codigo ausente em gastos_executivo';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.gastos_executivo'::regclass
      AND conname = 'gastos_executivo_candidato_orgao_ug_mes_unique'
  ) THEN
    RAISE EXCEPTION 'unique de UG ausente em gastos_executivo';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gastos_executivo'
      AND cmd = 'SELECT'
      AND qual LIKE '%is_public_candidate(candidato_id)%'
  ) THEN
    RAISE EXCEPTION 'policy pública de gastos_executivo ausente ou permissiva demais';
  END IF;
END $$;
