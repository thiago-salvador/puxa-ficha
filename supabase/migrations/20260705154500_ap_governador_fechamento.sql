-- AP Governador: fechamento Clecio Luis + Dr. Furlan.
-- Fontes principais: TSE consulta_cand/bem/receitas, Senado Dados Abertos,
-- Camara Municipal de Macapa e Prefeitura de Macapa.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'clecio-luis' AND publicavel = true) THEN
    RAISE EXCEPTION 'clecio-luis nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'dr-furlan' AND publicavel = true) THEN
    RAISE EXCEPTION 'dr-furlan nao encontrado ou nao publicavel';
  END IF;
END $$;

-- Clecio: historico TSE ja materializado, mas sem proveniencia estruturada.
UPDATE public.historico_politico
SET proveniencia = 'tse'
WHERE id IN (
  '51785abe-06d7-42a1-a353-8d986113816d',
  '812a0ea4-d71c-4797-9596-85020dd279b9',
  '5a294634-70ba-4040-b596-10f8dcdb2bb5',
  'eb254588-17f1-4fea-abc3-c7d38c1f0cf3',
  'ead69e74-d841-45cd-a563-86b897f50d23'
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
  'Senador (suplente)',
  2011,
  2019,
  'PSOL',
  'AP',
  'suplencia',
  'Senado Dados Abertos confirma CodigoParlamentar 5044 para Clecio Luis Vilhena Vieira no mandato AP 2011-2019; participacoes indicam suplencia/titularidade.',
  'Senador',
  'mandato',
  'misto'
FROM public.candidatos c
WHERE c.slug = 'clecio-luis'
  AND NOT EXISTS (
    SELECT 1
    FROM public.historico_politico hp
    WHERE hp.candidato_id = c.id
      AND hp.cargo ILIKE '%senador%'
      AND hp.periodo_inicio = 2011
      AND hp.periodo_fim = 2019
  );

UPDATE public.pontos_atencao
SET
  visivel = false,
  verificado = false,
  descricao = descricao || ' [Oculto em 2026-07-05: ponto gerado por IA, nao verificado, duplicava resumo de carreira e ficava desatualizado apos normalizacao do historico Senado.]'
WHERE id = '94dc3127-214c-4702-88fa-30b9bc1d75ad';

-- Furlan: normalizacao da timeline municipal e dos mandatos TSE.
UPDATE public.historico_politico
SET proveniencia = 'tse'
WHERE id IN (
  'd7f8ba90-284f-44b5-9607-418edc53c42e',
  'e02fa55b-f484-4940-a91f-96c0dca58885'
);

UPDATE public.historico_politico
SET
  partido = 'CIDADANIA',
  estado = 'AP',
  eleito_por = 'voto direto',
  proveniencia = 'misto',
  observacoes = 'Eleito prefeito de Macapa em 2020 pelo TSE; mandato municipal confirmado em fontes oficiais locais.'
WHERE id = '4010381b-b37f-4053-838e-bf9deb3adf79';

UPDATE public.historico_politico
SET
  periodo_fim = 2026,
  partido = 'MDB',
  estado = 'AP',
  eleito_por = 'voto direto',
  proveniencia = 'misto',
  observacoes = 'Reeleito prefeito de Macapa em 2024 pelo TSE; Camara Municipal de Macapa oficializou vacancia apos renuncia em 17/03/2026.'
WHERE id = '7673b1d6-6184-4401-b5a8-e29b82631bbd';

UPDATE public.pontos_atencao
SET
  visivel = false,
  verificado = false,
  descricao = descricao || ' [Oculto em 2026-07-05: ponto gerado por IA dizia que nao havia mandato eletivo registrado, contradizendo mandatos TSE/ALAP/Prefeitura materializados.]'
WHERE id = '69ed52a2-5177-4248-946d-c04734c2af0f';

CREATE TEMP TABLE _ap_furlan_lme ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (
      'lei_sancionada',
      'municipal',
      'AP',
      'Macapa',
      'lei municipal',
      NULL,
      2021,
      '2021-07-07',
      'Lei municipal que institui o Dia Municipal do Sociologo, sancionada pelo prefeito Antonio Furlan.',
      'ANTONIO PAULO DE OLIVEIRA FURLAN',
      'titular',
      'https://www.macapa.ap.leg.br/institucional/noticias/lei-do-vereador-nelson-souza-que-institui-o-dia-municipal-do-sociologo-e-sancionada-pelo-prefeito-antonio-furlan',
      'Camara Municipal de Macapa - Lei do Dia Municipal do Sociologo sancionada pelo prefeito Antonio Furlan',
      NULL,
      'CMM-MACAPA:2021-07-07:DIA-MUNICIPAL-SOCIOLOGO',
      '{"source":"Camara Municipal de Macapa","data_real":true,"fluxo":"candidate-completion-status-html-workflow","curation_batch_id":"ap-governador-fechamento-20260705","coverage_id":"dr-furlan-macapa-executivo-fontes-oficiais-20260705","coverage_scope":"descoberta_oficial_escopada_prefeitura_macapa_2021_2026_sem_inventario_total","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"fonte_oficial_verificada_em":"2026-07-05T15:17:00Z","source_proof":{"published_at":"2021-07-07T20:02:00","contains_sanction_by_prefeito":true,"official_source_kind":"camara_municipal_textual"}}'::jsonb
    ),
    (
      'lei_sancionada',
      'municipal',
      'AP',
      'Macapa',
      'lei municipal',
      '2.992/2025-PMM',
      2025,
      '2025-11-12',
      'Obriga a emissao de NFS-e por prestadores de servicos da administracao municipal de Macapa.',
      'ANTONIO PAULO DE OLIVEIRA FURLAN',
      'titular',
      'https://macapa.ap.gov.br/portal/wp-content/uploads/2025/12/Lei_2_992_2025_PMM.pdf',
      'Prefeitura de Macapa - Lei 2.992/2025-PMM',
      NULL,
      'PMM:LEI-2992-2025',
      '{"source":"Prefeitura de Macapa","data_real":true,"fluxo":"candidate-completion-status-html-workflow","curation_batch_id":"ap-governador-fechamento-20260705","coverage_id":"dr-furlan-macapa-executivo-fontes-oficiais-20260705","coverage_scope":"descoberta_oficial_escopada_prefeitura_macapa_2021_2026_sem_inventario_total","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"fonte_oficial_verificada_em":"2026-07-05T15:22:00Z","source_proof":{"downloaded_official_pdf":true,"pdf_url_variant_unblocked":"Lei_2_992_2025_PMM.pdf","pdftotext_chars":0,"note":"PDF oficial escaneado; titulo/URL oficial identificam a Lei 2.992/2025-PMM."}}'::jsonb
    )
) AS v(
  tipo_relacao,
  esfera,
  uf_norma,
  municipio_norma,
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
        AND hp.cargo_canonico = 'Prefeito'
        AND UPPER(COALESCE(hp.estado, '')) = 'AP'
        AND COALESCE(hp.periodo_inicio, 9999) <= seed.ano
        AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
      ORDER BY hp.periodo_inicio DESC NULLS LAST, hp.id
      LIMIT 1
    ) AS historico_politico_id
  FROM public.candidatos c
  CROSS JOIN _ap_furlan_lme seed
  WHERE c.slug = 'dr-furlan'
)
INSERT INTO public.legislacao_mandato_executivo (
  candidato_id,
  historico_politico_id,
  tipo_relacao,
  esfera,
  uf_norma,
  municipio_norma,
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
  municipio_norma,
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

CREATE TEMP TABLE _ap_furlan_patrimonio ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (
      2020,
      2305027.62,
      '[{"tipo":"OUTROS BENS E DIREITOS","descricao":"DOACAO COMO ADIANTAMENTO DA LEGITIMA RECEBIDA DE JOSE FURLAN JUNIOR, APTO 402, NO EDIFICIO ROMA, EM BELEM-PA.","valor":530000.00},{"tipo":"Casa","descricao":"CASA NA RODOVIA JK, KM 4, RAMAL DOS PROMOTORES, 1156, EM MACAPA-AP.","valor":125000.00},{"tipo":"Outros bens imóveis","descricao":"IMOVEL LOCALIZADO NA RUA VINICIUS DE MORAES, N 185, CONJUNTO DA EMBRAPA, EM MACAPA-AP.","valor":300000.00},{"tipo":"Outros bens imóveis","descricao":"IMOVEL URBANO LOCALIZADO NO LOTEAMENTO MANARI VILLAGE, LOTE 15, NA RODOVIA JUSCELINO KUBITSCHEK, KM 5, EM MACAPA-AP.","valor":180250.00},{"tipo":"Construção","descricao":"CONSTRUCAO NO IMOVEL URBANO LOCALIZADO NO LOTEAMENTO MANARI VILLAGE, LOTE 15, EM MACAPA-AP.","valor":43214.77},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEICULO FIAT PALIO ATTRACTIVE 1.0, ANO 2016, MOD. 2017.","valor":20793.64},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEICULO AUDI A5 SPORTBACK, ANO/MOD. 2016.","valor":54485.40},{"tipo":"Outras participações societárias","descricao":"20% DO INSTITUTO DE TERAPIA INTENSIVA DO AMAPA LTDA.","valor":15000.00},{"tipo":"Outras participações societárias","descricao":"PARTICIPACAO NO CAPITAL DA EMPRESA INSTITUTO DE MEDICINA DO CORACAO LTDA.","valor":100000.00},{"tipo":"Caderneta de poupança","descricao":"POUPANCA SANTANDER.","valor":116621.49},{"tipo":"Outras aplicações e Investimentos","descricao":"CDB SANTANDER.","valor":535992.71},{"tipo":"Outros fundos","descricao":"SALDO EM C/C NO BANCO SANTANDER S/A.","valor":79097.05},{"tipo":"Outros fundos","descricao":"SALDO NO BANCO DO BRASIL S/A.","valor":181.26},{"tipo":"Outros fundos","descricao":"SALDO EM CONTA CORRENTE NO BANCO SANTANDER S/A.","valor":2391.30},{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"VGBL - ZURICH SANTANDER BRASIL SEGUROS E PREVIDENCIA S/A.","valor":202000.00}]'::jsonb
    ),
    (
      2024,
      1262464.77,
      '[{"tipo":"Apartamento","descricao":"APTO 402, NO EDIFICIO ROMA. AV. DOS TAMOIOS, 471, BELEM/PA.","valor":530000.00},{"tipo":"Outros bens imóveis","descricao":"IMOVEL LOCALIZADO NA RUA VINICIUS DE MORAES, N 185, CONJUNTO DA EMBRAPA, COM 375 M DE AREA CONSTRUIDA, MACAPA/AP.","valor":300000.00},{"tipo":"Outros bens imóveis","descricao":"IMOVEL URBANO LOCALIZADO NO LOTEAMENTO MANARI VILLAGE, LOTE 15, NA ROD. JUSCELINO KUBITSCHEK, KM 5, MACAPA/AP.","valor":180250.00},{"tipo":"Outros bens imóveis","descricao":"CONSTRUCAO NO IMOVEL URBANO LOCALIZADO NO LOTEAMENTO MANARI VILLAGE, LOTE 15, NA ROD. JUSCELINO KUBITSCHEK, KM 5, MACAPA/AP.","valor":43214.77},{"tipo":"Outras participações societárias","descricao":"20% DO INSTITUTO DE TERAPIA INTENSIVA DO AMAPA LTDA.","valor":15000.00},{"tipo":"Outras participações societárias","descricao":"PARTICIPACAO NO CAPITAL DA EMPRESA INSTITUTO DE MEDICINA DO CORACAO.","valor":69000.00},{"tipo":"Casa","descricao":"CASA NA ROD. JK, KM 4, RAMAL DOS PROMOTORES, 1066, MACAPA/AP.","valor":125000.00}]'::jsonb
    )
) AS v(ano_eleicao, valor_total, bens);

UPDATE public.patrimonio p
SET
  valor_total = src.valor_total,
  bens = src.bens,
  fonte = 'TSE'
FROM _ap_furlan_patrimonio src
JOIN public.candidatos c ON c.slug = 'dr-furlan'
WHERE p.candidato_id = c.id
  AND p.ano_eleicao = src.ano_eleicao;

INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, src.ano_eleicao, src.valor_total, src.bens, 'TSE'
FROM _ap_furlan_patrimonio src
CROSS JOIN public.candidatos c
WHERE c.slug = 'dr-furlan'
  AND NOT EXISTS (
    SELECT 1
    FROM public.patrimonio p
    WHERE p.candidato_id = c.id
      AND p.ano_eleicao = src.ano_eleicao
  );

CREATE TEMP TABLE _ap_furlan_financiamento ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (
      2020,
      1121351.75,
      1590.00,
      1084851.75,
      24910.00,
      0.00,
      '[{"nome":"CIDADANIA - BRASIL - BR - NACIONAL","tipo":"PJ","valor":500000.00},{"nome":"DIRETORIO MUNICIPAL DO MOVIMENTO DEMOCRATICO BRASILEIRO -MDB-MACAPA","tipo":"PJ","valor":209800.00},{"nome":"DIRETORIO REGIONAL DO MOVIM. DEMOCRATICO BRASILEIRO-AP","tipo":"PJ","valor":195000.00},{"nome":"23 - CIDADANIA - AMAPA - AP - ESTADUAL","tipo":"PJ","valor":101780.00},{"nome":"MOVIMENTO DEMOCRATICO BRASILEIRO - ACRE - AC - ESTADUAL","tipo":"PJ","valor":79861.75},{"nome":"ANTONIO PAULO DE OLIVEIRA FURLAN","tipo":"PF","valor":10000.00},{"nome":"RAIMUNDO DOS SANTOS","tipo":"PF","valor":9000.00},{"nome":"LUCIANO FERREIRA SECCHIN","tipo":"PF","valor":3500.00},{"nome":"PEDRO PAULO DA SILVA COSTA","tipo":"PF","valor":3000.00},{"nome":"ANTONIO AUGUSTO DE AGUIAR","tipo":"PF","valor":3000.00}]'::jsonb
    ),
    (
      2024,
      1535949.25,
      0.00,
      1379000.00,
      229.30,
      0.00,
      '[{"nome":"MOVIMENTO DEMOCRATICO BRASILEIRO - BRASIL - BR - NACIONAL","tipo":"PJ","valor":1300000.00},{"nome":"ANTONIO PAULO DE OLIVEIRA FURLAN","tipo":"PF","valor":156719.95},{"nome":"PODEMOS","tipo":"PJ","valor":79000.00},{"nome":"ROMMEL EDUARDO CORREA GOMES","tipo":"PF","valor":229.30}]'::jsonb
    )
) AS v(
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
FROM _ap_furlan_financiamento src
JOIN public.candidatos c ON c.slug = 'dr-furlan'
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
FROM _ap_furlan_financiamento src
CROSS JOIN public.candidatos c
WHERE c.slug = 'dr-furlan'
  AND NOT EXISTS (
    SELECT 1
    FROM public.financiamento f
    WHERE f.candidato_id = c.id
      AND f.ano_eleicao = src.ano_eleicao
  );

DO $$
DECLARE
  v_clecio uuid;
  v_furlan uuid;
  v_clecio_senado int;
  v_furlan_lme int;
  v_furlan_pat int;
  v_furlan_fin int;
BEGIN
  SELECT id INTO v_clecio FROM public.candidatos WHERE slug = 'clecio-luis';
  SELECT id INTO v_furlan FROM public.candidatos WHERE slug = 'dr-furlan';

  SELECT count(*) INTO v_clecio_senado
  FROM public.historico_politico
  WHERE candidato_id = v_clecio
    AND cargo ILIKE '%senador%';
  IF v_clecio_senado < 1 THEN
    RAISE EXCEPTION 'clecio-luis sem historico de senador apos apply';
  END IF;

  SELECT count(*) INTO v_furlan_lme
  FROM public.legislacao_mandato_executivo
  WHERE candidato_id = v_furlan
    AND metadata ->> 'coverage_id' = 'dr-furlan-macapa-executivo-fontes-oficiais-20260705';
  IF v_furlan_lme <> 2 THEN
    RAISE EXCEPTION 'dr-furlan LME esperado 2, encontrado %', v_furlan_lme;
  END IF;

  SELECT count(*) INTO v_furlan_pat
  FROM public.patrimonio
  WHERE candidato_id = v_furlan
    AND ano_eleicao IN (2018, 2020, 2024);
  SELECT count(*) INTO v_furlan_fin
  FROM public.financiamento
  WHERE candidato_id = v_furlan
    AND ano_eleicao IN (2018, 2020, 2024);
  IF v_furlan_pat <> 3 OR v_furlan_fin <> 3 THEN
    RAISE EXCEPTION 'dr-furlan dinheiro esperado pat=3 fin=3, encontrado pat=% fin=%', v_furlan_pat, v_furlan_fin;
  END IF;
END $$;
