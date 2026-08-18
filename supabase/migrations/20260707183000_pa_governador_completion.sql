-- PA Governador: fechamento TSE/dinheiro/perfil para os seis candidatos publicos.
-- Fontes: ZIPs oficiais TSE em data/tse (consulta_cand, bem_candidato e receitas_candidatos PA),
-- revisoes editoriais locais ja materializadas e fontes publicas registradas em pontos_atencao.

BEGIN;

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(slug, ', ' ORDER BY slug)
    INTO missing
  FROM (
    VALUES
      ('araceli-lemos'),
      ('cleber-rabelo'),
      ('dr-daniel'),
      ('hana-ghassan'),
      ('mario-couto'),
      ('raquel-bricio')
  ) AS expected(slug)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.candidatos c
    WHERE c.slug = expected.slug
      AND c.publicavel = true
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'PA governador candidatos publicos ausentes: %', missing;
  END IF;
END $$;

UPDATE public.candidatos
SET
  nome_completo = 'Mário Couto Filho',
  data_nascimento = '1946-01-14',
  formacao = 'SUPERIOR COMPLETO',
  profissao_declarada = 'ADMINISTRADOR'
WHERE slug = 'mario-couto';

UPDATE public.candidatos
SET
  nome_completo = 'Raquel Nonato de Brício',
  data_nascimento = '1991-10-12',
  formacao = 'SUPERIOR COMPLETO',
  profissao_declarada = 'SERVIDOR PÚBLICO FEDERAL'
WHERE slug = 'raquel-bricio';

-- SQ 50001614695 e homonimo da Bahia, nao Daniel Barbosa Santos (PA).
DELETE FROM public.financiamento f
USING public.candidatos c
WHERE f.candidato_id = c.id
  AND c.slug = 'dr-daniel'
  AND f.ano_eleicao = 2022;

CREATE TEMP TABLE _pa_patrimonio ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('araceli-lemos', 2010, 120617.42, '[{"tipo":"Veículo automotor terrestre","descricao":"Honda Fit LX Flex ano 2008","valor":58000.00},{"tipo":"Depósito bancário","descricao":"Banco do Brasil","valor":1017.42},{"tipo":"Terreno","descricao":"Terrenos em Castanhal/PA","valor":32000.00},{"tipo":"Jóias","descricao":"Compra de jóias","valor":20000.00},{"tipo":"Consórcio não contemplado","descricao":"Consórcio de veículo Honda","valor":9600.00}]'::jsonb),
    ('cleber-rabelo', 2018, 13500.00, '[{"tipo":"Veículo automotor terrestre","descricao":"TSE sem descricao publica alem de #NULO#","valor":13500.00}]'::jsonb),
    ('cleber-rabelo', 2020, 30000.00, '[{"tipo":"Outros bens móveis","descricao":"Carro Cobalt Chevrolet 1.4 ano 2014","valor":30000.00}]'::jsonb),
    ('cleber-rabelo', 2022, 40000.00, '[{"tipo":"Outros bens móveis","descricao":"Carro Cobalt 1.4 ano 2014","valor":40000.00}]'::jsonb),
    ('mario-couto', 2014, 3128537.72, '[]'::jsonb),
    ('mario-couto', 2020, 1155000.00, '[]'::jsonb),
    ('mario-couto', 2022, 465727.20, '[]'::jsonb)
) AS v(slug, ano_eleicao, valor_total, bens);

UPDATE public.patrimonio p
SET
  valor_total = src.valor_total,
  bens = src.bens,
  fonte = 'TSE'
FROM _pa_patrimonio src
JOIN public.candidatos c ON c.slug = src.slug
WHERE p.candidato_id = c.id
  AND p.ano_eleicao = src.ano_eleicao;

INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, src.ano_eleicao, src.valor_total, src.bens, 'TSE'
FROM _pa_patrimonio src
JOIN public.candidatos c ON c.slug = src.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.patrimonio p
  WHERE p.candidato_id = c.id
    AND p.ano_eleicao = src.ano_eleicao
);

CREATE TEMP TABLE _pa_financiamento ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('araceli-lemos', 2010, 56161.00, '[{"nome":"GRAFITH EXPRESSO GRÁFICA E EDITORA","tipo":"PJ","valor":11695.00},{"nome":"ARACELI MARIA PEREIRA LEMOS","tipo":"PF","valor":6250.50},{"nome":"FRANCIARA PEREIRA LEMOS","tipo":"PF","valor":5000.00},{"nome":"J B MONTENEGRO CARDOSO","tipo":"PF","valor":5000.00},{"nome":"ANTONIO DOS REIS PEREIRA","tipo":"PF","valor":4000.00}]'::jsonb),
    ('cleber-rabelo', 2010, 19280.00, '[{"nome":"Comitê Financeiro Único","tipo":"PJ","valor":14100.00},{"nome":"ALEXANDRE BENEDITO FAVACHO MELO","tipo":"PF","valor":1600.00},{"nome":"WALTER SILVA SANTOS","tipo":"PF","valor":1600.00},{"nome":"FELIPE MOREIRA ALVARES","tipo":"PF","valor":660.00},{"nome":"ANILSON TRINDADE NOGUEIRA","tipo":"PF","valor":660.00}]'::jsonb),
    ('cleber-rabelo', 2012, 68437.16, '[{"nome":"Comitê Financeiro Municipal Único","tipo":"PJ","valor":63937.16},{"nome":"ELEIÇÃO 2012 EDMILSON BRITO RODRIGUES - PREFEITO","tipo":"PJ","valor":4500.00}]'::jsonb),
    ('cleber-rabelo', 2014, 30425.73, '[{"nome":"Comitê Financeiro Único","tipo":"PJ","valor":30205.73},{"nome":"WILLIAM PESSOA DA MOTA JUNIOR","tipo":"PF","valor":220.00}]'::jsonb),
    ('cleber-rabelo', 2016, 40765.00, '[{"nome":"FRANCISCO EDYR SOUSA DA SILVA SEGUNDO","tipo":"PF","valor":5130.00},{"nome":"ANDREA DA SILVA NEVES","tipo":"PF","valor":4930.00},{"nome":"CARLOS CLEY RAMOS PAIVA","tipo":"PF","valor":3400.00},{"nome":"ANACELY DE JESUS RODRIGUES","tipo":"PF","valor":3000.00},{"nome":"ANTONIO SÉRGIO VASCONCELOS DARWICH","tipo":"PF","valor":1920.00}]'::jsonb),
    ('cleber-rabelo', 2018, 35213.20, '[{"nome":"PARTIDO SOCIALISTA DOS TRABALHADORES UNIFICADO PSTU","tipo":"PJ","valor":29420.00},{"nome":"JOSE CLEBER BARROS RABELO","tipo":"PF","valor":1693.20},{"nome":"BIANCA BRABO CANCIO","tipo":"PF","valor":1000.00},{"nome":"PARTIDO SOCIALISTA DOS TRABALHADORES UNIFICADOS","tipo":"PJ","valor":600.00},{"nome":"AURINOR GAMA MARQUES","tipo":"PF","valor":500.00}]'::jsonb),
    ('cleber-rabelo', 2020, 14000.00, '[{"nome":"PARTIDO SOCIALISTA DOS TRABALHADORES UNIFICADO PSTU","tipo":"PJ","valor":13300.00},{"nome":"BRUNO GOMES TERRIBAS","tipo":"PF","valor":700.00}]'::jsonb),
    ('cleber-rabelo', 2022, 25000.00, '[{"nome":"PARTIDO SOCIALISTA DOS TRABALHADORES UNIFICADO PSTU","tipo":"PJ","valor":25000.00}]'::jsonb),
    ('mario-couto', 2014, 865987.57, '[{"nome":"Comitê Financeiro Único","tipo":"PJ","valor":263864.00},{"nome":"MARIO COUTO FILHO","tipo":"PF","valor":198702.10},{"nome":"POLO SEGURANÇA ESPECIALIZADA LTDA","tipo":"PJ","valor":100000.00},{"nome":"Direção Estadual/Distrital","tipo":"PJ","valor":100000.00},{"nome":"COMPANHIA DE BEBIDAS BRASIL KIRIN","tipo":"PJ","valor":30000.00}]'::jsonb),
    ('mario-couto', 2020, 59400.00, '[{"nome":"MARIO COUTO FILHO","tipo":"PF","valor":59400.00}]'::jsonb),
    ('mario-couto', 2022, 1045301.00, '[{"nome":"PARTIDO LIBERAL (PL)","tipo":"PJ","valor":1000000.00},{"nome":"MARINETE DA SILVA","tipo":"PF","valor":8000.00},{"nome":"LINDALVA GOMES SILVA","tipo":"PF","valor":5000.00},{"nome":"MARIA DA CONCEICAO LOBO COSTA","tipo":"PF","valor":5000.00},{"nome":"JOCELINE COELHO PENA","tipo":"PF","valor":5000.00}]'::jsonb),
    ('raquel-bricio', 2020, 11069.50, '[{"nome":"UNIDADE POPULAR - BELEM-PA - MUNICIPAL","tipo":"PJ","valor":9109.50},{"nome":"FERNANDA MARISTANE LOPES ARAUJO","tipo":"PF","valor":1500.00},{"nome":"BRUNA FREIRE DE ALMEIDA","tipo":"PF","valor":210.00},{"nome":"SIMONE MARIA PAMPLONA MOREIRA","tipo":"PF","valor":100.00},{"nome":"DANYELLE RODRIGUES MARTINS","tipo":"PF","valor":100.00}]'::jsonb),
    ('raquel-bricio', 2022, 59930.00, '[{"nome":"UNIDADE POPULAR - PARA - PA - ESTADUAL","tipo":"PJ","valor":58500.00},{"nome":"JOSE RENATO HENRIQUES BEZERRA","tipo":"PF","valor":1200.00},{"nome":"TALES EFRAIM PERES FALQUETO","tipo":"PF","valor":100.00},{"nome":"GHABRIEL MORAIS PORTAL","tipo":"PF","valor":100.00},{"nome":"RODRIGO GONDIM SILVA","tipo":"PF","valor":30.00}]'::jsonb)
) AS v(slug, ano_eleicao, total_arrecadado, maiores_doadores);

UPDATE public.financiamento f
SET
  total_arrecadado = src.total_arrecadado,
  total_fundo_partidario = 0,
  total_fundo_eleitoral = 0,
  total_pessoa_fisica = 0,
  total_recursos_proprios = 0,
  maiores_doadores = src.maiores_doadores,
  fonte = 'TSE'
FROM _pa_financiamento src
JOIN public.candidatos c ON c.slug = src.slug
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
  0,
  0,
  0,
  0,
  src.maiores_doadores,
  'TSE'
FROM _pa_financiamento src
JOIN public.candidatos c ON c.slug = src.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.financiamento f
  WHERE f.candidato_id = c.id
    AND f.ano_eleicao = src.ano_eleicao
);

UPDATE public.historico_politico hp
SET proveniencia = 'tse'
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug = 'dr-daniel'
  AND hp.proveniencia IS NULL
  AND hp.observacoes ILIKE '%TSE%';

UPDATE public.historico_politico hp
SET proveniencia = 'misto'
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug = 'dr-daniel'
  AND hp.proveniencia IS NULL
  AND hp.observacoes ILIKE '%O Liberal%';

INSERT INTO public.mudancas_partido (
  candidato_id,
  partido_anterior,
  partido_novo,
  data_mudanca,
  ano,
  contexto
)
SELECT
  c.id,
  'PSB',
  'PODEMOS',
  NULL,
  2026,
  'Timeline partidaria alinhada ao partido atual publicado (PODEMOS); biografia publica e auditoria editorial registram filiacao ao Podemos no ciclo 2026.'
FROM public.candidatos c
WHERE c.slug = 'dr-daniel'
  AND NOT EXISTS (
    SELECT 1
    FROM public.mudancas_partido mp
    WHERE mp.candidato_id = c.id
      AND mp.partido_novo IN ('PODE', 'PODEMOS')
  );

UPDATE public.historico_politico hp
SET proveniencia = CASE
  WHEN hp.observacoes ILIKE '%TSE%' THEN 'tse'
  WHEN hp.observacoes ILIKE '%O Liberal%' OR hp.observacoes ILIKE '%Governo do Para%' THEN 'misto'
  ELSE 'manual'
END
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug = 'hana-ghassan'
  AND hp.proveniencia IS NULL;

UPDATE public.pontos_atencao pa
SET
  visivel = false,
  verificado = false
FROM public.candidatos c
WHERE pa.candidato_id = c.id
  AND c.slug = 'dr-daniel'
  AND pa.titulo = 'Sem histórico de mandato eletivo registrado';

UPDATE public.pontos_atencao pa
SET
  fontes = '[{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/PA/2040602022/candidato/140001651992","titulo":"TSE DivulgaCand 2022 - Hana Ghassan"},{"url":"https://www.agenciapara.com.br/noticia/65077/hana-ghassan-assume-o-governo-do-para-em-cerimonia-no-palacio-dos-despachos","titulo":"Agencia Para - posse no Governo do Para"}]'::jsonb,
  verificado = true,
  gerado_por = 'curadoria'
FROM public.candidatos c
WHERE pa.candidato_id = c.id
  AND c.slug = 'hana-ghassan'
  AND pa.titulo = 'Carreira política: 2 mandato(s) registrado(s)';

DO $$
DECLARE
  v_count integer;
  v_dr uuid;
BEGIN
  SELECT id INTO v_dr FROM public.candidatos WHERE slug = 'dr-daniel';

  IF EXISTS (SELECT 1 FROM public.financiamento WHERE candidato_id = v_dr AND ano_eleicao = 2022) THEN
    RAISE EXCEPTION 'dr-daniel financiamento 2022 homonimo nao removido';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.patrimonio p
  JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE c.slug = 'araceli-lemos'
    AND p.ano_eleicao IN (2010, 2018);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'araceli patrimonio esperado 2010/2018, encontrado %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.financiamento f
  JOIN public.candidatos c ON c.id = f.candidato_id
  WHERE c.slug = 'cleber-rabelo'
    AND f.ano_eleicao IN (2010, 2012, 2014, 2016, 2018, 2020, 2022);
  IF v_count <> 7 THEN
    RAISE EXCEPTION 'cleber financiamento esperado 7 anos, encontrado %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.patrimonio p
  JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE c.slug = 'mario-couto'
    AND p.ano_eleicao IN (2014, 2020, 2022);
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'mario-couto patrimonio esperado 3 anos, encontrado %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.financiamento f
  JOIN public.candidatos c ON c.id = f.candidato_id
  WHERE c.slug = 'raquel-bricio'
    AND f.ano_eleicao IN (2020, 2022);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'raquel-bricio financiamento esperado 2 anos, encontrado %', v_count;
  END IF;
END $$;

COMMIT;
