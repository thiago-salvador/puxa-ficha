-- ============================================
-- Fluxo 5B expansao parlamentar Camara
-- Seed parcial ampliado: Lote A Aldo Rebelo / projetos_lei
-- ============================================
-- Nao aplicar ao Supabase remoto sem autorizacao explicita.
-- Fonte oficial: Camara dos Deputados - Dados Abertos
--   https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=73428&siglaTipo=PL,PEC,PLP
--   https://dadosabertos.camara.leg.br/api/v2/proposicoes/{id}
--   https://dadosabertos.camara.leg.br/api/v2/proposicoes/{id}/autores
--   Pagina publica: https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=...
-- Artefato de auditoria:
--   fonte interna de curadoria
-- Coverage scope: inventario_parlamentar_ampliado_parcial_camara_lote_a_20260429
-- Linhas verificadas: 5
-- Filtro: ordemAssinatura=1 e tipoAutor='Deputado(a)' e idDeputado=73428 (Aldo Rebelo)
--
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO toca as 100 rows pre-existentes em projetos_lei
--   (cleanup curatorial para distinguir autoria principal de co-autoria/relatoria
--    fica como blocking_gap residual_eliminavel separado).
-- Esta migration nao popula tema, destaque, destaque_motivo nem situacao
-- (campos editoriais/curatoriais, fora do contrato bruto de ingest oficial).
-- O guard usa cargo_canonico exato 'Presidente'/'Governador'/'Prefeito'
-- (com cargo ILIKE 'Presidente da Republica' como fallback) para evitar
-- falso positivo com 'Presidente da Camara dos Deputados' que Aldo ocupou
-- em 2005-2007 e nao se qualifica como chefe do Executivo neste contrato.
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM candidatos c
    WHERE c.slug = 'aldo-rebelo'
  ) THEN
    RAISE EXCEPTION 'aldo-rebelo nao encontrado em candidatos';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM candidatos c
    JOIN historico_politico hp ON hp.candidato_id = c.id
    WHERE c.slug = 'aldo-rebelo'
      AND hp.tipo_evento = 'mandato'
      AND (hp.cargo ILIKE '%Deputado Federal%' OR hp.cargo_canonico = 'Deputado Federal')
      AND hp.estado = 'SP'
  ) THEN
    RAISE EXCEPTION 'mandato Deputado Federal/SP de aldo-rebelo nao encontrado em historico_politico';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM candidatos c
    JOIN historico_politico hp ON hp.candidato_id = c.id
    WHERE c.slug = 'aldo-rebelo'
      AND hp.tipo_evento = 'mandato'
      AND (
        hp.cargo_canonico IN ('Presidente', 'Governador', 'Prefeito')
        OR hp.cargo ILIKE 'Presidente da Republica%'
        OR hp.cargo ILIKE 'Governador d%'
        OR hp.cargo ILIKE 'Prefeito d%'
      )
  ) THEN
    RAISE EXCEPTION 'aldo-rebelo tem mandato de chefe do Executivo no historico_politico; rota parlamentar deste lote esta incorreta';
  END IF;
END $$;

CREATE TEMP TABLE _seed_aldo_rebelo_parlamentar_lote_a_projetos ON COMMIT DROP AS
SELECT *
FROM (
VALUES
  (
    'PL',
    '1676',
    1999,
    'Dispõe sobre a promoção, a proteção, a defesa e o uso da Língua Portuguesa e dá outras providências.',
    'Camara',
    '17069',
    'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=17947'
  ),
  (
    'PEC',
    '180',
    1999,
    'Dá nova redação a dispositivos constitucionais que tratam de empresas brasileiras.',
    'Camara',
    '14509',
    'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=68179'
  ),
  (
    'PL',
    '10',
    1995,
    'Dispõe sobre a instituição do ano de 1995 como o "Ano Zumbi dos Palmares" em homenagem ao tricentenário de sua morte.',
    'Camara',
    '170071',
    NULL
  ),
  (
    'PL',
    '1202',
    1995,
    'Altera a Lei nº 8.989, de 24 de fevereiro de 1995, que dispõe sobre a isenção do Imposto sobre Produtos Industrializados (IPI) na aquisição de automóveis para utilização no transporte de passageiros (táxi).',
    'Camara',
    '188956',
    NULL
  ),
  (
    'PL',
    '2762',
    2003,
    'Institui o dia 31 de Outubro como o Dia do Saci e dá outras providências.',
    'Camara',
    '148717',
    'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=189684'
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
  WHERE c.slug = 'aldo-rebelo'
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
CROSS JOIN _seed_aldo_rebelo_parlamentar_lote_a_projetos AS seed
ON CONFLICT (candidato_id, proposicao_id_api) DO NOTHING;

DO $$
DECLARE
  cand_id uuid;
  inserted_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'aldo-rebelo';

  SELECT count(*) INTO inserted_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Camara'
    AND proposicao_id_api IN ('17069', '14509', '170071', '188956', '148717');

  IF inserted_count <> 5 THEN
    RAISE EXCEPTION 'Esperado exatamente 5 rows do Lote A parlamentar Aldo em projetos_lei (Camara), encontrado %', inserted_count;
  END IF;
END $$;
