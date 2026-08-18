-- Atualiza o inventario oficial de autoria substantiva de Eduardo Girao no Senado.
-- Fonte: https://legis.senado.leg.br/dadosabertos/senador/5976/autorias.json
-- Consulta read-only em 2026-07-11: 165 itens no recorte 2019-2026.

DO $$
DECLARE
  cand_id uuid;
  old_count integer;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'eduardo-girao';
  IF cand_id IS NULL THEN
    RAISE NOTICE 'eduardo-girao ausente; migration de frescor ignorada';
    RETURN;
  END IF;

  SELECT count(*) INTO old_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'eduardo-girao-senado-completo-autoria-substantiva-2019-2026-20260506';

  IF old_count NOT IN (0, 159) THEN
    RAISE EXCEPTION 'eduardo-girao: coverage anterior inesperado: % rows', old_count;
  END IF;

  UPDATE projetos_lei
  SET
    coverage_id = 'eduardo-girao-senado-completo-autoria-substantiva-2019-2026-20260711',
    coverage_scope = 'inventario_completo_senado_autoria_substantiva_2019_2026_20260711',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'coverage_id', 'eduardo-girao-senado-completo-autoria-substantiva-2019-2026-20260711',
      'coverage_scope', 'inventario_completo_senado_autoria_substantiva_2019_2026_20260711',
      'snapshot_consulta_em', '2026-07-11T21:20:00.000Z',
      'curation_batch_id', 'eduardo-girao-senado-freshness-20260711'
    )
  WHERE candidato_id = cand_id
    AND coverage_id = 'eduardo-girao-senado-completo-autoria-substantiva-2019-2026-20260506';
END $$;

WITH target AS (
  SELECT id AS candidato_id FROM candidatos WHERE slug = 'eduardo-girao'
), fresh(tipo, numero, ano, ementa, proposicao_id_api, data_apresentacao) AS (
  VALUES
    ('PRS', '14', 2026, 'Extingue a assistência à saúde vitalícia de ex-Senadores da República, cônjuges, companheiros, filhos, ascendentes e dependentes, limita a assistência à saúde ao período de efetivo exercício do mandato, estabelece regras de transição, transparência e auditoria, revoga a Resolução nº 35, de 2012, e dá outras providências.', '174379', '2026-05-28'),
    ('PRS', '15', 2026, 'Extingue o pagamento de auxílio-moradia a Senadores, estabelece critérios restritivos para utilização de imóveis funcionais, disciplina deveres de convivência, fiscalização e sanções pelo uso irregular, e dá outras providências.', '174380', '2026-05-28'),
    ('PRS', '16', 2026, 'Extingue a disponibilização de veículos oficiais e motoristas privativos a Senadores da República, veda a criação de benefícios equivalentes e estabelece regras de transparência, controle e responsabilização sobre deslocamentos institucionais.', '174382', '2026-05-28'),
    ('PL', '2991', 2026, 'Altera o Decreto-Lei nº 2.848, de 7 de dezembro de 1940 (Código Penal), para dispor sobre o crime de manipulação fraudulenta de sistema de inteligência artificial, quando o fato não constituir crime mais grave.', '174521', '2026-06-10'),
    ('PL', '3070', 2026, 'Dispõe sobre a transferência temporária da sede do Governo Federal para a cidade de Fortaleza, no Estado do Ceará, no dia 25 de março de cada ano, em comemoração da Data Magna do Estado do Ceará.', '174595', '2026-06-12'),
    ('PL', '3533', 2026, 'Altera a Lei nº 8.429, de 2 de junho de 1992, para incluir entre os atos de improbidade administrativa a utilização de recursos oriundos de emendas individuais ou de iniciativa de bancada de parlamentares ao projeto de lei orçamentária para a contratação de shows musicais ou artísticos de qualquer natureza.', '174992', '2026-07-07')
)
INSERT INTO projetos_lei (
  candidato_id, tipo, numero, ano, ementa, fonte, proposicao_id_api,
  url_inteiro_teor, coverage_id, coverage_scope, metadata
)
SELECT
  target.candidato_id,
  fresh.tipo,
  fresh.numero,
  fresh.ano,
  fresh.ementa,
  'Senado',
  fresh.proposicao_id_api,
  'https://www25.senado.leg.br/web/atividade/materias/-/materia/' || fresh.proposicao_id_api,
  'eduardo-girao-senado-completo-autoria-substantiva-2019-2026-20260711',
  'inventario_completo_senado_autoria_substantiva_2019_2026_20260711',
  jsonb_build_object(
    'proposicao_id_api', fresh.proposicao_id_api,
    'descricao_identificacao', fresh.tipo || ' ' || fresh.numero || '/2026',
    'data_apresentacao', fresh.data_apresentacao,
    'casa', 'SF',
    'codigo_parlamentar_senado', 5976,
    'indicador_autor_principal_endpoint_senador', 'Sim',
    'autor_nome', 'Eduardo Girão',
    'fonte', 'Senado Federal Dados Abertos',
    'autorias_endpoint', 'https://legis.senado.leg.br/dadosabertos/senador/5976/autorias.json',
    'public_url', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/' || fresh.proposicao_id_api,
    'coverage_id', 'eduardo-girao-senado-completo-autoria-substantiva-2019-2026-20260711',
    'coverage_scope', 'inventario_completo_senado_autoria_substantiva_2019_2026_20260711',
    'tabela_alvo', 'projetos_lei',
    'legislacao_mandato_executivo_mixed', false,
    'snapshot_consulta_em', '2026-07-11T21:20:00.000Z'
  )
FROM target CROSS JOIN fresh
ON CONFLICT (candidato_id, proposicao_id_api) DO UPDATE SET
  tipo = EXCLUDED.tipo,
  numero = EXCLUDED.numero,
  ano = EXCLUDED.ano,
  ementa = EXCLUDED.ementa,
  fonte = EXCLUDED.fonte,
  url_inteiro_teor = EXCLUDED.url_inteiro_teor,
  coverage_id = EXCLUDED.coverage_id,
  coverage_scope = EXCLUDED.coverage_scope,
  metadata = COALESCE(projetos_lei.metadata, '{}'::jsonb) || EXCLUDED.metadata;

DO $$
DECLARE
  cand_id uuid;
  coverage_count integer;
  lme_count integer;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'eduardo-girao';
  IF cand_id IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO coverage_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'eduardo-girao-senado-completo-autoria-substantiva-2019-2026-20260711';

  SELECT count(*) INTO lme_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  IF coverage_count <> 165 THEN
    RAISE EXCEPTION 'eduardo-girao: esperadas 165 rows no coverage atualizado, encontradas %', coverage_count;
  END IF;
  IF lme_count <> 0 THEN
    RAISE EXCEPTION 'eduardo-girao: legislacao_mandato_executivo deve permanecer 0, encontrado %', lme_count;
  END IF;
END $$;
