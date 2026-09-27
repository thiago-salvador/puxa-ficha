-- Estrutura da quarentena, separada da curadoria das 57 linhas.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gastos_parlamentares'
      AND policyname = 'Leitura pública' AND cmd = 'SELECT'
      AND qual = 'is_public_candidate(candidato_id)'
  ) OR (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gastos_parlamentares'
      AND cmd IN ('SELECT', 'ALL')
  ) <> 1 THEN
    RAISE EXCEPTION 'política pública de gastos divergiu do preflight';
  END IF;
END $$;

ALTER TABLE public.gastos_parlamentares
  ADD COLUMN despublicado_em timestamptz,
  ADD COLUMN despublicacao_motivo text,
  ADD COLUMN coletado_em timestamptz;

ALTER POLICY "Leitura pública" ON public.gastos_parlamentares
  USING (public.is_public_candidate(candidato_id) AND despublicado_em IS NULL);

COMMIT;
