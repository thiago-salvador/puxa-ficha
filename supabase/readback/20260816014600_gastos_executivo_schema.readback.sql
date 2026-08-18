DO $$
BEGIN
  IF to_regclass('public.gastos_executivo') IS NULL THEN
    RAISE EXCEPTION 'gastos_executivo não existe';
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
