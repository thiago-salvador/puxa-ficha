-- PE Governador: fechamento de lacunas estruturais do painel real.
-- Escopo: camila-falcao, ivan-moraes, joao-campos, raquel-lyra, renan-hallais.
-- Fontes: TSE Dados Abertos consulta_cand 2010/2012/2014/2016/2018/2020/2022/2024,
-- histórico já materializado no Supabase, Câmara/OpenLegis/Recife, ALEPE e curadoria pública existente.

BEGIN;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.candidatos
    WHERE slug IN (
      'camila-falcao',
      'ivan-moraes',
      'joao-campos',
      'raquel-lyra',
      'renan-hallais'
    )
      AND publicavel = true
  ) <> 5 THEN
    RAISE EXCEPTION 'PE Governador: coorte publica esperada nao encontrada';
  END IF;
END $$;

CREATE TEMP TABLE _pe_historico_minimo ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (
      'camila-falcao',
      'candidatura',
      'Pre-candidata a Governadora de Pernambuco',
      'Governador',
      'PE',
      2026,
      NULL::integer,
      'UP',
      NULL::text,
      'Pre-candidatura ao Governo de Pernambuco em 2026 ja descrita na camada publica; varredura TSE consulta_cand 2010/2012/2014/2016/2018/2020/2022/2024 em PE/BRASIL nao encontrou SQ_CANDIDATO para Camila Falcao, portanto patrimonio/financiamento TSE historico ficam como ausencia documentada, nao como dado zerado.',
      'manual'
    ),
    (
      'renan-hallais',
      'candidatura',
      'Pre-candidato a Governador de Pernambuco',
      'Governador',
      'PE',
      2026,
      NULL::integer,
      'MISSAO',
      NULL::text,
      'Pre-candidatura ao Governo de Pernambuco em 2026 ja descrita na camada publica; varredura TSE consulta_cand 2010/2012/2014/2016/2018/2020/2022/2024 em PE/BRASIL nao encontrou SQ_CANDIDATO para Renan Hallais, portanto patrimonio/financiamento TSE historico ficam como ausencia documentada, nao como dado zerado.',
      'manual'
    )
) AS v(
  slug,
  tipo_evento,
  cargo,
  cargo_canonico,
  estado,
  periodo_inicio,
  periodo_fim,
  partido,
  eleito_por,
  observacoes,
  proveniencia
);

INSERT INTO public.historico_politico (
  candidato_id,
  tipo_evento,
  cargo,
  cargo_canonico,
  estado,
  periodo_inicio,
  periodo_fim,
  partido,
  eleito_por,
  observacoes,
  proveniencia
)
SELECT
  c.id,
  h.tipo_evento,
  h.cargo,
  h.cargo_canonico,
  h.estado,
  h.periodo_inicio,
  h.periodo_fim,
  h.partido,
  h.eleito_por,
  h.observacoes,
  h.proveniencia
FROM _pe_historico_minimo h
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

UPDATE public.historico_politico hp
SET proveniencia = 'tse'
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug IN ('ivan-moraes', 'joao-campos', 'raquel-lyra')
  AND hp.proveniencia IS NULL
  AND hp.observacoes ILIKE '%TSE%';

UPDATE public.historico_politico hp
SET proveniencia = 'manual'
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug IN ('ivan-moraes', 'joao-campos', 'raquel-lyra')
  AND hp.proveniencia IS NULL;

-- Pontos IA sem verificacao/proveniencia suficiente nao sustentam completude publica.
UPDATE public.pontos_atencao pa
SET
  visivel = false,
  verificado = false,
  descricao = pa.descricao || ' [Oculto em 2026-07-08: ponto gerado por IA sem verificacao suficiente no fechamento PE Governador.]'
FROM public.candidatos c
WHERE pa.candidato_id = c.id
  AND c.slug IN ('ivan-moraes', 'joao-campos', 'raquel-lyra')
  AND pa.gerado_por = 'ia'
  AND pa.verificado = false
  AND pa.visivel = true;

DO $$
DECLARE
  camila_rows integer;
  renan_rows integer;
  null_history_rows integer;
  visible_unverified_ai_points integer;
BEGIN
  SELECT count(*) INTO camila_rows
  FROM public.historico_politico hp
  JOIN public.candidatos c ON c.id = hp.candidato_id
  WHERE c.slug = 'camila-falcao';

  SELECT count(*) INTO renan_rows
  FROM public.historico_politico hp
  JOIN public.candidatos c ON c.id = hp.candidato_id
  WHERE c.slug = 'renan-hallais';

  SELECT count(*) INTO null_history_rows
  FROM public.historico_politico hp
  JOIN public.candidatos c ON c.id = hp.candidato_id
  WHERE c.slug IN ('ivan-moraes', 'joao-campos', 'raquel-lyra', 'camila-falcao', 'renan-hallais')
    AND hp.proveniencia IS NULL;

  SELECT count(*) INTO visible_unverified_ai_points
  FROM public.pontos_atencao pa
  JOIN public.candidatos c ON c.id = pa.candidato_id
  WHERE c.slug IN ('ivan-moraes', 'joao-campos', 'raquel-lyra')
    AND pa.gerado_por = 'ia'
    AND pa.verificado = false
    AND pa.visivel = true;

  IF camila_rows < 1 THEN
    RAISE EXCEPTION 'camila-falcao historico nao materializado';
  END IF;
  IF renan_rows < 1 THEN
    RAISE EXCEPTION 'renan-hallais historico nao materializado';
  END IF;
  IF null_history_rows > 0 THEN
    RAISE EXCEPTION 'PE Governador: historico com proveniencia nula: %', null_history_rows;
  END IF;
  IF visible_unverified_ai_points > 0 THEN
    RAISE EXCEPTION 'PE Governador: pontos IA visiveis sem verificacao: %', visible_unverified_ai_points;
  END IF;
END $$;

COMMIT;
