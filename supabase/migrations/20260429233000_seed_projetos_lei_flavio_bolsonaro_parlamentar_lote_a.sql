-- ============================================
-- Fluxo 5B expansao parlamentar Senado
-- Seed parcial ampliado: Lote A Flavio Bolsonaro / projetos_lei
-- ============================================
-- Nao aplicar ao Supabase remoto sem autorizacao explicita.
-- Fonte oficial: Senado Federal - Dados Abertos (Atividade Legislativa)
--   https://legis.senado.leg.br/dadosabertos/senador/5894/autorias.json
--   https://legis.senado.leg.br/dadosabertos/materia/{codigo}
--   https://legis.senado.leg.br/dadosabertos/materia/autoria/{codigo}
--   Pagina publica: https://www25.senado.leg.br/web/atividade/materias/-/materia/{codigo}
-- Artefato de auditoria:
--   fonte interna de curadoria
-- Coverage scope: inventario_parlamentar_ampliado_parcial_senado_lote_a_20260429
-- Linhas verificadas: 5
-- Filtro: IndicadorAutorPrincipal=Sim e NumOrdemAutor=1 e CodigoParlamentar=5894
--
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO altera nem deleta as 3 rows pre-existentes com
-- proposicao_id_api null (registradas como blocking_gap residual_eliminavel
-- no artefato; cleanup ocorre em lote separado com autorizacao explicita).
-- Esta migration nao popula tema, destaque, destaque_motivo nem situacao
-- (campos editoriais/curatoriais, fora do contrato bruto de ingest oficial).
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM candidatos c
    WHERE c.slug = 'flavio-bolsonaro'
  ) THEN
    RAISE EXCEPTION 'flavio-bolsonaro nao encontrado em candidatos';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM candidatos c
    JOIN historico_politico hp ON hp.candidato_id = c.id
    WHERE c.slug = 'flavio-bolsonaro'
      AND hp.tipo_evento = 'mandato'
      AND (hp.cargo ILIKE '%Senador%' OR hp.cargo_canonico = 'Senador')
      AND hp.estado = 'RJ'
      AND hp.periodo_inicio <= 2019
  ) THEN
    RAISE EXCEPTION 'mandato Senador/RJ de flavio-bolsonaro com inicio <= 2019 nao encontrado em historico_politico';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM candidatos c
    JOIN historico_politico hp ON hp.candidato_id = c.id
    WHERE c.slug = 'flavio-bolsonaro'
      AND hp.tipo_evento = 'mandato'
      AND (
        hp.cargo ILIKE '%Presidente%'
        OR hp.cargo ILIKE '%Governador%'
        OR hp.cargo ILIKE '%Prefeito%'
        OR hp.cargo_canonico IN ('Presidente', 'Governador', 'Prefeito')
      )
  ) THEN
    RAISE EXCEPTION 'flavio-bolsonaro tem mandato de chefe do Executivo no historico_politico; rota parlamentar deste lote esta incorreta';
  END IF;
END $$;

CREATE TEMP TABLE _seed_flavio_bolsonaro_parlamentar_lote_a_projetos ON COMMIT DROP AS
SELECT *
FROM (
VALUES
  (
    'PEC',
    '32',
    2019,
    'Altera a redação do art. 228 da Constituição Federal, a fim de reduzir a maioridade penal para dezesseis anos.',
    'Senado',
    '135977',
    'https://www25.senado.leg.br/web/atividade/materias/-/materia/135977'
  ),
  (
    'PL',
    '2393',
    2019,
    'Altera o Código Penal para dispor sobre a legítima defesa da sociedade pelo agente de segurança pública.',
    'Senado',
    '136390',
    'https://www25.senado.leg.br/web/atividade/materias/-/materia/136390'
  ),
  (
    'PL',
    '4475',
    2021,
    'Altera o art. 329 do Decreto-Lei nº 2.848, de 7 de dezembro de 1940 (Código Penal), para estabelecer tipos penais qualificados para o crime de resistência.',
    'Senado',
    '151329',
    'https://www25.senado.leg.br/web/atividade/materias/-/materia/151329'
  ),
  (
    'PL',
    '5593',
    2025,
    'Altera o Decreto-Lei nº 2.848, de 7 de dezembro de 1940 (Código Penal), para incluir expressamente o advogado como sujeito passivo na qualificadora do homicídio.',
    'Senado',
    '171423',
    'https://www25.senado.leg.br/web/atividade/materias/-/materia/171423'
  ),
  (
    'PL',
    '1019',
    2026,
    'Institui a Política Nacional de Unidades de Pronto Atendimento à Mulher - UPAM, destinadas ao atendimento humanizado e especializado à saúde da mulher no âmbito do Sistema Único de Saúde - SUS, e dá outras providências.',
    'Senado',
    '172949',
    'https://www25.senado.leg.br/web/atividade/materias/-/materia/172949'
  )
) AS v(
  tipo,
  numero,
  ano,
  ementa,
  fonte,
  proposicao_id_api,
  url_inteiro_teor
);

WITH target AS (
  SELECT c.id AS candidato_id
  FROM candidatos c
  WHERE c.slug = 'flavio-bolsonaro'
)
INSERT INTO projetos_lei (
  candidato_id,
  tipo,
  numero,
  ano,
  ementa,
  fonte,
  proposicao_id_api,
  url_inteiro_teor
)
SELECT
  target.candidato_id,
  seed.tipo,
  seed.numero,
  seed.ano,
  seed.ementa,
  seed.fonte,
  seed.proposicao_id_api,
  seed.url_inteiro_teor
FROM target
CROSS JOIN _seed_flavio_bolsonaro_parlamentar_lote_a_projetos AS seed
ON CONFLICT (candidato_id, proposicao_id_api) DO NOTHING;

DO $$
DECLARE
  cand_id uuid;
  inserted_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'flavio-bolsonaro';

  SELECT count(*) INTO inserted_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Senado'
    AND proposicao_id_api IN ('135977', '136390', '151329', '171423', '172949');

  IF inserted_count <> 5 THEN
    RAISE EXCEPTION 'Esperado exatamente 5 rows do Lote A parlamentar Flavio em projetos_lei (Senado), encontrado %', inserted_count;
  END IF;
END $$;
