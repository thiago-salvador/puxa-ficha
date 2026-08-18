-- DF Governador: fechamento de dinheiro TSE e historico minimo fonteado.
-- Fontes: TSE consulta_cand/bem_candidato/prestacao_contas; Metropoles; Brasil de Fato.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'izalci-lucas' AND publicavel = true) THEN
    RAISE EXCEPTION 'izalci-lucas nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'jose-roberto-arruda' AND publicavel = true) THEN
    RAISE EXCEPTION 'jose-roberto-arruda nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'kiko-caputo' AND publicavel = true) THEN
    RAISE EXCEPTION 'kiko-caputo nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'samara-mineiro' AND publicavel = true) THEN
    RAISE EXCEPTION 'samara-mineiro nao encontrado ou nao publicavel';
  END IF;
END $$;

INSERT INTO public.historico_politico (
  candidato_id,
  cargo,
  periodo_inicio,
  periodo_fim,
  partido,
  estado,
  eleito_por,
  observacoes,
  cargo_canonico,
  tipo_evento,
  proveniencia
)
SELECT
  c.id,
  'Pre-candidato a Governador',
  2026,
  NULL,
  'NOVO',
  'DF',
  NULL,
  'Metropoles informou em 31/03/2026 que o advogado Francisco Caputo, conhecido como Kiko Caputo, iria se filiar ao NOVO para disputar o Governo do DF em 2026; Correio Braziliense registrou lancamento da pre-candidatura em maio de 2026.',
  'Governador',
  'candidatura',
  'misto'
FROM public.candidatos c
WHERE c.slug = 'kiko-caputo'
  AND NOT EXISTS (
    SELECT 1 FROM public.historico_politico hp
    WHERE hp.candidato_id = c.id
      AND hp.periodo_inicio = 2026
      AND hp.cargo ILIKE '%Governador%'
  );

INSERT INTO public.historico_politico (
  candidato_id,
  cargo,
  periodo_inicio,
  periodo_fim,
  partido,
  estado,
  eleito_por,
  observacoes,
  cargo_canonico,
  tipo_evento,
  proveniencia
)
SELECT
  c.id,
  'Pre-candidata a Governadora',
  2026,
  NULL,
  'UP',
  'DF',
  NULL,
  'Brasil de Fato informou em 28/05/2026 que a Unidade Popular lancaria Samara Mineiro como pre-candidata ao Governo do Distrito Federal; a fonte a descreve como professora da rede publica do DF.',
  'Governador',
  'candidatura',
  'misto'
FROM public.candidatos c
WHERE c.slug = 'samara-mineiro'
  AND NOT EXISTS (
    SELECT 1 FROM public.historico_politico hp
    WHERE hp.candidato_id = c.id
      AND hp.periodo_inicio = 2026
      AND hp.cargo ILIKE '%Governador%'
  );

CREATE TEMP TABLE _df_patrimonio ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('izalci-lucas', 2010, 6362764.83, 'TSE Dados Abertos bem_candidato_2010 SQ 70000000726 (37 bens deduplicados; total agregado)'::text),
    ('izalci-lucas', 2014, 8903714.51, 'TSE Dados Abertos bem_candidato_2014 SQ 70000001075 (30 bens deduplicados; total agregado)'::text),
    ('izalci-lucas', 2018, 8453062.33, 'TSE Dados Abertos bem_candidato_2018 SQ 70000625515 (24 bens deduplicados; total agregado)'::text),
    ('izalci-lucas', 2022, 8701004.63, 'TSE Dados Abertos bem_candidato_2022 SQ 70001651176 (17 bens deduplicados; total agregado)'::text),
    ('jose-roberto-arruda', 2014, 1509296.63, 'TSE Dados Abertos bem_candidato_2014 SQ 70000000153 (10 bens deduplicados; total agregado)'::text)
) AS v(slug, ano_eleicao, valor_total, fonte);

UPDATE public.patrimonio p
SET
  valor_total = src.valor_total,
  fonte = src.fonte
FROM _df_patrimonio src
JOIN public.candidatos c ON c.slug = src.slug
WHERE p.candidato_id = c.id
  AND p.ano_eleicao = src.ano_eleicao;

INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, src.ano_eleicao, src.valor_total, '[]'::jsonb, src.fonte
FROM _df_patrimonio src
JOIN public.candidatos c ON c.slug = src.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.patrimonio p
  WHERE p.candidato_id = c.id
    AND p.ano_eleicao = src.ano_eleicao
);

CREATE TEMP TABLE _df_financiamento ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (
      'izalci-lucas',
      2010,
      761944.72,
      3960.00,
      0.00,
      0.00,
      455000.00,
      '[{"nome":"IZALCI LUCAS FERREIRA","tipo":"PF","valor":455000.00},{"nome":"Comite Financeiro Unico","tipo":"PJ","valor":170000.00},{"nome":"CENTRO DE ENSINO UNIFICADO DO DF","tipo":"PJ","valor":25000.00},{"nome":"CONSULTHABIL CONSULTORES AUDITORES E CONTADORES","tipo":"PJ","valor":18604.72},{"nome":"JORGE ABDON MANZUR ISMAEL","tipo":"PF","valor":12500.00},{"nome":"JAIME MARTINS ZVEITER","tipo":"PF","valor":10510.00},{"nome":"CENTRO OESTE INSTITUTO DE EDUCACAO LTDA","tipo":"PJ","valor":10000.00},{"nome":"SOCIEDADE EDUCACIONAL CIMAN LTDA","tipo":"PJ","valor":10000.00},{"nome":"INEI INSTITUTO DE EDUCACAO INFANTIL LTDA","tipo":"PJ","valor":10000.00},{"nome":"CENTRO DE ENSINO MAURICIO SALES DE MELLO","tipo":"PJ","valor":10000.00}]'::jsonb
    ),
    (
      'izalci-lucas',
      2014,
      1033145.77,
      451900.00,
      0.00,
      0.00,
      202000.00,
      '[{"nome":"Direcao Nacional","tipo":"PJ","valor":250000.00},{"nome":"IZALCI LUCAS FERREIRA","tipo":"PF","valor":202000.00},{"nome":"Direcao Estadual/Distrital","tipo":"PJ","valor":201900.00},{"nome":"UNIAO DE FACULDADES DO AMAPA LTDA","tipo":"PJ","valor":100000.00},{"nome":"SOCIEDADE PADRAO DE EDUCACAO SUPERIOR LTDA","tipo":"PJ","valor":50000.00},{"nome":"CARLOS ALBERTO FREITAS","tipo":"PF","valor":50000.00},{"nome":"CONSULTHABIL CONTADORES LTDA - EPP","tipo":"PJ","valor":50000.00},{"nome":"MM EMPREENDIMENTOS IMOBILIARIOS LTDA","tipo":"PJ","valor":25000.00},{"nome":"JORGE ABDON MANZUR ISMAEL","tipo":"PF","valor":20000.00},{"nome":"CASCOL COMBUSTIVEIS PARA VEICULOS LTDA","tipo":"PJ","valor":15780.00}]'::jsonb
    ),
    (
      'izalci-lucas',
      2018,
      2988000.00,
      1000000.00,
      1500000.00,
      0.00,
      1480000.00,
      '[{"nome":"LUIS FELIPE BELMONTE DOS SANTOS","tipo":"PF","valor":1480000.00},{"nome":"Direcao Nacional","tipo":"PJ","valor":1000000.00},{"nome":"ELEICAO 2018 GERALDO JOSE RODRIGUES ALCKMIN FILHO","tipo":"PJ","valor":500000.00},{"nome":"SERGIO FERNANDES FERREIRA","tipo":"PF","valor":5000.00},{"nome":"RENATO FERNANDES FERREIRA","tipo":"PF","valor":3000.00}]'::jsonb
    ),
    (
      'izalci-lucas',
      2022,
      4266632.00,
      4148016.00,
      4141000.00,
      0.00,
      0.00,
      '[{"nome":"Direcao Nacional","tipo":"PJ","valor":4141000.00},{"nome":"RENATO FERNANDES FERREIRA","tipo":"PF","valor":18000.00},{"nome":"Direcao Estadual/Distrital","tipo":"PJ","valor":7016.00},{"nome":"ADRIANNE TEIXEIRA DE BESSA","tipo":"PF","valor":4500.00},{"nome":"WILLIAM SANT ANA DA SILVA","tipo":"PF","valor":4500.00},{"nome":"GLAUCIO MANOEL SANTOS DUARTE","tipo":"PF","valor":4500.00},{"nome":"ANDERSON RIBEIRO GOULART BRITO","tipo":"PF","valor":4500.00},{"nome":"LARISSA GABRIELA DE MELLO SILVA","tipo":"PF","valor":4500.00},{"nome":"CATARINA GIULIA SILVA CALLADO DE OLIVEIRA","tipo":"PF","valor":4000.00},{"nome":"LUIZ CLAUDIO MOURAO CAMELO","tipo":"PF","valor":3000.00}]'::jsonb
    ),
    (
      'jose-roberto-arruda',
      2014,
      4177971.10,
      3346820.00,
      0.00,
      0.00,
      0.00,
      '[{"nome":"Direcao Estadual/Distrital","tipo":"PJ","valor":3346820.00},{"nome":"EDUARDO CAVALCANTE GAUCHE","tipo":"PF","valor":80000.00},{"nome":"INVESTICAR VEICULOS LTDA","tipo":"PJ","valor":64200.00},{"nome":"CIPLAN CIMENTO PLANALTO S/A","tipo":"PJ","valor":50000.00},{"nome":"NOVA AMAZONAS INDUSTRIA E COMERCIO E IMP. DE ALIMENTOS LTDA","tipo":"PJ","valor":50000.00},{"nome":"WILMAR JOSE DE CARVALHO","tipo":"PF","valor":40000.00},{"nome":"GUALTER TAVARES NETO","tipo":"PF","valor":25500.00},{"nome":"ASFALTO BRASILIA LTDA","tipo":"PJ","valor":18154.57},{"nome":"GEORGINO PAULINO DA SILVA","tipo":"PF","valor":14400.00},{"nome":"MATOZINHOS FIGUEIREDO","tipo":"PF","valor":12000.00}]'::jsonb
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
FROM _df_financiamento src
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
FROM _df_financiamento src
JOIN public.candidatos c ON c.slug = src.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.financiamento f
  WHERE f.candidato_id = c.id
    AND f.ano_eleicao = src.ano_eleicao
);

DO $$
DECLARE
  v_izalci uuid;
  v_arruda uuid;
  v_kiko uuid;
  v_samara uuid;
  v_count int;
BEGIN
  SELECT id INTO v_izalci FROM public.candidatos WHERE slug = 'izalci-lucas';
  SELECT id INTO v_arruda FROM public.candidatos WHERE slug = 'jose-roberto-arruda';
  SELECT id INTO v_kiko FROM public.candidatos WHERE slug = 'kiko-caputo';
  SELECT id INTO v_samara FROM public.candidatos WHERE slug = 'samara-mineiro';

  SELECT count(*) INTO v_count FROM public.patrimonio WHERE candidato_id = v_izalci AND ano_eleicao IN (2010, 2014, 2018, 2022);
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'izalci patrimonio esperado 4, encontrado %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.financiamento WHERE candidato_id = v_izalci AND ano_eleicao IN (2010, 2014, 2018, 2022);
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'izalci financiamento esperado 4, encontrado %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.patrimonio WHERE candidato_id = v_arruda AND ano_eleicao IN (2014, 2022);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'arruda patrimonio esperado 2, encontrado %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.financiamento WHERE candidato_id = v_arruda AND ano_eleicao = 2014;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'arruda financiamento 2014 esperado 1, encontrado %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.historico_politico WHERE candidato_id = v_kiko;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'kiko-caputo sem historico apos apply';
  END IF;

  SELECT count(*) INTO v_count FROM public.historico_politico WHERE candidato_id = v_samara;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'samara-mineiro sem historico apos apply';
  END IF;
END $$;
