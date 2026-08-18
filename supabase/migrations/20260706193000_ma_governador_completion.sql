-- MA Governador: saneamento de historico, identidade TSE e pontos antes do fechamento.
-- Fontes: TSE consulta_cand 2010/2012/2014/2016/2018/2020/2022/2024,
-- ALEMA e dados publicos ja materializados no produto.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'andre-luis' AND publicavel = true) THEN
    RAISE EXCEPTION 'andre-luis nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'eduardo-braide' AND publicavel = true) THEN
    RAISE EXCEPTION 'eduardo-braide nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'enilton-rodrigues' AND publicavel = true) THEN
    RAISE EXCEPTION 'enilton-rodrigues nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'felipe-camarao' AND publicavel = true) THEN
    RAISE EXCEPTION 'felipe-camarao nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'orleans-brandao' AND publicavel = true) THEN
    RAISE EXCEPTION 'orleans-brandao nao encontrado ou nao publicavel';
  END IF;
END $$;

UPDATE public.candidatos
SET
  nome_completo = 'Carlos Orleans Brandão Junior',
  ultima_atualizacao = now()
WHERE slug = 'orleans-brandao'
  AND nome_completo IS DISTINCT FROM 'Carlos Orleans Brandão Junior';

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
  'candidatura',
  'Pre-candidato a Governador',
  'Governador',
  'MA',
  2026,
  NULL,
  'MISSAO',
  NULL,
  'Perfil publico @andreluismbl/Partido Missao registra pre-candidatura ao Governo do Maranhao; consulta_cand TSE MA/BR 2010-2024 nao retornou SQ vinculavel ao perfil publico de Andre Luis, apenas homonimos sem identidade confirmavel.',
  'misto'
FROM public.candidatos c
WHERE c.slug = 'andre-luis'
  AND NOT EXISTS (
    SELECT 1
    FROM public.historico_politico hp
    WHERE hp.candidato_id = c.id
      AND hp.periodo_inicio = 2026
      AND hp.cargo_canonico = 'Governador'
  );

UPDATE public.historico_politico hp
SET proveniencia = 'tse'
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug IN ('eduardo-braide', 'enilton-rodrigues', 'felipe-camarao')
  AND hp.proveniencia IS NULL
  AND hp.observacoes ILIKE '%TSE%';

UPDATE public.historico_politico hp
SET proveniencia = 'manual'
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug IN ('felipe-camarao')
  AND hp.proveniencia IS NULL
  AND (
    hp.observacoes ILIKE '%curadoria%'
    OR hp.observacoes ILIKE '%Governo do MA%'
  );

UPDATE public.pontos_atencao
SET
  verificado = true,
  gerado_por = 'curadoria',
  descricao = 'Enilton Rodrigues tem candidaturas materializadas no TSE em 2016, 2018, 2020, 2022 e 2024; nao ha mandato eletivo materializado no contrato publico atual.',
  fontes = '[{"url":"https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_{ano}.zip","titulo":"TSE Dados Abertos - consulta_cand 2016/2018/2020/2022/2024"}]'::jsonb
WHERE id = 'c42f394c-49ea-4e93-b21d-dbf0186512f1';

UPDATE public.pontos_atencao
SET
  visivel = false,
  verificado = false,
  descricao = descricao || ' [Oculto em 2026-07-06: ponto IA contradizia historico ja materializado de Felipe Camarao como vice-governador eleito e secretario.]'
WHERE id = '280c85fc-a3a8-4f8e-b081-d3d5b7d3cc5c';

UPDATE public.pontos_atencao
SET
  verificado = true,
  gerado_por = 'curadoria',
  descricao = 'Eduardo Costa Braide tem historico materializado como deputado estadual, deputado federal e prefeito de Sao Luis, alem de candidaturas TSE anteriores.',
  fontes = '[{"url":"https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_{ano}.zip","titulo":"TSE Dados Abertos - consulta_cand"},{"url":"https://dadosabertos.camara.leg.br/","titulo":"Camara dos Deputados - Dados Abertos"}]'::jsonb
WHERE id = 'feb712e3-bc11-45c4-b1e1-ac637e1594d6';

UPDATE public.pontos_atencao
SET
  verificado = true,
  gerado_por = 'curadoria',
  descricao = 'Carlos Orleans Brandao Junior tem historico materializado como deputado federal, vice-governador e governador do Maranhao; o slug local permanece orleans-brandao.',
  fontes = '[{"url":"https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_{ano}.zip","titulo":"TSE Dados Abertos - consulta_cand 2010/2014/2018/2022"},{"url":"https://app.stc.ma.gov.br/legisla/","titulo":"STC-MA Legisla"}]'::jsonb
WHERE id = 'df1ea0bc-afc2-407f-8db0-c031841d438e';

UPDATE public.processos
SET
  descricao = 'Assembleia Legislativa do Maranhao registrou CPI para apurar denuncias de corrupcao e lavagem de dinheiro envolvendo a estrutura administrativa da Vice-Governadoria, o vice-governador Felipe Camarao e servidores do orgao.',
  status = 'em_andamento',
  fonte = 'ALEMA',
  url_fonte = 'https://www.al.ma.leg.br/sitealema/diario-da-manha-detalha-trabalhos-iniciais-da-cpi-que-apura-denuncias-de-corrupcao-na-vice-governadoria-do-maranhao/'
FROM public.candidatos c
WHERE processos.candidato_id = c.id
  AND c.slug = 'felipe-camarao'
  AND processos.id = 'c4733b38-09c9-4e98-b529-8ee3c0fdf939';

CREATE TEMP TABLE _ma_orleans_patrimonio ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('orleans-brandao', 2010, 582009.70, 'TSE Dados Abertos bem_candidato_2010 SQ 100000000020 (20 bens; total agregado)'::text),
    ('orleans-brandao', 2014, 552853.14, 'TSE Dados Abertos bem_candidato_2014 SQ 100000000015 (24 bens; total agregado)'::text),
    ('orleans-brandao', 2018, 139372.34, 'TSE Dados Abertos bem_candidato_2018 SQ 100000603919 (8 bens; total agregado)'::text),
    ('orleans-brandao', 2022, 957451.88, 'TSE Dados Abertos bem_candidato_2022 SQ 100001667487 (14 bens; total agregado)'::text)
) AS v(slug, ano_eleicao, valor_total, fonte);

UPDATE public.patrimonio p
SET
  valor_total = src.valor_total,
  fonte = src.fonte
FROM _ma_orleans_patrimonio src
JOIN public.candidatos c ON c.slug = src.slug
WHERE p.candidato_id = c.id
  AND p.ano_eleicao = src.ano_eleicao;

INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, src.ano_eleicao, src.valor_total, '[]'::jsonb, src.fonte
FROM _ma_orleans_patrimonio src
JOIN public.candidatos c ON c.slug = src.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.patrimonio p
  WHERE p.candidato_id = c.id
    AND p.ano_eleicao = src.ano_eleicao
);

CREATE TEMP TABLE _ma_orleans_financiamento ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (
      'orleans-brandao',
      2010,
      181310.80,
      0.00,
      0.00,
      0.00,
      100000.00,
      '[{"nome":"CARLOS ORLEANS BRANDAO JUNIOR","tipo":"PF","valor":100000.00},{"nome":"SUZANO PAPEL E CELULOSE S/A","tipo":"PJ","valor":45612.00},{"nome":"HELOISA HELENA BRANDAO PIMENTEL","tipo":"PF","valor":7000.00},{"nome":"VICTOR LEANDRO BARROS LAGO","tipo":"PF","valor":6000.00},{"nome":"LUZIA DE JESUS WAQUIM","tipo":"PF","valor":6000.00},{"nome":"DANIELLE AROUCHE DA PENHA","tipo":"PF","valor":6000.00},{"nome":"MARCUS BARBOSA BRANDAO","tipo":"PF","valor":4000.00},{"nome":"JACKSON KEPLER LAGO","tipo":"PF","valor":2698.80},{"nome":"JOSE DE RIBAMAR CASTRO VIANA JUNIOR","tipo":"PF","valor":2000.00},{"nome":"ROSARITA ALVES DE SOUSA","tipo":"PF","valor":1000.00}]'::jsonb
    ),
    (
      'orleans-brandao',
      2022,
      14500200.00,
      0.00,
      10000000.00,
      0.00,
      0.00,
      '[{"nome":"Direcao Nacional","tipo":"PJ","valor":10000000.00},{"nome":"WASHINGTON UMBERTO CINEL","tipo":"PF","valor":1400000.00},{"nome":"MARCELO JULIO VIEIRA BRASIL","tipo":"PF","valor":1000000.00},{"nome":"ROBERTO REIS DE ALBUQUERQUE","tipo":"PF","valor":240000.00},{"nome":"JOAO CARLOS FREITAS DE CAMARGO","tipo":"PF","valor":200000.00},{"nome":"ANTONIO TARCISIO DA SILVA","tipo":"PF","valor":148000.00},{"nome":"AISLAN CAMARA CURY HELUY","tipo":"PF","valor":144000.00},{"nome":"ANTONIO DE JESUS LEITAO NUNES","tipo":"PF","valor":100000.00},{"nome":"JOSE RONIERD DOS SANTOS BARROS SOUSA","tipo":"PF","valor":100000.00},{"nome":"EURICO ALVES NUNES","tipo":"PF","valor":100000.00}]'::jsonb
    )
) AS v(
  slug,
  ano_eleicao,
  total_arrecadado,
  total_fundo_partidario,
  total_fundo_eleitoral,
  total_pessoa_fisica,
  total_recursos_proprios,
  maiores_doadores
);

UPDATE public.financiamento f
SET
  total_arrecadado = src.total_arrecadado,
  total_fundo_partidario = src.total_fundo_partidario,
  total_fundo_eleitoral = src.total_fundo_eleitoral,
  total_pessoa_fisica = src.total_pessoa_fisica,
  total_recursos_proprios = src.total_recursos_proprios,
  maiores_doadores = src.maiores_doadores,
  fonte = 'TSE'
FROM _ma_orleans_financiamento src
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
  src.total_fundo_partidario,
  src.total_fundo_eleitoral,
  src.total_pessoa_fisica,
  src.total_recursos_proprios,
  src.maiores_doadores,
  'TSE'
FROM _ma_orleans_financiamento src
JOIN public.candidatos c ON c.slug = src.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.financiamento f
  WHERE f.candidato_id = c.id
    AND f.ano_eleicao = src.ano_eleicao
);

DO $$
DECLARE
  sem_proveniencia integer;
  andre_historico integer;
  felipe_ponto_falso integer;
  orleans_patrimonio integer;
  orleans_financiamento integer;
BEGIN
  SELECT count(*) INTO sem_proveniencia
  FROM public.historico_politico hp
  JOIN public.candidatos c ON c.id = hp.candidato_id
  WHERE c.slug IN ('andre-luis', 'eduardo-braide', 'enilton-rodrigues', 'felipe-camarao', 'orleans-brandao')
    AND hp.proveniencia IS NULL;

  SELECT count(*) INTO andre_historico
  FROM public.historico_politico hp
  JOIN public.candidatos c ON c.id = hp.candidato_id
  WHERE c.slug = 'andre-luis'
    AND hp.periodo_inicio = 2026
    AND hp.cargo_canonico = 'Governador';

  SELECT count(*) INTO felipe_ponto_falso
  FROM public.pontos_atencao
  WHERE id = '280c85fc-a3a8-4f8e-b081-d3d5b7d3cc5c'
    AND visivel = true;

  SELECT count(*) INTO orleans_patrimonio
  FROM public.patrimonio p
  JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE c.slug = 'orleans-brandao'
    AND p.ano_eleicao IN (2010, 2014, 2018, 2022);

  SELECT count(*) INTO orleans_financiamento
  FROM public.financiamento f
  JOIN public.candidatos c ON c.id = f.candidato_id
  WHERE c.slug = 'orleans-brandao'
    AND f.ano_eleicao IN (2010, 2022);

  IF sem_proveniencia <> 0 THEN
    RAISE EXCEPTION 'MA Governador ainda tem % linhas de historico sem proveniencia', sem_proveniencia;
  END IF;
  IF andre_historico <> 1 THEN
    RAISE EXCEPTION 'andre-luis sem historico minimo de pre-candidatura';
  END IF;
  IF felipe_ponto_falso <> 0 THEN
    RAISE EXCEPTION 'ponto IA falso de felipe-camarao continua visivel';
  END IF;
  IF orleans_patrimonio <> 4 THEN
    RAISE EXCEPTION 'orleans-brandao patrimonio esperado 4, encontrado %', orleans_patrimonio;
  END IF;
  IF orleans_financiamento <> 2 THEN
    RAISE EXCEPTION 'orleans-brandao financiamento esperado 2, encontrado %', orleans_financiamento;
  END IF;
END $$;
