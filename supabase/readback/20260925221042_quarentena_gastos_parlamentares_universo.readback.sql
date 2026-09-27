-- Conferência somente leitura da quarentena ampliada (20260925221042).
-- Sem fronteira transacional própria: o apply embute este texto na transação
-- da migration e o repete depois em sessão READ ONLY.
DO $$
DECLARE
  v_rows integer;
  v_profiles integer;
BEGIN
  SELECT count(*), count(DISTINCT candidato_id)
  INTO v_rows, v_profiles
  FROM public.gastos_parlamentares
  WHERE despublicacao_motivo = 'gastos-universo: Total CEAP/CEAPS fora da tolerância da fonte oficial (1% ou R$ 50) ou sem id oficial verificado; varredura 2026-09-25'
    AND despublicado_em IS NOT NULL;
  IF v_rows <> 68 OR v_profiles <> 42 THEN
    RAISE EXCEPTION 'quarentena ampliada incompleta: % linhas, % fichas', v_rows, v_profiles;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gastos_parlamentares'
      AND policyname = 'Leitura pública' AND cmd = 'SELECT'
      AND qual LIKE '%is_public_candidate(candidato_id)%'
      AND qual LIKE '%despublicado_em IS NULL%'
  ) OR (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gastos_parlamentares'
      AND cmd IN ('SELECT', 'ALL')
  ) <> 1 THEN
    RAISE EXCEPTION 'política pública de gastos divergiu do schema da quarentena';
  END IF;
END $$;
