-- Backfill de patrimônio do ciclo 2026 (workflow pf-patrimonio-20260807T170643Z).
-- Snapshot local do pacote oficial bem_candidato_2026 de 2026-08-04: os
-- registros de 2026 ainda estão em andamento no TSE, então cada linha declara
-- o snapshot na fonte/detalhe e deverá ser revalidada quando o TSE publicar
-- pacote atualizado. Nenhuma célula inventada: bens extraídos do pacote
-- oficial com dedupe _UF/_BRASIL e descrição mascarada; totais conferidos
-- contra o manifesto auditado da etapa 2b antes da geração.
BEGIN;

-- @write tabela=patrimonio slug=acm-neto campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 84888809.63, '[{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA NA EMPRESA TELEVISÃO CONQUISTA LTDA","valor":25453},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"FORD RANGER 2025","valor":350000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"SALDO DE APLICAÇÃO EM RENDA FIXA CDB NO BANCO BRADESCO","valor":726327.19},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEICULO OFF-ROAD MODELO UFORCE 2023","valor":115000},{"tipo":"Apartamento","descricao":"APARTAMENTO NO EDIFICIO MANSÃO LEONOR CALMON, 2172, SALVADOR/BA","valor":7879197.99},{"tipo":"Quotas ou quinhões de capital","descricao":"818500 QUOTAS NA ANRE PARTICIPAÇÕES EMPREENDIMENTOS LTDA","valor":818500},{"tipo":"Outras participações societárias","descricao":"AÇÕES ORDINÁRIAS NOMINATIVAS DA TELEVISÃO BAHIA SA","valor":9384042},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"SALDO EM APLICAÇÃO EM RENDA FIXA BANCO BRADESCO","valor":1101664.34},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"XP APLICAÇÕES RENDA FIXA","valor":822038.96},{"tipo":"Outras aplicações e Investimentos","descricao":"BRADESCO DEBENTURES INCENTIVADAS CDI FIC DE FUNDOS","valor":3588000},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"FUNDO DE INVESTIMENTO BR PARTNERS PET FIP","valor":1326315.79},{"tipo":"Outros fundos","descricao":"TREND PÓS-FIXADO FUNDO DE INVESTIMENTO EM COTAS RENDA FIXA SIMPLES RESPONSABILIDADE LIMITADA","valor":429435.01},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÕES FUNDOS DE INVESTIMENTO - PLANNER CORRETORA DE VALORES SA","valor":9080757.39},{"tipo":"Caderneta de poupança","descricao":"CADERNETA BANCO BRADESCO EM NOME DA DEPENDENTE","valor":30565.26},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BANCO BTG PACTUAL","valor":2683.75},{"tipo":"Outras participações societárias","descricao":"QUOTAS DA TELEVISÃO SANTA CRUZ LTDA","valor":122500},{"tipo":"Outras participações societárias","descricao":"QUOTAS RÁDIO FM IEMANJÁ LTDA","valor":1280000},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"FUNDO DE INVESTIMENTO BRIDGE AGRO COMMERCE","valor":548751.4},{"tipo":"Outras participações societárias","descricao":"QUOTAS DA EMPRESA RB VENTURES LTDA","valor":1500},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA NA EMPRESA CABAÇEIRAS PARTICIPAÇÕES LTDA","valor":3008400},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO EM ESPECIE","valor":50000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"SALDO DE ADIATAMENTO PARA FUTURO AUMENTO DE CAPITAL NA EMPRESA ANRE PARTICIPAÇÕES EMPREENDIMENTOS LTDA","valor":7999933.9},{"tipo":"Caderneta de poupança","descricao":"CADERNETA BANCO BRADESCO EM NOME DA DEPENDENTE","valor":30563.77},{"tipo":"Outros fundos","descricao":"TREND DI FUNDO DE INVESTIMENTO EM COTAS DE FUNDOS DE INVESTIMENTO RENDA FIXA SIMPLES","valor":108900.15},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BANCO XP","valor":6892.57},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"LCI BRADESCO","valor":700000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO RENDA FIXA NO BANCO BRADESCO","valor":1500174.18},{"tipo":"Apartamento","descricao":"APARTAMENTO NO CONDOMINIO BAYVIEW - BARRA GRANDE - MARAU/BA","valor":1045448.69},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"FUNDO DE INVESTIMENTOS BRIDGE INFLUENCE","valor":3018.16},{"tipo":"Outros fundos","descricao":"TREND INB FUNDO DE INVESTIMENTO EM COTAS DE FUNDOS DE INVESTIMENTO RENDA FIXA SIMPLES","valor":12745.04},{"tipo":"OUTROS BENS E DIREITOS","descricao":"SALDO DE ADIATAMENTO PARA FUTURO AUMENTO DE CAPITAL NA EMPRESA RB VENTURES LTDA","valor":195250.01},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÕES CRA BANCO BTG PACTUAL","valor":2564543.1},{"tipo":"Depósito bancário em conta corrente no exterior","descricao":"SALDO BRADESCO GLOBAL PRIVATE BANK","valor":6773.85},{"tipo":"Crédito decorrente de empréstimo","descricao":"SALDO DE EMPRESTIMO A TERCEIRO","valor":30000},{"tipo":"Crédito decorrente de empréstimo","descricao":"EMPRESTIMO PARA EMPRESA SUN LOC UNIDADE FOTOVOLTAICA","valor":534027.19},{"tipo":"Outras aplicações e Investimentos","descricao":"FUNDO DE INVESTIMENTO IMOBILIARIO PRAIA DO CASTELO","valor":11979000},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÕES BC BRADESCO","valor":1000000},{"tipo":"Outras aplicações e Investimentos","descricao":"BRADESCO DEB INC CDI II FIC DE INVESTIMENTOS","valor":166000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÕES LCI BANCO BRADESCO","valor":5000000},{"tipo":"Outras aplicações e Investimentos","descricao":"B6 MACRO DE INVESTIMENTO MULTIMERCADO CREDITO PRIVADO","valor":4020406.94},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO BRADESCO LCA","valor":3130000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÕES LIG BANCO BRADESCO","valor":4150000},{"tipo":"Outras aplicações e Investimentos","descricao":"FUNDO DE INVESTIMENTO IMOBILIARIO PRAIA DO CASTELO","valor":7000},{"tipo":"Outras aplicações e Investimentos","descricao":"FUNDO DE INVESTIMENTO IMOBILIARIO PRAIA DO CASTELO","valor":7000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 50002533190 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'acm-neto'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=alan-rick campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 5244567.72, '[{"tipo":"Outras aplicações e Investimentos","descricao":"CERTIFICADO DE OPERACAO ESTRUTURAL","valor":50000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"BTG PACTUAL - PROD.: CDB-SR","valor":69891.86},{"tipo":"Outras aplicações e Investimentos","descricao":"CERTIFICADO DE RECEBIVEIS DO AGRONEGOCIO BTG PACTUAL","valor":105105.93},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"DEBENTURE DE INFRAESTRUTURA BTG PACTUAL","valor":48825.71},{"tipo":"Outras aplicações e Investimentos","descricao":"COTA DE FERIAS JUNTO AO GOLDEN LAGHETTO EMPREENDIMENTOS IMOBILIARIOS SPE LTDA","valor":48524.85},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BTG PACTUAL - TITULO: TERRAMAGNA II FIAGRO -","valor":50000},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BTG PACTUAL - VIRTUS FUNDO INCENTIVADO DE INVEST EM INFRAESTRUTURA REN","valor":800000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA LIVRE MOVIMENTACAO - AG./CONTA: 0534-","valor":12982.34},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"PROD.: PIPO CAPITAL I FUNDO DE INVESTIMENTO EM PARTICIPACOES MULTIEST - FUNDO DE INVESTIMENTO BTG PACTUAL.","valor":18415.46},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO","valor":150000},{"tipo":"Outras aplicações e Investimentos","descricao":"COTA DE FERIAS JUNTO AO GOLDEN LAGHETTO EMPREENDIMENTOS IMOBILIARIOS SPE LTDA - CONTRATO NR 84073 // CT.01-F277/13 UNIDADE 277/13 VR","valor":48524.85},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BTG PACTUAL - ESPECIFICACAO: FI IE JGP ECOSSISTEMA FIC FDS COTAS PRINCIPAL","valor":65000.04},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BTG PACTUAL - PROD.: CDB-SR-","valor":3321.13},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEICULO JEEP GRAND CHEROKEE","valor":236794.96},{"tipo":"Outras aplicações e Investimentos","descricao":"CERTIFICADO DE RECEBIVEIS DO AGRONEGOCIO BTG PACTUAL","valor":200000},{"tipo":"Outras aplicações e Investimentos","descricao":"CERTIFICADO DE DIREITOS CREDITORIOS DO AGRONEGOCIO","valor":16000},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BTG PACTUAL - FIP IE AZ QUEST PRE INFRA IX -","valor":26000},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BB RENDA FIXA LONGO PRAZO HIGH FUNDO DE INVESTIMENTO EM COTAS DE FIF","valor":174762.67},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"RF REF DI PLUS AGIL -","valor":573106.16},{"tipo":"Outras aplicações e Investimentos","descricao":"COTA DE FERIAS JUNTO AO GOLDEN LAGHETTO EMPREENDIMENTOS IMOBILIARIOS SPE LTDA","valor":48524.85},{"tipo":"Casa","descricao":"IMOVEL RESIDENCIAL","valor":1319000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BANCO DO BRASIL - SALDO CDB/DI CFE INFORME DE RENDIMENTOS","valor":19000},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"PROD.: PIPO CAPITAL I FUNDO DE INVESTIMENTO RENDA FIXA - FUNDO DE INVESTIMENTO","valor":11172.12},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"CEF - FI - FUNDO DE INVESTIMENTO","valor":999614.79},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BTG PACTUAL - FII ENERGIA REAL - 6454225UN1","valor":150000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 10002532492 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'alan-rick'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=alvaro-dias-rn campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 2917179.51, '[{"tipo":"Prédio residencial","descricao":"IMÓVEL RESIDENCIAL - NA AV. MARECHAL FLORIANO PEIXOTO - NATAL/RN","valor":175513.9},{"tipo":"Outros bens móveis","descricao":"FAZENDA/SITIO/CHARA - MUNICÍPIO JACARAU","valor":198846.72},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"TOYOTA HILUX 2016/2016","valor":95000},{"tipo":"Outros bens imóveis","descricao":"50% DA FAZENDA SITIO CHACARA - MUNICÍPIO JARDIM DE PIRANHAS/RN","valor":150000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"D20 1995/1995","valor":45000},{"tipo":"Outros bens imóveis","descricao":"PROPRIEDADE DENOMINADA POÇO DA PEDRA - MUNICÍPIOS CAÍCO/RN E SÃO JOÃO DO SABUGI/RN","valor":605841.23},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB CDB RENDE FACIL, RF SIMPLES, BB AUTOMAIS","valor":85780.74},{"tipo":"Outros bens imóveis","descricao":"FAZENDA/SITIO/CHACARA - MUNICÍPIO JACARAU","valor":207132},{"tipo":"Outros bens imóveis","descricao":"PROPRIEDADE RURAL - GRANJA - MUNICÍPIO JARDIM DE PIRANHAS/RN","valor":300962.99},{"tipo":"Apartamento","descricao":"RESIDENCIAL - PETRÓPOLIS - NATAL/RN","valor":343417.26},{"tipo":"Outros bens imóveis","descricao":"FAZENDA/SITIO/CHACARA - MUNICÍPIO JACARAU","valor":300000},{"tipo":"Outros bens imóveis","descricao":"FAZENDA/SITIO/CHACARA - MUNICÍPIO JACARAU","valor":100342.48},{"tipo":"Outros bens imóveis","descricao":"AREA DE TERRA - FAZENDO REFÚGIO - PRESIDENTE DUTRA/MA","valor":283183.9},{"tipo":"Outros bens imóveis","descricao":"25% DE UMA GRANJA - MUNICÍPIO CAICÓ/RN","valor":26158.29}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 200002534442 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'alvaro-dias-rn'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=ciro-gomes-gov-ce campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1756648.94, '[{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"VGBL NO BRASIL PREV SEGUROS E PREVIDÊNCIAS EM NOME DO DEPENDENTE","valor":53676.49},{"tipo":"Outras participações societárias","descricao":"100% DE PARTICIAPAÇÃO NA EMPRESA NEWSLETTERS","valor":12000},{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":889375.65},{"tipo":"Outras participações societárias","descricao":"100% DE PARTICIAPAÇÃO NA EMPRESA CIRO GOMES SOCIEDADE INDIVIDUAL DE ADAVOCACIA","valor":50000},{"tipo":"Crédito decorrente de empréstimo","descricao":"CRÉDIDO DECORRENTE DE EMPRÉSTIMO A SOCIEDADE CIRO GOMES SOCIEDADE INDIVIDUAL DE ADVOCACIA","valor":0},{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":381202.9},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TOYOTA HILUX SW4","valor":105000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"1/5 DE 01(UM) IMÓVEL RESIDENCIAL","valor":160000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"VALORES NA POSSE DA SRA. MARIA LUIZA GURGEL SERPA PARA PAGAMENTO DE DESPESAS","valor":19771.22},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO HYUNDAI ELANTRA","valor":85000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE BB","valor":622.68}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 60002531351 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'ciro-gomes-gov-ce'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=david-almeida campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1432848.4, '[{"tipo":"Apartamento","descricao":"MANAUS","valor":510000},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"MOEDA NACIONAL","valor":80000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO","valor":180000},{"tipo":"Terreno","descricao":"TERRENO","valor":350000},{"tipo":"Casa","descricao":"MORRO DA LIBERDADE","valor":290000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"RENDA FIXA","valor":22848.4}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 40002536086 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'david-almeida'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=dr-furlan campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1168464.77, '[{"tipo":"Outras participações societárias","descricao":"20% DO INSTITUTO DE TERAPIA INTENSIVA DO AMAPA LTDA","valor":15000},{"tipo":"Casa","descricao":"IMOVEL RESIDENCIAL EM MACAPÁ","valor":180250},{"tipo":"Construção","descricao":"CONTRUCAO EM IMOVEL URBANO","valor":43214.77},{"tipo":"Outras participações societárias","descricao":"CAPITAL DA EMPRESA INSTITUTO DE MEDICINA DO CORACAO LTDA.","valor":100000},{"tipo":"Prédio residencial","descricao":"APTO RESIDENCIAL","valor":530000},{"tipo":"Casa","descricao":"IMOVEL RESIDENCIAL EM MACAPÁ","valor":300000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 30002530014 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'dr-furlan'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=eduardo-riedel campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 16147849.34, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO AUTOMOTOR FORD EDGE ANO 2011","valor":96000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA CAPITAL COOPERATIVA AGRÍCOLA MISTA DE ADAMANTINA","valor":8379.88},{"tipo":"Outros bens móveis","descricao":"SEMOV.BOVINOS - 521 CABEÇAS - VALOR MÉDIO DE R$ 4000,00 - QUANTIDADE EM 31/12/2025","valor":2084000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA CAPITAL COOPERATIVA AGRÍCOLA SULMATOGROSSENSE","valor":3276.79},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA CAPITAL SICREDI CENTRO SUL MS/BA","valor":95545.04},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO AUTOMOTOR FORD RANGER ANO 2024","valor":321890},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA CAPITAL APE PARTICIPAÇÕES","valor":3000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA CAPITAL COAMO","valor":6534.69},{"tipo":"Bem relacionado com o exercício da atividade autônoma","descricao":"BENS RELACIONADOS AO EXERCÍCIO DA ATIVIDADE RURAL","valor":12250222.42},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MOTOCICLETA BMW ANO 2026","valor":113900},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA CAPITAL SICREDI UNIÃO MS/TO","valor":2937.56},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MOTOCICLETA HONDA ANO 2019","valor":15800},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MOTOCICLETA YAMAHA ANO 2017","valor":18000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS COOPERATIVA AGRÍCOLA MISTA SERRA DE MARACAJU","valor":3500},{"tipo":"Outros créditos e poupança vinculados","descricao":"CRÉDITO A RECEBER","valor":624344.36},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITOS EM CONTA CORRENTE, POUPANÇA E INVESTIMENTOS BANCÁRIOS - SALDO EM 31/12/2025","valor":439724.68},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA CAPITAL COOPERATIVA PLANTADORES DE CANA SÃO PAULO","valor":60793.92}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 120002536582 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'eduardo-riedel'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=elizeu-aguiar campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 872808, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TOYOTA COROLLA","valor":82808},{"tipo":"Terreno","descricao":"TERRENO RUA ARMANDO CAJUBÁ, BAIRRO SABIAZAL, PARNAÍBA (50 X 80)","valor":40000},{"tipo":"Casa","descricao":"RUA TORQUATO NETO, 2400 - SÃO CRISTÓVÃO","valor":750000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 180002533958 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'elizeu-aguiar'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=guilherme-fonseca campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 300000, '[{"tipo":"Apartamento","descricao":"1 APARTAMENTO","valor":300000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 170002536575 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'guilherme-fonseca'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=jorginho-mello campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 2818036.89, '[{"tipo":"Outras aplicações e Investimentos","descricao":"CONTA REGISTRO DE FLUXO PAG BB","valor":42019.49},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA PARTE NO CAPITAL SOCIAL DA FIRMA JSM.","valor":1688000},{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"BRASILPREV VGBL","valor":4055.28},{"tipo":"OUTROS BENS E DIREITOS","descricao":"ADIANTAMENTO PARA FUTURO AUMENTO DE CAPITAL SOCIAL DA JSM PARTICIPAÇÕES SOCIETÁRIAS LTDA.","valor":164925.08},{"tipo":"Apartamento","descricao":"AQUISIÇÃO DE 02 APARTAMENTOS, SITUADOS EM ITAPEMA/SC.","valor":380000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO MARCA VW, MODELO KARMANN GHIA, ANO 1988.","valor":145000},{"tipo":"Terreno","descricao":"TERRENO EM ARARANGUA, ADQUIRIDO NO ANO DE 1986.","valor":828.68},{"tipo":"Outras aplicações e Investimentos","descricao":"BB REF DI PLUS ÁGIL","valor":100.41},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO MARCA DODGE, MODELO POLARA, ANO 1980.","valor":20000},{"tipo":"Outras aplicações e Investimentos","descricao":"BB CDB RENDE FÁCIL","valor":43607.95},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB CDB","valor":329500}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 240002537073 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'jorginho-mello'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=omar-aziz campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 2070608, '[{"tipo":"Terreno","descricao":"LOTES DE TERRA","valor":320000},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÃO FINANCEIRA","valor":125.84},{"tipo":"Casa","descricao":"CASA","valor":670133.39},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÃO FINANCEIRA","valor":86694.54},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"FUNDO DE INVESTIMENTO - RENDA FIXA","valor":993654.23}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 40002532272 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'omar-aziz'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=priscila-voigt campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1000, '[{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO","valor":1000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 210002533355 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'priscila-voigt'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=rafael-fonteles campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1799948.6, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUTOMÓVEL CHEVROLET S10 LTZ DD4A 2021\\2022","valor":270000},{"tipo":"Outros bens imóveis","descricao":"IMÓVEL EM TERESINA CORRESPONDENTE A 20HA DE UM TOTAL DE 60HS, FINANCIADO","valor":950000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUTOMÓVEL SW4 2021-2021","valor":290000},{"tipo":"Outras aplicações e Investimentos","descricao":"PARTICIPAÇÃO NO CAPITAL SOCIAL NA EMPRESA TF3 PARTICIPAÇÕES S.A. COM 79.200 AÇÕES","valor":198000},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO EM ESPÉCIE","valor":60000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA NO BANCO DO BRASIL","valor":27574.23},{"tipo":"Caderneta de poupança","descricao":"SALDO EM CARDENETA DE PUPANÇA NA CEF","valor":4374.37}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 180002532987 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'rafael-fonteles'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=robson-raymundo campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 900000, '[{"tipo":"Apartamento","descricao":"1 APARTAMENTO EM ÁGUAS CLARAS, BRASÍLIA-DF","valor":900000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 70002535930 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'robson-raymundo'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=ronaldo-mansur campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 91397.22, '[{"tipo":"Caderneta de poupança","descricao":"CONTA POUPANÇA NA CEF","valor":923.52},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE NO BANCO DO BRASIL","valor":423.7},{"tipo":"Caderneta de poupança","descricao":"CONTA POUPANÇA BANCO DO BRASIL","valor":50},{"tipo":"Casa","descricao":"IMÓVEL RESIDENCIAL, LOCALIZADA NA CIDADE DE SALVADOR BA - ADIQUIRIDA COM O FGTS NO ANO DE 2024, SENDO R$ 59.827,52 COM RECURSOS DE FGTS E R$ 172,48 COM RECURSOS PRÓPRIOS.","valor":60000},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA EM EMPRESA (BABAYAGA)","valor":30000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 50002532269 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'ronaldo-mansur'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=valmir-de-francisquinho campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 258000, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"TOYOTA SW4","valor":233000},{"tipo":"Dinheiro em espécie - moeda estrangeira","descricao":"EM ESPÉCIE","valor":25000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 260002532010 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'valmir-de-francisquinho'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio slug=william-siri campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 120000, '[{"tipo":"Outras participações societárias","descricao":"PARTICIPACAO SOCIETARIA EMPRESA: CASAS THEREZA PRODUTOS ALIMENTICIOS LTDA","valor":120000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 190002536162 (total agregado, snapshot 2026-08-04)'
FROM public.candidatos c
WHERE c.slug = 'william-siri'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );

-- @write tabela=patrimonio_ausencia_oficial slug=andre-marinho campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, '190002537524', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
FROM public.candidatos c
WHERE c.slug = 'andre-marinho'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2026
  );

-- @write tabela=patrimonio_ausencia_oficial slug=cleber-rabelo campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, '140002538631', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
FROM public.candidatos c
WHERE c.slug = 'cleber-rabelo'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2026
  );

-- @write tabela=patrimonio_ausencia_oficial slug=dr-luisinho campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, '10002533539', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
FROM public.candidatos c
WHERE c.slug = 'dr-luisinho'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2026
  );

-- @write tabela=patrimonio_ausencia_oficial slug=efraim-filho campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, '150002538692', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
FROM public.candidatos c
WHERE c.slug = 'efraim-filho'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2026
  );

-- @write tabela=patrimonio_ausencia_oficial slug=geraldo-carvalho campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, '180002537422', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
FROM public.candidatos c
WHERE c.slug = 'geraldo-carvalho'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2026
  );

-- @write tabela=patrimonio_ausencia_oficial slug=gilberto-vasconcelos campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, '40002535267', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
FROM public.candidatos c
WHERE c.slug = 'gilberto-vasconcelos'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2026
  );

-- @write tabela=patrimonio_ausencia_oficial slug=ivan-moraes campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, '170002538097', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
FROM public.candidatos c
WHERE c.slug = 'ivan-moraes'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2026
  );

-- @write tabela=patrimonio_ausencia_oficial slug=joao-campos campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, '170002537230', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
FROM public.candidatos c
WHERE c.slug = 'joao-campos'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2026
  );

-- @write tabela=patrimonio_ausencia_oficial slug=joel-rodrigues campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, '180002538530', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
FROM public.candidatos c
WHERE c.slug = 'joel-rodrigues'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2026
  );

-- @write tabela=patrimonio_ausencia_oficial slug=luciana-gurgel campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, '30002530015', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
FROM public.candidatos c
WHERE c.slug = 'luciana-gurgel'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2026
  );

-- @write tabela=patrimonio_ausencia_oficial slug=preta-lu campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, '100002534191', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
FROM public.candidatos c
WHERE c.slug = 'preta-lu'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2026
  );

-- @write tabela=patrimonio_ausencia_oficial slug=raquel-lyra campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, '170002537227', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
FROM public.candidatos c
WHERE c.slug = 'raquel-lyra'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2026
  );

-- @write tabela=patrimonio_ausencia_oficial slug=vera-lucia campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, '250002536915', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
FROM public.candidatos c
WHERE c.slug = 'vera-lucia'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2026
  );

DO $$
DECLARE
  n_bens integer;
  n_ausencias integer;
BEGIN
  SELECT COUNT(*) INTO n_bens
  FROM public.patrimonio p
  WHERE p.ano_eleicao = 2026
    AND p.fonte LIKE 'TSE Dados Abertos bem\_candidato\_2026 SQ%'
    AND p.fonte LIKE '%snapshot 2026-08-04%';
  IF n_bens <> 17 THEN
    RAISE EXCEPTION 'backfill 2026: esperados 17 bens, encontrados %', n_bens;
  END IF;

  SELECT COUNT(*) INTO n_ausencias
  FROM public.patrimonio_ausencia_oficial a
  WHERE a.ano_eleicao = 2026
    AND a.detalhe LIKE 'SQ ausente no pacote oficial bem_candidato_2026%';
  IF n_ausencias <> 13 THEN
    RAISE EXCEPTION 'backfill 2026: esperadas 13 ausencias, encontradas %', n_ausencias;
  END IF;
END $$;

COMMIT;
