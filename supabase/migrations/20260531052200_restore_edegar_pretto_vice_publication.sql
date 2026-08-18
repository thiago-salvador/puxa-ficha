BEGIN;

-- Keep the public launch contract aligned with the 2026-05-20 closure:
-- Edegar Pretto is the public RS vice-governor pre-candidate profile.
UPDATE public.candidatos
SET
  publicavel = true,
  status = 'pre-candidato',
  situacao_candidatura = 'pre-candidato',
  cargo_disputado = 'Vice-Governador',
  estado = 'RS',
  ultima_atualizacao = NOW()
WHERE slug = 'edegar-pretto';

DO $$
DECLARE
  mismatch text;
BEGIN
  SELECT 'edegar-pretto esperado publicavel como Vice-Governador/RS'
  INTO mismatch
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.candidatos_publico
    WHERE slug = 'edegar-pretto'
      AND cargo_disputado = 'Vice-Governador'
      AND estado = 'RS'
  );

  IF mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'restore_edegar_pretto_vice_publication mismatch: %', mismatch;
  END IF;
END $$;

COMMIT;
