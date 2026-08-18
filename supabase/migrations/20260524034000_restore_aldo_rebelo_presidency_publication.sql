BEGIN;

-- While the DC/Joaquim Barbosa swap remains publicly disputed, keep Aldo Rebelo
-- as the divulgable presidential pre-candidate and hold Joaquim Barbosa out of
-- the public list until the exchange is materially confirmed.
UPDATE public.candidatos
SET
  publicavel = true,
  status = 'pre-candidato',
  situacao_candidatura = 'pre-candidato',
  cargo_disputado = 'Presidente',
  estado = NULL,
  ultima_atualizacao = NOW()
WHERE slug = 'aldo-rebelo';

UPDATE public.candidatos
SET
  publicavel = false,
  ultima_atualizacao = NOW()
WHERE slug = 'joaquim-barbosa';

DO $$
DECLARE
  mismatch text;
BEGIN
  WITH expected AS (
    SELECT ARRAY[
      'aldo-rebelo',
      'augusto-cury',
      'cabo-daciolo',
      'edmilson-costa',
      'flavio-bolsonaro',
      'hertz-dias',
      'lula',
      'renan-santos',
      'romeu-zema',
      'ronaldo-caiado',
      'rui-costa-pimenta',
      'samara-martins'
    ]::text[] AS expected_slugs
  ), actual AS (
    SELECT COALESCE(array_agg(slug ORDER BY slug), ARRAY[]::text[]) AS actual_slugs
    FROM public.candidatos_publico
    WHERE cargo_disputado = 'Presidente'
      AND estado IS NULL
  )
  SELECT 'Presidente/BR: esperado ' || expected_slugs::text || ', encontrado ' || actual_slugs::text
  INTO mismatch
  FROM expected, actual
  WHERE expected_slugs <> actual_slugs;

  IF mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'restore_aldo_rebelo_presidency_publication mismatch: %', mismatch;
  END IF;
END $$;

COMMIT;
