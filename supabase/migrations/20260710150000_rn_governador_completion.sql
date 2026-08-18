-- RN Governador: proveniencia rastreavel, identidade TSE e saneamento de pontos IA falsos.
-- Fontes: TSE Dados Abertos, ALRN, Diario Oficial de Mossoro e DOE/RN.

BEGIN;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.candidatos
    WHERE slug IN (
      'alvaro-dias-rn', 'alysson-bezerra', 'cadu-xavier',
      'dario-barbosa', 'francisco-dias', 'roberio-paulino'
    )
      AND publicavel = true
      AND estado = 'RN'
      AND cargo_disputado = 'Governador'
  ) <> 6 THEN
    RAISE EXCEPTION 'RN Governador: coorte publica esperada nao encontrada';
  END IF;
END $$;

UPDATE public.historico_politico hp
SET proveniencia = CASE
  WHEN hp.observacoes ILIKE '%TSE%' THEN 'tse'
  ELSE 'manual'
END
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug IN ('alvaro-dias-rn', 'alysson-bezerra', 'cadu-xavier')
  AND hp.proveniencia IS NULL;

INSERT INTO public.historico_politico (
  candidato_id, tipo_evento, cargo, cargo_canonico, estado,
  periodo_inicio, periodo_fim, partido, eleito_por, observacoes, proveniencia
)
SELECT
  c.id, 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RN',
  2024, 2024, 'UP', 'nao eleito',
  'Consulta_cand TSE 2024: Francisco de Assis da Costa Dias, vereador pelo UP em Natal/RN, SQ 200002109074, resultado NAO ELEITO.',
  'tse'
FROM public.candidatos c
WHERE c.slug = 'francisco-dias'
  AND NOT EXISTS (
    SELECT 1
    FROM public.historico_politico hp
    WHERE hp.candidato_id = c.id
      AND hp.periodo_inicio = 2024
      AND hp.cargo_canonico = 'Candidatura a Vereador'
  );

UPDATE public.pontos_atencao pa
SET
  visivel = false,
  verificado = false,
  descricao = pa.descricao || ' [Oculto em 2026-07-10: resumo gerado por IA sem verificacao e contradito pelo historico eleitoral materializado.]'
FROM public.candidatos c
WHERE pa.candidato_id = c.id
  AND c.slug IN ('alvaro-dias-rn', 'alysson-bezerra', 'cadu-xavier')
  AND pa.gerado_por = 'ia'
  AND pa.verificado = false
  AND pa.visivel = true;

UPDATE public.candidatos
SET
  nome_completo = CASE slug
    WHEN 'dario-barbosa' THEN 'Dario Barbosa de Melo'
    WHEN 'francisco-dias' THEN 'Francisco de Assis da Costa Dias'
    WHEN 'roberio-paulino' THEN 'Roberio Paulino Rodrigues'
    ELSE nome_completo
  END,
  fonte_dados = ARRAY(
    SELECT DISTINCT source
    FROM unnest(
      coalesce(fonte_dados, ARRAY[]::text[]) ||
      ARRAY['TSE Dados Abertos consulta_cand 2012-2024']::text[]
    ) AS source
  ),
  ultima_atualizacao = NOW()
WHERE slug IN ('dario-barbosa', 'francisco-dias', 'roberio-paulino');

UPDATE public.candidatos
SET
  fonte_dados = ARRAY(
    SELECT DISTINCT source
    FROM unnest(
      coalesce(fonte_dados, ARRAY[]::text[]) ||
      ARRAY['TSE Dados Abertos', 'ALRN/Diario Oficial RN']::text[]
    ) AS source
  ),
  ultima_atualizacao = NOW()
WHERE slug IN ('alvaro-dias-rn', 'alysson-bezerra', 'cadu-xavier');

DO $$
DECLARE
  empty_history integer;
  null_provenance integer;
  unverified_ai integer;
BEGIN
  SELECT count(*) INTO empty_history
  FROM public.candidatos c
  WHERE c.slug IN (
    'alvaro-dias-rn', 'alysson-bezerra', 'cadu-xavier',
    'dario-barbosa', 'francisco-dias', 'roberio-paulino'
  )
    AND NOT EXISTS (
      SELECT 1 FROM public.historico_politico hp WHERE hp.candidato_id = c.id
    );

  SELECT count(*) INTO null_provenance
  FROM public.historico_politico hp
  JOIN public.candidatos c ON c.id = hp.candidato_id
  WHERE c.slug IN (
    'alvaro-dias-rn', 'alysson-bezerra', 'cadu-xavier',
    'dario-barbosa', 'francisco-dias', 'roberio-paulino'
  )
    AND hp.proveniencia IS NULL;

  SELECT count(*) INTO unverified_ai
  FROM public.pontos_atencao pa
  JOIN public.candidatos c ON c.id = pa.candidato_id
  WHERE c.slug IN (
    'alvaro-dias-rn', 'alysson-bezerra', 'cadu-xavier',
    'dario-barbosa', 'francisco-dias', 'roberio-paulino'
  )
    AND pa.gerado_por = 'ia'
    AND pa.verificado = false
    AND pa.visivel = true;

  IF empty_history <> 0 OR null_provenance <> 0 OR unverified_ai <> 0 THEN
    RAISE EXCEPTION 'RN Governador: residual (empty %, null provenance %, visible AI %)',
      empty_history, null_provenance, unverified_ai;
  END IF;
END $$;

COMMIT;
