-- Backfill de patrimonio (bens declarados ao TSE) para 27 eleicoes 2006-2024
-- que tinham lacuna publicada (etapa 2b da execucao pf-patrimonio-20260807T170643Z).
-- Bens extraidos dos pacotes oficiais bem_candidato com dedupe entre arquivos
-- _UF/_BRASIL (dedupeTsePatrimonioRows) e descricao mascarada
-- (maskDocumentLikeSequences), mesmo pipeline do ingest-tse. Valores totais e
-- contagens conferidos contra o manifesto auditado antes da geracao.
-- Celulas de 2026 ficam de fora: snapshot do TSE em fluxo, tratadas no gate do
-- ciclo atual (migration 20260807052000 da completude).
BEGIN;

-- @write tabela=patrimonio slug=cicero-lucena campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2006, 914731, '[{"tipo":"Outros bens e direitos","descricao":"02 salas comerciais, Edf. Tocantins, João Pessoa","valor":10417},{"tipo":"Outros bens e direitos","descricao":"03 salas comerciais situadas no Edf. Monte Carlo, João Pessoa","valor":45000},{"tipo":"Outros bens e direitos","descricao":"Casa Res. sito à Praia do Poço, Cabedelo, Paraíba","valor":61227},{"tipo":"Outros bens e direitos","descricao":"Casa Res. sito à rua Norbeto C. Nogueira, 301, João Pessoa","valor":265719},{"tipo":"Outros bens e direitos","descricao":"Parte no terreno situado à Av. João Maurício, Tambaú","valor":166660},{"tipo":"Outros bens e direitos","descricao":"Quotas no grupo 2023 do Consórcio Scania Administradora","valor":48000},{"tipo":"Outros bens e direitos","descricao":"Quotas partes no capital da empresa Gradiente Ltda.","valor":193800},{"tipo":"Outros bens e direitos","descricao":"Quotas partes no capital da empresa Posto Cabaceiras","valor":1},{"tipo":"Outros bens e direitos","descricao":"Salas comerciais situadas no Empresarial Independência, João Pessoa","valor":38907},{"tipo":"Outros bens e direitos","descricao":"Veículo tipo Pajero ano 2000","valor":85000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2006 SQ 10057 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'cicero-lucena'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2006
  );

-- @write tabela=patrimonio slug=clecio-luis campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2006, 112000, '[{"tipo":"Outros bens e direitos","descricao":"UM TERRENO RESIDENCIAL URBANO, SITUADO NA AV. ANHANGUERA, N. 65, BAIRRO BEIROL, MEDINDO 14x30M","valor":80000},{"tipo":"Outros bens e direitos","descricao":"UM VEÍCULO VOLKSWAGEN MODELO GOL HIGHWAY 1.0, ANO 2003, PLACA NEW 6035","valor":25000},{"tipo":"Outros bens e direitos","descricao":"UM VEÍCULO VOLKSWAGEN, MODELO GOL CL 1.8, ANO 1991, PLACA MXJ 1630","valor":7000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2006 SQ 10063 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'clecio-luis'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2006
  );

-- @write tabela=patrimonio slug=clecio-luis campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2008, 187000, '[{"tipo":"Outros bens e direitos","descricao":"UM IMÓVEL RESIDENCIAL SITUADO NA AVENIDA ANHANGUERA, 65 - BEIROL","valor":150000},{"tipo":"Outros bens e direitos","descricao":"UM VEÍCULO MARCA FORD FIESTA, ANO 2003, PLACA NEZ 7307","valor":22000},{"tipo":"Outros bens e direitos","descricao":"UM VEÍCULO MARCA VW GOL, ANO 91/92, PLACA MXJ 1630","valor":5000},{"tipo":"Outros bens e direitos","descricao":"UM VEÍCULO MARCA VW KOMBI ANO 94, PLACA NEN 0710","valor":10000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2008 SQ 447 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'clecio-luis'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2008
  );

-- @write tabela=patrimonio slug=coronel-busnello campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2018, 70000, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"#NULO#","valor":70000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2018 SQ 190000626280 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'coronel-busnello'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2018
  );

-- @write tabela=patrimonio slug=coronel-busnello campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2022, 1502095.73, '[{"tipo":"Casa","descricao":"IMÓVEL","valor":780000},{"tipo":"Construção","descricao":"PROM. DE COMPRA E VENDA CASA","valor":600000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUTOMÓVEL","valor":80000},{"tipo":"Caderneta de poupança","descricao":"POUPANÇA","valor":11209.12},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE","valor":10},{"tipo":"Consórcio não contemplado","descricao":"EMBRACON","valor":30876.61}]'::jsonb, 'TSE Dados Abertos bem_candidato_2022 SQ 190001603420 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'coronel-busnello'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2022
  );

-- @write tabela=patrimonio slug=eduardo-braide campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2006, 125805.4, '[{"tipo":"Outros bens e direitos","descricao":"APARTAMENTO (FLAT)","valor":57781.98},{"tipo":"Outros bens e direitos","descricao":"AUTO MAREA TOYOTA","valor":50683.76},{"tipo":"Outros bens e direitos","descricao":"CADERNETA DE POUPANÇA CEF","valor":215.15},{"tipo":"Outros bens e direitos","descricao":"CONTA CORRENTE AG. 2972-6","valor":0.28},{"tipo":"Outros bens e direitos","descricao":"SALDO EM CONTA CORRENTE CEF","valor":9220.72},{"tipo":"Outros bens e direitos","descricao":"APARTAMENTO","valor":7903.51}]'::jsonb, 'TSE Dados Abertos bem_candidato_2006 SQ 10331 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'eduardo-braide'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2006
  );

-- @write tabela=patrimonio slug=eduardo-paes campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2006, 341800.02, '[{"tipo":"Outros bens e direitos","descricao":"50% DA SALA-3414- RUA DA ASSEMBLEIA, 10  RIO DE JANEIRO-RJ","valor":32626.36},{"tipo":"Outros bens e direitos","descricao":"50% da Sala - 3415 da RUA DA ASSEMBLEIA, 10 - RIO DE JANEIRO -RJ","valor":32626.36},{"tipo":"Outros bens e direitos","descricao":"AUTO RENAULT SCENIC- ANO 2003","valor":38000},{"tipo":"Outros bens e direitos","descricao":"AUTO TOYOTA COROLLA FIELDER FABRICAÇÃO- 2005","valor":64360},{"tipo":"Outros bens e direitos","descricao":"C/C -269068-3 - BCO. DO BRASIL- AG. 3596-3","valor":6459.74},{"tipo":"Outros bens e direitos","descricao":"C/C -3186-6- BCO. BRADESCO AG. 2580-1","valor":2469.11},{"tipo":"Outros bens e direitos","descricao":"CARRO FORD ECOSPORT XLS - ANO - 2004","valor":44000},{"tipo":"Outros bens e direitos","descricao":"CONTA DE APOSENDORIA BRASIL PREV SEGUROS E PREVIDENCIA S/A - PGBL","valor":7521.14},{"tipo":"Outros bens e direitos","descricao":"POUPANÇA BRADESCO EM NOME DE DEPENDENTE","valor":534.85},{"tipo":"Outros bens e direitos","descricao":"SALA 211- BL.02 EM CONSTRUÇÃO SITO NA ESTRADA DE JACAREAPGUA, 7221 - RIO DE JANEIRO","valor":29362.62},{"tipo":"Outros bens e direitos","descricao":"SALA-206 - BL.4- SITO NA AV. DAS AMERICAS, 1650","valor":61091.75},{"tipo":"Outros bens e direitos","descricao":"SALA-212 -BL.2- EM CONSTRUÇÃO SITO NA ESTRADA DE JACAREPAGUA, 7221 - RIO DE JANEIRO","valor":22748.09}]'::jsonb, 'TSE Dados Abertos bem_candidato_2006 SQ 10421 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'eduardo-paes'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2006
  );

-- @write tabela=patrimonio slug=eduardo-paes campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2008, 390372.87, '[{"tipo":"Outros bens e direitos","descricao":"50% DA SALA 3414 RUA DA ASSEMBLEIA 10 RECEBIDA EM DOAÇÃO DO PAI EM 30.11.1987","valor":32626.36},{"tipo":"Outros bens e direitos","descricao":"50% DA SALA 3415 RUA DA ASSEMBLEIA 10 RECEBIDA EM DOAÇÃO  EM 30.11.1987","valor":32626.36},{"tipo":"Outros bens e direitos","descricao":"SALA 206 BLOCO 4 AVENIDA DAS AMERICAS 1650","valor":149880.37},{"tipo":"Outros bens e direitos","descricao":"CARRO TOYOTA COROLLA FIELDER ANO 2005","valor":64360},{"tipo":"Outros bens e direitos","descricao":"SALA 211 BLOCO 02 EM CONSTRUÇÃO NA ESTRADA DE JACAREPAGUÁ 7221","valor":61210.61},{"tipo":"Outros bens e direitos","descricao":"SALA 212 BLOCO 02 EM CONSTRUÇÃO NA ESTRADA DE JACAREPAGUÁ 7221","valor":45877.3},{"tipo":"Outros bens e direitos","descricao":"CONTA CORRENTE 20204-3 AGÊNCIA 3831 BANCO ITAÚ","valor":3488.31},{"tipo":"Outros bens e direitos","descricao":"CONTA CORRENTE NO BANCO DO BRASIL N. 269068-3 AGÊNCIA 3596-3","valor":303.56}]'::jsonb, 'TSE Dados Abertos bem_candidato_2008 SQ 395 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'eduardo-paes'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2008
  );

-- @write tabela=patrimonio slug=gabriel-azevedo campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2016, 432500, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"BICICLETA PASHLEY","valor":3000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"BICILETA VERLOBIS CHURCHILL BALON","valor":4500},{"tipo":"Apartamento","descricao":"METADE DO APARTAMENTO LOCALIZADO NA RUA TUPIS NÚMERO 225 APARTAMENTO 301 CENTRO EM BELO HORZIONTE","valor":425000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2016 SQ 130000084647 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'gabriel-azevedo'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2016
  );

-- @write tabela=patrimonio slug=gelson-merisio campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2006, 434191.6, '[{"tipo":"Outros bens e direitos","descricao":"APTO 901, EDIFÍCIO AMSTERDÃ, NO BAIRRO ESTREITO, FLORIANÓPOLIS SC, ADQUIRIDO EM FEVEREIRO DE 2005","valor":205793.09},{"tipo":"Outros bens e direitos","descricao":"APTO 903, AVENIDA RIO BRANCO, ED. LINDACAP, FLORIANÓPOLIS SC, ADQUIRIDO EM 2001","valor":45000},{"tipo":"Outros bens e direitos","descricao":"AUTOMÓVEL MARCA MERCEDES BENZ, CLASSE A, ANO DE FABRICAÇÃO 2001, ADQUIRIDO EM 2004","valor":32000},{"tipo":"Outros bens e direitos","descricao":"LINHA TELEFÔNICA N. 49-3433.0079","valor":2147},{"tipo":"Outros bens e direitos","descricao":"LOTE N. 1, QUADRA 05, COM CASA DE ALVENARIA DE 257 M2, FINANCIADO PELA CAIXA ECONÔMICA FEDERAL, CONFORME CONTRATO N. 999-7","valor":44251.51},{"tipo":"Outros bens e direitos","descricao":"LOTE N. 2, QUADRA 5, NO MUNICÍPIO DE XANXERÊ","valor":10000},{"tipo":"Outros bens e direitos","descricao":"PARTICIPAÇÃO SOCIAL NA EMPRESA MERISIO COM. DE MATERIAIS DE CONSTRUÇÃO LTDA","valor":95000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2006 SQ 10081 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'gelson-merisio'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2006
  );

-- @write tabela=patrimonio slug=jayme-campos campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2006, 14142116.37, '[{"tipo":"Outros bens e direitos","descricao":"dois lotes de terreno, um com 360,00 m2 e o outro com 4.964,95 m2, av. felinto muller s/n varzea grande - mt","valor":40000},{"tipo":"Outros bens e direitos","descricao":"duas casas residenciais no lote n 02 bairro verdao","valor":9067.1},{"tipo":"Outros bens e direitos","descricao":"emprestimo em moeda corrente a benedito s. castro braga","valor":51125.71},{"tipo":"Outros bens e direitos","descricao":"fazenda boa esperança municipio de cáceres","valor":698393},{"tipo":"Outros bens e direitos","descricao":"fazenda bonanza municipio de rosario oeste","valor":903082.81},{"tipo":"Outros bens e direitos","descricao":"fazenda santa clara no municipio de castanheiras - mt","valor":1300000},{"tipo":"Outros bens e direitos","descricao":"fundo aplicação banco rural s/a em nome de lucimar sacre de campos","valor":2838.98},{"tipo":"Outros bens e direitos","descricao":"grade aradora pesada controle remoto super tatu","valor":10000},{"tipo":"Outros bens e direitos","descricao":"grupo gerador mwm","valor":5000},{"tipo":"Outros bens e direitos","descricao":"lancha maarajo modelo 19 e motor para a lancha","valor":5000},{"tipo":"Outros bens e direitos","descricao":"lote de terra municipio de caceres-mt parte ideal da fazenda boa esperança","valor":7820.37},{"tipo":"Outros bens e direitos","descricao":"lote terra com 450 m2 av. felinto muller Varzea grande-mt","valor":2153.44},{"tipo":"Outros bens e direitos","descricao":"ourocap banco do brasil s/a","valor":0},{"tipo":"Outros bens e direitos","descricao":"plantadeira adubadeira marca baudan","valor":10000},{"tipo":"Outros bens e direitos","descricao":"poupança banco do brasil s/a em nome de carlos eduardo s. campos c n. 6778-4 ag. 2764-2","valor":49006.26},{"tipo":"Outros bens e direitos","descricao":"poupança banco do brasil s/a em nome de jayme verissimo de campos junior nr. 6771-7 ag. 2764-2","valor":49006.26},{"tipo":"Outros bens e direitos","descricao":"poupança banco do brasil s/a em nome de michelle c. s. campos, n. 6751-2 ag. 2764-2","valor":49006.26},{"tipo":"Outros bens e direitos","descricao":"poupança no banco do brasil s/a em nome de karla renata s. c. souto nr. 6752-0 ag. 2764-2","valor":49006.26},{"tipo":"Outros bens e direitos","descricao":"saldo banco do bradesco conta poupança ag. n. 60002","valor":61585.25},{"tipo":"Outros bens e direitos","descricao":"saldo banco rural s/a ag. 016 e c/c 20-1","valor":92569.69},{"tipo":"Outros bens e direitos","descricao":"saldo conta corrente bradesco s/a nr. agencia 60002","valor":1},{"tipo":"Outros bens e direitos","descricao":"saldo em c/c banco do brasil ag. 2764-2 conta 2.362-0","valor":9954.32},{"tipo":"Outros bens e direitos","descricao":"saldo em conta corrente banco bic s/a","valor":175.45},{"tipo":"Outros bens e direitos","descricao":"saldo em conta corrente banco safra","valor":100375.39},{"tipo":"Outros bens e direitos","descricao":"saldo em conta corrente caixa economica federal ag. 790-0 c/c 105.476-1","valor":1713.8},{"tipo":"Outros bens e direitos","descricao":"saldo em conta corrente hsbc ag. 830 c/c 6234-91","valor":31923.71},{"tipo":"Outros bens e direitos","descricao":"semi reboque boiadeiro","valor":25810},{"tipo":"Outros bens e direitos","descricao":"semi-reboque bastulante rebaixado","valor":35000},{"tipo":"Outros bens e direitos","descricao":"titulo capitalização unibanco em nome de lucimar sacre de campos","valor":3150.92},{"tipo":"Outros bens e direitos","descricao":"titulo de capitalização unibanco","valor":630.9},{"tipo":"Outros bens e direitos","descricao":"titulo de cotas-partes cuiabacredi ltda","valor":1738},{"tipo":"Outros bens e direitos","descricao":"trator 8630 4x4","valor":55439.4},{"tipo":"Outros bens e direitos","descricao":"trator agricola de rodas nes holland","valor":80000},{"tipo":"Outros bens e direitos","descricao":"tratos de esteira komatsu","valor":280000},{"tipo":"Outros bens e direitos","descricao":"tres imoveis com 275 m2, 570 m2, 247,5 m2 e 600 m2 localizado na av couto magalhaes em varzea grande-mt","valor":25000},{"tipo":"Outros bens e direitos","descricao":"um apartamento com 170,5 m2, n. 91, Ed. Queen Julie, na Rua Maranhão, n 208, cidade de São Paulo-Sp","valor":160000},{"tipo":"Outros bens e direitos","descricao":"um apartamento na rua julio martinez benevides em tangará da serra - mt","valor":55000},{"tipo":"Outros bens e direitos","descricao":"um area de terra com 2.500,037 has","valor":125000},{"tipo":"Outros bens e direitos","descricao":"um lote de terra com 11153 m2 desdobrado em 10 lotes no n. 10","valor":5666.94},{"tipo":"Outros bens e direitos","descricao":"um lote de terra com 1547,25 m2","valor":3400.16},{"tipo":"Outros bens e direitos","descricao":"um lote de terra em varzea grande - mt rua feliciano garcia","valor":2266.78},{"tipo":"Outros bens e direitos","descricao":"um lote de terra no jardim gloria com 1043 m2","valor":11333.87},{"tipo":"Outros bens e direitos","descricao":"um lote no jardim california coxipo c/ 600m2","valor":2040.09},{"tipo":"Outros bens e direitos","descricao":"um lote urbano com 54,50 m2 na av. couto magalhaes centro, varzea grande-mt","valor":868},{"tipo":"Outros bens e direitos","descricao":"um lote urbano de terra na cidade de varzea grande de mt","valor":2266.78},{"tipo":"Outros bens e direitos","descricao":"um terreno com 320 m2, bairro agua limpa, varzea grande - mt","valor":4794.81},{"tipo":"Outros bens e direitos","descricao":"um terreno urbano com 4646,27 m2","valor":3400.16},{"tipo":"Outros bens e direitos","descricao":"um veículo cherokke sport em nome de sua filha michelle c. sacre de campos","valor":114616},{"tipo":"Outros bens e direitos","descricao":"uma aeronave embraer mode. emb-121al","valor":381463.38},{"tipo":"Outros bens e direitos","descricao":"uma area de terra 203 has na baia dos quatos barão de melgaço-mt","valor":30000},{"tipo":"Outros bens e direitos","descricao":"uma area de terra com 2.499,9648 has","valor":125050},{"tipo":"Outros bens e direitos","descricao":"uma area de terra com 251 has e 5451 m2 taruma em livramento - mt","valor":28448.01},{"tipo":"Outros bens e direitos","descricao":"uma area de terra com 537,50 has no lugar denominado sesmaria palmares de cidade de caceres-mt","valor":182758.64},{"tipo":"Outros bens e direitos","descricao":"uma casa no lote de rua 24 de outubro de cuiabá-mt","valor":22667.24},{"tipo":"Outros bens e direitos","descricao":"uma casa residencial construida nos dois lotes c/ area de 360 m2 cada","valor":9067.1},{"tipo":"Outros bens e direitos","descricao":"uma casa residencial de alvenaria","valor":7933},{"tipo":"Outros bens e direitos","descricao":"uma csa residencial na travessa do limoeiro, cuiabá-MT","valor":11333.87},{"tipo":"Outros bens e direitos","descricao":"uma sala n. 1008 no edf. empire center em cuiabá-mt","valor":9067.1},{"tipo":"Outros bens e direitos","descricao":"uma sla comercial com 106,20 m2 na cidade de v. grande-mt","valor":3400.16},{"tipo":"Outros bens e direitos","descricao":"veiculo mercedes benz caminhao trator","valor":174999.91},{"tipo":"Outros bens e direitos","descricao":"veiculo toyota hilux","valor":65000},{"tipo":"Outros bens e direitos","descricao":"veículo chevrolet s-10 colina","valor":84700},{"tipo":"Outros bens e direitos","descricao":"veículo corola fielder ano 2005/2005","valor":66000},{"tipo":"Outros bens e direitos","descricao":"veículo toyota hilux ano 2005","valor":79000},{"tipo":"Outros bens e direitos","descricao":"02 motos honda xr2004","valor":11411.12},{"tipo":"Outros bens e direitos","descricao":"04 lotes urbanos n 14, 15, 16 e 17 quadra 2 planalto ipiranga varzea grande - mt","valor":2040.09},{"tipo":"Outros bens e direitos","descricao":"1/12 avos de terra urbana com area de 10.908,70 m2 cuiaba/mt","valor":486953.97},{"tipo":"Outros bens e direitos","descricao":"11.060,50 has de uma area denominada de fazenda santa amalia","valor":193.81},{"tipo":"Outros bens e direitos","descricao":"166 has e 2.086 m2 parte ideal fazenda boa esperança","valor":56442.67},{"tipo":"Outros bens e direitos","descricao":"2.112,50 has parte ideal da fazenda boa esperança","valor":718284},{"tipo":"Outros bens e direitos","descricao":"2.155,96 has adq. de vital vilela assunçao CRI 39869","valor":733061.06},{"tipo":"Outros bens e direitos","descricao":"20% de uma area de terra com 251 has e 5451 m2 em taruma livramento-mt","valor":377689.88},{"tipo":"Outros bens e direitos","descricao":"244,81 has adquirido de jose carlos lameira otero","valor":83239.34},{"tipo":"Outros bens e direitos","descricao":"31.000 quotas-capital da friaf-frigorifico alta floresta ltda","valor":15500},{"tipo":"Outros bens e direitos","descricao":"311 has adq plinio antonio marais e esposa","valor":105745},{"tipo":"Outros bens e direitos","descricao":"40 has de terra no município de n. sra. do livramento","valor":155.26},{"tipo":"Outros bens e direitos","descricao":"449.000 quotas de capital v. grande armazens gerais ltda","valor":508.89},{"tipo":"Outros bens e direitos","descricao":"500 quotas capital da empresa radio industria l. de varzea grande-mt","valor":2.84},{"tipo":"Outros bens e direitos","descricao":"aquisiçao 100 das partes jorge a. p. miranda, julio j. campos, jose t c costa e 15 0/0 parte benedito s c braga","valor":1321914.5},{"tipo":"Outros bens e direitos","descricao":"aquisiçao cota capital fritanser frigorifico tangara da serra ltda","valor":2316491},{"tipo":"Outros bens e direitos","descricao":"aquisiçao e intregalização de ações zpe de caceres-mt","valor":86.52},{"tipo":"Outros bens e direitos","descricao":"aquisição 100 0/0 parte de jorge a. p. miranda, jose c. costa e 15 0/0 benedito s. c. braga do total de 4217 has","valor":932001.06},{"tipo":"Outros bens e direitos","descricao":"aquisição de 100 0/0 parte de benedito s. c. braga do total correspondente 10 0/0 s/ 4.217 has","valor":12223.12},{"tipo":"Outros bens e direitos","descricao":"aquisição de 100 0/0 pqarte de benedito s. c. braga do total de 10 0/0 sobre 5554 has","valor":16111.55},{"tipo":"Outros bens e direitos","descricao":"aquisição e intregalização de ações zpe de caceres-mt","valor":86.52},{"tipo":"Outros bens e direitos","descricao":"ação do clube operario de v. grande-mt","valor":340.01},{"tipo":"Outros bens e direitos","descricao":"ações da telemat s a aparelhos","valor":1133.38},{"tipo":"Outros bens e direitos","descricao":"ações da telemat s/a","valor":1133.38},{"tipo":"Outros bens e direitos","descricao":"ações da telemat s/a  aparelhos","valor":1133.38},{"tipo":"Outros bens e direitos","descricao":"banco general motors financiamento  toyota","valor":28783.06},{"tipo":"Outros bens e direitos","descricao":"caixa via   previdencia em nome de lucimar sacre de campos e filhos","valor":150185.84},{"tipo":"Outros bens e direitos","descricao":"caminhao ford/ f 12000 ano 1998/98","valor":23339.96},{"tipo":"Outros bens e direitos","descricao":"camioneta marca ford f-350","valor":73000},{"tipo":"Outros bens e direitos","descricao":"camioneta marca ford f-4000","valor":66000},{"tipo":"Outros bens e direitos","descricao":"cardeneta poupança caixa economica federal ag. 790-0 em nome de lucimar sacre campos","valor":89296.8},{"tipo":"Outros bens e direitos","descricao":"cessão de direito de uma sala com 64 m2 no edf. master center em cuiabá-mt","valor":2500},{"tipo":"Outros bens e direitos","descricao":"colhedora de forragens marca nogueira","valor":10500},{"tipo":"Outros bens e direitos","descricao":"complexa denominada fazenda ines constituida imovel investido cujo complex possui 25% c/ 4217 has em rosário oeste-mt","valor":358461.94},{"tipo":"Outros bens e direitos","descricao":"condominio bougainville - foi construido um edificio em condominio no parque eldorado em cuiabá-mt","valor":258579.55},{"tipo":"Outros bens e direitos","descricao":"consorcio nacional massey fergunson em 100 parcelas","valor":49627.04},{"tipo":"Outros bens e direitos","descricao":"conta poupança unibanco em nome de lucimar sacre de campos","valor":10843.55},{"tipo":"Outros bens e direitos","descricao":"dca 5500 dist. calcareo e adubo marca super tatu","valor":5000},{"tipo":"Outros bens e direitos","descricao":"dois lotes de terreno urbano um com 256,50 m2 e outro com 414 m2 na Av. Couto Magalhaes na cidade de varzea grande-mt","valor":5000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2006 SQ 10321 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'jayme-campos'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2006
  );

-- @write tabela=patrimonio slug=jeremias-cosmo campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2018, 70000, '[{"tipo":"Casa","descricao":"Casa financiada pela Caixa Econômica na Rua Santos Dumont, 166, Centro, Ribeirão, Pernambuco","valor":70000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2018 SQ 170000607399 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'jeremias-cosmo'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2018
  );

-- @write tabela=patrimonio slug=jeremias-cosmo campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2024, 155000, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUTOMÓVEL","valor":85000},{"tipo":"Casa","descricao":"IMÓVEL CASA","valor":70000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2024 SQ 170002143292 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'jeremias-cosmo'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2024
  );

-- @write tabela=patrimonio slug=jeronimo campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2022, 515216.13, '[{"tipo":"Apartamento","descricao":"50% do Apartamento situado na Rua  Várzea de Santo Antônio N.: 316, Caminho das Árvores,  Salvador Ba CEP: 41820-180, adquirido em comunhão com Tatiana Ribeiro Velloso CPF/ME n.. [documento mascarado]","valor":315000},{"tipo":"Casa","descricao":"50% de CASA RESIDENCIAL localizada na Quadra C N.: 17, Conjunto Centenário, Queimadinha - Feira de Santana (BA), CEP: 44050-608,  adquirida em comunhão com Tatiana Ribeiro Velloso","valor":100000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"Modelo C4  Citroen. RENAVAM: [documento mascarado] 01. Ano 2018","valor":72000},{"tipo":"Caderneta de poupança","descricao":"Banco do Brasil. Agência: 2216.  Conta: 36238-7","valor":16330},{"tipo":"Outras aplicações e Investimentos","descricao":"ASCOOB - Cooperativa de Credito Rural","valor":7570.91},{"tipo":"Depósito bancário em conta corrente no País","descricao":"Banco do Brasil Agencia 2216 Conta 36238-7","valor":4207.29},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"5 AÇÕES. CASH3. / 6 AÇÕES CIEL3/ 1 AÇÃO CTSA3 e 1 AÇÃO ENJU3","valor":42.15},{"tipo":"Outras aplicações e Investimentos","descricao":"banco do brasil nuinvest","valor":50.21},{"tipo":"Outras aplicações e Investimentos","descricao":"Fundo Cautela Banco do Brasi","valor":10.57},{"tipo":"Outras aplicações e Investimentos","descricao":"FUNDO EQUILÍBRIO bb","valor":3},{"tipo":"Outras aplicações e Investimentos","descricao":"FUNDO POTENCIAL","valor":2}]'::jsonb, 'TSE Dados Abertos bem_candidato_2022 SQ 50001603638 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'jeronimo'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2022
  );

-- @write tabela=patrimonio slug=jose-roberto-arruda campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2006, 598076.98, '[{"tipo":"Outros bens e direitos","descricao":"01 AUT. FORD RANGER ANO 2001","valor":51400},{"tipo":"Outros bens e direitos","descricao":"APARTAMENTO 102 SITO A RUA XAVIER LISBOA - ITAJUBÁ MG","valor":66955.53},{"tipo":"Outros bens e direitos","descricao":"APARTAMENTO 304 BL.D SQS114 - BRASÍLIA","valor":195261.56},{"tipo":"Outros bens e direitos","descricao":"BANCO DO BRASIL AG. 3478-9 C.C232262-5","valor":26693.85},{"tipo":"Outros bens e direitos","descricao":"CASA RESID. SITO A RUA JAIME MARTINS VIEIRA 36/38 - ITAJUBÁ - MG","valor":194986.91},{"tipo":"Outros bens e direitos","descricao":"DINHEIRO EM ESPÉCIE MOEDA NACIONAL","valor":20000},{"tipo":"Outros bens e direitos","descricao":"LINHA TEL. RESID. 2","valor":1776.57},{"tipo":"Outros bens e direitos","descricao":"LOTE RES. LOTEAMENTO BPS - RUA JK ESQ. COM SILVESTRE FERRAZ - ITAJUBÁ - MG","valor":38862.47},{"tipo":"Outros bens e direitos","descricao":"SALDOC.C BANCO DO BRASIL AG.3596-3","valor":2140.09}]'::jsonb, 'TSE Dados Abertos bem_candidato_2006 SQ 10382 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'jose-roberto-arruda'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2006
  );

-- @write tabela=patrimonio slug=lourdes-melo campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2006, 35000, '[{"tipo":"Outros bens e direitos","descricao":"01 AUTOMÓVEL FIAT PALIO ANO 2002","valor":15000},{"tipo":"Outros bens e direitos","descricao":"01 CASA QUITADA","valor":20000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2006 SQ 10000 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'lourdes-melo'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2006
  );

-- @write tabela=patrimonio slug=lourdes-melo campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2008, 50000, '[{"tipo":"Outros bens e direitos","descricao":"IMÓVEL RESIDENCIAL","valor":50000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2008 SQ 8738 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'lourdes-melo'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2008
  );

-- @write tabela=patrimonio slug=marcus-sodre campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2014, 89490, '[{"tipo":"Caderneta de poupança","descricao":"POUPANÇA NO BANCO DO BRASIL","valor":2290},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO, MODELO FIESTA HATCH, FLEX, ANO 2012/2013, MOTOR 1.0, COM FINANCIAMENTO PELO BANCO BRADESCO","valor":28400},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MOTO HONDA BIZ 125CC ES ANO 2006 COR AZUL","valor":3500},{"tipo":"Apartamento","descricao":"FINANCIADO PELA CAIXA ECONÔMICA FEDERAL COM ÁREA PRIVATIVA DE 45M² EM BALNEÁRIO CAMBORIÚ","valor":55300}]'::jsonb, 'TSE Dados Abertos bem_candidato_2014 SQ 240000000204 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'marcus-sodre'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2014
  );

-- @write tabela=patrimonio slug=mauricio-tonha campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2008, 4992953.17, '[{"tipo":"Outros bens e direitos","descricao":"LOTE URBANO 28 E 28A, COM 6000 METROS QUADRADOS EM AGUA BOA MT, MATRICULA 2873","valor":120},{"tipo":"Outros bens e direitos","descricao":"LOTE URBANO N. 14 DA QUADRA 13, COM 450 METROS QUADRADOS, MATRICULA 2130","valor":340.76},{"tipo":"Outros bens e direitos","descricao":"LOTE URBANO 11 DA QUADRA 32, MATRICULA 5026","valor":33000},{"tipo":"Outros bens e direitos","descricao":"LOTE URBANO 12, QUADRA 32, MATRICULA 5025","valor":33000},{"tipo":"Outros bens e direitos","descricao":"UMA AREA DE TERRAS EM AGUA BOA, DENOMINADA FAZENDA ESTANCIA BAHIA III, COM 149,61 HECTARES, MATRICULA 2556","valor":34058.57},{"tipo":"Outros bens e direitos","descricao":"100 HECTARES DE TERRAS NO MUNICIPIO DE AGUA BOA, MATRICULA 2790","valor":18070.19},{"tipo":"Outros bens e direitos","descricao":"500 HECTARES DE TERRA NO MUNICIPIO DE ÁGUA BOA, MATRICULA 887","valor":56514},{"tipo":"Outros bens e direitos","descricao":"359,4790 HECTARES NO MUNICIPIO DE AGUA BOA, DENOMINADA FAZENDA PRINCESA, MATRIUCLA 354","valor":87926.28},{"tipo":"Outros bens e direitos","descricao":"200 HECTARES DE TERRA DENOMINADO FAZENDA ESTANCIA BAHIA, CRI 355","valor":50000},{"tipo":"Outros bens e direitos","descricao":"100 HECTARES DE TERRA, CRI 3926","valor":25000},{"tipo":"Outros bens e direitos","descricao":"244,845 HECTARES DE TERRA, MATRICULA 025","valor":2181.81},{"tipo":"Outros bens e direitos","descricao":"300 HECTARES DE TERRA, MATRICULA 2587","valor":63000},{"tipo":"Outros bens e direitos","descricao":"148,6849 HECTARES DE TERRA, MATRICULA 2557","valor":31158.51},{"tipo":"Outros bens e direitos","descricao":"210,73 HECTARES DE TERRA, MATRICULA 4773","valor":48673},{"tipo":"Outros bens e direitos","descricao":"1116,2361 HECTARES DE TERRA, MATRICULA 4674","valor":111623},{"tipo":"Outros bens e direitos","descricao":"COTA DO CAPITAL SOCIAL DA FIRMA TONHA E TONHA LTDA, CNPJ [documento mascarado]","valor":960000},{"tipo":"Outros bens e direitos","descricao":"COTA DE CAPITAL SOCIAL DA FIRMA MC TONHA, CNPJ [documento mascarado]","valor":200000},{"tipo":"Outros bens e direitos","descricao":"SICREDI LTDA, COTA COOPERATIVA DE CREDITO","valor":41502.28},{"tipo":"Outros bens e direitos","descricao":"25% DO IMOVEL RURAL COM AREA TOTAL DE 37,5 HECATRES, MATRICULA 4251","valor":25000},{"tipo":"Outros bens e direitos","descricao":"VALOR DE BENFEITORIAS REALIZADAS EM DIVERSOS IMOVEIS EM 2002","valor":865610},{"tipo":"Outros bens e direitos","descricao":"HONDA KLL 125 TS 2001 PLACAS JZC 2723","valor":4600},{"tipo":"Outros bens e direitos","descricao":"950 HECTARES DE TERRA, MATRICULA 6178","valor":288000},{"tipo":"Outros bens e direitos","descricao":"BANCO DO BRASIL","valor":731.12},{"tipo":"Outros bens e direitos","descricao":"AREA DE TERRA RURAL COM 47,34 42HECTARES EM CUIABA, MATRICULA 62821","valor":400000},{"tipo":"Outros bens e direitos","descricao":"BANCO SICREDI","valor":678.33},{"tipo":"Outros bens e direitos","descricao":"CAMIONETE MITSUBISHI L200, SPORT GLS, NOTA FISCAL 6154","valor":86000},{"tipo":"Outros bens e direitos","descricao":"FIAT UNO MILLE FIRE FLEX, NF 41938","valor":25500},{"tipo":"Outros bens e direitos","descricao":"OURO CAP","valor":17286.01},{"tipo":"Outros bens e direitos","descricao":"BRADESCO","valor":319.03},{"tipo":"Outros bens e direitos","descricao":"1000 COTAS DO CAPITAL SOCIAL DA EMPRESA BIO BRAZILIAM ITALIA OIL INDUSTRIA COMERCIO E EXPORTAÇÃO DE BIOCOMBUSTIVEIS LTDA","valor":25000},{"tipo":"Outros bens e direitos","descricao":"MITSUBISHI PAJERO ESPORT 4X4, NF 7952","valor":127800},{"tipo":"Outros bens e direitos","descricao":"CAMIONETE FORDE F4000, 2006 NF 119519","valor":70000},{"tipo":"Outros bens e direitos","descricao":"CAMINHÃO MERCEDEZ BENS L620","valor":110000},{"tipo":"Outros bens e direitos","descricao":"12 HECTARES DE TERRA, MATRICULA 5992","valor":12000},{"tipo":"Outros bens e direitos","descricao":"5 HECTARES DENOMINADA LOTE SEMEAR, MATRICULA 3018","valor":150000},{"tipo":"Outros bens e direitos","descricao":"25 HECTARES DE TERRA, MATRICULA 5568","valor":36000},{"tipo":"Outros bens e direitos","descricao":"4 LOTES URBANOS, MATRIULAS 2762, 2763, 2764, 2908","valor":270000},{"tipo":"Outros bens e direitos","descricao":"SALDO EM CAIXA EM 31/12/2007","valor":250000},{"tipo":"Outros bens e direitos","descricao":"114,0194 HECTARES DE TERRA, ATRICULA 1415","valor":50000},{"tipo":"Outros bens e direitos","descricao":"1/3 DA AERONAVE PREFIXO PTRBR MODELO NMM 810 D, N. SÉRIE 810558 CERTIFICADO 11440","valor":36666.67},{"tipo":"Outros bens e direitos","descricao":"FIAT PALIO ELX 1.0 FLEX, PLACA NJH 9410","valor":37865},{"tipo":"Outros bens e direitos","descricao":"VALOR DE BENFEITORIAS REALIZADAS EM DIVEROS IMOVEIS EM 2007","valor":299082.13},{"tipo":"Outros bens e direitos","descricao":"MOTO YAMAHA XTZ 125K, PLACAS NIY 9830","valor":8646.48}]'::jsonb, 'TSE Dados Abertos bem_candidato_2008 SQ 3028 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'mauricio-tonha'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2008
  );

-- @write tabela=patrimonio slug=patrus-ananias campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2014, 236336.09, '[{"tipo":"Apartamento","descricao":"1/3 APTO 03 DUPLEX BAIRRO SÃO LUCAS - BELO HORIZONTE - MG","valor":31111.13},{"tipo":"Terreno","descricao":"50% LOCALIZADO NO RECANTO VALE II BRUMADINHO","valor":10000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"FIAT/PALIO WK ADV ANO 2011/2012","valor":52182.9},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO FINANCEIRA NO BB CP","valor":9730.63},{"tipo":"Apartamento","descricao":"50% APTO AV. BERNADO MONTEIRO BH","valor":94495.49},{"tipo":"Linha telefônica","descricao":"50% LINHA TELEFONICA","valor":1179.75},{"tipo":"Casa","descricao":"50% CONSTRUCAO DE CASA NO RECANTO VALE II BRUMADINHO","valor":34897.44},{"tipo":"Outros bens móveis","descricao":"50% GARABEM RUA BERNARDO MONTEIRO - BH","valor":2738.75}]'::jsonb, 'TSE Dados Abertos bem_candidato_2014 SQ 130000000890 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'patrus-ananias'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2014
  );

-- @write tabela=patrimonio slug=patrus-ananias campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2018, 561673.66, '[{"tipo":"Apartamento","descricao":"#NULO#","valor":188990.99},{"tipo":"Depósito bancário em conta corrente no País","descricao":"#NULO#","valor":18385.96},{"tipo":"Depósito bancário em conta corrente no País","descricao":"#NULO#","valor":248533.16},{"tipo":"Depósito bancário em conta corrente no País","descricao":"#NULO#","valor":8103.1},{"tipo":"Depósito bancário em conta corrente no País","descricao":"#NULO#","valor":0.05},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"#NULO#","valor":52182.9},{"tipo":"Outros créditos e poupança vinculados","descricao":"#NULO#","valor":40000},{"tipo":"Outros bens imóveis","descricao":"#NULO#","valor":5477.5}]'::jsonb, 'TSE Dados Abertos bem_candidato_2018 SQ 130000626967 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'patrus-ananias'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2018
  );

-- @write tabela=patrimonio slug=patrus-ananias campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2022, 1025194.65, '[{"tipo":"Caderneta de poupança","descricao":"BANCO SANTANDER","valor":13003.4},{"tipo":"Caderneta de poupança","descricao":"BB","valor":0.05},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BANCO MERCANTIL","valor":150891.37},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB","valor":151327.22},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CRÉDITO JUNTO A MARCOS NEVES VICTER ANANIAS","valor":40000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BB","valor":4439.47},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BB","valor":4669.92},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BB","valor":41.69},{"tipo":"Apartamento","descricao":"APARTAMENTO EM BELO HORIZONTE MG","valor":320000},{"tipo":"Apartamento","descricao":"APARTAMENTO EM BELO HORIZONTE MG","valor":188990.99},{"tipo":"Apartamento","descricao":"3,28% APARTAMENTO EM BELO HORIZONTE MG","valor":13419.57},{"tipo":"Apartamento","descricao":"3,28% APARTAMENTO EM BELO HORIZONTE MG","valor":15244.57},{"tipo":"Apartamento","descricao":"3,28% APARTAMENTO EM BELO HORIZONTE MG","valor":8088.31},{"tipo":"Casa","descricao":"3,28% CASA RESIDENCIAL EM BOCAIUVA","valor":8207.69},{"tipo":"Outros bens imóveis","descricao":"GARAGEM EM BELO HORIZONTE MG","valor":5477.5},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"PALIO WK ADVENTURE FLEX 2011/2012","valor":52182.9},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"RENAULT DUSTER 2017","valor":49210}]'::jsonb, 'TSE Dados Abertos bem_candidato_2022 SQ 130001607244 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'patrus-ananias'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2022
  );

-- @write tabela=patrimonio slug=rafael-greca campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2006, 483980.68, '[{"tipo":"Outros bens e direitos","descricao":"05 JOIAS","valor":1025.52},{"tipo":"Outros bens e direitos","descricao":"05 TERMINAIS TELEFONICOS","valor":12066.88},{"tipo":"Outros bens e direitos","descricao":"18,91% LOTE DE TERRENO QUATRO BARRAS PR","valor":11346.66},{"tipo":"Outros bens e direitos","descricao":"40% CHACARA DAS LARANJEIRAS","valor":53040},{"tipo":"Outros bens e direitos","descricao":"50% APTO ED. VALENÇA EM CTBA","valor":22654.65},{"tipo":"Outros bens e direitos","descricao":"AÇÕES TELENORTE","valor":75.26},{"tipo":"Outros bens e direitos","descricao":"BB C/C","valor":88.33},{"tipo":"Outros bens e direitos","descricao":"BB REF DI ESTILO","valor":22345.7},{"tipo":"Outros bens e direitos","descricao":"BB RENDA FIXA","valor":23324.02},{"tipo":"Outros bens e direitos","descricao":"BCO DO BRASIL RENDA FIXA","valor":42005.09},{"tipo":"Outros bens e direitos","descricao":"BCO ITAU POUPANÇA","valor":71.79},{"tipo":"Outros bens e direitos","descricao":"BENFEITORIAS APTO ED. VALENÇA","valor":23874.93},{"tipo":"Outros bens e direitos","descricao":"BENFEITORIAS CHACARA DAS LARANJEIRAS","valor":72000},{"tipo":"Outros bens e direitos","descricao":"BRADESCO C/C","valor":1},{"tipo":"Outros bens e direitos","descricao":"BRADESCO POUPANÇA","valor":2546.59},{"tipo":"Outros bens e direitos","descricao":"CASA DE MADEIRA CHACARA DAS LARANJEIRAS PIRAQUARA PR","valor":2082.79},{"tipo":"Outros bens e direitos","descricao":"LOTE DE TERRENO EM PINHAIS","valor":30000},{"tipo":"Outros bens e direitos","descricao":"MAQUINA DE XEROX","valor":27912.38},{"tipo":"Outros bens e direitos","descricao":"MOEDA NACIONAL","valor":79000},{"tipo":"Outros bens e direitos","descricao":"NOTEBOOK","valor":3999},{"tipo":"Outros bens e direitos","descricao":"OBJETOS DE ARTE DIVERSOS","valor":42220.09},{"tipo":"Outros bens e direitos","descricao":"PIANO ESSENFELDER","valor":9000},{"tipo":"Outros bens e direitos","descricao":"VEICULO VW GOL 98","valor":1600},{"tipo":"Outros bens e direitos","descricao":"VEICULO VW KOMBI 99/2000","valor":1700}]'::jsonb, 'TSE Dados Abertos bem_candidato_2006 SQ 10186 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'rafael-greca'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2006
  );

-- @write tabela=patrimonio slug=tiao-bocalom campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2006, 462000, '[{"tipo":"Outros bens e direitos","descricao":"CINCO COLONIAS RURAIS COM 210 Ha, LOCALIZADA NO PROJETO REDENÇÃO II, NO MUNICIPIO DE ACRELANDIA","valor":350000},{"tipo":"Outros bens e direitos","descricao":"UM VEICULO VW MODELO PARATI ANO 97","valor":12000},{"tipo":"Outros bens e direitos","descricao":"UMA AREA URBANA COM CINCO HECTARES LOCALIZADA NA RUA JOSE DE DEUS, N. 343 - CENTRO DE ACRELANDIA , COM UMA CASA EM MADEIRA","valor":100000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2006 SQ 10275 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'tiao-bocalom'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2006
  );

-- @write tabela=patrimonio slug=tiao-bocalom campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2008, 624000, '[{"tipo":"Outros bens e direitos","descricao":"DUAS COLONIAS NO RAMAL BIGODE KM 23 NA BR 364 MEDINDO 160 HECTARES NO MUNICIPIO DE ACRELANDIA","valor":200000},{"tipo":"Outros bens e direitos","descricao":"UMA COLONIA NO RAMAL OCO DO MUNDO, KM 24 NA BR - 364 MEDINDO 91 HECTARES, NO MUNICIPIO DE SENADOR GUIOMAR","valor":100000},{"tipo":"Outros bens e direitos","descricao":"UMA CASA EM MADEIRA MEDINDO 17X11 COM DOIS PISOS, NA RUA JOSÉ DE DEUS 349 - ACRELANDIA","valor":100000},{"tipo":"Outros bens e direitos","descricao":"UM VEICULO PARATI, ANO 97","valor":12000},{"tipo":"Outros bens e direitos","descricao":"VINTE E CINCO LOTES URBANOS, LOCALIZADO NO LOTIAMENTO BOCALOM , RUA JOSÉ DE DEUS N.. 349 - ACRELANDIA","valor":180000},{"tipo":"Outros bens e direitos","descricao":"UM VEICULO PARATI, ANO 2004","valor":32000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2008 SQ 313 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'tiao-bocalom'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2008
  );

-- @write tabela=patrimonio slug=vera-lucia campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2020, 20000, '[{"tipo":"Terreno","descricao":"Terreno localizado no município de Nossa Senhora do Socorro-SE","valor":20000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2020 SQ 250000744464 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'vera-lucia'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2020
  );

-- @write tabela=patrimonio slug=vittorio-medioli campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2016, 352572936.23, '[{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB AGRONEGOCIO LCA CDI AG 0750-1","valor":50000},{"tipo":"Casa","descricao":"1 CASA  BAIRRO BANDEIRANTES BELO HORIZONTE","valor":152674},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"FIAT PUNTO SPORTING 1.8 2012/2013 PLACA OOX 1962","valor":43397.6},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BB CDB BANCO DO BRASIL AG 0503-7 CC 72771-7","valor":205500},{"tipo":"Casa","descricao":"1 CASA NO LOTE DA QUADRA  73 BAIRRO BANDEIRANTES  BELO HORIZONTE","valor":75000},{"tipo":"Terreno","descricao":"UM TERRENO LOCALIZADO  A RUA ROVIGO S/N  BELO HORIZONTE","valor":15267.39},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BB SALDO CONTA CORRENTE AG 0750-1 C/C 49963-3","valor":18638.21},{"tipo":"Terreno","descricao":"UM LOTE  N 05 QUADRA 65 BAIRRO BAIA BRANCA CABO FRIO /RJ","valor":17649.33},{"tipo":"Quotas ou quinhões de capital","descricao":"NOVENTA E NOVE MIL  TREZENTOS  E SETENTA  E CINCO QUOTAS DE CAPITAL DEVA VEICULOS LTDA","valor":99375},{"tipo":"Terreno","descricao":"1 LOTE  N 31 QUADRA  04 QUINTAS DAS JANGADAS - IBIRITE","valor":1387},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BB SALDO C/C BANCO DO BRASIL AG 0503-7 C/C 7277-1","valor":14478.27},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB AGRONEGOCIO LCA POS CDI AG 0750-1","valor":209000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BB C PRAZO CONTA 72771-7 AG 0503-7","valor":89854.07},{"tipo":"Quotas ou quinhões de capital","descricao":"TRINTA MIL QUOTAS DE CAPITAL DA EMPRESA SADA TRANSPORTES CENTRO OESTE LTDA","valor":30000},{"tipo":"Quotas ou quinhões de capital","descricao":"SESSENTA E TRES MILHOES E OITOCENTOS E DEZ MIL QUUOTAS DE CAPITAL DA EMPRESA SEMPRE EDITORA SEMPRE EDITORA LTDA","valor":63810000},{"tipo":"Quotas ou quinhões de capital","descricao":"ITAU QUOTAS DA ITAUVEST PLUS FACFI","valor":9487.96},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"UM VEICULO FIAT PUNTO 1.8 FLEX PLACA HGL 6022","valor":44052},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB RENDA FIXA  500 CONTA  72771-7 AG 0503-7","valor":69369},{"tipo":"Quotas ou quinhões de capital","descricao":"VINTE E CINCO MIL QUOTAS DE CAPITAL DA EMPRESA EBER BIOENERGIA E AGRICULTURA  LTDA","valor":25000},{"tipo":"Quotas ou quinhões de capital","descricao":"CINCO MIL E OITOCENTOS QUOTAS DE DE CAPITAL DA EMPRESA MATRAM INDUSTRIA E COMERCIO  LTDA","valor":5800},{"tipo":"Quotas ou quinhões de capital","descricao":"OITOCENTOS QUOTAS DE CAPITAL DA EMPRESA BERC ETANOL E AGRICULTURA","valor":834},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB RENDA FIXA  500 AG 0750-1","valor":72817.58},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"ITAU APLICACOES DE RENDA FIXA CBD BANCO ITAU","valor":4905.18},{"tipo":"Casa","descricao":"CASA SITUADA NA AV GETULIO VARGAS N° 4136 PAMPULHA  BELO HORIZONTE  COM TERRENO DE AREA TOTAL 12.345.72 M2","valor":1000000},{"tipo":"Quotas ou quinhões de capital","descricao":"01 QUOTA  DE CAPITAL DA EMPRESA BRASIL PROLOGIC COMERCIO EXTERIOR  LTDA","valor":1},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"SETE MIL TREZENTOS E QUARENTA E UMA MIL ACOES DA EMPRESA DACUNHA S/A","valor":2953.74},{"tipo":"Quotas ou quinhões de capital","descricao":"OITO QUOTAS DE CAPITAL DA EMPRESA CBC IMOVEIS ECOSERVADORA  LTDA","valor":8},{"tipo":"Depósito bancário em conta corrente no País","descricao":"ITAU SALDO C/C AG 1335 CONTA 17905-5","valor":10.01},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BB SALDO C/C BANCO DO BRASIL  AG 0503-7 C/C 72771-7","valor":14478.27},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB LCI POS FIXADA  COM COM RESGATE  AG 0750-1","valor":100000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"CDB DI BANCO DO BRASIL AG 0750-1","valor":351000},{"tipo":"Quotas ou quinhões de capital","descricao":"DUAS ACOES DA EMPRESA SADA TRANSP E ARMAZENAGEM  S/A","valor":2},{"tipo":"Quotas ou quinhões de capital","descricao":"QUARENTA E SETE MIL QUOTAS  DE CAPITAL DA EMPRESA SADA  LOGISTICA E ARMAZENAGEM","valor":47},{"tipo":"Quotas ou quinhões de capital","descricao":"CEM MIL QUOTAS  DE CAPITAL DE CAPITAL DA EMPRESA  DEVA AUTOMOVEIS","valor":100000},{"tipo":"Terreno","descricao":"1 LOTE N 06 QUADRA  65 BAIRRO BAIA BRANCA EM CABO FRIO/RJ","valor":9715.62},{"tipo":"Quotas ou quinhões de capital","descricao":"DUZENTOS E OITENTA E CINCO MILHOES NOVECENTOS E VINTE  E NOVE MIL E DUZENTOS E TRINTA QUOTAS DE CAPITAL DA EMPRESA VIME PARTICIPACOES LTDA","valor":285929233},{"tipo":"Quotas ou quinhões de capital","descricao":"01 QUOTA DE CAPITAL DA EMPRESA VIEHOLDING COMERCIO E REPRESENTACOES","valor":1},{"tipo":"Quotas ou quinhões de capital","descricao":"MIL QUOTAS DE CAPITAL DA EMPRESA SADA LOGISTICA  LTDA","valor":1000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2016 SQ 130000080259 (total agregado)'
FROM public.candidatos c
WHERE c.slug = 'vittorio-medioli'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2016
  );

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n
  FROM public.patrimonio p
  WHERE p.fonte LIKE 'TSE Dados Abertos bem\_candidato\_% (total agregado)';
  IF n < 27 THEN
    RAISE EXCEPTION 'backfill patrimonio: esperadas pelo menos 27 linhas com fonte TSE Dados Abertos, encontradas %', n;
  END IF;
END $$;

COMMIT;
