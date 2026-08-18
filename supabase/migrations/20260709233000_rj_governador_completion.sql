-- RJ Governador: historico minimo rastreavel e saneamento de proveniencia.
-- Fontes: TSE Dados Abertos, Alerj, Itatiaia e O Dia.

BEGIN;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.candidatos
    WHERE slug IN (
      'andre-marinho', 'andre-portugues', 'cyro-garcia', 'douglas-ruas',
      'eduardo-paes', 'garotinho', 'juliete-pantoja', 'luan-monteiro',
      'rafael-luz', 'william-siri', 'wilson-witzel'
    )
      AND publicavel = true
      AND estado = 'RJ'
      AND cargo_disputado = 'Governador'
  ) <> 11 THEN
    RAISE EXCEPTION 'RJ Governador: coorte publica esperada nao encontrada';
  END IF;
END $$;

-- As onze linhas sem proveniencia ja declaravam a origem TSE nas observacoes.
UPDATE public.historico_politico hp
SET proveniencia = 'tse'
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug IN ('douglas-ruas', 'eduardo-paes', 'garotinho')
  AND hp.proveniencia IS NULL
  AND hp.observacoes ILIKE '%TSE%';

CREATE TEMP TABLE _rj_historico ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (
      'andre-marinho', 'candidatura', 'Pre-candidato a Governador',
      'Pre-candidato a Governador', 'RJ', 2026, NULL::integer, 'NOVO', NULL::text,
      'Pre-candidatura ao Governo do Rio pelo Novo anunciada em abril de 2026. Fontes: O Dia (08/04/2026) e Itatiaia (02/07/2026). Varredura nominal de consulta_cand TSE 2010-2024 nao encontrou Andre Bourguignon Marinho; homonimos foram descartados.',
      'manual'
    ),
    (
      'rafael-luz', 'candidatura', 'Pre-candidato a Governador',
      'Pre-candidato a Governador', 'RJ', 2026, NULL::integer, 'MISSAO', NULL::text,
      'Pre-candidatura ao Governo do Rio pelo Missao documentada pela Itatiaia em 02/07/2026. Varredura nominal de consulta_cand TSE 2010-2024 nao encontrou registro seguro de Rafael Luz; dinheiro eleitoral historico nao foi inferido.',
      'manual'
    ),
    (
      'wilson-witzel', 'mandato', 'Governador', 'Governador', 'RJ',
      2019, 2021, 'PSC', 'voto direto',
      'Eleito governador do Rio de Janeiro em 2018 pelo PSC, SQ 190000612301. Mandato encerrado em 2021 apos impeachment julgado pela Alerj.',
      'misto'
    ),
    (
      'wilson-witzel', 'candidatura', 'Candidatura a Governador',
      'Candidatura a Governador', 'RJ', 2022, 2022, 'PMB', 'nao eleito',
      'Consulta_cand TSE 2022: Wilson Jose Witzel, governador pelo PMB no RJ, SQ 190001714872, situacao INAPTO e resultado NAO ELEITO.',
      'tse'
    )
) AS v(
  slug, tipo_evento, cargo, cargo_canonico, estado, periodo_inicio, periodo_fim,
  partido, eleito_por, observacoes, proveniencia
);

INSERT INTO public.historico_politico (
  candidato_id, tipo_evento, cargo, cargo_canonico, estado, periodo_inicio,
  periodo_fim, partido, eleito_por, observacoes, proveniencia
)
SELECT
  c.id, h.tipo_evento, h.cargo, h.cargo_canonico, h.estado, h.periodo_inicio,
  h.periodo_fim, h.partido, h.eleito_por, h.observacoes, h.proveniencia
FROM _rj_historico h
JOIN public.candidatos c ON c.slug = h.slug
ON CONFLICT (candidato_id, cargo_canonico, periodo_inicio)
WHERE periodo_inicio IS NOT NULL AND cargo_canonico IS NOT NULL
DO UPDATE SET
  tipo_evento = EXCLUDED.tipo_evento,
  cargo = EXCLUDED.cargo,
  estado = EXCLUDED.estado,
  periodo_fim = EXCLUDED.periodo_fim,
  partido = EXCLUDED.partido,
  eleito_por = EXCLUDED.eleito_por,
  observacoes = EXCLUDED.observacoes,
  proveniencia = EXCLUDED.proveniencia;

UPDATE public.candidatos
SET
  fonte_dados = ARRAY(
    SELECT DISTINCT source
    FROM unnest(
      coalesce(fonte_dados, ARRAY[]::text[]) ||
      ARRAY['TSE consulta_cand 2010-2024', 'Itatiaia 2026']::text[]
    ) AS source
  ),
  ultima_atualizacao = NOW()
WHERE slug IN ('andre-marinho', 'rafael-luz');

UPDATE public.candidatos
SET
  fonte_dados = ARRAY(
    SELECT DISTINCT source
    FROM unnest(
      coalesce(fonte_dados, ARRAY[]::text[]) ||
      ARRAY['TSE consulta_cand 2018/2022', 'Alerj impeachment 2021']::text[]
    ) AS source
  ),
  ultima_atualizacao = NOW()
WHERE slug = 'wilson-witzel';

DO $$
DECLARE
  empty_history integer;
  null_provenance integer;
BEGIN
  SELECT count(*) INTO empty_history
  FROM public.candidatos c
  WHERE c.slug IN (
    'andre-marinho', 'andre-portugues', 'cyro-garcia', 'douglas-ruas',
    'eduardo-paes', 'garotinho', 'juliete-pantoja', 'luan-monteiro',
    'rafael-luz', 'william-siri', 'wilson-witzel'
  )
    AND NOT EXISTS (
      SELECT 1 FROM public.historico_politico hp WHERE hp.candidato_id = c.id
    );

  SELECT count(*) INTO null_provenance
  FROM public.historico_politico hp
  JOIN public.candidatos c ON c.id = hp.candidato_id
  WHERE c.slug IN (
    'andre-marinho', 'andre-portugues', 'cyro-garcia', 'douglas-ruas',
    'eduardo-paes', 'garotinho', 'juliete-pantoja', 'luan-monteiro',
    'rafael-luz', 'william-siri', 'wilson-witzel'
  )
    AND hp.proveniencia IS NULL;

  IF empty_history <> 0 OR null_provenance <> 0 THEN
    RAISE EXCEPTION 'RJ Governador: historico residual (empty %, null provenance %)', empty_history, null_provenance;
  END IF;
END $$;

COMMIT;
