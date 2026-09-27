-- Rodar após a migração, em sessão separada. Não altera dados.
BEGIN READ ONLY;

DO $$
DECLARE
  v_rows integer;
  v_profiles integer;
BEGIN
  SELECT count(*), count(DISTINCT candidato_id)
  INTO v_rows, v_profiles
  FROM public.gastos_parlamentares
  WHERE despublicacao_motivo = 'gastos-129: Totais CEAP/CEAPS em conferência com a fonte oficial; triagem 129 casos 2026-09-25'
    AND despublicado_em IS NOT NULL;
  IF v_rows <> 57 OR v_profiles <> 40 THEN
    RAISE EXCEPTION 'quarentena incompleta: % linhas, % fichas', v_rows, v_profiles;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gastos_parlamentares'
      AND policyname = 'Leitura pública' AND cmd = 'SELECT'
      AND qual LIKE '%is_public_candidate(candidato_id)%'
      AND qual LIKE '%despublicado_em IS NULL%'
  ) THEN
    RAISE EXCEPTION 'política pública não filtra gastos despublicados';
  END IF;
  IF (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gastos_parlamentares'
      AND cmd IN ('SELECT', 'ALL')
  ) <> 1 THEN
    RAISE EXCEPTION 'outra política pública pode expor gastos';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gastos_parlamentares'
      AND column_name = 'coletado_em' AND data_type = 'timestamp with time zone'
  ) THEN
    RAISE EXCEPTION 'coluna de data de corte ausente';
  END IF;
END $$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.gastos_parlamentares
    WHERE despublicacao_motivo = 'gastos-129: Totais CEAP/CEAPS em conferência com a fonte oficial; triagem 129 casos 2026-09-25'
  ) THEN
    RAISE EXCEPTION 'anon ainda lê gasto em quarentena';
  END IF;
END $$;

COMMIT;
