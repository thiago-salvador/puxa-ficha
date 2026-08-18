-- ES Governador: fechamento real de Breno Barcelos, Helder Salomao,
-- Magno Malta, Pazolini e Ricardo Ferraco.
-- Fontes principais: TSE Dados Abertos, Senado Dados Abertos/CEAPS,
-- Governo ES, Ales e Camara Municipal de Vitoria.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'breno-barcelar' AND publicavel = true) THEN
    RAISE EXCEPTION 'breno-barcelar nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'helder-salomao' AND publicavel = true) THEN
    RAISE EXCEPTION 'helder-salomao nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'magno-malta' AND publicavel = true) THEN
    RAISE EXCEPTION 'magno-malta nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'pazolini' AND publicavel = true) THEN
    RAISE EXCEPTION 'pazolini nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'ricardo-ferraco' AND publicavel = true) THEN
    RAISE EXCEPTION 'ricardo-ferraco nao encontrado ou nao publicavel';
  END IF;
END $$;

-- Helder: ponto IA contradizia historico materializado por TSE/Camara.
UPDATE public.pontos_atencao
SET
  visivel = false,
  verificado = false,
  descricao = descricao || ' [Oculto em 2026-07-05: ponto gerado por IA contradizia mandatos TSE/Camara ja materializados na ficha publica.]'
WHERE id = '436ebb81-a612-4706-9e42-09015ba5de3a';

-- Pazolini: renuncia comunicada oficialmente a Camara de Vitoria em 01/04/2026,
-- com efeitos a partir de 04/04/2026. Logo nao deve permanecer como prefeito atual.
UPDATE public.candidatos
SET
  cargo_atual = NULL,
  biografia = 'Lorenzo Silva de Pazolini e delegado de policia, advogado e politico brasileiro, filiado ao Republicanos. Foi deputado estadual e prefeito de Vitoria; a Camara de Vitoria registrou em 01/04/2026 a comunicacao de renuncia ao mandato de prefeito, com efeitos a partir de 04/04/2026, para fins de desincompatibilizacao eleitoral.',
  ultima_atualizacao = now()
WHERE slug = 'pazolini';

UPDATE public.historico_politico
SET
  periodo_fim = 2026,
  proveniencia = 'misto',
  observacoes = 'Reeleito prefeito de Vitoria em 2024 pelo TSE; a Camara Municipal de Vitoria registrou em 01/04/2026 a comunicacao de renuncia ao mandato, com efeitos a partir de 04/04/2026.'
WHERE id = 'd94d5b4d-8182-44ad-8cdd-9f82cad38ba3';

UPDATE public.pontos_atencao
SET
  verificado = true,
  fontes = '[
    {"url":"https://www.tse.jus.br","titulo":"TSE - candidaturas 2018/2020/2024"},
    {"url":"https://www.cmv.es.gov.br/noticia/ler/11679/-cmara-de-vitria-recebe-comunicao-de-renncia-de-pazolini","titulo":"Camara de Vitoria - renuncia de Pazolini"}
  ]'::jsonb
WHERE id = '9c885daa-3da5-489c-80c2-6dab87585ec1';

-- Ricardo Ferraco: Governo ES oficializou posse como governador em 02/04/2026.
UPDATE public.candidatos
SET
  cargo_atual = 'Governador do Espirito Santo',
  biografia = 'Ricardo de Rezende Ferraco e politico brasileiro, filiado ao MDB. Foi vereador, deputado estadual, deputado federal, senador e vice-governador do Espirito Santo; o Governo ES registrou sua posse como governador do Estado em 02/04/2026, apos a renuncia de Renato Casagrande.',
  ultima_atualizacao = now()
WHERE slug = 'ricardo-ferraco';

UPDATE public.historico_politico
SET
  periodo_fim = 2026,
  proveniencia = 'misto',
  observacoes = 'Vice-governador do Espirito Santo eleito em 2022 pelo TSE; mandato encerrado em 02/04/2026 com posse como governador, conforme Governo ES.'
WHERE id = '58b6227c-4bcf-427e-a556-1ab7a6ff7418';

UPDATE public.historico_politico
SET
  cargo = 'Governador',
  periodo_inicio = 2026,
  periodo_fim = NULL,
  partido = 'MDB',
  estado = 'ES',
  eleito_por = 'sucessao constitucional',
  observacoes = 'Governo ES registrou a posse de Ricardo Ferraco como governador do Estado do Espirito Santo em 02/04/2026, apos a renuncia de Renato Casagrande.',
  cargo_canonico = 'Governador',
  tipo_evento = 'mandato',
  proveniencia = 'misto'
WHERE id = 'f4c6375a-f6b7-46e9-9965-2b92196b0e42';

UPDATE public.pontos_atencao
SET
  verificado = true,
  fontes = '[
    {"url":"https://www.es.gov.br/governo/governador","titulo":"Governo ES - Governador Ricardo Ferraco"},
    {"url":"https://www.es.gov.br/Noticia/ricardo-ferraco-toma-posse-como-governador-do-espirito-santo","titulo":"Governo ES - posse em 02/04/2026"},
    {"url":"https://legis.senado.leg.br/dadosabertos/senador/635/mandatos?v=5","titulo":"Senado Dados Abertos - mandatos"}
  ]'::jsonb
WHERE id = '337bc0e5-614c-433d-8da9-584e3fee29f7';

CREATE TEMP TABLE _es_ricardo_lme ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (
      'lei_sancionada',
      'estadual',
      'ES',
      'lei',
      '12.858/2026',
      2026,
      '2026-06-10',
      'Lei que inverte fases em licitacoes publicas para servicos medicos, exigindo comprovacao de capacidade tecnica antes da apresentacao de precos.',
      'RICARDO DE REZENDE FERRACO',
      'titular',
      'https://www.al.es.gov.br/Noticia/2026/06/50909/sancao-de-lei-garante-qualidade-a-licitacoes-de-servicos-medicos.html',
      'Ales - sancao da Lei 12.858/2026',
      NULL,
      'ALES:LEI-12858-2026',
      '{"source":"Ales/Governo ES","data_real":true,"fluxo":"candidate-completion-status-html-workflow","curation_batch_id":"es-governador-fechamento-20260705","coverage_id":"ricardo-ferraco-governo-es-atos-oficiais-20260705","coverage_scope":"descoberta_oficial_escopada_governo_es_2026_sem_inventario_total","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"fonte_oficial_verificada_em":"2026-07-05T23:36:18-0300","source_proof":{"official_source_kind":"noticia_ales","law_number":"12.858/2026","published_in_doe":"2026-06-10","contains_sanction_by_governor":true}}'::jsonb
    ),
    (
      'lei_sancionada',
      'estadual',
      'ES',
      'lei',
      '12.871/2026',
      2026,
      '2026-07-01',
      'Lei que institui o Programa Estadual de Navegacao de Pacientes para Pessoas com Neoplasia Maligna de Mama.',
      'RICARDO DE REZENDE FERRACO',
      'titular',
      'https://www.al.es.gov.br/Noticia/2026/07/51046/lei-cria-programa-para-acelerar-tratamento-de-cancer-de-mama-no-es.html',
      'Ales - Lei 12.871/2026 sobre navegacao de pacientes',
      NULL,
      'ALES:LEI-12871-2026',
      '{"source":"Ales/Governo ES","data_real":true,"fluxo":"candidate-completion-status-html-workflow","curation_batch_id":"es-governador-fechamento-20260705","coverage_id":"ricardo-ferraco-governo-es-atos-oficiais-20260705","coverage_scope":"descoberta_oficial_escopada_governo_es_2026_sem_inventario_total","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"fonte_oficial_verificada_em":"2026-07-05T23:36:18-0300","source_proof":{"official_source_kind":"noticia_ales","law_number":"12.871/2026","published_in_doe":"2026-07-01","contains_sanction_by_governor":true}}'::jsonb
    )
) AS v(
  tipo_relacao,
  esfera,
  uf_norma,
  tipo_norma,
  numero,
  ano,
  data_norma,
  ementa,
  signatario,
  autoridade_papel,
  fonte_primaria_url,
  fonte_primaria_titulo,
  fonte_tramitacao_url,
  identificador_fonte,
  metadata
);

WITH target AS (
  SELECT
    c.id AS candidato_id,
    seed.*,
    (
      SELECT hp.id
      FROM public.historico_politico hp
      WHERE hp.candidato_id = c.id
        AND hp.tipo_evento = 'mandato'
        AND hp.cargo_canonico = 'Governador'
        AND hp.periodo_inicio <= seed.ano
        AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
      ORDER BY hp.periodo_inicio DESC NULLS LAST, hp.id
      LIMIT 1
    ) AS historico_politico_id
  FROM public.candidatos c
  CROSS JOIN _es_ricardo_lme seed
  WHERE c.slug = 'ricardo-ferraco'
)
INSERT INTO public.legislacao_mandato_executivo (
  candidato_id,
  historico_politico_id,
  tipo_relacao,
  esfera,
  uf_norma,
  tipo_norma,
  numero,
  ano,
  data_norma,
  ementa,
  signatario,
  autoridade_papel,
  fonte_primaria_url,
  fonte_primaria_titulo,
  fonte_tramitacao_url,
  identificador_fonte,
  metadata
)
SELECT
  candidato_id,
  historico_politico_id,
  tipo_relacao,
  esfera,
  uf_norma,
  tipo_norma,
  numero,
  ano,
  data_norma::date,
  ementa,
  signatario,
  autoridade_papel,
  fonte_primaria_url,
  fonte_primaria_titulo,
  fonte_tramitacao_url,
  identificador_fonte,
  metadata
FROM target
WHERE historico_politico_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.legislacao_mandato_executivo lme
    WHERE lme.candidato_id = target.candidato_id
      AND lme.identificador_fonte = target.identificador_fonte
  );

-- Magno Malta: historico Senado e dinheiro TSE 2010/2018/2022.
UPDATE public.historico_politico
SET
  partido = 'PL',
  cargo_canonico = 'Senador',
  tipo_evento = 'mandato',
  proveniencia = 'misto',
  observacoes = 'Senado Dados Abertos /senador/631/mandatos registra mandato ES 2003-2011; a resposta oficial lista PL, Sem Partido e PL no periodo consolidado.'
WHERE id = 'e5c298b2-44e7-4b17-aa18-a8ed56be6ae3';

UPDATE public.historico_politico
SET
  partido = 'PL',
  cargo_canonico = 'Senador',
  tipo_evento = 'mandato',
  proveniencia = 'misto',
  observacoes = 'Senado Dados Abertos /senador/631/mandatos registra mandato ES 2011-2019, titular, partido PL.'
WHERE id = '77a898e3-589a-4ce4-aa4e-9b06c4595483';

UPDATE public.historico_politico
SET
  partido = 'PL',
  cargo_canonico = 'Senador',
  tipo_evento = 'mandato',
  proveniencia = 'misto',
  observacoes = 'Senado Dados Abertos /senador/631/mandatos registra mandato ES 2023-2031, titular, partido PL.'
WHERE id = '59557142-939b-4150-89ef-95508ab55626';

CREATE TEMP TABLE _es_magno_patrimonio ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (2010, 941639.00, 'TSE Dados Abertos bem_candidato_2010_ES.csv SQ 80000000184 (11 bens; total agregado)'::text),
    (2018, 474315.68, 'TSE Dados Abertos bem_candidato_2018_ES.csv SQ 80000607499 (7 bens; total agregado)'::text),
    (2022, 657164.73, 'TSE Dados Abertos bem_candidato_2022_ES.csv SQ 80001720164 (11 bens; total agregado)'::text)
) AS v(ano_eleicao, valor_total, fonte);

UPDATE public.patrimonio p
SET
  valor_total = src.valor_total,
  fonte = src.fonte
FROM _es_magno_patrimonio src
JOIN public.candidatos c ON c.slug = 'magno-malta'
WHERE p.candidato_id = c.id
  AND p.ano_eleicao = src.ano_eleicao;

INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, src.ano_eleicao, src.valor_total, '[]'::jsonb, src.fonte
FROM _es_magno_patrimonio src
JOIN public.candidatos c ON c.slug = 'magno-malta'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.patrimonio p
  WHERE p.candidato_id = c.id
    AND p.ano_eleicao = src.ano_eleicao
);

CREATE TEMP TABLE _es_magno_financiamento ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (
      2010,
      2811759.23,
      875000.00,
      0.00,
      29600.72,
      17127.00,
      '[{"nome":"Diretorio Nacional","tipo":"PJ","valor":875000.00},{"nome":"SERVENG CIVILSAN SA EMPRESAS ASSOCIADAS DE ENGENHARIA","tipo":"PJ","valor":400000.00},{"nome":"TELEMONT ENGENHARIA DE TELECOMUNICACOES SA","tipo":"PJ","valor":300000.00},{"nome":"SA PAULISTA DE CONSTRUCOES E COMERCIO","tipo":"PJ","valor":100000.01},{"nome":"M.MARTINS ENGENHARIA E COMERCIO SA","tipo":"PJ","valor":100000.00},{"nome":"COMPANHIA DE BEBIDAS PRIMO SCHINCARIOL","tipo":"PJ","valor":100000.00},{"nome":"CBEMI CONSTRUTORA BRASILEIRA E MINERADORA LTDA","tipo":"PJ","valor":100000.00},{"nome":"GALVAO ENGENHARIA SA","tipo":"PJ","valor":100000.00},{"nome":"PROSUL PROJETOS SUPERVISAO E PLANEJAMENTOS LTDA","tipo":"PJ","valor":100000.00},{"nome":"TOP ENGENHARIA LTDA","tipo":"PJ","valor":100000.00}]'::jsonb,
      'TSE Dados Abertos prestacao_contas_2010.zip candidato/ES/ReceitasCandidatos.txt SQ 80000000184 (44 receitas; total agregado)'::text
    ),
    (
      2018,
      2819275.60,
      700000.00,
      2100000.00,
      15275.60,
      4000.00,
      '[{"nome":"Direcao Nacional","tipo":"PJ","valor":2700000.00},{"nome":"ELEICAO 2018 LAURIETE RODRIGUES DE JESUS MALTA DEPUTADO FEDERAL","tipo":"PJ","valor":100000.00},{"nome":"EUZIMAR LIVRAMENTO LAURENTINO","tipo":"PF","valor":4500.00},{"nome":"MOABE DE SOUZA CONCEICAO","tipo":"PF","valor":4000.00},{"nome":"DIEGO VELOSO FERREIRA","tipo":"PF","valor":4000.00},{"nome":"MAGNA KARLA SANTOS MALTA","tipo":"PF","valor":2325.60},{"nome":"MAGDA SANTOS MALTA","tipo":"PF","valor":2300.00},{"nome":"AMELIANO MALTA JUNIOR","tipo":"PF","valor":2150.00}]'::jsonb,
      'TSE Dados Abertos receitas_candidatos_2018_ES.csv SQ 80000607499 (9 receitas; total agregado)'::text
    ),
    (
      2022,
      2618962.00,
      150000.00,
      2000000.00,
      360992.00,
      0.00,
      '[{"nome":"Direcao Nacional","tipo":"PJ","valor":2253330.00},{"nome":"ELIZEU Z MAGGI SCHEFFER","tipo":"PF","valor":100000.00},{"nome":"ANTONIO CARLOS TORRES","tipo":"PF","valor":50000.00},{"nome":"FRANCISCO DE ASSIS TORRES","tipo":"PF","valor":50000.00},{"nome":"LUIS EDUARDO G GIRAO","tipo":"PF","valor":50000.00},{"nome":"LEANDRO INNOCENTI","tipo":"PF","valor":20000.00},{"nome":"GEANE APARECIDA FURLANETTI","tipo":"PF","valor":10000.00},{"nome":"MIGUEL DE SOUZA MAIA","tipo":"PF","valor":5768.00},{"nome":"ADRIANA CELIA SARTORIO BAZON","tipo":"PF","valor":5000.00},{"nome":"MAGDA SANTOS MALTA","tipo":"PF","valor":5000.00}]'::jsonb,
      'TSE Dados Abertos receitas_candidatos_2022_ES.csv SQ 80001720164 (36 receitas; total agregado)'::text
    )
) AS v(
  ano_eleicao,
  total_arrecadado,
  total_fundo_partidario,
  total_fundo_eleitoral,
  total_pessoa_fisica,
  total_recursos_proprios,
  maiores_doadores,
  fonte
);

UPDATE public.financiamento f
SET
  total_arrecadado = src.total_arrecadado,
  total_fundo_partidario = src.total_fundo_partidario,
  total_fundo_eleitoral = src.total_fundo_eleitoral,
  total_pessoa_fisica = src.total_pessoa_fisica,
  total_recursos_proprios = src.total_recursos_proprios,
  maiores_doadores = src.maiores_doadores,
  fonte = src.fonte
FROM _es_magno_financiamento src
JOIN public.candidatos c ON c.slug = 'magno-malta'
WHERE f.candidato_id = c.id
  AND f.ano_eleicao = src.ano_eleicao;

INSERT INTO public.financiamento (
  candidato_id,
  ano_eleicao,
  total_arrecadado,
  total_fundo_partidario,
  total_fundo_eleitoral,
  total_pessoa_fisica,
  total_recursos_proprios,
  maiores_doadores,
  fonte
)
SELECT
  c.id,
  src.ano_eleicao,
  src.total_arrecadado,
  src.total_fundo_partidario,
  src.total_fundo_eleitoral,
  src.total_pessoa_fisica,
  src.total_recursos_proprios,
  src.maiores_doadores,
  src.fonte
FROM _es_magno_financiamento src
JOIN public.candidatos c ON c.slug = 'magno-malta'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.financiamento f
  WHERE f.candidato_id = c.id
    AND f.ano_eleicao = src.ano_eleicao
);

CREATE TEMP TABLE _es_magno_ceaps ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (
      2019,
      4725.79,
      '[{"categoria":"Passagens aereas, aquaticas e terrestres nacionais","valor":2363.03},{"categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":2362.76}]'::jsonb,
      '[{"fornecedor":"Posto Tres Coqueiros Ltda","categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":2362.76,"documento":"14400","data":"22/01/2019","cod_documento":"2113501"},{"fornecedor":"Adria Viagens e Turismo Ltda","categoria":"Passagens aereas, aquaticas e terrestres nacionais","valor":919.28,"documento":"BUHQBB","data":"15/01/2019","cod_documento":"2113314"},{"fornecedor":"Adria Viagens e Turismo Ltda","categoria":"Passagens aereas, aquaticas e terrestres nacionais","valor":728.39,"documento":"ULWVEM","data":"20/12/2018","cod_documento":"2113310"},{"fornecedor":"Adria Viagens e Turismo Ltda","categoria":"Passagens aereas, aquaticas e terrestres nacionais","valor":715.36,"documento":"PFSFMT","data":"15/01/2019","cod_documento":"2113316"}]'::jsonb
    ),
    (
      2023,
      257928.37,
      '[{"categoria":"Passagens aereas, aquaticas e terrestres nacionais","valor":135212.33},{"categoria":"Aluguel de imoveis para escritorio politico, compreendendo despesas concernentes a eles.","valor":62114.03},{"categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":52500.00},{"categoria":"Aquisicao de material de consumo para uso no escritorio politico","valor":8102.01}]'::jsonb,
      '[{"fornecedor":"AMANDA LOCADORA DE VEICULOS LTDA","categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":5200.00,"documento":"1607","data":"30/03/2023","cod_documento":"2196667"},{"fornecedor":"AMANDA LOCADORA DE VEICULOS LTDA","categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":5200.00,"documento":"1632","data":"28/04/2023","cod_documento":"2198650"},{"fornecedor":"AMANDA LOCADORA DE VEICULOS LTDA","categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":5200.00,"documento":"1651","data":"31/05/2023","cod_documento":"2200995"},{"fornecedor":"AMANDA LOCADORA DE VEICULOS LTDA","categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":5200.00,"documento":"1664","data":"03/07/2023","cod_documento":"2203331"},{"fornecedor":"AMANDA LOCADORA DE VEICULOS LTDA","categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":5200.00,"documento":"1680","data":"31/07/2023","cod_documento":"2205611"}]'::jsonb
    ),
    (
      2024,
      315514.08,
      '[{"categoria":"Passagens aereas, aquaticas e terrestres nacionais","valor":143196.83},{"categoria":"Aluguel de imoveis para escritorio politico, compreendendo despesas concernentes a eles.","valor":92766.42},{"categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":74056.09},{"categoria":"Divulgacao da atividade parlamentar","valor":4000.00},{"categoria":"Aquisicao de material de consumo para uso no escritorio politico","valor":1494.74}]'::jsonb,
      '[{"fornecedor":"Adria Viagens e Turismo Ltda","categoria":"Passagens aereas, aquaticas e terrestres nacionais","valor":6162.32,"documento":"MOXLTB","data":"09/08/2024","cod_documento":"2235373"},{"fornecedor":"AMANDA LOCADORA DE VEICULOS LTDA","categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":5500.00,"documento":"1799","data":"30/04/2024","cod_documento":"2226475"},{"fornecedor":"AMANDA LOCADORA DE VEICULOS LTDA","categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":5500.00,"documento":"1809","data":"28/05/2024","cod_documento":"2228675"},{"fornecedor":"AMANDA LOCADORA DE VEICULOS LTDA","categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":5500.00,"documento":"1824","data":"28/06/2024","cod_documento":"2231147"},{"fornecedor":"AMANDA LOCADORA DE VEICULOS LTDA","categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":5500.00,"documento":"1838","data":"29/07/2024","cod_documento":"2233509"}]'::jsonb
    ),
    (
      2025,
      400026.56,
      '[{"categoria":"Passagens aereas, aquaticas e terrestres nacionais","valor":231771.66},{"categoria":"Aluguel de imoveis para escritorio politico, compreendendo despesas concernentes a eles.","valor":97081.41},{"categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":69000.00},{"categoria":"Aquisicao de material de consumo para uso no escritorio politico","valor":2173.49}]'::jsonb,
      '[{"fornecedor":"Britanica Viagens e Turismo","categoria":"Passagens aereas, aquaticas e terrestres nacionais","valor":7619.22,"documento":"GUTPUJ","data":"15/12/2025","cod_documento":"2278833"},{"fornecedor":"Britanica Viagens e Turismo","categoria":"Passagens aereas, aquaticas e terrestres nacionais","valor":7334.89,"documento":"IEBDRH","data":"18/02/2025","cod_documento":"2249965"},{"fornecedor":"Britanica Viagens e Turismo","categoria":"Passagens aereas, aquaticas e terrestres nacionais","valor":7173.86,"documento":"LQZXGP","data":"29/12/2025","cod_documento":"2278836"},{"fornecedor":"AMANDA LOCADORA DE VEICULOS LTDA","categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":5800.00,"documento":"1940","data":"27/03/2025","cod_documento":"2252317"},{"fornecedor":"AMANDA LOCADORA DE VEICULOS LTDA","categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":5800.00,"documento":"1954","data":"29/04/2025","cod_documento":"2255363"}]'::jsonb
    ),
    (
      2026,
      187032.46,
      '[{"categoria":"Passagens aereas, aquaticas e terrestres nacionais","valor":107845.24},{"categoria":"Aluguel de imoveis para escritorio politico, compreendendo despesas concernentes a eles.","valor":49375.98},{"categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":29000.00},{"categoria":"Aquisicao de material de consumo para uso no escritorio politico","valor":811.24}]'::jsonb,
      '[{"fornecedor":"Britanica Viagens e Turismo","categoria":"Passagens aereas, aquaticas e terrestres nacionais","valor":8690.44,"documento":"AZWGND","data":"12/03/2026","cod_documento":"2283170"},{"fornecedor":"Britanica Viagens e Turismo","categoria":"Passagens aereas, aquaticas e terrestres nacionais","valor":8160.66,"documento":"HBKUEG","data":"08/03/2026","cod_documento":"2282782"},{"fornecedor":"Britanica Viagens e Turismo","categoria":"Passagens aereas, aquaticas e terrestres nacionais","valor":6462.76,"documento":"NDUTNG","data":"31/03/2026","cod_documento":"2285477"},{"fornecedor":"AMANDA LOCADORA DE VEICULOS LTDA","categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":5800.00,"documento":"2086","data":"03/02/2026","cod_documento":"2279891"},{"fornecedor":"AMANDA LOCADORA DE VEICULOS LTDA","categoria":"Locomocao, hospedagem, alimentacao, combustiveis e lubrificantes","valor":5800.00,"documento":"2093","data":"03/03/2026","cod_documento":"2282084"}]'::jsonb
    )
) AS v(ano, total_gasto, detalhamento, gastos_destaque);

UPDATE public.gastos_parlamentares gp
SET
  total_gasto = src.total_gasto,
  detalhamento = src.detalhamento,
  gastos_destaque = src.gastos_destaque,
  fonte = 'Senado CEAPS'
FROM _es_magno_ceaps src
JOIN public.candidatos c ON c.slug = 'magno-malta'
WHERE gp.candidato_id = c.id
  AND gp.ano = src.ano;

INSERT INTO public.gastos_parlamentares (
  candidato_id,
  ano,
  total_gasto,
  detalhamento,
  gastos_destaque,
  fonte
)
SELECT
  c.id,
  src.ano,
  src.total_gasto,
  src.detalhamento,
  src.gastos_destaque,
  'Senado CEAPS'
FROM _es_magno_ceaps src
JOIN public.candidatos c ON c.slug = 'magno-malta'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.gastos_parlamentares gp
  WHERE gp.candidato_id = c.id
    AND gp.ano = src.ano
);

-- Normalizacao de proveniencia em linhas ES que ja declaravam a fonte em observacoes.
UPDATE public.historico_politico hp
SET proveniencia = CASE
  WHEN hp.observacoes ILIKE '%TSE%' OR hp.observacoes ILIKE '%ELEITO%' OR hp.observacoes ILIKE '%SUPLENTE%' OR hp.observacoes ILIKE '%NÃO ELEITO%' THEN 'tse'
  WHEN hp.observacoes ILIKE '%Câmara%' OR hp.observacoes ILIKE '%Camara%' OR hp.observacoes ILIKE '%Senado%' OR hp.observacoes ILIKE '%Prefeitura%' THEN 'misto'
  ELSE 'manual'
END
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug IN ('helder-salomao', 'pazolini', 'ricardo-ferraco')
  AND hp.proveniencia IS NULL
  AND hp.observacoes IS NOT NULL;
