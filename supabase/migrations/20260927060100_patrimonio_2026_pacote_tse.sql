-- Substitui o patrimonio 2026 de quatro fichas pela lista oficial do TSE.
--
-- Fonte primaria: pacote bem_candidato_2026 do TSE (https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip),
-- SHA-256 ca1262aad03e129a8489cb0514b1e1be6705391961cb18c00bbc90280a7efae0, CSV gerado em 27/09/2026 05:31:34.
-- Linhas lidas por SQ_CANDIDATO da candidatura atual de cada ficha, com dedupe
-- por SQ_CANDIDATO + NR_ORDEM_BEM_CANDIDATO entre o arquivo nacional e o da UF.
-- Descricoes passam pelo mesmo tratamento do coletor: o marcador de travessao
-- perdido pelo TSE vira " - " e sequencias com forma de CPF/CNPJ viram
-- "[documento mascarado]".
--
--   ataides-oliveira: SQ 270002548412, 6 bens / R$ 54458902.00 -> 6 bens / R$ 57458902.00
--   augusto-cury: SQ 280002551547, 56 bens / R$ 242281162.52 -> 60 bens / R$ 242593012.43
--   laurez-moreira: SQ 270002544494, 21 bens / R$ 9615406.23 -> 22 bens / R$ 9935406.23
--   leonardo-avalanche: SQ 280002554479, 7 bens / R$ 495224296.00 -> 5 bens / R$ 495030000.00
--
-- leonardo-avalanche: a lista anterior veio do SQ 280002553883, que saiu do
-- pacote; a candidatura atual e o SQ 280002554479.
--
-- CAS fail-closed: cada UPDATE so casa a pre-imagem medida (valor_total, fonte
-- e bens exatos, sq_candidato nulo). Nenhuma outra linha de patrimonio muda.
-- NAO aplicar por `supabase db push`: producao recebe esta migration somente
-- pelo workflow apply-processos-patrimonio-20260927-production.
BEGIN;

CREATE TEMP TABLE pf_patrimonio_pacote_tse_snapshot ON COMMIT DROP AS
SELECT
  (SELECT count(*)::bigint FROM public.patrimonio p WHERE p.id NOT IN ('2af07279-ea86-4459-b51d-54944a3fa017'::uuid, '16e7c300-f336-4a87-9372-b4223ab5d7b9'::uuid, 'db6ff05a-083a-4e17-bfd0-6b16e42a4057'::uuid, '1c6976ff-ed21-46d9-bde8-1711ddd4370f'::uuid)) AS other_count,
  (SELECT md5(coalesce(string_agg(row_to_json(p)::text, '' ORDER BY p.id), ''))
   FROM public.patrimonio p WHERE p.id NOT IN ('2af07279-ea86-4459-b51d-54944a3fa017'::uuid, '16e7c300-f336-4a87-9372-b4223ab5d7b9'::uuid, 'db6ff05a-083a-4e17-bfd0-6b16e42a4057'::uuid, '1c6976ff-ed21-46d9-bde8-1711ddd4370f'::uuid)) AS other_digest;

DO $precondition$
DECLARE
  n integer;
BEGIN
  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'patrimonio 2026 pacote tse: ignorado apenas no replay descartavel';
    RETURN;
  END IF;
  SELECT count(*) INTO n FROM public.candidatos WHERE id IN ('131fa6ef-ec83-40fc-8cb8-d01c79dd30cd'::uuid, '5a4d76d2-6243-41b9-88b2-e94c68383e52'::uuid, 'e4a0bfc6-586c-491f-8580-e43c6d30f7a1'::uuid, '11aeff6f-ce8d-45bb-a4d1-a798b160e2fe'::uuid);
  IF n = 0 THEN
    RAISE NOTICE 'patrimonio 2026 pacote tse: coorte ausente; correcao ignorada';
    RETURN;
  END IF;
  IF n <> 4 THEN
    RAISE EXCEPTION 'patrimonio 2026 pacote tse: coorte parcial (% de 4)', n;
  END IF;
  SELECT count(*) INTO n FROM public.coleta_log WHERE execucao = 'migration:20260927060100';
  IF n <> 0 THEN
    RAISE EXCEPTION 'patrimonio 2026 pacote tse: recibo ja existe (%)', n;
  END IF;
  SELECT count(*) INTO n
  FROM public.patrimonio p
  JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE p.id = '2af07279-ea86-4459-b51d-54944a3fa017'::uuid
    AND c.id = '131fa6ef-ec83-40fc-8cb8-d01c79dd30cd'::uuid
    AND c.slug = 'ataides-oliveira'
    AND c.sq_candidato_2026 = '270002548412'
    AND p.ano_eleicao = 2026
    AND p.sq_candidato IS NULL
    AND p.valor_total = 54458902.00
    AND p.fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 270002548412 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
    AND p.bens = '[{"tipo":"Quotas ou quinhões de capital","valor":6375000,"descricao":"100% DO CAPITAL SOCIAL DA EMPRESA  CONDOMINIO PARK RESEDA SPE LTDA"},{"tipo":"Dinheiro em espécie - moeda nacional","valor":780000,"descricao":"DINHEIRO EM ESPÉCIE - MOEDA NACIONAL"},{"tipo":"Embarcação","valor":85000,"descricao":"LANCHA DE FIBRA DE VIDRO ANO 2003 COM MOTORES"},{"tipo":"Quotas ou quinhões de capital","valor":20000000,"descricao":"100% DAS QUOTAS DA EMPRESA ARAGUAIA COMERCIAL DE MOTOS DE URUACU LTDA  CNPJ 02.391.971/0001- 35"},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","valor":218902,"descricao":"TRAILBLAZER  2.8 L 4X4 LTZ DIESEL 2019-2018 BRANCO PLACA QKL 4108"},{"tipo":"Quotas ou quinhões de capital","valor":27000000,"descricao":"90% DO CAPITAL SOCIAL DA EMPRESA SHOPPING CENTER ARAGUAIA LTDA"}]'::jsonb;
  IF n <> 1 THEN
    RAISE EXCEPTION 'patrimonio 2026 pacote tse: pre-imagem de ataides-oliveira divergiu (%)', n;
  END IF;

  SELECT count(*) INTO n
  FROM public.patrimonio p
  JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE p.id = '16e7c300-f336-4a87-9372-b4223ab5d7b9'::uuid
    AND c.id = '5a4d76d2-6243-41b9-88b2-e94c68383e52'::uuid
    AND c.slug = 'augusto-cury'
    AND c.sq_candidato_2026 = '280002551547'
    AND p.ano_eleicao = 2026
    AND p.sq_candidato IS NULL
    AND p.valor_total = 242281162.52
    AND p.fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 280002551547 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
    AND p.bens = '[{"tipo":"Apartamento","valor":560000,"descricao":"APARTAMENTO"},{"tipo":"Outros créditos e poupança vinculados","valor":247299.54,"descricao":"CRÉDITOS EM TRÂNSITO"},{"tipo":"Outros bens imóveis","valor":45128,"descricao":"FAZENDA PRATA"},{"tipo":"Outros bens imóveis","valor":500060,"descricao":"FAZENDA LAVARINTO"},{"tipo":"Prédio comercial","valor":164654.85,"descricao":"PRÉDIO COMERCIAL"},{"tipo":"Outros bens imóveis","valor":1000000,"descricao":"FAZENDA TAMBORIL E SOBRADINHO"},{"tipo":"Outros bens imóveis","valor":180000,"descricao":"FAZENDA PERNAMBUCO"},{"tipo":"Outros bens imóveis","valor":200000,"descricao":"FAZENDA MARAVILHA/SAGARANA"},{"tipo":"Depósito bancário em conta corrente no País","valor":16254.76,"descricao":"SALDO EM CONTA"},{"tipo":"Prédio residencial","valor":6623800,"descricao":"PRÉDIO URBANO"},{"tipo":"Prédio comercial","valor":3200000,"descricao":"PRÉDIO COMERCIAL"},{"tipo":"Apartamento","valor":160809.6,"descricao":"APARTAMENTO"},{"tipo":"Terreno","valor":2150000,"descricao":"50% DE ÁREA EM CONDOMINIO"},{"tipo":"Outros bens imóveis","valor":342503.28,"descricao":"FAZENDA"},{"tipo":"Outros bens imóveis","valor":104998,"descricao":"FAZENDA CAMPINA VERDE"},{"tipo":"Outros bens imóveis","valor":180000,"descricao":"FAZENDA CRUZ DA RETIRADA BONITA"},{"tipo":"OUTROS BENS E DIREITOS","valor":4125172.3,"descricao":"EMPRÉSTIMO CONCEDIDO - INTELLIENCE SCHOOL LLC"},{"tipo":"Depósito bancário em conta corrente no exterior","valor":11500.04,"descricao":"SALDO EM CONTA"},{"tipo":"Casa","valor":4388.94,"descricao":"18,25% DE IMÓVEL"},{"tipo":"Outros bens imóveis","valor":201727.91,"descricao":"FAZENDA SOBRADINHO/CORUMBÁ"},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","valor":7090180,"descricao":"AÇÕES BBDC3"},{"tipo":"Quotas ou quinhões de capital","valor":31500000,"descricao":"SÓCIO PARTICIPANTE - FICTOR INVEST LTDA"},{"tipo":"Outros bens imóveis","valor":9025.63,"descricao":"FAZENDA SALTO E PONTE"},{"tipo":"Casa","valor":26597.48,"descricao":"18,25% DE IMÓVEL"},{"tipo":"Outros bens móveis","valor":180000,"descricao":"SÍTIO FIGUEIRA"},{"tipo":"Outros bens imóveis","valor":14535.7,"descricao":"FAZENDA SERRA BRANCA"},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","valor":799500,"descricao":"AÇÕES PETR4"},{"tipo":"Quotas ou quinhões de capital","valor":95000,"descricao":"INSTITUTO ACADEMIA DE INTELIGENCIA LTDA"},{"tipo":"Quotas ou quinhões de capital","valor":15607925,"descricao":"FILADÉLFIA NATURE PARTICIPAÇÕES E EMPREENDIMENTOS LTDA"},{"tipo":"Quotas ou quinhões de capital","valor":115362.06,"descricao":"64% DE PARTICIPAÇÃO - INTELLIGENCE SCHOOL LLC"},{"tipo":"Quotas ou quinhões de capital","valor":150582.92,"descricao":"CAPITAL SOCIAL - SICOOB"},{"tipo":"Caderneta de poupança","valor":9757.42,"descricao":"BRADESCO"},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","valor":223970.64,"descricao":"SALDO CDB"},{"tipo":"Fundo de Curto Prazo","valor":2558575.5,"descricao":"FUNDO BB GESTÃO DE RECURSOS"},{"tipo":"Outros bens imóveis","valor":520750,"descricao":"ESTÂNCIA ECOLÓGICA EM COLINA/SP"},{"tipo":"Crédito decorrente de alienação","valor":2950000,"descricao":"DE QUOTAS - FACULDADE METROPOLITANA"},{"tipo":"Outros bens imóveis","valor":1000000,"descricao":"FAZENDA PERNAMBUCO"},{"tipo":"Quotas ou quinhões de capital","valor":4739990,"descricao":"COTAS DE CAPITAL - FLORIDA INVESTIMENTOS PARTICIPAÇÕES LTDA"},{"tipo":"Depósito bancário em conta corrente no exterior","valor":40267.95,"descricao":"SALDO EM CONTA"},{"tipo":"Depósito bancário em conta corrente no País","valor":1518,"descricao":"SALDO EM CONTA"},{"tipo":"Fundo de Longo Prazo e Fundo de Investimentos em Direitos Creditórios (FIDC)","valor":2733124.44,"descricao":"NAVI ENERGIAS SUSTENTÁVEIS II FIP INFRAESTRUTURA"},{"tipo":"Outros bens imóveis","valor":1325721,"descricao":"FAZENDA SANTOS REIS"},{"tipo":"OUTROS BENS E DIREITOS","valor":121190451.65,"descricao":"EMPRÉSTIMO MUTUO - FILADÉLFIA NATURE PARTICIPAÇÕES"},{"tipo":"Outros bens imóveis","valor":36102.52,"descricao":"FAZENDA"},{"tipo":"Terreno","valor":603288,"descricao":"40% ÁREA EM FAZENDA"},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","valor":25827960,"descricao":"ATIVOS NEGOCIADOS BDR"},{"tipo":"Quotas ou quinhões de capital","valor":2570476.79,"descricao":"80% DE PARTICIPAÇÃO - LOVE STORY JOSEFINA LLC"},{"tipo":"Outros créditos e poupança vinculados","valor":241.01,"descricao":"BANCO 001"},{"tipo":"Depósito bancário em conta corrente no País","valor":1361.47,"descricao":"SALDO EM CONTA"},{"tipo":"Outros bens imóveis","valor":110000,"descricao":"FAZENDA SERRA BRANCA"},{"tipo":"Outros bens imóveis","valor":176854.5,"descricao":"FAZENDA SOBRADINHO"},{"tipo":"Outros bens imóveis","valor":46775.35,"descricao":"18,25% DE IMÓVEL"},{"tipo":"Quotas ou quinhões de capital","valor":244,"descricao":"QUOTAS DE CAPITAL - ACADEMIA DE GESTÃO DA EMOÇÃO LTDA"},{"tipo":"Quotas ou quinhões de capital","valor":941.3,"descricao":"CAPITAL SOCIAL - COOPERATIVA DE CRÉDITO DE PROD. RURAIS DO TRIÂNGULO MINEIRO"},{"tipo":"Depósito bancário em conta corrente no País","valor":3918.95,"descricao":"BANCO 001"},{"tipo":"Depósito bancário em conta corrente no País","valor":1866.02,"descricao":"SALDO EM CONTA"}]'::jsonb;
  IF n <> 1 THEN
    RAISE EXCEPTION 'patrimonio 2026 pacote tse: pre-imagem de augusto-cury divergiu (%)', n;
  END IF;

  SELECT count(*) INTO n
  FROM public.patrimonio p
  JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE p.id = 'db6ff05a-083a-4e17-bfd0-6b16e42a4057'::uuid
    AND c.id = 'e4a0bfc6-586c-491f-8580-e43c6d30f7a1'::uuid
    AND c.slug = 'laurez-moreira'
    AND c.sq_candidato_2026 = '270002544494'
    AND p.ano_eleicao = 2026
    AND p.sq_candidato IS NULL
    AND p.valor_total = 9615406.23
    AND p.fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 270002544494 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
    AND p.bens = '[{"tipo":"Terra nua","valor":112425.54,"descricao":"IMOVEL RURAL EM DUERE"},{"tipo":"Terra nua","valor":475228.13,"descricao":"IMOVEL RURAL EM DUERE"},{"tipo":"Terreno","valor":5000,"descricao":"LOTE EM PALMAS"},{"tipo":"Terra nua","valor":533333.34,"descricao":"PARTE DE FAZENDA GOIAS"},{"tipo":"Terra nua","valor":696619.66,"descricao":"IMOVEL RURAL EM DUERE"},{"tipo":"Terreno","valor":2333.34,"descricao":"11,11% IMOVEL URBANO EM GURUPI"},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","valor":242270,"descricao":"VEIUCLO TOYOTA HILUX"},{"tipo":"Quotas ou quinhões de capital","valor":270000,"descricao":"QUOTAS EMPRESA PRODUTOS VALE DA SERRA COMERCIAL"},{"tipo":"Depósito bancário em conta corrente no País","valor":2488.23,"descricao":"SALDO EM CONTA BANCARIA"},{"tipo":"Prédio residencial","valor":150000,"descricao":"IMOVEL RESIDENCIAL EM GURUPI"},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","valor":66340.57,"descricao":"VEICULO FIAT STRADA"},{"tipo":"Quotas ou quinhões de capital","valor":451875.95,"descricao":"CAPITAL JUNTO A COOPERATIVA DE CREDITO LIVRE DE ADMISSAO DE PARAISO"},{"tipo":"Terra nua","valor":359112.2,"descricao":"IMOVEL RURAL EM DUERE"},{"tipo":"Consórcio não contemplado","valor":97157.72,"descricao":"CONSORCIO TRATORES"},{"tipo":"Consórcio não contemplado","valor":11343.6,"descricao":"CONSORCIO DE BEM"},{"tipo":"OUTROS BENS E DIREITOS","valor":5201300,"descricao":"ANIMAIS BOVINOS"},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","valor":293000,"descricao":"CAMINHAO CARGA VW 1180"},{"tipo":"Outros fundos","valor":122298.4,"descricao":"TITULO DE CAPITALIZACAO"},{"tipo":"Consórcio não contemplado","valor":74687.11,"descricao":"CONSORCIO DE VEICULO"},{"tipo":"Consórcio não contemplado","valor":22900.71,"descricao":"COTA CONSORCIO VEICULO"},{"tipo":"Terra nua","valor":425691.73,"descricao":"IMOVEL RURAL EM DUERE"}]'::jsonb;
  IF n <> 1 THEN
    RAISE EXCEPTION 'patrimonio 2026 pacote tse: pre-imagem de laurez-moreira divergiu (%)', n;
  END IF;

  SELECT count(*) INTO n
  FROM public.patrimonio p
  JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE p.id = '1c6976ff-ed21-46d9-bde8-1711ddd4370f'::uuid
    AND c.id = '11aeff6f-ce8d-45bb-a4d1-a798b160e2fe'::uuid
    AND c.slug = 'leonardo-avalanche'
    AND c.sq_candidato_2026 = '280002554479'
    AND p.ano_eleicao = 2026
    AND p.sq_candidato IS NULL
    AND p.valor_total = 495224296.00
    AND p.fonte = 'TSE DivulgaCandContas 2026, SQ_CANDIDATO 280002553883, total e sete bens conferidos em 06/09/2026 (https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BRASIL/BR/20322002026/280002553883/2026/BR)'
    AND p.bens = '[{"tipo":"Outros bens e direitos","valor":9900,"descricao":"99% das quotas - Avalanche Holding Participação S/A (CNPJ [documento mascarado])"},{"tipo":"Outros bens e direitos","valor":2230000,"descricao":"Obras de arte"},{"tipo":"Outros bens e direitos","valor":100000,"descricao":"100% das quotas - Avalanche Consultoria Participação & Incorporação Ltda. (CNPJ [documento mascarado])"},{"tipo":"Outros bens e direitos","valor":1200000,"descricao":"Joias"},{"tipo":"Outros bens e direitos","valor":500000,"descricao":"100% das quotas - Avalanche Bank Ltda. (CNPJ [documento mascarado])"},{"tipo":"Outros bens e direitos","valor":491174496,"descricao":"Investimentos em criptomoedas - Bitcoin"},{"tipo":"Outros bens e direitos","valor":9900,"descricao":"99% das quotas - L A Holding Patrimonial S/A (CNPJ [documento mascarado])"}]'::jsonb;
  IF n <> 1 THEN
    RAISE EXCEPTION 'patrimonio 2026 pacote tse: pre-imagem de leonardo-avalanche divergiu (%)', n;
  END IF;
END
$precondition$;

-- @write tabela=patrimonio slug=ataides-oliveira ano=2026 campos=valor_total,bens,sq_candidato,fonte
UPDATE public.patrimonio AS p
SET valor_total = 57458902.00,
    bens = '[{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO EM ESPÉCIE - MOEDA NACIONAL","valor":780000},{"tipo":"Embarcação","descricao":"LANCHA DE FIBRA DE VIDRO ANO 2003 COM MOTORES","valor":85000},{"tipo":"Quotas ou quinhões de capital","descricao":"100% DAS QUOTAS DA EMPRESA ARAGUAIA COMERCIAL DE MOTOS DE URUACU LTDA CNPJ [documento mascarado]","valor":20000000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"TRAILBLAZER 2.8 L 4X4 LTZ DIESEL 2019-2018 BRANCO PLACA QKL 4108","valor":218902},{"tipo":"Quotas ou quinhões de capital","descricao":"90% DO CAPITAL SOCIAL DA EMPRESA SHOPPING CENTER ARAGUAIA LTDA","valor":27000000},{"tipo":"Quotas ou quinhões de capital","descricao":"100% DO CAPITAL SOCIAL DA EMPRESA CONDOMINIO PARK RESEDA SPE LTDA","valor":9375000}]'::jsonb,
    sq_candidato = '270002548412',
    fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 270002548412 (pacote SHA-256 ca1262aad03e129a8489cb0514b1e1be6705391961cb18c00bbc90280a7efae0; CSV gerado 27/09/2026 05:31:34; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
WHERE p.id = '2af07279-ea86-4459-b51d-54944a3fa017'::uuid
  AND p.candidato_id = '131fa6ef-ec83-40fc-8cb8-d01c79dd30cd'::uuid
  AND p.ano_eleicao = 2026
  AND p.sq_candidato IS NULL
  AND p.valor_total = 54458902.00
  AND p.fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 270002548412 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
  AND EXISTS (
    SELECT 1 FROM public.candidatos c
    WHERE c.id = p.candidato_id AND c.slug = 'ataides-oliveira'
  );

-- @write tabela=patrimonio slug=augusto-cury ano=2026 campos=valor_total,bens,sq_candidato,fonte
UPDATE public.patrimonio AS p
SET valor_total = 242593012.43,
    bens = '[{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":560000},{"tipo":"Outros créditos e poupança vinculados","descricao":"CRÉDITOS EM TRÂNSITO","valor":247299.54},{"tipo":"Outros bens imóveis","descricao":"FAZENDA PRATA","valor":45128},{"tipo":"Outros bens imóveis","descricao":"FAZENDA LAVARINTO","valor":500060},{"tipo":"Outros bens imóveis","descricao":"FAZENDA PERNAMBUCO","valor":180000},{"tipo":"Outros bens imóveis","descricao":"FAZENDA TAMBORIL E SOBRADINHO","valor":1000000},{"tipo":"Prédio comercial","descricao":"PRÉDIO COMERCIAL","valor":164654.85},{"tipo":"Outros bens imóveis","descricao":"FAZENDA MARAVILHA/SAGARANA","valor":200000},{"tipo":"Prédio residencial","descricao":"PRÉDIO URBANO","valor":6623800},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA","valor":16254.76},{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":160809.6},{"tipo":"Terreno","descricao":"50% DE ÁREA EM CONDOMINIO","valor":2150000},{"tipo":"Prédio comercial","descricao":"PRÉDIO COMERCIAL","valor":3200000},{"tipo":"Outros bens imóveis","descricao":"FAZENDA","valor":342503.28},{"tipo":"Outros bens imóveis","descricao":"FAZENDA CAMPINA VERDE","valor":104998},{"tipo":"Outros bens imóveis","descricao":"FAZENDA CRUZ DA RETIRADA BONITA","valor":180000},{"tipo":"Casa","descricao":"18,25% DE IMÓVEL","valor":4388.94},{"tipo":"OUTROS BENS E DIREITOS","descricao":"EMPRÉSTIMO CONCEDIDO - INTELLIENCE SCHOOL LLC","valor":4125172.3},{"tipo":"Depósito bancário em conta corrente no exterior","descricao":"SALDO EM CONTA","valor":11500.04},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"AÇÕES BBDC3","valor":7090180},{"tipo":"Quotas ou quinhões de capital","descricao":"SÓCIO PARTICIPANTE - FICTOR INVEST LTDA","valor":31500000},{"tipo":"Outros bens imóveis","descricao":"FAZENDA SOBRADINHO/CORUMBÁ","valor":201727.91},{"tipo":"Casa","descricao":"18,25% DE IMÓVEL","valor":26597.48},{"tipo":"Outros bens imóveis","descricao":"FAZENDA SALTO E PONTE","valor":9025.63},{"tipo":"Outros bens móveis","descricao":"SÍTIO FIGUEIRA","valor":180000},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"AÇÕES PETR4","valor":799500},{"tipo":"Quotas ou quinhões de capital","descricao":"INSTITUTO ACADEMIA DE INTELIGENCIA LTDA","valor":95000},{"tipo":"Outros bens imóveis","descricao":"FAZENDA SERRA BRANCA","valor":14535.7},{"tipo":"Quotas ou quinhões de capital","descricao":"FILADÉLFIA NATURE PARTICIPAÇÕES E EMPREENDIMENTOS LTDA","valor":15607925},{"tipo":"Quotas ou quinhões de capital","descricao":"64% DE PARTICIPAÇÃO - INTELLIGENCE SCHOOL LLC","valor":115362.06},{"tipo":"Quotas ou quinhões de capital","descricao":"CAPITAL SOCIAL - SICOOB","valor":150582.92},{"tipo":"Caderneta de poupança","descricao":"BRADESCO","valor":9757.42},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"SALDO CDB","valor":223970.64},{"tipo":"Fundo de Curto Prazo","descricao":"FUNDO BB GESTÃO DE RECURSOS","valor":2558575.5},{"tipo":"Crédito decorrente de alienação","descricao":"DE QUOTAS - FACULDADE METROPOLITANA","valor":2950000},{"tipo":"Outros bens imóveis","descricao":"FAZENDA PERNAMBUCO","valor":1000000},{"tipo":"Outros bens imóveis","descricao":"ESTÂNCIA ECOLÓGICA EM COLINA/SP","valor":520750},{"tipo":"Quotas ou quinhões de capital","descricao":"COTAS DE CAPITAL - FLORIDA INVESTIMENTOS PARTICIPAÇÕES LTDA","valor":4739990},{"tipo":"Depósito bancário em conta corrente no exterior","descricao":"SALDO EM CONTA","valor":40267.95},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA","valor":1518},{"tipo":"Fundo de Longo Prazo e Fundo de Investimentos em Direitos Creditórios (FIDC)","descricao":"NAVI ENERGIAS SUSTENTÁVEIS II FIP INFRAESTRUTURA","valor":2733124.44},{"tipo":"OUTROS BENS E DIREITOS","descricao":"EMPRÉSTIMO MUTUO - FILADÉLFIA NATURE PARTICIPAÇÕES","valor":121190451.65},{"tipo":"Outros bens imóveis","descricao":"FAZENDA SANTOS REIS","valor":1325721},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"ATIVOS NEGOCIADOS BDR","valor":25827960},{"tipo":"Terreno","descricao":"40% ÁREA EM FAZENDA","valor":603288},{"tipo":"Outros bens imóveis","descricao":"FAZENDA","valor":36102.52},{"tipo":"Quotas ou quinhões de capital","descricao":"80% DE PARTICIPAÇÃO - LOVE STORY JOSEFINA LLC","valor":2570476.79},{"tipo":"Outros créditos e poupança vinculados","descricao":"BANCO 001","valor":241.01},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA","valor":1361.47},{"tipo":"Outros bens imóveis","descricao":"FAZENDA SERRA BRANCA","valor":110000},{"tipo":"Outros bens imóveis","descricao":"FAZENDA SOBRADINHO","valor":176854.5},{"tipo":"Outros bens imóveis","descricao":"18,25% DE IMÓVEL","valor":46775.35},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE CAPITAL - ACADEMIA DE GESTÃO DA EMOÇÃO LTDA","valor":244},{"tipo":"Quotas ou quinhões de capital","descricao":"CAPITAL SOCIAL - COOPERATIVA DE CRÉDITO DE PROD. RURAIS DO TRIÂNGULO MINEIRO","valor":941.3},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BANCO 001","valor":3918.95},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA","valor":1866.02},{"tipo":"Outras participações societárias","descricao":"50% DAS COTAS DE PARTICIPAÇÃO SOCIETÁRIA NA EMPRESA FREE MIND PUBLISH KKC, SITUADA NOS ESTADOS UNIDOS","valor":268524.91},{"tipo":"Outras participações societárias","descricao":"5% DE PARTICIPAÇÃO SOCIETÁRIA NA EMPRESA CURY ACADEMIA COMPORTAMENTAL LLC, SITUADA NOS ESTADOS UNIDOS","valor":37710.4},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTEMPLARE INTELIGÊNCIA IMOBILIÁRIA LTDA","valor":500},{"tipo":"Outras participações societárias","descricao":"100% DE PARTICIPAÇÃO NA EMPRESA CONTEMPLARE INVESTMENTS LLC","valor":5114.6}]'::jsonb,
    sq_candidato = '280002551547',
    fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 280002551547 (pacote SHA-256 ca1262aad03e129a8489cb0514b1e1be6705391961cb18c00bbc90280a7efae0; CSV gerado 27/09/2026 05:31:34; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
WHERE p.id = '16e7c300-f336-4a87-9372-b4223ab5d7b9'::uuid
  AND p.candidato_id = '5a4d76d2-6243-41b9-88b2-e94c68383e52'::uuid
  AND p.ano_eleicao = 2026
  AND p.sq_candidato IS NULL
  AND p.valor_total = 242281162.52
  AND p.fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 280002551547 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
  AND EXISTS (
    SELECT 1 FROM public.candidatos c
    WHERE c.id = p.candidato_id AND c.slug = 'augusto-cury'
  );

-- @write tabela=patrimonio slug=laurez-moreira ano=2026 campos=valor_total,bens,sq_candidato,fonte
UPDATE public.patrimonio AS p
SET valor_total = 9935406.23,
    bens = '[{"tipo":"Terra nua","descricao":"IMOVEL RURAL EM DUERE","valor":112425.54},{"tipo":"Terra nua","descricao":"IMOVEL RURAL EM DUERE","valor":475228.13},{"tipo":"Terreno","descricao":"LOTE EM PALMAS","valor":5000},{"tipo":"Terra nua","descricao":"PARTE DE FAZENDA GOIAS","valor":533333.34},{"tipo":"Terra nua","descricao":"IMOVEL RURAL EM DUERE","valor":696619.66},{"tipo":"Terreno","descricao":"11,11% IMOVEL URBANO EM GURUPI","valor":2333.34},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA BANCARIA","valor":2488.23},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEIUCLO TOYOTA HILUX","valor":242270},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS EMPRESA PRODUTOS VALE DA SERRA COMERCIAL","valor":270000},{"tipo":"Prédio residencial","descricao":"IMOVEL RESIDENCIAL EM GURUPI","valor":150000},{"tipo":"Quotas ou quinhões de capital","descricao":"CAPITAL JUNTO A COOPERATIVA DE CREDITO LIVRE DE ADMISSAO DE PARAISO","valor":451875.95},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEICULO FIAT STRADA","valor":66340.57},{"tipo":"Terra nua","descricao":"IMOVEL RURAL EM DUERE","valor":359112.2},{"tipo":"Consórcio não contemplado","descricao":"CONSORCIO TRATORES","valor":97157.72},{"tipo":"Consórcio não contemplado","descricao":"CONSORCIO DE BEM","valor":11343.6},{"tipo":"Outros fundos","descricao":"TITULO DE CAPITALIZACAO","valor":122298.4},{"tipo":"OUTROS BENS E DIREITOS","descricao":"ANIMAIS BOVINOS","valor":5201300},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CAMINHAO CARGA VW 1180","valor":293000},{"tipo":"Terra nua","descricao":"IMOVEL RURAL EM DUERE","valor":425691.73},{"tipo":"Consórcio não contemplado","descricao":"CONSORCIO DE VEICULO","valor":74687.11},{"tipo":"Consórcio não contemplado","descricao":"COTA CONSORCIO VEICULO","valor":22900.71},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"I/TOYOTA HILUX SWSRXA4RD, cor Preta, Ano Fabricação/Modelo 2025/2026","valor":320000}]'::jsonb,
    sq_candidato = '270002544494',
    fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 270002544494 (pacote SHA-256 ca1262aad03e129a8489cb0514b1e1be6705391961cb18c00bbc90280a7efae0; CSV gerado 27/09/2026 05:31:34; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
WHERE p.id = 'db6ff05a-083a-4e17-bfd0-6b16e42a4057'::uuid
  AND p.candidato_id = 'e4a0bfc6-586c-491f-8580-e43c6d30f7a1'::uuid
  AND p.ano_eleicao = 2026
  AND p.sq_candidato IS NULL
  AND p.valor_total = 9615406.23
  AND p.fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 270002544494 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
  AND EXISTS (
    SELECT 1 FROM public.candidatos c
    WHERE c.id = p.candidato_id AND c.slug = 'laurez-moreira'
  );

-- @write tabela=patrimonio slug=leonardo-avalanche ano=2026 campos=valor_total,bens,sq_candidato,fonte
UPDATE public.patrimonio AS p
SET valor_total = 495030000.00,
    bens = '[{"tipo":"Quotas ou quinhões de capital","descricao":"100% DAS QUOTAS - AVALANCHE BANK LTDA. (CNPJ [documento mascarado])","valor":500000},{"tipo":"Jóia, quadro, objeto de arte, de coleção, antiguidade, etc.","descricao":"JÓIAS","valor":1200000},{"tipo":"Jóia, quadro, objeto de arte, de coleção, antiguidade, etc.","descricao":"OBRAS DE ARTE","valor":2230000},{"tipo":"Quotas ou quinhões de capital","descricao":"100% DAS QUOTAS - AVALANCHE CONSULTORIA PARTICIPAÇÃO INCORPORAÇÃO LTDA. (CNPJ [documento mascarado])","valor":100000},{"tipo":"Outras aplicações e Investimentos","descricao":"INVESTIMENTOS EM CRIPTOMOEDAS - BITCOIN","valor":491000000}]'::jsonb,
    sq_candidato = '280002554479',
    fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 280002554479 (pacote SHA-256 ca1262aad03e129a8489cb0514b1e1be6705391961cb18c00bbc90280a7efae0; CSV gerado 27/09/2026 05:31:34; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
WHERE p.id = '1c6976ff-ed21-46d9-bde8-1711ddd4370f'::uuid
  AND p.candidato_id = '11aeff6f-ce8d-45bb-a4d1-a798b160e2fe'::uuid
  AND p.ano_eleicao = 2026
  AND p.sq_candidato IS NULL
  AND p.valor_total = 495224296.00
  AND p.fonte = 'TSE DivulgaCandContas 2026, SQ_CANDIDATO 280002553883, total e sete bens conferidos em 06/09/2026 (https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BRASIL/BR/20322002026/280002553883/2026/BR)'
  AND EXISTS (
    SELECT 1 FROM public.candidatos c
    WHERE c.id = p.candidato_id AND c.slug = 'leonardo-avalanche'
  );

-- @write tabela=coleta_log ref=migration:20260927060100 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao)
SELECT 'tse-patrimonio', 'candidato', r.slug, r.candidato_id, 'encontrado', r.volume, r.detalhe,
       'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', 'migration:20260927060100'
FROM (VALUES
    ('ataides-oliveira', '131fa6ef-ec83-40fc-8cb8-d01c79dd30cd'::uuid, 6, 'Migration 20260927060100: patrimonio 2026 substituido pelo pacote oficial do TSE, SQ 270002548412: R$ 54458902.00 (6 bens) para R$ 57458902.00 (6 bens)'),
    ('augusto-cury', '5a4d76d2-6243-41b9-88b2-e94c68383e52'::uuid, 60, 'Migration 20260927060100: patrimonio 2026 substituido pelo pacote oficial do TSE, SQ 280002551547: R$ 242281162.52 (56 bens) para R$ 242593012.43 (60 bens)'),
    ('laurez-moreira', 'e4a0bfc6-586c-491f-8580-e43c6d30f7a1'::uuid, 22, 'Migration 20260927060100: patrimonio 2026 substituido pelo pacote oficial do TSE, SQ 270002544494: R$ 9615406.23 (21 bens) para R$ 9935406.23 (22 bens)'),
    ('leonardo-avalanche', '11aeff6f-ce8d-45bb-a4d1-a798b160e2fe'::uuid, 5, 'Migration 20260927060100: patrimonio 2026 substituido pelo pacote oficial do TSE, SQ 280002554479: R$ 495224296.00 (7 bens) para R$ 495030000.00 (5 bens)')
) AS r(slug, candidato_id, volume, detalhe)
JOIN public.candidatos c ON c.id = r.candidato_id AND c.slug = r.slug
WHERE current_setting('pf.replay', true) IS DISTINCT FROM 'true'
  AND NOT EXISTS (
    SELECT 1 FROM public.coleta_log l
    WHERE l.execucao = 'migration:20260927060100' AND l.alvo = r.slug
  );

DO $postcondition$
DECLARE
  n integer;
  s record;
BEGIN
  IF current_setting('pf.replay', true) = 'true' THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE id IN ('131fa6ef-ec83-40fc-8cb8-d01c79dd30cd'::uuid, '5a4d76d2-6243-41b9-88b2-e94c68383e52'::uuid, 'e4a0bfc6-586c-491f-8580-e43c6d30f7a1'::uuid, '11aeff6f-ce8d-45bb-a4d1-a798b160e2fe'::uuid)) THEN
    RETURN;
  END IF;
  SELECT count(*) INTO n
  FROM public.patrimonio p
  WHERE p.id = '2af07279-ea86-4459-b51d-54944a3fa017'::uuid
    AND p.candidato_id = '131fa6ef-ec83-40fc-8cb8-d01c79dd30cd'::uuid
    AND p.ano_eleicao = 2026
    AND p.sq_candidato = '270002548412'
    AND p.valor_total = 57458902.00
    AND jsonb_array_length(p.bens) = 6
    AND p.fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 270002548412 (pacote SHA-256 ca1262aad03e129a8489cb0514b1e1be6705391961cb18c00bbc90280a7efae0; CSV gerado 27/09/2026 05:31:34; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)';
  IF n <> 1 THEN
    RAISE EXCEPTION 'patrimonio 2026 pacote tse: pos-condicao de ataides-oliveira falhou (%)', n;
  END IF;

  SELECT count(*) INTO n
  FROM public.patrimonio p
  WHERE p.id = '16e7c300-f336-4a87-9372-b4223ab5d7b9'::uuid
    AND p.candidato_id = '5a4d76d2-6243-41b9-88b2-e94c68383e52'::uuid
    AND p.ano_eleicao = 2026
    AND p.sq_candidato = '280002551547'
    AND p.valor_total = 242593012.43
    AND jsonb_array_length(p.bens) = 60
    AND p.fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 280002551547 (pacote SHA-256 ca1262aad03e129a8489cb0514b1e1be6705391961cb18c00bbc90280a7efae0; CSV gerado 27/09/2026 05:31:34; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)';
  IF n <> 1 THEN
    RAISE EXCEPTION 'patrimonio 2026 pacote tse: pos-condicao de augusto-cury falhou (%)', n;
  END IF;

  SELECT count(*) INTO n
  FROM public.patrimonio p
  WHERE p.id = 'db6ff05a-083a-4e17-bfd0-6b16e42a4057'::uuid
    AND p.candidato_id = 'e4a0bfc6-586c-491f-8580-e43c6d30f7a1'::uuid
    AND p.ano_eleicao = 2026
    AND p.sq_candidato = '270002544494'
    AND p.valor_total = 9935406.23
    AND jsonb_array_length(p.bens) = 22
    AND p.fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 270002544494 (pacote SHA-256 ca1262aad03e129a8489cb0514b1e1be6705391961cb18c00bbc90280a7efae0; CSV gerado 27/09/2026 05:31:34; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)';
  IF n <> 1 THEN
    RAISE EXCEPTION 'patrimonio 2026 pacote tse: pos-condicao de laurez-moreira falhou (%)', n;
  END IF;

  SELECT count(*) INTO n
  FROM public.patrimonio p
  WHERE p.id = '1c6976ff-ed21-46d9-bde8-1711ddd4370f'::uuid
    AND p.candidato_id = '11aeff6f-ce8d-45bb-a4d1-a798b160e2fe'::uuid
    AND p.ano_eleicao = 2026
    AND p.sq_candidato = '280002554479'
    AND p.valor_total = 495030000.00
    AND jsonb_array_length(p.bens) = 5
    AND p.fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 280002554479 (pacote SHA-256 ca1262aad03e129a8489cb0514b1e1be6705391961cb18c00bbc90280a7efae0; CSV gerado 27/09/2026 05:31:34; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)';
  IF n <> 1 THEN
    RAISE EXCEPTION 'patrimonio 2026 pacote tse: pos-condicao de leonardo-avalanche falhou (%)', n;
  END IF;
  SELECT count(*) INTO n FROM public.coleta_log WHERE execucao = 'migration:20260927060100';
  IF n <> 4 THEN
    RAISE EXCEPTION 'patrimonio 2026 pacote tse: recibos esperados 4, encontrados %', n;
  END IF;
  SELECT * INTO STRICT s FROM pf_patrimonio_pacote_tse_snapshot;
  IF (SELECT count(*)::bigint FROM public.patrimonio p WHERE p.id NOT IN ('2af07279-ea86-4459-b51d-54944a3fa017'::uuid, '16e7c300-f336-4a87-9372-b4223ab5d7b9'::uuid, 'db6ff05a-083a-4e17-bfd0-6b16e42a4057'::uuid, '1c6976ff-ed21-46d9-bde8-1711ddd4370f'::uuid)) <> s.other_count
     OR (SELECT md5(coalesce(string_agg(row_to_json(p)::text, '' ORDER BY p.id), ''))
         FROM public.patrimonio p WHERE p.id NOT IN ('2af07279-ea86-4459-b51d-54944a3fa017'::uuid, '16e7c300-f336-4a87-9372-b4223ab5d7b9'::uuid, 'db6ff05a-083a-4e17-bfd0-6b16e42a4057'::uuid, '1c6976ff-ed21-46d9-bde8-1711ddd4370f'::uuid)) IS DISTINCT FROM s.other_digest THEN
    RAISE EXCEPTION 'patrimonio 2026 pacote tse: outra linha de patrimonio mudou';
  END IF;
END
$postcondition$;

COMMIT;
