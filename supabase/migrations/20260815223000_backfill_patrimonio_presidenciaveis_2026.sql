-- P-PATRIMONIO-2026: bens dos presidenciáveis registrados no TSE.
-- Fonte oficial: https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip
-- ZIP sha256: 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1
-- Snapshot congelado: 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT.
--
-- Hertz Dias (SQ 280002541457) e Rui Costa Pimenta (SQ 280002552487) não
-- têm declaração neste snapshot pré-fechamento do lote. Nenhuma ausência
-- oficial é registrada; rechecagem obrigatória no ZIP de 16/08/2026.
-- Leonardo Avalanche (PRTB) fica fora: registro não localizado após o prazo e
-- ainda em verificação.
BEGIN;

DO $$
DECLARE
  n_coorte integer;
BEGIN
  SELECT COUNT(*) INTO n_coorte
  FROM public.candidatos
  WHERE slug IN ('samara-martins', 'renan-filho', 'wilson-grassi-junior', 'clariana-barao', 'romeu-zema', 'ronaldo-caiado', 'edmilson-costa', 'flavio-bolsonaro', 'lula', 'augusto-cury');

  IF n_coorte NOT IN (0, 10)
     AND to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'P-PATRIMONIO-2026: coorte parcial em banco com ledger, esperados 10 candidatos, encontrados %', n_coorte;
  END IF;
END $$;

-- @write tabela=patrimonio slug=samara-martins ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 33000.00, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"UNO VIVACE 2016","valor":29000},{"tipo":"Caderneta de poupança","descricao":"POUPANÇA","valor":4000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 280002538811 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'samara-martins'
  AND (
    SELECT COUNT(*) FROM public.candidatos
    WHERE slug IN ('samara-martins', 'renan-filho', 'wilson-grassi-junior', 'clariana-barao', 'romeu-zema', 'ronaldo-caiado', 'edmilson-costa', 'flavio-bolsonaro', 'lula', 'augusto-cury')
  ) = 10
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=renan-filho ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 795089.00, '[{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE CAPITAL","valor":100000},{"tipo":"Bem relacionado com o exercício da atividade autônoma","descricao":"BEM RELACIONADO COM O EXERCÍCIO DA ATIVIDADE AUTÔNOMA","valor":275329},{"tipo":"Outras participações societárias","descricao":"QUOTAS DE SOCIEDADE","valor":119760},{"tipo":"Outros créditos e poupança vinculados","descricao":"OUTROS CRÉDITOS E POUPANÇA VINCULADOS","valor":300000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 280002540694 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'renan-filho'
  AND (
    SELECT COUNT(*) FROM public.candidatos
    WHERE slug IN ('samara-martins', 'renan-filho', 'wilson-grassi-junior', 'clariana-barao', 'romeu-zema', 'ronaldo-caiado', 'edmilson-costa', 'flavio-bolsonaro', 'lula', 'augusto-cury')
  ) = 10
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=wilson-grassi-junior ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 50000000.00, '[{"tipo":"OUTROS BENS E DIREITOS","descricao":"BENS IMÓVEIS: POSSE E DIREITOS SOBRE DIVERSOS IMÓVEIS FINANCIADOS JUNTO A INSTITUIÇÕES FINANCEIRAS. ¿ PARTICIPAÇÕES SOCIETÁRIAS: PARTICIPAÇÃO NO CAPITAL SOCIAL DE DIVERSAS SOCIEDADES EMPRESARIAIS.","valor":50000000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 280002548139 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'wilson-grassi-junior'
  AND (
    SELECT COUNT(*) FROM public.candidatos
    WHERE slug IN ('samara-martins', 'renan-filho', 'wilson-grassi-junior', 'clariana-barao', 'romeu-zema', 'ronaldo-caiado', 'edmilson-costa', 'flavio-bolsonaro', 'lula', 'augusto-cury')
  ) = 10
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=clariana-barao ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1820760.17, '[{"tipo":"Apartamento","descricao":"EDIFÍCIO","valor":261759.38},{"tipo":"Terreno","descricao":"TERRENO FRAÇÃO","valor":5000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"LAND ROVER DISCOVERY SPORT","valor":376006.08},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO BRADESCO","valor":151.7},{"tipo":"Casa","descricao":"CONDOMINIO","valor":979500},{"tipo":"Casa","descricao":"RESIDENCIAL SFH CEF","valor":90933.51},{"tipo":"Casa","descricao":"RESIDENCIAL FINACIADA BRADESCO","valor":107409.5}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 280002552484 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'clariana-barao'
  AND (
    SELECT COUNT(*) FROM public.candidatos
    WHERE slug IN ('samara-martins', 'renan-filho', 'wilson-grassi-junior', 'clariana-barao', 'romeu-zema', 'ronaldo-caiado', 'edmilson-costa', 'flavio-bolsonaro', 'lula', 'augusto-cury')
  ) = 10
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=romeu-zema ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 178707610.09, '[{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"FUNDO DE INVESTIMENTO EM AÇÕES","valor":1556006.67},{"tipo":"Quotas ou quinhões de capital","descricao":"PARTICIPAÇÃO EM SEGURADORA","valor":3666680},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO DE RENDA FIXA","valor":3964283.93},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO EM CDB","valor":337400.33},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE EM COOPERATIVA","valor":14.86},{"tipo":"Quotas ou quinhões de capital","descricao":"PARTICIPAÇÃO EM INSTITUIÇÃO FINANCEIRA","valor":16834806},{"tipo":"Casa","descricao":"IMÓVEL RESIDENCIAL REFORMADO","valor":704864.25},{"tipo":"Quotas ou quinhões de capital","descricao":"PARTICIPAÇÃO EM EMPRESA IMOBILIÁRIA","valor":47000},{"tipo":"Caderneta de poupança","descricao":"POUPANÇA BANCÁRIA","valor":119.02},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE EM COOPERATIVA","valor":9848.34},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"FUNDO DE INVESTIMENTO MULTIMERCADO","valor":56218194.15},{"tipo":"Fundo de Longo Prazo e Fundo de Investimentos em Direitos Creditórios (FIDC)","descricao":"FUNDO DE INVESTIMENTO RENDA FIXA","valor":362.56},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS OU QUINHÕES DE CAPITAL","valor":3959.16},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS EM COOPERATIVA DE CRÉDITO","valor":393000},{"tipo":"Terreno","descricao":"TERRENO RECEBIDO EM DOAÇÃO","valor":70000},{"tipo":"Quotas ou quinhões de capital","descricao":"PARTICIPAÇÃO EM HOLDING FAMILIAR","valor":94498898},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"FUNDO DE INVESTIMENTO RENDA FIXA","valor":4306.56},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"FUNDO DE INVESTIMENTO EM COTAS","valor":397866.26}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 280002539826 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'romeu-zema'
  AND (
    SELECT COUNT(*) FROM public.candidatos
    WHERE slug IN ('samara-martins', 'renan-filho', 'wilson-grassi-junior', 'clariana-barao', 'romeu-zema', 'ronaldo-caiado', 'edmilson-costa', 'flavio-bolsonaro', 'lula', 'augusto-cury')
  ) = 10
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=ronaldo-caiado ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 52557930.98, '[{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"AÇÕES","valor":133.53},{"tipo":"Sala ou conjunto","descricao":"SALAS OU CONJUNTOS","valor":35711.94},{"tipo":"Outras aplicações e Investimentos","descricao":"TÍTULO DE CAPITALIZAÇÃO","valor":3385.99},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO AUTOMOTOR TERRESTRE","valor":7100},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS OU QUINHÕES DE CAPITAL","valor":1008634.21},{"tipo":"Casa","descricao":"CASA","valor":70000},{"tipo":"Outros bens imóveis","descricao":"IMÓVEIS DO TIPO RURAL","valor":36213674.73},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITOS À VISTA / NUMERÁRIO","valor":44881.89},{"tipo":"Outros bens imóveis","descricao":"OUTROS BENS IMÓVEIS","valor":4640.34},{"tipo":"Terreno","descricao":"TERRENO","valor":243037.95},{"tipo":"Outros fundos","descricao":"FUNDOS DE INVESTIMENTO","valor":16.71},{"tipo":"Outras participações societárias","descricao":"OUTRAS PARTICIPAÇÕES SOCIETÁRIAS","valor":148613.18},{"tipo":"Outras aplicações e Investimentos","descricao":"TÍTULOS ISENTOS DE TRIBUTAÇÃO (LIG/LCI/LCA/CRI/CRA)","valor":4288620.51},{"tipo":"OUTROS BENS E DIREITOS","descricao":"SEMOVENTES (REBANHO) - VALOR TOTAL DE MERCADO - ESTIMADO","valor":10489480}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 280002551932 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'ronaldo-caiado'
  AND (
    SELECT COUNT(*) FROM public.candidatos
    WHERE slug IN ('samara-martins', 'renan-filho', 'wilson-grassi-junior', 'clariana-barao', 'romeu-zema', 'ronaldo-caiado', 'edmilson-costa', 'flavio-bolsonaro', 'lula', 'augusto-cury')
  ) = 10
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=edmilson-costa ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 454485.68, '[{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"VALOR APLICADO","valor":232.61},{"tipo":"Caderneta de poupança","descricao":"VALOR APLICADO","valor":51403.07},{"tipo":"Apartamento","descricao":"50% DO APARTAMENTO","valor":350000},{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"VALOR","valor":52850}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 280002551975 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'edmilson-costa'
  AND (
    SELECT COUNT(*) FROM public.candidatos
    WHERE slug IN ('samara-martins', 'renan-filho', 'wilson-grassi-junior', 'clariana-barao', 'romeu-zema', 'ronaldo-caiado', 'edmilson-costa', 'flavio-bolsonaro', 'lula', 'augusto-cury')
  ) = 10
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=flavio-bolsonaro ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 8186555.83, '[{"tipo":"Casa","descricao":"CASA, LAGO SUL, BRASÍLIA","valor":6226043.8},{"tipo":"Outras participações societárias","descricao":"QUOTA E QUINHÃO DE CAPITAL","valor":46000},{"tipo":"Outros fundos","descricao":"FUNDO DE INVESTIMENTO EM COTAS MULTIMERCADO FIFCIC RL","valor":1090520.47},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO EM CDB - BANCO DO BRASIL","valor":8266.1},{"tipo":"Outras participações societárias","descricao":"QUOTA OU QUINHÃO DE CAPITAL - SOCIEDADE INDIVIDUAL DE ADVOCACIA","valor":10000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO 2014","valor":133000},{"tipo":"Outras participações societárias","descricao":"QUOTA OU QUINHÃO DE CAPITAL","valor":249},{"tipo":"Caderneta de poupança","descricao":"SALDO CONTA POUPANÇA - BANCO ITAU","valor":103746.23},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BANCOS DIVERSOS","valor":568730.23}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 280002551544 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'flavio-bolsonaro'
  AND (
    SELECT COUNT(*) FROM public.candidatos
    WHERE slug IN ('samara-martins', 'renan-filho', 'wilson-grassi-junior', 'clariana-barao', 'romeu-zema', 'ronaldo-caiado', 'edmilson-costa', 'flavio-bolsonaro', 'lula', 'augusto-cury')
  ) = 10
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=lula ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 4775650.64, '[{"tipo":"Terreno","descricao":"64,08% DE TERRENO LOCALIZADO NO DISTRITO DO RIACHO GRANDE, SÃO BERNARDO DO CAMPO","valor":265000},{"tipo":"Quotas ou quinhões de capital","descricao":"98% DO CAPITAL SOCIAL DA L.I.L.S PALESTRAS, EVENTOS E PUBLICAÇÕES","valor":49000},{"tipo":"Fundo de Curto Prazo","descricao":"FUNDO DI PLUS AGIL","valor":132834.2},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CREDITO DECORRENTE DO DISTRATO DATADO EM 11/2015., COM SOLICITACAO DE RESGATE, DA QUOTA PARTE DO TERMO DE ADESAO E COMPROMISSO DE PARTICIPACAO PARA IMPLANTACAO E CONSTRUCAO ATRAVES DA BANCOOP","valor":179298.96},{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"BANCO BRADESCO","valor":1380000},{"tipo":"Caderneta de poupança","descricao":"CADERNETA DE POUPANÇA","valor":0.13},{"tipo":"Apartamento","descricao":"50% DO APARTAMENTO LOCALIZADO EM SÃO BERNARDO DO CAMPO","valor":94571.25},{"tipo":"Terreno","descricao":"26,68% DE SÍTIO NO DISTRITO DE RIACHO GRANDE, SÃO BERNARDO DO CAMPO","valor":130000},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÃO FINANCEIRA - BANCO DO BRASIL","valor":485.39},{"tipo":"Fundo de Investimento Imobiliário","descricao":"TVRI11","valor":50000},{"tipo":"Caderneta de poupança","descricao":"SALDO EM CADERNETA DE POUPANÇA","valor":14.99},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BRADESCO FUNDO DE INVESTIMENTO EM COTAS DE FUNDOS DE INVESTIMENTO RENDA FIXA SIMPLES","valor":6277.62},{"tipo":"Construção","descricao":"CASA EM CONSTRUÇÃO SÃO BERNARDO DO CAMPO","valor":246918.82},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MARCA CHEVROLET, ANO 2010/2011","valor":50000},{"tipo":"Terreno","descricao":"SITUADO NO DISTRITO DE RIACHO GRANDE EM SÃO BERNARDO DO CAMPO","valor":2733.45},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BRADESCO","valor":56671.07},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB RF LP HIGH","valor":207917.4},{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"BRASILPREV SEGUROS","valor":1923927.36}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 280002542548 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'lula'
  AND (
    SELECT COUNT(*) FROM public.candidatos
    WHERE slug IN ('samara-martins', 'renan-filho', 'wilson-grassi-junior', 'clariana-barao', 'romeu-zema', 'ronaldo-caiado', 'edmilson-costa', 'flavio-bolsonaro', 'lula', 'augusto-cury')
  ) = 10
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=augusto-cury ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 242281162.52, '[{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":560000},{"tipo":"Outros créditos e poupança vinculados","descricao":"CRÉDITOS EM TRÂNSITO","valor":247299.54},{"tipo":"Outros bens imóveis","descricao":"FAZENDA PRATA","valor":45128},{"tipo":"Outros bens imóveis","descricao":"FAZENDA LAVARINTO","valor":500060},{"tipo":"Prédio comercial","descricao":"PRÉDIO COMERCIAL","valor":164654.85},{"tipo":"Outros bens imóveis","descricao":"FAZENDA TAMBORIL E SOBRADINHO","valor":1000000},{"tipo":"Outros bens imóveis","descricao":"FAZENDA PERNAMBUCO","valor":180000},{"tipo":"Outros bens imóveis","descricao":"FAZENDA MARAVILHA/SAGARANA","valor":200000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA","valor":16254.76},{"tipo":"Prédio residencial","descricao":"PRÉDIO URBANO","valor":6623800},{"tipo":"Prédio comercial","descricao":"PRÉDIO COMERCIAL","valor":3200000},{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":160809.6},{"tipo":"Terreno","descricao":"50% DE ÁREA EM CONDOMINIO","valor":2150000},{"tipo":"Outros bens imóveis","descricao":"FAZENDA","valor":342503.28},{"tipo":"Outros bens imóveis","descricao":"FAZENDA CAMPINA VERDE","valor":104998},{"tipo":"Outros bens imóveis","descricao":"FAZENDA CRUZ DA RETIRADA BONITA","valor":180000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"EMPRÉSTIMO CONCEDIDO - INTELLIENCE SCHOOL LLC","valor":4125172.3},{"tipo":"Depósito bancário em conta corrente no exterior","descricao":"SALDO EM CONTA","valor":11500.04},{"tipo":"Casa","descricao":"18,25% DE IMÓVEL","valor":4388.94},{"tipo":"Outros bens imóveis","descricao":"FAZENDA SOBRADINHO/CORUMBÁ","valor":201727.91},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"AÇÕES BBDC3","valor":7090180},{"tipo":"Quotas ou quinhões de capital","descricao":"SÓCIO PARTICIPANTE - FICTOR INVEST LTDA","valor":31500000},{"tipo":"Outros bens imóveis","descricao":"FAZENDA SALTO E PONTE","valor":9025.63},{"tipo":"Casa","descricao":"18,25% DE IMÓVEL","valor":26597.48},{"tipo":"Outros bens móveis","descricao":"SÍTIO FIGUEIRA","valor":180000},{"tipo":"Outros bens imóveis","descricao":"FAZENDA SERRA BRANCA","valor":14535.7},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"AÇÕES PETR4","valor":799500},{"tipo":"Quotas ou quinhões de capital","descricao":"INSTITUTO ACADEMIA DE INTELIGENCIA LTDA","valor":95000},{"tipo":"Quotas ou quinhões de capital","descricao":"FILADÉLFIA NATURE PARTICIPAÇÕES E EMPREENDIMENTOS LTDA","valor":15607925},{"tipo":"Quotas ou quinhões de capital","descricao":"64% DE PARTICIPAÇÃO - INTELLIGENCE SCHOOL LLC","valor":115362.06},{"tipo":"Quotas ou quinhões de capital","descricao":"CAPITAL SOCIAL - SICOOB","valor":150582.92},{"tipo":"Caderneta de poupança","descricao":"BRADESCO","valor":9757.42},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"SALDO CDB","valor":223970.64},{"tipo":"Fundo de Curto Prazo","descricao":"FUNDO BB GESTÃO DE RECURSOS","valor":2558575.5},{"tipo":"Outros bens imóveis","descricao":"ESTÂNCIA ECOLÓGICA EM COLINA/SP","valor":520750},{"tipo":"Crédito decorrente de alienação","descricao":"DE QUOTAS - FACULDADE METROPOLITANA","valor":2950000},{"tipo":"Outros bens imóveis","descricao":"FAZENDA PERNAMBUCO","valor":1000000},{"tipo":"Quotas ou quinhões de capital","descricao":"COTAS DE CAPITAL - FLORIDA INVESTIMENTOS PARTICIPAÇÕES LTDA","valor":4739990},{"tipo":"Depósito bancário em conta corrente no exterior","descricao":"SALDO EM CONTA","valor":40267.95},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA","valor":1518},{"tipo":"Fundo de Longo Prazo e Fundo de Investimentos em Direitos Creditórios (FIDC)","descricao":"NAVI ENERGIAS SUSTENTÁVEIS II FIP INFRAESTRUTURA","valor":2733124.44},{"tipo":"Outros bens imóveis","descricao":"FAZENDA SANTOS REIS","valor":1325721},{"tipo":"OUTROS BENS E DIREITOS","descricao":"EMPRÉSTIMO MUTUO - FILADÉLFIA NATURE PARTICIPAÇÕES","valor":121190451.65},{"tipo":"Outros bens imóveis","descricao":"FAZENDA","valor":36102.52},{"tipo":"Terreno","descricao":"40% ÁREA EM FAZENDA","valor":603288},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"ATIVOS NEGOCIADOS BDR","valor":25827960},{"tipo":"Quotas ou quinhões de capital","descricao":"80% DE PARTICIPAÇÃO - LOVE STORY JOSEFINA LLC","valor":2570476.79},{"tipo":"Outros créditos e poupança vinculados","descricao":"BANCO 001","valor":241.01},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA","valor":1361.47},{"tipo":"Outros bens imóveis","descricao":"FAZENDA SERRA BRANCA","valor":110000},{"tipo":"Outros bens imóveis","descricao":"FAZENDA SOBRADINHO","valor":176854.5},{"tipo":"Outros bens imóveis","descricao":"18,25% DE IMÓVEL","valor":46775.35},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE CAPITAL - ACADEMIA DE GESTÃO DA EMOÇÃO LTDA","valor":244},{"tipo":"Quotas ou quinhões de capital","descricao":"CAPITAL SOCIAL - COOPERATIVA DE CRÉDITO DE PROD. RURAIS DO TRIÂNGULO MINEIRO","valor":941.3},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BANCO 001","valor":3918.95},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA","valor":1866.02}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 280002551547 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'augusto-cury'
  AND (
    SELECT COUNT(*) FROM public.candidatos
    WHERE slug IN ('samara-martins', 'renan-filho', 'wilson-grassi-junior', 'clariana-barao', 'romeu-zema', 'ronaldo-caiado', 'edmilson-costa', 'flavio-bolsonaro', 'lula', 'augusto-cury')
  ) = 10
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

DO $$
DECLARE
  n_coorte integer;
  n_corretos integer;
BEGIN
  SELECT COUNT(*) INTO n_coorte
  FROM public.candidatos
  WHERE slug IN ('samara-martins', 'renan-filho', 'wilson-grassi-junior', 'clariana-barao', 'romeu-zema', 'ronaldo-caiado', 'edmilson-costa', 'flavio-bolsonaro', 'lula', 'augusto-cury');

  -- Replay vazio/parcial não tem ledger e não recebe nenhuma linha. Em banco
  -- integrado, o guard anterior já abortou coorte parcial antes dos upserts.
  IF n_coorte = 0 THEN
    RETURN;
  END IF;
  IF n_coorte <> 10 THEN
    RETURN;
  END IF;

  WITH esperados(slug, valor_total, n_bens, fonte) AS (
    VALUES
    ('samara-martins', 33000.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 280002538811 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('renan-filho', 795089.00::numeric, 4, 'TSE Dados Abertos bem_candidato_2026 SQ 280002540694 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('wilson-grassi-junior', 50000000.00::numeric, 1, 'TSE Dados Abertos bem_candidato_2026 SQ 280002548139 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('clariana-barao', 1820760.17::numeric, 7, 'TSE Dados Abertos bem_candidato_2026 SQ 280002552484 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('romeu-zema', 178707610.09::numeric, 18, 'TSE Dados Abertos bem_candidato_2026 SQ 280002539826 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('ronaldo-caiado', 52557930.98::numeric, 14, 'TSE Dados Abertos bem_candidato_2026 SQ 280002551932 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('edmilson-costa', 454485.68::numeric, 4, 'TSE Dados Abertos bem_candidato_2026 SQ 280002551975 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('flavio-bolsonaro', 8186555.83::numeric, 9, 'TSE Dados Abertos bem_candidato_2026 SQ 280002551544 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('lula', 4775650.64::numeric, 18, 'TSE Dados Abertos bem_candidato_2026 SQ 280002542548 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('augusto-cury', 242281162.52::numeric, 56, 'TSE Dados Abertos bem_candidato_2026 SQ 280002551547 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)')
  )
  SELECT COUNT(*) INTO n_corretos
  FROM esperados e
  JOIN public.candidatos c ON c.slug = e.slug
  JOIN public.patrimonio p
    ON p.candidato_id = c.id
   AND p.ano_eleicao = 2026
   AND p.valor_total = e.valor_total
   AND jsonb_array_length(p.bens) = e.n_bens
   AND p.fonte = e.fonte;

  IF n_corretos <> 10 THEN
    RAISE EXCEPTION 'P-PATRIMONIO-2026: esperadas 10 linhas exatas, encontradas %', n_corretos;
  END IF;
END $$;

COMMIT;
