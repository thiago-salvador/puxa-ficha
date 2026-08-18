-- Patrimonio declarado de 2026 das fichas novas de 03/08. Lote 1 de 3.
--
-- Decisao do Thiago: preencher antes do video de lancamento de 05/08, em vez de
-- esperar 15/08. As fichas novas nasceram com "Perfil em construcao" e este e o
-- primeiro dado real que entra nelas.
--
-- FONTE: pacote bem_candidato_2026.zip do TSE, arquivo BRASIL, baixado em
-- 03/08/2026. O vinculo com cada ficha e por SQ_CANDIDATO, degrau de maior
-- prioridade do resolver, entao nao ha risco de homonimo aqui.
--
-- POR QUE NAO FOI PELO scripts/ingest-all.ts: ele exige SUPABASE_SERVICE_ROLE_KEY
-- e nao existe .env.local nesta maquina; a chave nao sai do Vercel (variavel
-- encriptada) nem do MCP do Supabase, que so expoe chaves publicaveis. Alem
-- disso o ingest roda sobre a coorte inteira, e isto toca so as 15 fichas novas
-- que tem bens declarados.
--
-- ARMADILHA DO PACOTE, QUE QUASE DOBROU TODO VALOR: o zip traz um arquivo por UF
-- E um bem_candidato_2026_BRASIL.csv consolidado, com as mesmas 13.426 linhas.
-- Glob em bem_candidato_2026_*.csv soma os dois e dobra o patrimonio de todo
-- mundo. Pego na conferencia, antes de aplicar. Usa so o BRASIL, e ainda
-- deduplica por NR_ORDEM_BEM_CANDIDATO como segunda rede.
-- Prova em numero pequeno: naf-nascimento tem 2 bens no arquivo,
-- R$ 1.784,49 + R$ 52,00 = R$ 1.836,49, que e o valor_total gravado no lote 2.
--
-- 3 dos 18 SQ novos nao tem bens declarados no pacote. Ficha sem patrimonio aqui
-- e ausencia de declaracao, nao zero. Os 5 provisorios nao tem SQ nenhum, entao
-- ficam de fora por construcao ate o registro deles sair.

INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
  SELECT id, 2026, 1443073.26, '[{"tipo": "Casa", "valor": 450000.0, "descricao": "IMÓVEL"}, {"tipo": "Consórcio não contemplado", "valor": 305034.77, "descricao": "CONSÓRIO DE IMÓVEL"}, {"tipo": "Caderneta de poupança", "valor": 83269.18, "descricao": "CADERNETA DE POUPANÇA"}, {"tipo": "Casa", "valor": 250000.0, "descricao": "IMÓVEL"}, {"tipo": "Casa", "valor": 100000.0, "descricao": "IMÓVEL"}, {"tipo": "Apartamento", "valor": 254769.31, "descricao": "APARTAMENTO"}]'::jsonb, 'TSE' FROM public.candidatos WHERE slug = 'alessandra-campelo'
UNION ALL
  SELECT id, 2026, 1545137.20, '[{"tipo": "Terreno", "valor": 55000.0, "descricao": "50% DO LOTE 35 - MUNICÍPIO MONTE DAS GAMELEIRAS/RN"}, {"tipo": "Outros bens móveis", "valor": 245000.0, "descricao": "REBANHO DE 98 CABEÇAS DE GADO, TOUROS, VAGAS, GARROTES NOVILHA E BEZERROS"}, {"tipo": "Terreno", "valor": 6250.0, "descricao": "50% DO LOTE 564 - LOTEAMENTO PARAISO DE BOM JESUS - MUNICÍPIO BOM JESUS/RN"}, {"tipo": "Aplicação de renda fixa (CDB, RDB e outros)", "valor": 82045.19, "descricao": "CEF SALDO EM VGBL"}, {"tipo": "Apartamento", "valor": 380000.0, "descricao": "FINANCIADO, NO BAIRO LAGOA NOVA - NATAL/RN"}, {"tipo": "Apartamento", "valor": 240000.0, "descricao": "NA PRAIA PORTO MIRIM - MUNICÍPIO CEARÁ-MIRIM/RN"}, {"tipo": "Terreno", "valor": 6250.0, "descricao": "50% DO COMPLEXO MERCIAL GARCIA FREIRE - GLEBA 13 - MUNICÍPIO BOM JESUS/RN"}, {"tipo": "Terreno", "valor": 23286.94, "descricao": "LOTE 02 - LOTEAMENTO SANTA ISMENIA - MUNICÍPIO ASSU/RN"}, {"tipo": "Aplicação de renda fixa (CDB, RDB e outros)", "valor": 74466.02, "descricao": "BB CDB DI, OUROCAP, CEF DE INVESTIMENTO 6800"}, {"tipo": "Casa", "valor": 267372.0, "descricao": "RESIDENCIAL, BAIRRO ALTO DO CEU - MUNICÍPIO DE SÃO TOMÉ/RN"}, {"tipo": "Terreno", "valor": 6250.0, "descricao": "50% DO TERRENO - COMPLETO COMERCIAL GARCIA FREIRE - MUNICÍPIO BOM JESUS/RN"}, {"tipo": "Dinheiro em espécie - moeda nacional", "valor": 52000.0, "descricao": "DINHEIRO EM ESPÉCIE"}, {"tipo": "Terreno", "valor": 6250.0, "descricao": "50% DO LOTE 563 - LOTEAMENTO BOM JESUS - BOM JESUS/RN"}, {"tipo": "Depósito bancário em conta corrente no País", "valor": 100967.05, "descricao": "DEPÓSITO EM CONTA CORRENTE CEF"}]'::jsonb, 'TSE' FROM public.candidatos WHERE slug = 'baba'
UNION ALL
  SELECT id, 2026, 554918.96, '[{"tipo": "Casa", "valor": 225000.0, "descricao": "CASA PRÓPRIA"}, {"tipo": "Veículo automotor terrestre: caminhão, automóvel, moto, etc.", "valor": 117590.0, "descricao": "CARRO PRÓPRIO"}, {"tipo": "Aplicação de renda fixa (CDB, RDB e outros)", "valor": 30222.86, "descricao": "COE E LCA"}, {"tipo": "Outras aplicações e Investimentos", "valor": 1047.06, "descricao": "AGIBANK"}, {"tipo": "Aplicação de renda fixa (CDB, RDB e outros)", "valor": 10521.23, "descricao": "ECO SECURITIZADORA"}, {"tipo": "Depósito bancário em conta corrente no País", "valor": 6021.32, "descricao": "DEPÓSITO EM MOEDA ESTRANGEIRA (DÓLAR E EURO)"}, {"tipo": "Outros fundos", "valor": 986.54, "descricao": "FUNDO DE INVESTIMENTO"}, {"tipo": "OUTROS BENS E DIREITOS", "valor": 71074.93, "descricao": "PREVIDÊNCIA PRIVADA"}, {"tipo": "Aplicação de renda fixa (CDB, RDB e outros)", "valor": 1591.12, "descricao": "NUBANK"}, {"tipo": "Outras aplicações e Investimentos", "valor": 159.57, "descricao": "INVESTIMENTO"}, {"tipo": "Aplicação de renda fixa (CDB, RDB e outros)", "valor": 59985.77, "descricao": "TITULO BANCO"}, {"tipo": "Aplicação de renda fixa (CDB, RDB e outros)", "valor": 30718.56, "descricao": "PICPAY"}]'::jsonb, 'TSE' FROM public.candidatos WHERE slug = 'catherine-teles'
UNION ALL
  SELECT id, 2026, 450000.00, '[{"tipo": "Apartamento", "valor": 100000.0, "descricao": "APARTAMENTO LOCALIZADO NO CONJ MANOEL JULIAO"}, {"tipo": "Casa", "valor": 350000.0, "descricao": "CASA RESIDENCIAL FLORESTA SUL"}]'::jsonb, 'TSE' FROM public.candidatos WHERE slug = 'daniela-paiva'
UNION ALL
  SELECT id, 2026, 713037.71, '[{"tipo": "Quotas ou quinhões de capital", "valor": 70000.0, "descricao": "CAPITAL INTEGRALIZADO NA FIRMA IMOBILIÁRIA VALE DO SOL LTDA."}, {"tipo": "Depósito bancário em conta corrente no País", "valor": 1877.61, "descricao": "DEPÓSITO EM CONTA CORRENTE, BANCO DO BRASIL S/A"}, {"tipo": "Aplicação de renda fixa (CDB, RDB e outros)", "valor": 103.5, "descricao": "APLICAÇÃO/DEPÓSITO NO BANCO INTER S.A"}, {"tipo": "Aplicação de renda fixa (CDB, RDB e outros)", "valor": 1056.6, "descricao": "APLICAÇÃO/DEPÓSITO NO BANCO DO BRASIL S/A"}, {"tipo": "Apartamento", "valor": 180000.0, "descricao": "APARTAMENTO EM TERESINA-PI"}, {"tipo": "Terreno", "valor": 120000.0, "descricao": "TERRENO GLEBA DE TERRA DATA MURICI"}, {"tipo": "Terreno", "valor": 180000.0, "descricao": "TERRENO TERRA DATA INHUMAS - CANDEEIRO, EM LUZILÂNDIA-PI"}, {"tipo": "Casa", "valor": 160000.0, "descricao": "CASA EM LUZILÂNDIA-PI"}]'::jsonb, 'TSE' FROM public.candidatos WHERE slug = 'ismar-marques';;
