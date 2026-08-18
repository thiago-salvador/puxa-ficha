-- P-PATRIMONIO-NACIONAL: carga positiva de bens 2026 das fichas públicas.
-- Fonte oficial: https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip
-- ZIP sha256: db5b5a3e430670496aedb27a6dc9cd679117ff519f55222e8c70792faeca59c8
-- Snapshot congelado: 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT.
-- Ausências neste snapshot ficam somente no relatório e não geram estado oficial.
BEGIN;

DO $$
DECLARE
  n_coorte integer;
BEGIN
  SELECT COUNT(*) INTO n_coorte
  FROM public.candidatos c
  WHERE c.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
    AND c.publicavel = true
    AND c.status <> 'removido';

  IF n_coorte NOT IN (0, 108)
     AND to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'P-PATRIMONIO-NACIONAL: coorte parcial em banco com ledger, esperados 108 candidatos, encontrados %', n_coorte;
  END IF;
END $$;

-- @write tabela=patrimonio slug=acm-neto ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 84888809.63, '[{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"SALDO DE APLICAÇÃO EM RENDA FIXA CDB NO BANCO BRADESCO","valor":726327.19},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA NA EMPRESA TELEVISÃO CONQUISTA LTDA","valor":25453},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"FORD RANGER 2025","valor":350000},{"tipo":"Apartamento","descricao":"APARTAMENTO NO EDIFICIO MANSÃO LEONOR CALMON, 2172, SALVADOR/BA","valor":7879197.99},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEICULO OFF-ROAD MODELO UFORCE 2023","valor":115000},{"tipo":"Quotas ou quinhões de capital","descricao":"818500 QUOTAS NA ANRE PARTICIPAÇÕES EMPREENDIMENTOS LTDA","valor":818500},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"SALDO EM APLICAÇÃO EM RENDA FIXA BANCO BRADESCO","valor":1101664.34},{"tipo":"Outras participações societárias","descricao":"AÇÕES ORDINÁRIAS NOMINATIVAS DA TELEVISÃO BAHIA SA","valor":9384042},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"XP APLICAÇÕES RENDA FIXA","valor":822038.96},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"FUNDO DE INVESTIMENTO BR PARTNERS PET FIP","valor":1326315.79},{"tipo":"Outros fundos","descricao":"TREND PÓS-FIXADO FUNDO DE INVESTIMENTO EM COTAS RENDA FIXA SIMPLES RESPONSABILIDADE LIMITADA","valor":429435.01},{"tipo":"Outras aplicações e Investimentos","descricao":"BRADESCO DEBENTURES INCENTIVADAS CDI FIC DE FUNDOS","valor":3588000},{"tipo":"Caderneta de poupança","descricao":"CADERNETA BANCO BRADESCO EM NOME DA DEPENDENTE","valor":30565.26},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BANCO BTG PACTUAL","valor":2683.75},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÕES FUNDOS DE INVESTIMENTO - PLANNER CORRETORA DE VALORES SA","valor":9080757.39},{"tipo":"Outras participações societárias","descricao":"QUOTAS RÁDIO FM IEMANJÁ LTDA","valor":1280000},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"FUNDO DE INVESTIMENTO BRIDGE AGRO COMMERCE","valor":548751.4},{"tipo":"Outras participações societárias","descricao":"QUOTAS DA TELEVISÃO SANTA CRUZ LTDA","valor":122500},{"tipo":"Outras participações societárias","descricao":"QUOTAS DA EMPRESA RB VENTURES LTDA","valor":1500},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA NA EMPRESA CABAÇEIRAS PARTICIPAÇÕES LTDA","valor":3008400},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO EM ESPECIE","valor":50000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"SALDO DE ADIATAMENTO PARA FUTURO AUMENTO DE CAPITAL NA EMPRESA ANRE PARTICIPAÇÕES EMPREENDIMENTOS LTDA","valor":7999933.9},{"tipo":"Outros fundos","descricao":"TREND DI FUNDO DE INVESTIMENTO EM COTAS DE FUNDOS DE INVESTIMENTO RENDA FIXA SIMPLES","valor":108900.15},{"tipo":"Caderneta de poupança","descricao":"CADERNETA BANCO BRADESCO EM NOME DA DEPENDENTE","valor":30563.77},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO RENDA FIXA NO BANCO BRADESCO","valor":1500174.18},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"LCI BRADESCO","valor":700000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BANCO XP","valor":6892.57},{"tipo":"Outros fundos","descricao":"TREND INB FUNDO DE INVESTIMENTO EM COTAS DE FUNDOS DE INVESTIMENTO RENDA FIXA SIMPLES","valor":12745.04},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"FUNDO DE INVESTIMENTOS BRIDGE INFLUENCE","valor":3018.16},{"tipo":"Apartamento","descricao":"APARTAMENTO NO CONDOMINIO BAYVIEW - BARRA GRANDE - MARAU/BA","valor":1045448.69},{"tipo":"Depósito bancário em conta corrente no exterior","descricao":"SALDO BRADESCO GLOBAL PRIVATE BANK","valor":6773.85},{"tipo":"OUTROS BENS E DIREITOS","descricao":"SALDO DE ADIATAMENTO PARA FUTURO AUMENTO DE CAPITAL NA EMPRESA RB VENTURES LTDA","valor":195250.01},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÕES CRA BANCO BTG PACTUAL","valor":2564543.1},{"tipo":"Crédito decorrente de empréstimo","descricao":"SALDO DE EMPRESTIMO A TERCEIRO","valor":30000},{"tipo":"Crédito decorrente de empréstimo","descricao":"EMPRESTIMO PARA EMPRESA SUN LOC UNIDADE FOTOVOLTAICA","valor":534027.19},{"tipo":"Outras aplicações e Investimentos","descricao":"FUNDO DE INVESTIMENTO IMOBILIARIO PRAIA DO CASTELO","valor":11979000},{"tipo":"Outras aplicações e Investimentos","descricao":"BRADESCO DEB INC CDI II FIC DE INVESTIMENTOS","valor":166000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÕES LCI BANCO BRADESCO","valor":5000000},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÕES BC BRADESCO","valor":1000000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÕES LIG BANCO BRADESCO","valor":4150000},{"tipo":"Outras aplicações e Investimentos","descricao":"B6 MACRO DE INVESTIMENTO MULTIMERCADO CREDITO PRIVADO","valor":4020406.94},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO BRADESCO LCA","valor":3130000},{"tipo":"Outras aplicações e Investimentos","descricao":"FUNDO DE INVESTIMENTO IMOBILIARIO PRAIA DO CASTELO","valor":7000},{"tipo":"Outras aplicações e Investimentos","descricao":"FUNDO DE INVESTIMENTO IMOBILIARIO PRAIA DO CASTELO","valor":7000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 50002533190 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'acm-neto'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'BA'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=adailton-furia ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1665086.74, '[{"tipo":"Terreno","descricao":"01 (UM) LOTE URBANO (PRÉDIO COMERCIAL)","valor":400000},{"tipo":"Terreno","descricao":"LOTE RURAL","valor":90000},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO NA EMPRESA AUTO POSTO DA SETE LTDA.","valor":500000},{"tipo":"Terreno","descricao":"1 (UM) TERRENO","valor":175000},{"tipo":"Terreno","descricao":"03 LOTES URBANO COM 2 CASAS RESIDENCIAL","valor":350000},{"tipo":"Outros créditos e poupança vinculados","descricao":"105 - BRASIL BEM OU DIREITO PERTENCENTE AO TÍTULAR CNPJ: [documento mascarado]","valor":86.74},{"tipo":"Terreno","descricao":"02 LOTES URBANO","valor":150000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 220002536806 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'adailton-furia'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RO'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=alan-rick ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 5244567.72, '[{"tipo":"Outras aplicações e Investimentos","descricao":"CERTIFICADO DE OPERACAO ESTRUTURAL","valor":50000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"BTG PACTUAL - PROD.: CDB-SR","valor":69891.86},{"tipo":"Outras aplicações e Investimentos","descricao":"CERTIFICADO DE RECEBIVEIS DO AGRONEGOCIO BTG PACTUAL","valor":105105.93},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"DEBENTURE DE INFRAESTRUTURA BTG PACTUAL","valor":48825.71},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BTG PACTUAL - VIRTUS FUNDO INCENTIVADO DE INVEST EM INFRAESTRUTURA REN","valor":800000},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BTG PACTUAL - TITULO: TERRAMAGNA II FIAGRO -","valor":50000},{"tipo":"Outras aplicações e Investimentos","descricao":"COTA DE FERIAS JUNTO AO GOLDEN LAGHETTO EMPREENDIMENTOS IMOBILIARIOS SPE LTDA","valor":48524.85},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO","valor":150000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA LIVRE MOVIMENTACAO - AG./CONTA: 0534-","valor":12982.34},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"PROD.: PIPO CAPITAL I FUNDO DE INVESTIMENTO EM PARTICIPACOES MULTIEST - FUNDO DE INVESTIMENTO BTG PACTUAL.","valor":18415.46},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BTG PACTUAL - ESPECIFICACAO: FI IE JGP ECOSSISTEMA FIC FDS COTAS PRINCIPAL","valor":65000.04},{"tipo":"Outras aplicações e Investimentos","descricao":"COTA DE FERIAS JUNTO AO GOLDEN LAGHETTO EMPREENDIMENTOS IMOBILIARIOS SPE LTDA - CONTRATO NR 84073 // CT.01-F277/13 UNIDADE 277/13 VR","valor":48524.85},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BTG PACTUAL - PROD.: CDB-SR-","valor":3321.13},{"tipo":"Outras aplicações e Investimentos","descricao":"CERTIFICADO DE RECEBIVEIS DO AGRONEGOCIO BTG PACTUAL","valor":200000},{"tipo":"Outras aplicações e Investimentos","descricao":"CERTIFICADO DE DIREITOS CREDITORIOS DO AGRONEGOCIO","valor":16000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEICULO JEEP GRAND CHEROKEE","valor":236794.96},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BTG PACTUAL - FIP IE AZ QUEST PRE INFRA IX -","valor":26000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"RF REF DI PLUS AGIL -","valor":573106.16},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BB RENDA FIXA LONGO PRAZO HIGH FUNDO DE INVESTIMENTO EM COTAS DE FIF","valor":174762.67},{"tipo":"Outras aplicações e Investimentos","descricao":"COTA DE FERIAS JUNTO AO GOLDEN LAGHETTO EMPREENDIMENTOS IMOBILIARIOS SPE LTDA","valor":48524.85},{"tipo":"Casa","descricao":"IMOVEL RESIDENCIAL","valor":1319000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BANCO DO BRASIL - SALDO CDB/DI CFE INFORME DE RENDIMENTOS","valor":19000},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"PROD.: PIPO CAPITAL I FUNDO DE INVESTIMENTO RENDA FIXA - FUNDO DE INVESTIMENTO","valor":11172.12},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"CEF - FI - FUNDO DE INVESTIMENTO","valor":999614.79},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BTG PACTUAL - FII ENERGIA REAL - 6454225UN1","valor":150000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 10002532492 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'alan-rick'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'AC'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=alexandre-kalil ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 5941176.84, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MOTOCICLETA HARLEY DAVIDSON/1KLJE-FLHTK-ELETRICA GLIDE ULTRA ANO/MODELO: 2014/2014","valor":81900},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CAMINHONETE CABINE DUPLA MITSUBISHI CAMINHONTE CABINE DUPLA MITSUBISHI L200 SPORT 4X4 ANO 2005 -","valor":40000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DO CAPITAL SOCIAL DA FERGIKAL LTDA [documento mascarado].","valor":296000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BANCO BRADESCO - SALDO CONTA CORRENTE","valor":15231.38},{"tipo":"Outros bens imóveis","descricao":"25 POR CENTO DA AREA DE 1.027,77 M2 RUA PEDRINHAS EM VENDA NOVA BH/MG HAVIDO POR HERANCA DE MEU PAI ELIAS KALIL CPF [documento mascarado] CONF. FORMAL DE PARTILHA EM 25/02/94.","valor":19431.24},{"tipo":"Outros bens imóveis","descricao":"37,50 MEIO POR CENTO LOTE 24, QUADRA 33, BAIRRO CASTELO, BELO HORIZONTE/MG, CONFORME R-3-MATRICULA 9445 PROTCOLO 104117-LIVRO 2 EM 17/08/1987, 43 OFICIO DE REGISTRO DE IMOVEIS EM BELO HORIZONTE-MG, CO","valor":11450.55},{"tipo":"Prédio residencial","descricao":"GLAUCIA - 50% PREDIO RESIDENCIAL COM TODAS AS SUAS BENFEITORIAS E INSTALACOES, FORMADO PELOS LOTES 01 AO 06 E 26 AO 34 DA QUADRA 34 DO BAIRRO TREVO - PERTENCENTE A GLAUCIA NAVES KALIL - ADQUIRIDO POR","valor":112477.68},{"tipo":"Prédio residencial","descricao":"GLAUCIA - 50% DO PREDIO RESIDENCIAL COM TODAS AS SUAS BENFEITORIAS E INSTALACOES, TERRENO FORMADO PELOS LOTES 07 AO 10 DO BAIRRO TREVO - PERTENCENTE A GLAUCIA NVAVES KALIL - AD","valor":31281},{"tipo":"Outros bens imóveis","descricao":"12,5 POR CENTO DO LOTE 30 QUADRA 79 - RUA YAZIGI - JARDIM LEONOR - BAIRRO MORUMBI EM SAO PAULO/SP- R296368 LIVRO 2 - 18O OFICIO REGISTRO DE IMOVEIS DE SAO PAULO/SP EM 03/08/1989 - PROTOCOLO 151130.","valor":7633.7},{"tipo":"Outros bens imóveis","descricao":"25 POR CENTO DO LOTE 27 QUADRA 18 DO LOTEAMENTO DENOMINADO VILA DO PERO SITUADO NO LUGAR DENOMINADO GURIRI, NA CIDADE DE CABO FRIO/RJ, COMAREA DE 420 M - R-3 - MATRICULA 27.140 EM 15/02/1989 - 1O E 4O","valor":1943.12},{"tipo":"Outros bens imóveis","descricao":"12,5 POR CENTO DO LOTE 13 QUADRA 18 DO LOTEAMENTO DENOMINADO VILA DO PERO SITUADO NO LUGAR DENOMINADO GURIRI, NA CIDADE DE CABO FRIO/RJ, COMAREA DE 420 M - R-3 - MATRICULA 27.133 EM 15/02/1989 - 1O E","valor":971.56},{"tipo":"Outros bens imóveis","descricao":"25 POR CENTO DO LOTE 26 QUADRA 18 DO LOTEAMENTO DENOMINADO VILA DO PERO SITUADO NO LUGAR DENOMINADO GURIRI, NA CIDADE DE CABO FRIO/RJ, COMAREA DE 420 M - R-3 - MATRICULA 27.139 EM 15/02/1989 - 1O E 4O","valor":1943.12},{"tipo":"Outros bens imóveis","descricao":"IMOVEL SITUADO - BAIRRO TREVO EM BELO HORIZONTE, MATRICULA NO 67.255-L.2-CARTORIO DO 6O OFICIO E REGISTRO NO 3.574 DO L.3-C DO CARTORIO DO 6O OFICIO, AREA DE 5.590 M2. REGISTRO D","valor":400817.34},{"tipo":"Outros bens imóveis","descricao":"25 POR CENTO DO LOTE 13 QUADRA 27 RUA SALINAS BH/MG HAVIDO POR HERANCA DE MEU PAI ELIAS KALIL CPF [documento mascarado] CONF. FORMAL DE PARTILHA EM 25/02/94.","valor":78765.91},{"tipo":"Outros bens imóveis","descricao":"GLAUCIA - 50% LOTES 11 A 22 DO QUARTEIRAO 17 MA REGIAO DENOMINADA CONFISCO - PAMPULHA - PERTENCENTE A GLAUCIA NVAVES KALIL - ADQUIRIDO POR HERANCA DE SUA MAE JOYCE BARROS NAVES","valor":56650},{"tipo":"Outros bens imóveis","descricao":"18,75 POR CENTO DA LOJA 01 DO EDIFICIO MOYSES KALIL, NA AVENIDA GETULIO VARGAS, 620, BAIRRO FUNCIONARIOS, BELO HORIZONTE/MG, RECEBIDO EM DOACAO DE SEUA MAE LEILA ANTONIO HISSA KALIL CPF: 662.562.756-9","valor":51159.74},{"tipo":"Outros bens imóveis","descricao":"18,75 POR CENTO LOJA 02 DO EDIFICIO MOYSES KALIL, NA AVENIDA GETULIO VARGAS, 620, BAIRRO FUNCIONARIOS, BELO HORIZONTE/MG, RECEBIDO EM DOACAO DE SEUA MAE LEILA ANTONIO HISSA KALIL CPF: [documento mascarado],","valor":51159.74},{"tipo":"Outros bens imóveis","descricao":"18,75 POR CENTO LOTE 12, QUADRA 28 DA AV.BERNARDO MONTEIRO NO 468, 13A SECAO URBANA, REGISTROS NOS R-1 MATRICULA 13341 E 41890 - LIVRO 2 EM 12/06/1979 E 09/03/1988 - 4O OFICIO REGISTRO DE IMOVEIS DE B","valor":58814.19},{"tipo":"Outros bens imóveis","descricao":"SIM 18,75 POR CENTO DA GARAGEM LOJA 03 DO EDIFICIO MOYSES KALIL, NA AVENIDA GETULIO VARGAS, 620, BAIRRO FUNCIONARIOS, BELO HORIZONTE/MG, RECEBIDO EM DOACAO DE SEUA MAE LEILA ANTONIO HISSA KALIL","valor":1929.2},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DO CAPITAL SOCIAL DA ALKA LOCACAO DE MAQUINAS E EQUIPAMENTOS EIRELI-EPP CNPJ NO [documento mascarado]","valor":80000},{"tipo":"Outros bens imóveis","descricao":"31,25 POR CENTO DO LOTE 11, QUADRA 28, 13A SECAO URBANA AVENIDA BERNADO MONTEIRO,458 REGISTRO 431, FLS 18, CARTORIO 9O OFICIO DE NOTAS, ADQUIRIDO EM 08.06.10984 EM BELO HORIZONTE/MG, HAVIDO POR HERANC","valor":98023.65},{"tipo":"Outros bens imóveis","descricao":"50,0 POR CENTO DO LOTE 310, QUADRA N, SITUADO NO LOTEAMENTO OLHOS DAGUA , CONDOMINIO ESTANCIA DAS AMENDOEIRAS EM LAGOA SANTA MG,AREA DE 5.000 M2,CONFORME ESCRITURA DE COMPRA E VENDA , CARTORIO 1O.OFIC","valor":15000},{"tipo":"Outros bens imóveis","descricao":"18,75 POR CENTO DA LOJA 03 DO EDIFICIO MOYSES KALIL, NA AVENIDA GETULIO VARGAS, 620, BAIRRO FUNCIONARIOS, BELO HORIZONTE/MG, RECEBIDO EM DOACAO DE SEUA MAE LEILA ANTONIO HISSA KALIL CPF: 662.562.756-","valor":51159.74},{"tipo":"Outros bens imóveis","descricao":"18,75 POR CENTO DA LOJA 05 DO EDIFICIO MOYSES KALIL, NA AVENIDA GETULIO VARGAS, 620, BAIRRO FUNCIONARIOS, BELO HORIZONTE/MG, RECEBIDO EM DOACAO DE SEUA MAE LEILA ANTONIO HISSA KALIL CPF: 662.562.756-9","valor":1929.2},{"tipo":"Apartamento","descricao":"GLAUCIA - APARTAMENTO 201 DO EDIFICIO PARQUE BELVEDERE - PERTENCENTES A GLAUCIA NAVES KALIL - ADQURIDO POR HERANCA DE SUA MAE JOYCE BARROS NAVES - CF FORMAL DE PARTILHA","valor":1859235},{"tipo":"Terreno","descricao":"31,25 POR CENTO (12,5 + 18,5 ) DO LOTE 10 QUADRA 28, 13A SECAO URBANA, CASA, AV.BERNARDO MONTEIRO, 448, R-2 - MATRICULA 33270 - PROTOCOLO 75277 - LIVRO 2 EM 25/10/85, 4O OFICIO DE REGISTRO DE","valor":98023.65},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MOTOCICLETA HARLEY DAVIDSON/1BW5JE-FLSTC-HERITAGE SOFTAIL CLASSIC ANO/MODELO 2014/2014","valor":54000},{"tipo":"Crédito decorrente de empréstimo","descricao":"EMPRESTIMO A ERKAL ENGENHARIA LTDA","valor":46927.79},{"tipo":"Apartamento","descricao":"18,75 POR CENTO DO APARTAMENTO NO 201 DA RUA PIRAPETINGA,240, EDIFICIO LALU, BAIRRO SERRA, BELO HORIZONTE/MG, INCLUSIVE RESPECTIVA FRACAO IDEAL DE 1/6 DO LOTE NO 06, QUARTEIRAO 22, 1A SECAO, R-2 - MAT","valor":8848.15},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MOTOCICLETA HARLEY DAVIDSON / FLHTC ANO/MODELO: 2008/2009","valor":53000},{"tipo":"Depósito bancário em conta corrente no exterior","descricao":"DEPOSITO NO EXTERIOR / RECURSOS MANTIDOS NA C/C, DELTA NATIONAL BANK AND TRUST COMPANY- USA. - SENDO SALDO EM DOLARES EM 31/12/18 DE U$270.739,53 COM DOLAR EM 31/12/18 VALENDO R$3,89 - SALDO DE U$ 263","valor":1420459.22},{"tipo":"Outros bens imóveis","descricao":"18,75 POR CENTO DA LOJA 04 DO EDIFICIO MOYSES KALIL, NA AVENIDA GETULIO VARGAS, 620, BAIRRO FUNCIONARIOS, BELO HORIZONTE/MG, RECEBIDO EM DOACAO DE SEUA MAE LEILA ANTONIO HISSA KALIL CPF: 662.562.756-9","valor":51159.74},{"tipo":"Outros bens imóveis","descricao":"18,75 POR CENTO DA GARAGEM LOJA 02 DO EDIFICIO MOYSES KALIL, NA AVENIDA GETULIO VARGAS, 620, BAIRRO FUNCIONARIOS, BELO HORIZONTE/MG, RECEBIDO EM DOACAO DE SEUA MAE LEILA ANTONIO HISSA KALIL","valor":1929.2},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BANCO BRADESCO - SALDO CONTA CORRENTE","valor":12.79},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BANCO BRADESCO - SALDO EM DOLAR US$ 46,14","valor":255.84},{"tipo":"Outros bens imóveis","descricao":"18,75 POR CENTO DA LOJA 05 DO EDIFICIO MOYSES KALIL, NA AVENIDA GETULIO VARGAS, 620, BAIRRO FUNCIONARIOS, BELO HORIZONTE/MG, RECEBIDO EM DOACAO DE SEUA MAE LEILA ANTONIO HISSA KALIL CPF: 662.562.756-9","valor":51159.74},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"LAND ROVER, PRETA MODELO/ANO:2012 ADQUIRIDO DE TERRA NOVA VEICULOS E PECAS LTDA, FINANCIAMENTO BMG LEASING SA.","valor":351996.17},{"tipo":"Crédito decorrente de empréstimo","descricao":"EMPRESTIMO A ERKAL ENGENHARIA LDA","valor":319511.39},{"tipo":"Outros bens imóveis","descricao":"18,75 POR CENTO DA GARAGEM LOJA 05 DO EDIFICIO MOYSES KALIL, NA AVENIDA GETULIO VARGAS, 620, BAIRRO FUNCIONARIOS, BELO HORIZONTE/MG, RECEBIDO EM DOACAO DE SEUA MAE LEILA ANTONIO HISSA KALIL","valor":1929.2},{"tipo":"Outros bens imóveis","descricao":"18,75 POR CENTO DA GARAGEM LOJA 04 DO EDIFICIO MOYSES KALIL, NA AVENIDA GETULIO VARGAS, 620, BAIRRO FUNCIONARIOS, BELO HORIZONTE/MG, RECEBIDO EM DOACAO DE SEUA MAE LEILA ANTONIO HISSA KALIL","valor":1929.2},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DO CAPITAL SOCIAL ERIKAL ENGENHARIA LTDA CNPJ [documento mascarado].","valor":55055},{"tipo":"Caderneta de poupança","descricao":"CADERNETA DE POUPANCA BRADESCO(237) AG.513 CONTA 400.306-3","valor":72.7}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 130002539775 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'alexandre-kalil'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'MG'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=alysson-bezerra ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 748869.84, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO GOL 1.0, ANO 2012","valor":15000},{"tipo":"Casa","descricao":"IMÓVEL EM TIBAU/RN, ADQUIRIDO EM 2025 DE FORMA PARCELADA, VALOR CORRESPONDENTE AO MONTANTE JÁ EFETIVAMENTE PAGO","valor":30000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS EM PESSOA JURÍDICA","valor":15000},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO EM ESPÉCIE","valor":10000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA CORRENTE (BANCO DO BRASIL)","valor":261.5},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA CORRENTE (SICOOB)","valor":9.4},{"tipo":"Outras aplicações e Investimentos","descricao":"TÍTULO PÚBLICO (NTN-B, BANCO DO BRASIL)","valor":353.5},{"tipo":"Terreno","descricao":"FRAÇÃO (50%) DE LOTE EM LOTEAMENTO EM MOSSORÓ/RN, ADQUIRIDO MEDIANTE FINANCIAMENTO AINDA NÃO QUITADO","valor":75000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS JUNTO A COOPERATIVA DE CRÉDITO (SICOOB)","valor":2270.44},{"tipo":"Apartamento","descricao":"APARTAMENTO EM NATAL/RN, ADQUIRIDO EM 2020 MEDIANTE FINANCIAMENTO BANCÁRIO AINDA AINDA NÃO QUITADO E OBJETO DE ALIENAÇÃO FIDUCIÁRIA EM GARANTIA","valor":290975},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS EM PESSOA JURÍDICA","valor":150000},{"tipo":"Outros bens móveis","descricao":"TRATOR AGRÍCOLA, ADQUIRIDO MEDIANTE EMPRÉSTIMO BANCÁRIO AINDA NÃO QUITADO","valor":160000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 200002535255 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'alysson-bezerra'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RN'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=andre-marinho ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 407503.55, '[{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":300000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS OU QUINHÕES DE CAPITAL","valor":100000},{"tipo":"Caderneta de poupança","descricao":"CADERNETA DE POUPANÇA","valor":7487.18},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO DE RENDA FIXA (CDB, RDB E OUTROS)","valor":14.37},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITO BANCÁRIO EM CONTA CORRENTE NO PAÍS","valor":1},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITO BANCÁRIO EM CONTA CORRENTE NO PAÍS","valor":1}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 190002537524 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'andre-marinho'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RJ'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=araceli-lemos ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 534231.19, '[{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO EM RENDA FIXA NO BANPARA","valor":23898.72},{"tipo":"Outros bens imóveis","descricao":"50% DE UM APARTAMENTO","valor":55000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA CORRENTE BANCO DO BRASIL","valor":34408.48},{"tipo":"Terreno","descricao":"LOTE URBANO","valor":380000},{"tipo":"Outros créditos e poupança vinculados","descricao":"COOPERATIVA DE CRÉDITO SICOOB","valor":9923.99},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO EM RENDA FIXA NO SICOOB","valor":31000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 140002542386 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'araceli-lemos'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PA'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=aroldo-felix ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 857485.32, '[{"tipo":"Apartamento","descricao":"APARTAMENTO EM SALVADOR ADQUIRIDO ATRAVES DE FINANCIAMENTO IMOBILIARIO JUNTO AO BANCO BRADESCO","valor":589806.32},{"tipo":"Apartamento","descricao":"FORD RANGER XLS 2.2 4X4 CD DIESEL AUT. 2019/2019 BRANCA.","valor":122679},{"tipo":"Apartamento","descricao":"APARTAMENTO EM CAMPINA GRANDE-PB AQUISICAO: PAGO PELA AVÓ MATERNA, MARIA DA LUZ FLORENTINO E OLIVEIRA","valor":145000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 50002544692 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'aroldo-felix'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'BA'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=arthur-henrique ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 578525.64, '[{"tipo":"Casa","descricao":"MÓVEL URBANO, ADQUIRIDO ATRAVÉS DE HERANÇA PATERNA DE ARTHUR MACHADO FILHO","valor":150000},{"tipo":"Outras aplicações e Investimentos","descricao":"DÓLAR EM CRIPTOMOEDA ESTÁVEL (USDG 6030,00)","valor":30200},{"tipo":"Casa","descricao":"IMÓVEL URBANO, ADQUIRIDO ATRAVÉS DE HERANÇA PATERNA DE ARTHUR MACHADO FILHO","valor":150000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"INVESTIMENTO TESOURO DIRETO","valor":202379.55},{"tipo":"Outras aplicações e Investimentos","descricao":"INVESTIMENTO RENDA VARIÁVEL","valor":14374.97},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO EM ESPÉCIE","valor":4000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"RENDIMENTO RENDA FIXA","valor":19641.12},{"tipo":"Dinheiro em espécie - moeda estrangeira","descricao":"DINHEIRO EM ESPÉCIE (1360 EUROS)","valor":7930}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 230002549223 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'arthur-henrique'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RR'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=ataides-oliveira ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 54458902.00, '[{"tipo":"Quotas ou quinhões de capital","descricao":"100% DO CAPITAL SOCIAL DA EMPRESA CONDOMINIO PARK RESEDA SPE LTDA","valor":6375000},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO EM ESPÉCIE - MOEDA NACIONAL","valor":780000},{"tipo":"Embarcação","descricao":"LANCHA DE FIBRA DE VIDRO ANO 2003 COM MOTORES","valor":85000},{"tipo":"Quotas ou quinhões de capital","descricao":"100% DAS QUOTAS DA EMPRESA ARAGUAIA COMERCIAL DE MOTOS DE URUACU LTDA CNPJ 02.391.971/0001- 35","valor":20000000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"TRAILBLAZER 2.8 L 4X4 LTZ DIESEL 2019-2018 BRANCO PLACA QKL 4108","valor":218902},{"tipo":"Quotas ou quinhões de capital","descricao":"90% DO CAPITAL SOCIAL DA EMPRESA SHOPPING CENTER ARAGUAIA LTDA","valor":27000000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 270002548412 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'ataides-oliveira'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'TO'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=cabo-daciolo ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 190750.00, '[{"tipo":"OUTROS BENS E DIREITOS","descricao":"UM CAVALO MANGALARGA MARCHADOR","valor":15000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE CAPITAL (PARTICIPAÇÃO) EM EMPRESA","valor":1000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"50% DE UM CAVALO MANGALARGA MARCHADOR","valor":18000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"UM CAVALO MANGALARGA MARCHADOR","valor":15000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"UM CAVALO MANGALARGA MARCHADOR","valor":15000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"UM CAVALO MANGALARGA MARCHADOR","valor":25500},{"tipo":"OUTROS BENS E DIREITOS","descricao":"50% DE UM CAVALO MANGALARGA MARCHADOR","valor":18000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"UM CAVALO MANGALARGA MARCHADOR","valor":8250},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE CAPITAL (PARTICIPAÇÃO) EM EMPRESA","valor":1000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"UM CAVALO MANGALARGA MARCHADOR","valor":10000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"UM CAVALO MANGALARGA MARCHADOR","valor":10000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"UM CAVALO MANGALARGA MARCHADOR","valor":15000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"UM CAVALO MANGALARGA MARCHADOR","valor":10000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"UM CAVALO MANGALARGA MARCHADOR","valor":14000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"UM CAVALO MANGALARGA MARCHADOR","valor":15000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 40002551740 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'cabo-daciolo'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'AM'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=carlos-machado ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 27000.00, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO HONDA ACCORD","valor":12000},{"tipo":"Quotas ou quinhões de capital","descricao":"100% DE PARTICIPAÇÃO EM UMA EMPRESA MEI","valor":15000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 250002550913 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'carlos-machado'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'SP'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=celina-leao ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 440131.39, '[{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA","valor":1676.04},{"tipo":"Casa","descricao":"LOTE RESIDENCIAL NO CONDOMÍNIO PRIVE - LAGO NORTE","valor":280000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"DISCOVERY 4","valor":107210},{"tipo":"OUTROS BENS E DIREITOS","descricao":"AQUISIÇÃO DE EMBRIÃO BOVINO EM 30 PARCELAS DE R$ 7.500,00, TOTALIZANDO R$ 225.000,00. EM 2025, PAGO 2 PARCELAS DE R$ 7.500,00","valor":15000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"VGBL","valor":36245.35}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 70002553055 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'celina-leao'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'DF'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=cicero-lucena ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 2517809.94, '[{"tipo":"Sala ou conjunto","descricao":"TRES SALAS COMERCIAIS, NO BAIRRO DE TAMBIÁ - JOÃO PESSOA-PB","valor":38907.23},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"PAJERO SPORT ANO 2000","valor":85000},{"tipo":"Consórcio não contemplado","descricao":"CONSORCIO BB","valor":112244.95},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BANCO DO BRASIL - CDB","valor":154024.94},{"tipo":"Quotas ou quinhões de capital","descricao":"EMPRESA DE CONSTRUÇÃO CIVIL","valor":193800},{"tipo":"Casa","descricao":"LOCALIZADA NA PRAIA DO POCO - CABEDELO-PB","valor":169000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"TOYOTA TIPO HILUX CD 4X4 ANO 2012","valor":100000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"RF LP HIGH","valor":1.54},{"tipo":"Outras aplicações e Investimentos","descricao":"LP SELIC - BANCO DO BRASIL","valor":0.88},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA ESTILO - BANCO DO BRASIL","valor":3.9},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO EM ESPECIE","valor":140000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"ITAU PLUS RENDA FIXA CURTO PRAZO","valor":1397.02},{"tipo":"Apartamento","descricao":"LOCALIZADO EM PONTA DE CAMPINA - CABEDELO-PB","valor":726754.85},{"tipo":"Casa","descricao":"LOCALIZADA NO BAIRRO DO BESSA - JOAO PESSOA-PB","valor":265719.27},{"tipo":"Caderneta de poupança","descricao":"POUPANCA OURO BB","valor":50.37},{"tipo":"Sala ou conjunto","descricao":"DUAS SALAS COMERCIAIS NO BAIRRO DE MANAÍRA - JOAO PESSOA-PB","valor":10417.28},{"tipo":"Quotas ou quinhões de capital","descricao":"POSTO DE COMBUSTÍVEIS","valor":1},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BRB - APLICACAO DE RENDA FIXA","valor":148265.56},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA ESTILO","valor":164261.91},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE - CEF","valor":1994.25},{"tipo":"Terreno","descricao":"1/3 DO LOTE DE TERRENO LOCALIZADO EM TAMBAU - JOÃO PESSOA-PB","valor":166660.52},{"tipo":"Terreno","descricao":"LOCALIZADO EM AREIA-PB","valor":39304.47}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 150002544133 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'cicero-lucena'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PB'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=ciro-gomes-gov-ce ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1756648.94, '[{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"VGBL NO BRASIL PREV SEGUROS E PREVIDÊNCIAS EM NOME DO DEPENDENTE","valor":53676.49},{"tipo":"Outras participações societárias","descricao":"100% DE PARTICIAPAÇÃO NA EMPRESA NEWSLETTERS","valor":12000},{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":889375.65},{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":381202.9},{"tipo":"Outras participações societárias","descricao":"100% DE PARTICIAPAÇÃO NA EMPRESA CIRO GOMES SOCIEDADE INDIVIDUAL DE ADAVOCACIA","valor":50000},{"tipo":"Crédito decorrente de empréstimo","descricao":"CRÉDIDO DECORRENTE DE EMPRÉSTIMO A SOCIEDADE CIRO GOMES SOCIEDADE INDIVIDUAL DE ADVOCACIA","valor":0},{"tipo":"OUTROS BENS E DIREITOS","descricao":"1/5 DE 01(UM) IMÓVEL RESIDENCIAL","valor":160000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"VALORES NA POSSE DA SRA. MARIA LUIZA GURGEL SERPA PARA PAGAMENTO DE DESPESAS","valor":19771.22},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TOYOTA HILUX SW4","valor":105000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO HYUNDAI ELANTRA","valor":85000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE BB","valor":622.68}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 60002531351 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'ciro-gomes-gov-ce'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'CE'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=cleber-rabelo ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 52292.00, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"FIAT ARGO DRIVE 1.3 2018","valor":52292}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 140002538631 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'cleber-rabelo'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PA'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=clecio-luis ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 497990.00, '[{"tipo":"Terreno","descricao":"LOTE URBANO N. 09, QUADRA 04 NO LOTEAMENTO PRIME NORTE","valor":104000},{"tipo":"Terreno","descricao":"LOTE URBANO N. 08, QUADRA 04 NO LOTEAMENTO PRIME NORTE","valor":105000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEICULO DE PASSEIO HONDA HRV ADVANCE CINZA","valor":184990},{"tipo":"Terreno","descricao":"LOTE URBANO N. 10, QUADRA 04 NO LOTEAMENTO PRIME NORTE","valor":104000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 30002536311 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'clecio-luis'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'AP'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=cleitinho ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 956564.03, '[{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA BANCO ITAÚ","valor":699},{"tipo":"Casa","descricao":"CASA, BAIRRO JARDIM BETANIA, DIVINÓPOLIS - (MG) (EM FINANCIAMENTO)","valor":300000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA NUBANK","valor":434.33},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO FORD MAVERICK TREMOR","valor":239900},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS SOCIAIS NA EMPRESA TAMO JUNTO PRODUTORA LTDA.","valor":50000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO RAMPAGE LARAMIE GAS","valor":256000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA PICPAY BANK","valor":4003},{"tipo":"OUTROS BENS E DIREITOS","descricao":"ISS","valor":11287.59},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUTOMOVEL VW SAVEIRO","valor":23000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CAIXA ECONÔMICA FEDERAL","valor":4679.53},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTA INVESTIMENTO - PICPAY BANK","valor":66560.58}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 130002552296 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'cleitinho'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'MG'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=coronel-busnello ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 950000.00, '[{"tipo":"Casa","descricao":"CASA DE VILA","valor":750000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"FIAT TORO","valor":200000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 190002544120 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'coronel-busnello'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RJ'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=cyro-garcia ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 385400.00, '[{"tipo":"Apartamento","descricao":"IMOVEL LOCALIZADO NA AVENIDA MARECHAL RONDON, 500/301","valor":358000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CELTA ANO 2010 - MODELO 2011","valor":27400}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 190002540198 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'cyro-garcia'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RJ'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=daniel-vilela ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 5627385.99, '[{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS OU QUINHÃO DE CAPITAL","valor":96110.76},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS OU QUINHÃO DE CAPITAL","valor":546627.06},{"tipo":"Terreno","descricao":"50% (CINQUENTA POR CENTO) DE UM TERRENO","valor":1250000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS OU QUINHÃO DE CAPITAL","valor":25000},{"tipo":"Terra nua","descricao":"25% DE UMA GLEBA DE TERRAS","valor":2250},{"tipo":"Terra nua","descricao":"25,98% DE 50% DE UMA GLEBA DE TERRAS","valor":19508.25},{"tipo":"Terra nua","descricao":"25% DE 50% UMA GLEBA DE TERRAS","valor":60000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS OU QUINHÃO DE CAPITAL","valor":9800},{"tipo":"Terra nua","descricao":"29,40% DE UMA GLEBA DE TERRAS","valor":34627.32},{"tipo":"OUTROS BENS E DIREITOS","descricao":"301 BOVINOS","valor":903000},{"tipo":"Terra nua","descricao":"50% DE UMA GLEBA DE TERRAS","valor":7500},{"tipo":"Crédito decorrente de empréstimo","descricao":"CRÉDITO DECORRENTE DE EMPRÉSTIMO","valor":150087.24},{"tipo":"Terra nua","descricao":"25% DE UMA GLEBA DE TERRAS","valor":40380},{"tipo":"Crédito decorrente de empréstimo","descricao":"CRÉDITO DECORRENTE DE EMPRÉSTIMO","valor":2457495.36},{"tipo":"Terra nua","descricao":"50% DE 50% DE UMA GLEBA DE TERRAS","valor":25000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 90002540993 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'daniel-vilela'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'GO'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=dario-barbosa ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 170000.00, '[{"tipo":"Casa","descricao":"CASA RESIDENCIAL","valor":120000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO","valor":50000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 200002542481 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'dario-barbosa'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RN'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=douglas-ruas ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1467687.88, '[{"tipo":"Outras aplicações e Investimentos","descricao":"HASHDEX FUNDO","valor":50000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BRADESCO","valor":26605.39},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇAO ITAU","valor":315282.04},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE EMPRESA","valor":225000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"ITAU","valor":7234.02},{"tipo":"Caderneta de poupança","descricao":"SALDO","valor":6743.73},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"ITAU KINEA RENDA FIXA","valor":50000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE EMPRESA","valor":300000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"FUNDO DE INVESTIMENTO ITAU RENDA FIXA","valor":124663.57},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BRADESCO","valor":111957.71},{"tipo":"Outros bens imóveis","descricao":"IMOVEL","valor":50000},{"tipo":"Outros bens imóveis","descricao":"IMOVEL","valor":60000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"ITAU","valor":1},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BRADESCO","valor":1},{"tipo":"Outros bens imóveis","descricao":"IMOVEL","valor":83000},{"tipo":"Outros bens imóveis","descricao":"IMOVEL","valor":50000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"FUNDO DE INVESTIMENTO","valor":3499.04},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"FUNDO DE INVESTIMENTO","valor":3700.38}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 190002542887 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'douglas-ruas'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RJ'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=dr-furlan ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1168464.77, '[{"tipo":"Construção","descricao":"CONTRUCAO EM IMOVEL URBANO","valor":43214.77},{"tipo":"Casa","descricao":"IMOVEL RESIDENCIAL EM MACAPÁ","valor":180250},{"tipo":"Outras participações societárias","descricao":"20% DO INSTITUTO DE TERAPIA INTENSIVA DO AMAPA LTDA","valor":15000},{"tipo":"Outras participações societárias","descricao":"CAPITAL DA EMPRESA INSTITUTO DE MEDICINA DO CORACAO LTDA.","valor":100000},{"tipo":"Prédio residencial","descricao":"APTO RESIDENCIAL","valor":530000},{"tipo":"Casa","descricao":"IMOVEL RESIDENCIAL EM MACAPÁ","valor":300000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 30002530014 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'dr-furlan'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'AP'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=eduardo-braide ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1048910.76, '[{"tipo":"Apartamento","descricao":"APARTAMENTO ED SAQUAREMA","valor":95000},{"tipo":"Caderneta de poupança","descricao":"POUPANÇA BANCO DO BRASIL","valor":626.92},{"tipo":"Caderneta de poupança","descricao":"POUPANCA CEF","valor":1168.48},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE BANCO DO BRASIL","valor":40575.3},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO EM ESPECIE","valor":50000},{"tipo":"Terreno","descricao":"QUOTA DE PARTICIPAÇÃO IDEAL DE 33,33% EM TERRENO CONFORME ESCRITURA PUBLICA DE COMPA E VENDA DE COMPRA E VENDA REGISTRADA NO LIVRO N11 FLS 07/08 DA SERVENTIA DA COMARCA DE SANTA RITA, ESTADO DO MA","valor":73333.33},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MARCA GENERAL MOTORS MODELO S10","valor":160000},{"tipo":"Apartamento","descricao":"APARTAMENTO NO ED JOSE GONGLAVES DOS SANTOS FILHO","valor":628206.73}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 100002545679 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'eduardo-braide'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'MA'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=eduardo-paes ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 189210.63, '[{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"VGBL BRASIL PREV","valor":32811.38},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO","valor":150000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE","valor":2397.49},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE","valor":1085.74},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE","valor":115.54},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"RENDA FIXA","valor":49.58},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE","valor":2750.9}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 190002543380 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'eduardo-paes'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RJ'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=eduardo-riedel ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 16147849.34, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO AUTOMOTOR FORD EDGE ANO 2011","valor":96000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA CAPITAL COOPERATIVA AGRÍCOLA MISTA DE ADAMANTINA","valor":8379.88},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA CAPITAL COOPERATIVA AGRÍCOLA SULMATOGROSSENSE","valor":3276.79},{"tipo":"Outros bens móveis","descricao":"SEMOV.BOVINOS - 521 CABEÇAS - VALOR MÉDIO DE R$ 4000,00 - QUANTIDADE EM 31/12/2025","valor":2084000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA CAPITAL SICREDI CENTRO SUL MS/BA","valor":95545.04},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA CAPITAL COAMO","valor":6534.69},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO AUTOMOTOR FORD RANGER ANO 2024","valor":321890},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA CAPITAL APE PARTICIPAÇÕES","valor":3000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MOTOCICLETA BMW ANO 2026","valor":113900},{"tipo":"Bem relacionado com o exercício da atividade autônoma","descricao":"BENS RELACIONADOS AO EXERCÍCIO DA ATIVIDADE RURAL","valor":12250222.42},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA CAPITAL SICREDI UNIÃO MS/TO","valor":2937.56},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MOTOCICLETA HONDA ANO 2019","valor":15800},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS COOPERATIVA AGRÍCOLA MISTA SERRA DE MARACAJU","valor":3500},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MOTOCICLETA YAMAHA ANO 2017","valor":18000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITOS EM CONTA CORRENTE, POUPANÇA E INVESTIMENTOS BANCÁRIOS - SALDO EM 31/12/2025","valor":439724.68},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA CAPITAL COOPERATIVA PLANTADORES DE CANA SÃO PAULO","valor":60793.92},{"tipo":"Outros créditos e poupança vinculados","descricao":"CRÉDITO A RECEBER","valor":624344.36}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 120002536582 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'eduardo-riedel'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'MS'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=efraim-filho ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1682784.38, '[{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB CDB RENDA FACIL","valor":14433.61},{"tipo":"Outros bens imóveis","descricao":"FLAT EM CABEDELO-PB","valor":359083},{"tipo":"Outros fundos","descricao":"CAIXA GIRO IMEDIATO FIC DE CLASSE DE FIF RENDA FIXA","valor":149682.12},{"tipo":"Apartamento","descricao":"APARTAMENTO EM JOÃO PESSOA-PB","valor":536349.66},{"tipo":"Outros depósitos à vista e numerário","descricao":"OURO CAR","valor":244.26},{"tipo":"Outros bens imóveis","descricao":"FAZENDA EM GURINHÉM-PB","valor":42000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONSORCIO 25 PARCELAS","valor":31696.73},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"HILUX SW4 ANO 2015","valor":93000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"HILUX SW4 ANO 2025","valor":456295}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 150002538692 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'efraim-filho'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PB'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=elizeu-aguiar ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 872808.00, '[{"tipo":"Casa","descricao":"RUA TORQUATO NETO, 2400 - SÃO CRISTÓVÃO","valor":750000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TOYOTA COROLLA","valor":82808},{"tipo":"Terreno","descricao":"TERRENO RUA ARMANDO CAJUBÁ, BAIRRO SABIAZAL, PARNAÍBA (50 X 80)","valor":40000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 180002533958 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'elizeu-aguiar'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PI'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=elmano-de-freitas ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 366457.71, '[{"tipo":"Terreno","descricao":"PROPRIEDADE RURAL","valor":10000},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO NO CAPITAL DE PESSOA JURÍDICA","valor":55000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO MANTIDO EM CONTA BANCÁRIA","valor":16.4},{"tipo":"OUTROS BENS E DIREITOS","descricao":"EQUINOS","valor":4000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"REBANHO OVINO","valor":52600},{"tipo":"OUTROS BENS E DIREITOS","descricao":"DESTINADO À REPRODUÇÃO","valor":10000},{"tipo":"Outras aplicações e Investimentos","descricao":"INVESTIMENTO DE RENDA FIXA EM INSTITUIÇÃO FINANCEIRA","valor":13555.31},{"tipo":"OUTROS BENS E DIREITOS","descricao":"REBANHO BOVINO","valor":191100},{"tipo":"OUTROS BENS E DIREITOS","descricao":"BOVINOS DESTINADOS À REPRODUÇÃO","valor":20000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO MANTIDO EM CONTA BANCÁRIA","valor":1},{"tipo":"Outras aplicações e Investimentos","descricao":"INVESTIMENTO DE RENDA FIXA EM INSTITUIÇÃO FINANCEIRA","valor":185},{"tipo":"Terreno","descricao":"PROPRIEDADE RURAL","valor":10000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 60002543969 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'elmano-de-freitas'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'CE'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=emanuel-cacho ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 600000.00, '[{"tipo":"Casa","descricao":"CASA","valor":500000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO","valor":100000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 260002551712 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'emanuel-cacho'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'SE'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=expedito-netto ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 351226.00, '[{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DISPONIBILIDADE DE INVESTIMENTO","valor":300000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"JET SKY SEA DOO 215 ANO 2012 + REBOQUE MARCA PEGASUSNA COR CINZA PLACA NBN-3386, ADQ. 20/02/2015","valor":49899},{"tipo":"Outras aplicações e Investimentos","descricao":"OUROCAP BB","valor":1327}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 220002542185 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'expedito-netto'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RO'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=fabio-mitidieri ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1698945.66, '[{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":519456.69},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"REBOQUE","valor":11000},{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":491706.99},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE EMPRESA","valor":49400},{"tipo":"Outros fundos","descricao":"CONTA CORRENTE","valor":74546.79},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"QUADRICICLO","valor":57500},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUTOMÓVEL","valor":30000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUTOMÓVEL","valor":209990},{"tipo":"Outros bens imóveis","descricao":"LOTE","valor":82123.49},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MOTO AQUÁTICA","valor":115000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE EMPRESA","valor":721.7},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"QUADRICICLO","valor":57500}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 260002542491 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'fabio-mitidieri'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'SE'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=fabio-trad ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 3670880.45, '[{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO BANCÁRIA","valor":150000},{"tipo":"Outras aplicações e Investimentos","descricao":"OPERAÇÕES ESTRUTURADAS","valor":323000},{"tipo":"Outras aplicações e Investimentos","descricao":"SVN FUNDO DE INVESTIMENTO RENDA FIXA","valor":134592.55},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÃO BANCÁRIA MAN A 2","valor":20745.11},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"PETROBRAS","valor":1896},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"VALE","valor":1464.66},{"tipo":"Outras aplicações e Investimentos","descricao":"AÇÕES - IT NOW IBOV","valor":19861.87},{"tipo":"Casa","descricao":"CASA RESIDENCIAL LOCALIZADA EM CAMPO GRANDE-MS","valor":220000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"HYUNDAI CRETA","valor":122590},{"tipo":"Outras aplicações e Investimentos","descricao":"AÇÕES NA AXIA 3","valor":47505.92},{"tipo":"Outras aplicações e Investimentos","descricao":"PREVIDÊNCIA - SAFRA VIDA E PREVIDÊNCIA","valor":751050.26},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"HYUNDAI HB20","valor":80490},{"tipo":"Terreno","descricao":"LOCALIZADO EM SÃO GABRIEL DO OESTE-MS","valor":31343.9},{"tipo":"Terreno","descricao":"LOCALIZADO EM SÃO GABRIEL DO OESTE-MS","valor":31343.9},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"VALE","valor":1460},{"tipo":"Outras aplicações e Investimentos","descricao":"SAF SOB MAX","valor":39135.68},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO BANCÁRIA","valor":47757.15},{"tipo":"Outras aplicações e Investimentos","descricao":"TÍTULO DE CAPTALIZAÇÃO","valor":2834.19},{"tipo":"Outras aplicações e Investimentos","descricao":"AÇÕES NA AXIA 7","valor":14040.96},{"tipo":"Outros bens imóveis","descricao":"QUINHÃO DE SÍTIO LOCALIZADO EM SÃO GABRIEL DO OESTE-MS","valor":249975},{"tipo":"Outras aplicações e Investimentos","descricao":"AÇÕES NA AXIA/ADM BANCO SAFRA","valor":4866.12},{"tipo":"Outras aplicações e Investimentos","descricao":"AÇÕES - IT NOW IBOV","valor":2624.4},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"PETROBRAS","valor":1703.38},{"tipo":"Apartamento","descricao":"APARTAMENTO COM ALIENAÇÃO FIDUCIÁRIA LOCALIZADO EM CAMPO GRANDE-MS","valor":1000000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE CAPITAL FABIO TRAD ADVOGADOS E ASSOCIADOS","valor":18000},{"tipo":"Outras aplicações e Investimentos","descricao":"SAF CAPMKT","valor":41096.58},{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"INVESTIMENTO","valor":3814.69},{"tipo":"Outras aplicações e Investimentos","descricao":"AÇÕES - IT NOW IBOV","valor":1950.52},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"OUTRAS AÇÕES","valor":131363.35},{"tipo":"OUTROS BENS E DIREITOS","descricao":"VALORE RECEBIDO (ESPÓLIO)","valor":174374.26}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 120002539834 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'fabio-trad'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'MS'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=felipe-camarao ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 5208193.72, '[{"tipo":"Apartamento","descricao":"APARTAMENTO ADQUIRIDO NA PLANTA EM 2022 JUNTO À SPE CONDOMÍNIO PENÍNSULA II LTDA,PONTA D AREIA, SÃO LUÍS/MA. VALOR DE AQUISIÇÃO: R$ 2.865.628,60. VALOR PAGO ATÉ A PRESENTE DATA: R$ 822.003,91.","valor":2865628.6},{"tipo":"Apartamento","descricao":"APARTAMENTO ADQUIRIDO NA PLANTA EM 2023 JUNTO À SPE DOM RICARDO EMPREENDIMENTOS IMOBILIÁRIOS LTDA. VALOR TOTAL DO IMOVEL E DE: 831.282,56.VALOR PAGO ATE O PRESENTE MOMENTO FOI 220.103,90-","valor":831282.56},{"tipo":"Sala ou conjunto","descricao":"PARTICIPAÇÃO CORRESPONDENTE A 50% (CINQUENTA POR CENTO) DE PONTO COMERCIAL COMPOSTO POR 06 (SEIS) SALAS, LOCALIZADO NA AVENIDA AVICÊNIA,","valor":300000},{"tipo":"Apartamento","descricao":"APARTAMENTO RESIDENCIAL ADQUIRIDO POR MEIO DE CONTRATO DE COMPRA E VENDA","valor":380000},{"tipo":"Apartamento","descricao":"APARTAMENTO ADQUIRIDO NA PLANTA EM 2023 JUNTO À SPE DOM RICARDO EMPREENDIMENTOS IMOBILIÁRIOS LTDA. VALOR TOTAL DO IMOVEL E DE: 831.282,56.VALOR PAGO ATE O PRESENTE MOMENTO FOI 220.103,90-","valor":831282.56}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 100002542556 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'felipe-camarao'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'MA'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=gabriel-azevedo ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1702153.88, '[{"tipo":"Depósito bancário em conta corrente no exterior","descricao":"SALDO EM CONTA - BANCO BD2 S.A. (CÂMBIO: 5,5024)","valor":9139.43},{"tipo":"Outros créditos e poupança vinculados","descricao":"CRÉDITOS EM TRÂNSITO - XP INVESTIMENTOS CCTVM S/A","valor":140},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA GLOBAL - BANCO INTER S.A.","valor":4032.82},{"tipo":"Outras aplicações e Investimentos","descricao":"NTN-B","valor":993.23},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"RDB/CDB - ITAÚ UNIBANCO S.A.","valor":7848.69},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"CDB - BANCO GENIAL","valor":59778.23},{"tipo":"Fundo de Curto Prazo","descricao":"V8 CASH PLATINUM FIC FIRF CP","valor":7555.77},{"tipo":"Fundo de Longo Prazo e Fundo de Investimentos em Direitos Creditórios (FIDC)","descricao":"AZ QUEST VALORE FI RENDA FIXA CP","valor":17847.56},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA CORRENTE - ITAÚ UNIBANCO S.A.","valor":1},{"tipo":"Outros fundos","descricao":"JGP ECOSSISTEMA FIC INCENTIVADOS","valor":11684.39},{"tipo":"Outras aplicações e Investimentos","descricao":"XP DEBÊNTURES INCENTIVADAS","valor":21931.75},{"tipo":"Outros bens móveis","descricao":"BICICLETA VELORBIS 2023","valor":10000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE CAPITAL SOCIAL DA EMPRESA GABRIEL SOUSA MARQUES DE AZEVEDO COMUNICAÇÃO","valor":1000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO EM RENDA FIXA - XP INVESTIMENTOS CCTVM S/A","valor":41156.97},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA - XP","valor":1289.83},{"tipo":"Fundo de Curto Prazo","descricao":"BTG PACTUAL TESOURO","valor":4928.02},{"tipo":"Apartamento","descricao":"APARTAMENTO EM BELO HORIZONTE - MG","valor":406070.91},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO DE RENDA FIXA - XP INVESTIMENTOS CCTVM S.A.","valor":28340.73},{"tipo":"Outras aplicações e Investimentos","descricao":"CRA - BANCO GENIAL","valor":20449.07},{"tipo":"Outros bens móveis","descricao":"BICICLETA PASHLEY 2016","valor":6000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO DE RENDA FIXA - NU PAGAMENTOS S.A.","valor":9424.75},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO DE RENDA FIXA - BANCO INTER S.A.","valor":578.52},{"tipo":"Fundo de Curto Prazo","descricao":"TREND INB FIC FIRF SIMPLES","valor":439.47},{"tipo":"Outros fundos","descricao":"KAPITALO K10 ADVISORY FIF EM COT","valor":10742.39},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE CAPITAL SOCIAL DA EMPRESA MINA JAZZ BAR LTDA","valor":10000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA CORRENTE - BANCO BS2 S.A.","valor":2.13},{"tipo":"Apartamento","descricao":"50% DE APARTAMENTO EM BELO HORIZONTE - MG, COM USUFRUTO VITALÍCIO DE TERCEIRO","valor":733838.93},{"tipo":"Outras aplicações e Investimentos","descricao":"CRI - BANCO GENIAL","valor":63437.29},{"tipo":"Caderneta de poupança","descricao":"SALDO EM CONTA POUPANÇA - ITAÚ UNIBANCO S.A.","valor":194.61},{"tipo":"Apartamento","descricao":"APARTAMENTO EM BELO HORIZONTE - MG, ADQUIRIDO COM RECURSOS PRÓPRIOS E FINANCIAMENTO","valor":188423.04},{"tipo":"Outros bens móveis","descricao":"BICICLETA VELORBIS CHURCHILL BALLON 2013","valor":13000},{"tipo":"Outros bens móveis","descricao":"BICICLETA GORILLA 2020","valor":6000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA CORRENTE - GENIAL","valor":5884.35}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 130002549557 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'gabriel-azevedo'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'MG'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=gabriel-souza ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 935461.08, '[{"tipo":"Apartamento","descricao":"50% DE UM APARTAMENTO COM BOX EM PORTO ALEGRE - COM SALDO FINANCIADO","valor":287653.38},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITO EM CONTAS-CORRENTES","valor":18249.34},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÕES E INVESTIMENTOS","valor":191898.58},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO EM ESPÉCIE","valor":6950},{"tipo":"Casa","descricao":"50% DE UMA CASA EM TRAMANDAÍ-RS","valor":295874.33},{"tipo":"Outras aplicações e Investimentos","descricao":"PREVIDÊNCIA PRIVADA","valor":134835.45}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 210002542892 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'gabriel-souza'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RS'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=garotinho ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 167585.05, '[{"tipo":"OUTROS BENS E DIREITOS","descricao":"EMPRESTIMO CONCEDIDO","valor":33174.2},{"tipo":"OUTROS BENS E DIREITOS","descricao":"VALOR INFORMADO POR CNPJ [documento mascarado]","valor":2587.37},{"tipo":"OUTROS BENS E DIREITOS","descricao":"VALOR INFORMADO POR CNPJ [documento mascarado]","valor":33448.22},{"tipo":"OUTROS BENS E DIREITOS","descricao":"VALOR INFORMADO POR CNPJ [documento mascarado]","valor":22267.74},{"tipo":"Terreno","descricao":"TERRENO","valor":2000},{"tipo":"Outros bens imóveis","descricao":"IMOVEL","valor":45000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"VALOR INFORMADO POR CNPJ [documento mascarado]","valor":839.78},{"tipo":"OUTROS BENS E DIREITOS","descricao":"INFORMADO POR CNPJ [documento mascarado]","valor":28267.74}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 190002550196 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'garotinho'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RJ'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=gelson-merisio ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 652953.78, '[{"tipo":"Linha telefônica","descricao":"LINHA TELEFÔNICA","valor":2147},{"tipo":"Casa","descricao":"CASA ¿ IMÓVEL RESIDENCIAL SITUADO NO MUNICÍPIO DE SÃO PAULO/SP, ADQUIRIDO EM 24/10/2024","valor":430000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE CAPITAL ¿ SICOOB/CREDIMOC COOPERATIVA DE CRÉDITO (CONTA CAPITAL)","valor":75546.75},{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"CONTA CORRENTE E PLANO VGBL ¿ BANCO DO BRASIL S.A.","valor":0.01},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO FINANCEIRA ¿ BANCO DO BRASIL S.A. (CDB)","valor":734.39},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITO EM CONTA CORRENTE ¿ SICOOB/CREDIMOC COOPERATIVA DE CRÉDITO","valor":48359.22},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA NA EMPRESA MERISIO COMÉRCIO DE MATERIAIS DE CONSTRUÇÃO LTDA.","valor":95000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA DE PAGAMENTO ¿ PICPAY BANK BANCO MÚLTIPLO S.A.","valor":1166.41}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 240002548628 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'gelson-merisio'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'SC'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=geraldo-carvalho ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 200590.00, '[{"tipo":"Casa","descricao":"SÍTIO DENOMINADO TRAPIAZIN, N. 5739, COMUNIDADE MATA VELHA, ADQUIRIDO O DIREITO DE USO EM 2012, COM ÁREA DE 3 HECTARES, COM CASA, POÇO ARTESIANO, CERCADO DE ARAME FARPADO E OUTRAS BENFEITORIAS.","valor":150000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUTOMÓVEL NOVO - KWID ZEN 1.0 - 2021/2022 - CHASSI: 93YRBB008NJ916777 CIL 999","valor":50590}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 180002537422 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'geraldo-carvalho'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PI'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=guilherme-fonseca ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 300000.00, '[{"tipo":"Apartamento","descricao":"1 APARTAMENTO","valor":300000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 170002536575 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'guilherme-fonseca'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PE'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=gustavo-henrique ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 148000.00, '[{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO ESPÉCIE","valor":100000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MOTOCICLETA CB 1000 HONDA","valor":48000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 180002550421 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'gustavo-henrique'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PI'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=haddad-gov-sp ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 861217.25, '[{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÃO FINANCEIRA RF REF DI PLUS ÁGIL","valor":359328.43},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÃO FINANCEIRA RF SIMPLES ÁGIL","valor":76000},{"tipo":"Casa","descricao":"26,37% DA CASA SITUADA BAIRRO PLANALTO PAULISTA, SÃO PAULO, SP","valor":183000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE NO BANCO DO BRASIL","valor":100970.99},{"tipo":"Quotas ou quinhões de capital","descricao":"10 QUOTAS DA EMPRESA HADDAD E HADDAD CONSULTORIA EMPRESARIAL LTDA","valor":10},{"tipo":"Quotas ou quinhões de capital","descricao":"132.916 QUOTA DA EMPRESA KHLAP ADMINISTRAÇÃO PARTICIPAÇÕES LTDA","valor":140446.26},{"tipo":"Caderneta de poupança","descricao":"DEPÓSITO EM CADERNETA DE POUPANÇA NA CAIXA ECONÔMICA FEDERAL","valor":1461.57}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 250002549705 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'haddad-gov-sp'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'SP'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=hana-ghassan ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1670461.00, '[{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE","valor":30461},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO EM ESPECIE","valor":20000},{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":900000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"COMPASS 21/22","valor":190000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"CDB BB PRE","valor":440000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"OUTROS BENS E DIREITOS","valor":50000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB LCA","valor":40000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 140002551598 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'hana-ghassan'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PA'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=helder-salomao ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1206682.23, '[{"tipo":"Apartamento","descricao":"APARTAMENTO EM SÃO GERALDO, CARIACICA-ES","valor":43000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CC NA CEF","valor":16791.26},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPOSITO A VISTA NA WISE BRASIL","valor":13042.57},{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"VGBL CEF","valor":631760.85},{"tipo":"Terreno","descricao":"TERRENO NO LOT. SÃO CONRADO, ADQUIRIDO EM 09/1991","valor":3977.97},{"tipo":"Caderneta de poupança","descricao":"SALDO EM POUPANÇA NA CEF","valor":5020.7},{"tipo":"Plano PAIT e caderneta de pecúlio","descricao":"PECULIO NA CAIXA","valor":1943.12},{"tipo":"Sala ou conjunto","descricao":"SALA COMERCIAL EM CAMPO GRANDE, CARIACICA-ES","valor":138547.87},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA CORRENTE NO BANESTES","valor":144.89},{"tipo":"Apartamento","descricao":"APARTAMENTO EM CAMPO GRANDE, CARIACICA-ES","valor":352453}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 80002551833 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'helder-salomao'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'ES'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=hildon-chaves ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 30330625.02, '[{"tipo":"Outros bens imóveis","descricao":"IMOVEIS","valor":3150529.65},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEICULO SW4","valor":317785},{"tipo":"OUTROS BENS E DIREITOS","descricao":"PARTICIPAÇÃO SOCIETÁRIAS, APLICAÇÕES, CRÉDITOS E BENS NO EXTERIOR","valor":26862310.37}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 220002542916 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'hildon-chaves'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RO'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=indira-xavier ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 479.89, '[{"tipo":"Depósito bancário em conta corrente no País","descricao":"BANCO DO BRASIL","valor":479.89}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 130002547874 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'indira-xavier'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'MG'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=ivan-moraes ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 81452.00, '[{"tipo":"Casa","descricao":"IMÓVEL RESIDENCIAL SITUADO A RUA ESMERALDINO BANDEIRA, ADQUIRIDO VIA FINANCIAMENTO DIRETO JUNTO A CONSTRUTORA, TOTALMENTE QUITADO","valor":80000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTA EM BANCO. BANCO 341, AG: 1632, CONTA: 32077-4","valor":1452}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 170002538097 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'ivan-moraes'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PE'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=jeronimo ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 886548.53, '[{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE","valor":1774.38},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE","valor":14.83},{"tipo":"Outras aplicações e Investimentos","descricao":"BB RF PLUS AGIL FUNDO DE INVESTIMENTO EM COTAS INFORMADO POR CNPJ [documento mascarado]","valor":31799.98},{"tipo":"Casa","descricao":"50% DO IMÓVEL LOCALIZADO NA QUADRA C, N. 17, CONJ CENTENÁRIO, QUEIMADINHA, FEIRA DE SANTANA/BA","valor":100000},{"tipo":"Caderneta de poupança","descricao":"POUPANÇA","valor":15309.79},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"RF LP HIGH","valor":20162.91},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB LCA","valor":450000},{"tipo":"Outras aplicações e Investimentos","descricao":"TESOURO DIRETO","valor":7325.15},{"tipo":"Outras aplicações e Investimentos","descricao":"BB RF LONGO PRAZO HIGH FUNDO DE INVESTISMENTO EM COTAS DE FUNDOS DE INVESTIMENTO","valor":215866.09},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO","valor":1494.93},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO","valor":32166.78},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO COOPERATIVA RURAL ASCOOB","valor":10633.69}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 50002536314 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'jeronimo'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'BA'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=jhc ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 2244732.19, '[{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DA EMPRESA ALAGOAS COMUNICACOES LTDA","valor":45000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CAMINHÃO TRIO ELÉTRICO ANO 2003","valor":70000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE","valor":36388.02},{"tipo":"Caderneta de poupança","descricao":"POUPANÇA","valor":487},{"tipo":"Apartamento","descricao":"50% DE UM APARTAMENTO EM MACEIÓ","valor":1550776.57},{"tipo":"Caderneta de poupança","descricao":"POUPANÇA","valor":286316.36},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"SALDO EM DINHEIRO","valor":18000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"RENDA FIXA","valor":237764.24}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 20002553350 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'jhc'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'AL'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=joao-henrique-catan ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 588097.38, '[{"tipo":"Quotas ou quinhões de capital","descricao":"PARTICIPACAO COM 33,33% NP CAPITAL DA EMPRESA ALMEIDINHA, MIRANDA SOARES CATAN ADVOGADOS ASSOCIADOS S/S","valor":500},{"tipo":"Caderneta de poupança","descricao":"CADERNETA DE POUPANÇA","valor":136.23},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITO BANCÁRIO EM CONTA CORRENTE NO PAÍS","valor":111270.95},{"tipo":"OUTROS BENS E DIREITOS","descricao":"DISPONIBILIDADE PARA NOVOS INVESTIMENTOS","valor":382000},{"tipo":"Quotas ou quinhões de capital","descricao":"PARTICIPACAO COM 30% NO CAPITAL DA EMPRESA NOVAS SOLUCOES EM PARTICIPACOES SOCIETARIAS LTDA","valor":90000},{"tipo":"Outras aplicações e Investimentos","descricao":"BRADESCO - TÍTULO DE CAPITALIZAÇÃO","valor":4189.2},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITO BANCÁRIO EM CONTA CORRENTE NO PAÍS","valor":1}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 120002552191 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'joao-henrique-catan'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'MS'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=joel-rodrigues ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1688256.20, '[{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE BANCO DO BRASIL","valor":8792.67},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE BANCO NORDESTE","valor":1101.3},{"tipo":"Apartamento","descricao":"RESIDENCIAL","valor":300000},{"tipo":"Casa","descricao":"RESIDENCIAL","valor":900000},{"tipo":"Terreno","descricao":"FRAÇÃO","valor":80000},{"tipo":"Consórcio não contemplado","descricao":"BANCO DO BRASIL","valor":24159.4},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO","valor":22000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO ANO 2021/22","valor":175000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO ANO 2023/24","valor":175800},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"OUROCAP","valor":1402.83}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 180002538530 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'joel-rodrigues'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PI'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=jorginho-mello ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 2818036.89, '[{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA PARTE NO CAPITAL SOCIAL DA FIRMA JSM.","valor":1688000},{"tipo":"Outras aplicações e Investimentos","descricao":"CONTA REGISTRO DE FLUXO PAG BB","valor":42019.49},{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"BRASILPREV VGBL","valor":4055.28},{"tipo":"OUTROS BENS E DIREITOS","descricao":"ADIANTAMENTO PARA FUTURO AUMENTO DE CAPITAL SOCIAL DA JSM PARTICIPAÇÕES SOCIETÁRIAS LTDA.","valor":164925.08},{"tipo":"Apartamento","descricao":"AQUISIÇÃO DE 02 APARTAMENTOS, SITUADOS EM ITAPEMA/SC.","valor":380000},{"tipo":"Terreno","descricao":"TERRENO EM ARARANGUA, ADQUIRIDO NO ANO DE 1986.","valor":828.68},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO MARCA VW, MODELO KARMANN GHIA, ANO 1988.","valor":145000},{"tipo":"Outras aplicações e Investimentos","descricao":"BB REF DI PLUS ÁGIL","valor":100.41},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO MARCA DODGE, MODELO POLARA, ANO 1980.","valor":20000},{"tipo":"Outras aplicações e Investimentos","descricao":"BB CDB RENDE FÁCIL","valor":43607.95},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB CDB","valor":329500}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 240002537073 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'jorginho-mello'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'SC'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=jose-estevao ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 600000.00, '[{"tipo":"Quotas ou quinhões de capital","descricao":"CAPITAL SOCIAL DA EMPRESA GRADUX BRASIL LTDA","valor":600000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 50002536579 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'jose-estevao'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'BA'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=jose-roberto-arruda ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 830170.98, '[{"tipo":"Caderneta de poupança","descricao":"POUPANÇA","valor":4730.58},{"tipo":"Caderneta de poupança","descricao":"POUPANÇA","valor":49459.2},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE","valor":30355.97},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"GOL - VW, 2010/11","valor":30990},{"tipo":"Apartamento","descricao":"APARTAMENTO SITUADO EM ITAJUBA - MG","valor":66955.53},{"tipo":"Apartamento","descricao":"APARTAMENTO SITUADO EM ITAJUBA - MG","valor":19431.24},{"tipo":"Quotas ou quinhões de capital","descricao":"PARTICIPAÇÃO NO CAPITAL SOCIAL DE EMPRESA","valor":198000},{"tipo":"Apartamento","descricao":"APARTAMENTO SITUADO EM BRASÍLIA - DF","valor":195261.56},{"tipo":"Casa","descricao":"CASA SITUADA EM ITAJUBA - MG","valor":194986.9},{"tipo":"Outros créditos e poupança vinculados","descricao":"CRÉDITO EM EMPRESA","valor":40000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 70002552586 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'jose-roberto-arruda'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'DF'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=juliana-brizola ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 376137.78, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"HONDA HR-V","valor":155500},{"tipo":"Caderneta de poupança","descricao":"CONTA POUPANÇA JUNTO AO BANRISUL","valor":59.03},{"tipo":"Apartamento","descricao":"51% DE UM APARTAMENTO FINANCIADO JUNTO AO BANRISUL","valor":220578.75}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 210002551508 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'juliana-brizola'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RS'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=laurez-moreira ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 9615406.23, '[{"tipo":"Terra nua","descricao":"IMOVEL RURAL EM DUERE","valor":112425.54},{"tipo":"Terra nua","descricao":"IMOVEL RURAL EM DUERE","valor":475228.13},{"tipo":"Terreno","descricao":"LOTE EM PALMAS","valor":5000},{"tipo":"Terra nua","descricao":"PARTE DE FAZENDA GOIAS","valor":533333.34},{"tipo":"Terra nua","descricao":"IMOVEL RURAL EM DUERE","valor":696619.66},{"tipo":"Terreno","descricao":"11,11% IMOVEL URBANO EM GURUPI","valor":2333.34},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEIUCLO TOYOTA HILUX","valor":242270},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS EMPRESA PRODUTOS VALE DA SERRA COMERCIAL","valor":270000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA BANCARIA","valor":2488.23},{"tipo":"Prédio residencial","descricao":"IMOVEL RESIDENCIAL EM GURUPI","valor":150000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEICULO FIAT STRADA","valor":66340.57},{"tipo":"Quotas ou quinhões de capital","descricao":"CAPITAL JUNTO A COOPERATIVA DE CREDITO LIVRE DE ADMISSAO DE PARAISO","valor":451875.95},{"tipo":"Terra nua","descricao":"IMOVEL RURAL EM DUERE","valor":359112.2},{"tipo":"Consórcio não contemplado","descricao":"CONSORCIO TRATORES","valor":97157.72},{"tipo":"Consórcio não contemplado","descricao":"CONSORCIO DE BEM","valor":11343.6},{"tipo":"OUTROS BENS E DIREITOS","descricao":"ANIMAIS BOVINOS","valor":5201300},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CAMINHAO CARGA VW 1180","valor":293000},{"tipo":"Outros fundos","descricao":"TITULO DE CAPITALIZACAO","valor":122298.4},{"tipo":"Consórcio não contemplado","descricao":"CONSORCIO DE VEICULO","valor":74687.11},{"tipo":"Consórcio não contemplado","descricao":"COTA CONSORCIO VEICULO","valor":22900.71},{"tipo":"Terra nua","descricao":"IMOVEL RURAL EM DUERE","valor":425691.73}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 270002544494 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'laurez-moreira'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'TO'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=leandro-grass ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 285000.00, '[{"tipo":"Apartamento","descricao":"APARTAMENTO EM COPROPRIEDADE","valor":285000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 70002552496 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'leandro-grass'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'DF'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=lenilda-luna ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 115000.00, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO HB20 1.6 2018/2019","valor":55000},{"tipo":"Apartamento","descricao":"APARTAMENTO FINANCIADO PELO FUNDO DE ARRENDAMENTO RESIDENCIAL","valor":60000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 20002539642 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'lenilda-luna'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'AL'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=lourdes-melo ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 450000.00, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO","valor":150000},{"tipo":"Casa","descricao":"IMÓVEL RESIDENCIAL","valor":300000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 180002553722 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'lourdes-melo'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PI'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=lucas-ribeiro ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 385621.65, '[{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":48489.64},{"tipo":"Caderneta de poupança","descricao":"POUPANÇA BB","valor":48693.06},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE","valor":1764.1},{"tipo":"Caderneta de poupança","descricao":"POUPANÇA CEF","valor":1913.31},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO CDB","valor":14403.19},{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":270358.35}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 150002551789 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'lucas-ribeiro'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PB'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=lucia-santos ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 799134.68, '[{"tipo":"Apartamento","descricao":"APARTAMENTO QUITADO 12/07/2014","valor":10000},{"tipo":"Outros bens imóveis","descricao":"3 FRACAO HARD ROCK HOTAL E RESORT","valor":204000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE CAIXA","valor":10900},{"tipo":"Terreno","descricao":"TERRENO ADQUIRIDO EM 2026","valor":240000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TORO 2016","valor":60000},{"tipo":"Casa","descricao":"CASA RESIDENCIAL","valor":24234.68},{"tipo":"Caderneta de poupança","descricao":"POUPANCA CAIXA","valor":40000},{"tipo":"Outras aplicações e Investimentos","descricao":"NUBANK APLICACAO E INVESTIMENTOS","valor":210000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 180002544216 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'lucia-santos'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PI'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=luciano-zucco ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 709304.00, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUTOMÓVEL","valor":267607},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUTOMÓVEL","valor":30000},{"tipo":"Caderneta de poupança","descricao":"POUPEX","valor":34},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MOTOCICLETA","valor":39348},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BANRISUL","valor":217},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BANCO ITAÚ","valor":78426},{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"BANCO ITAÚ","valor":20000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BANRISUL","valor":251},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BB","valor":3133},{"tipo":"Caderneta de poupança","descricao":"BB","valor":32},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BANRISUL","valor":256},{"tipo":"Apartamento","descricao":"PORTO ALEGRE/RS","valor":270000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 210002547857 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'luciano-zucco'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RS'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=lucien-rezende ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 500000.00, '[{"tipo":"Casa","descricao":"CASA DE ALVENARIA RESIDENCIAL LOCALIZADA EM CAMPO GRANDE MS","valor":250000},{"tipo":"Casa","descricao":"CASA DE ALVENARIA RESIDENCIAL","valor":250000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 120002532257 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'lucien-rezende'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'MS'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=luis-cesar-bueno ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 884607.32, '[{"tipo":"Caderneta de poupança","descricao":"POUPANÇA ITAÚ","valor":3390.99},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"SANTANDER","valor":34.74},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"JEEP/COMPASS LONGITUDE 2023","valor":176900},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB RENDE FACIL","valor":207.17},{"tipo":"Caderneta de poupança","descricao":"BANCO DO BRASIL - POUPANÇA OURO","valor":0.3},{"tipo":"Apartamento","descricao":"EDIFICIO CANADA - FINANCIADO","valor":55364.88},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CPMTA CORRENTE CAIXA ECONOMICA","valor":1995.97},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTA CORRENTE ITAU","valor":10},{"tipo":"Caderneta de poupança","descricao":"POUPANÇA CAIXA ECONOMICA","valor":246.93},{"tipo":"Casa","descricao":"RESIDENCIAL - SITO RUA DOS BABACUS","valor":516662.97},{"tipo":"Outros bens imóveis","descricao":"20% DE IMOVEL SETOR RODOVIARIO","valor":49793.37},{"tipo":"Terreno","descricao":"30% LOTE 11 SITUADO NA RUA DOS BABAÇUS","valor":80000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 90002545476 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'luis-cesar-bueno'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'GO'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=mailza-assis ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 167482.91, '[{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTA BANCARIA - CEF - AGE 2278","valor":46000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTA BANCARIA - BANCO DO BRASIL","valor":0},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTA BANCARIA - CEF - AGE 3706","valor":255.27},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTA BANCARIA - CEF PERSONAL FIC RENDA FIXA LP","valor":121227.64},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTA BANCARIA - CREDISIS","valor":0}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 10002544107 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'mailza-assis'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'AC'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=marcelo-brigadeiro ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1831261.11, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO AUTOMOTOR TOYOTA/COROLLA CROSS XRX 20, ANO 2025/MODELO 2026, PLACA SXR2I92, COR PRETA (RENAVAM [documento mascarado])","valor":194000},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÕES E INVESTIMENTOS EM FUNDOS COMO XP, BRADESCO, WESTERN ASSET FIA, TREND INB E SALDO EM CONTA CORRENTE.","valor":566761.11},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO AUTOMOTOR BYD/DOLPHIN MINI GS5EV, ANO 2026/MODELO 2027, PLACA SXY3F22, COR PRETA (RENAVAM [documento mascarado])","valor":119000},{"tipo":"Quotas ou quinhões de capital","descricao":"PARTICIPAÇÃO NO CAPITAL SOCIAL ¿ MVP1 SERVIÇOS ADM LTDA (CNPJ [documento mascarado])","valor":841500},{"tipo":"Quotas ou quinhões de capital","descricao":"PARTICIPAÇÃO SOCIETÁRIA ¿ MB MANAGEMENT ASSESSORIA EIRELI (CNPJ [documento mascarado])","valor":110000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 240002544118 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'marcelo-brigadeiro'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'SC'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=marcelo-maranata ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 249805.00, '[{"tipo":"Quotas ou quinhões de capital","descricao":"50% QUOTAS DE CAPITAL DA EMPRESA MARJORIE ADMINISTRAÇÃO DE CONDOMINIO","valor":60000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO DE RENDA FIXA BANCO BRADESCO","valor":31915},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE CAPITAL DA EMPRESA AMITIE LIVRARIA E PAPELARIA","valor":13500},{"tipo":"Galpão","descricao":"UM GALPÃO PRÉ-MOLDADO NA RUA SÃO JOSÉ EM GUAÍBA","valor":40000},{"tipo":"Casa","descricao":"UMA CASA NO BAIRRO COHAB EM GUAÍBA","valor":60000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE CAPITAL DA EMPRESA MARCELLY MOVEIS LTDA","valor":9000},{"tipo":"Terreno","descricao":"UM TERRENO SEM BENFEITORIAS NA CHACARA DAS PAINEIRAS EM GUAÍBA","valor":24180},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"UM AUTOMÓVEL VW GOL 1.0 ANO/MODELO 2013/14","valor":11210}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 210002535802 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'marcelo-maranata'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RS'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=marconi-perillo ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 11876815.71, '[{"tipo":"Casa","descricao":"CASA RESIDENCIAL","valor":2500000},{"tipo":"Outras aplicações e Investimentos","descricao":"INVESTIMENTO FAZENDA","valor":219902},{"tipo":"OUTROS BENS E DIREITOS","descricao":"INVESTIMENTO NA FAZENDA MATEUS MACHADO","valor":185000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"LINHA TELEFONICA ADQUIRIDA","valor":1347.06},{"tipo":"OUTROS BENS E DIREITOS","descricao":"INVESTIMENTO FAZENDA MATEUS","valor":467800},{"tipo":"OUTROS BENS E DIREITOS","descricao":"PARTICIPAÇAO CAPITAL SOCIAL EMPRESA MEIA LUA","valor":20000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"QUOTA DE ACOES EMPRESA GOIÁS ALIMENTOS S.A","valor":50000.4},{"tipo":"OUTROS BENS E DIREITOS","descricao":"PAGAMENTO 13 ALQUEIRES, ESPÓLIO, FAZENDA","valor":40000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CREDITO DECORRENTE DE ALIENAÇÃO DE IMOVEL EM PALMEIRAS DE GOIÁS","valor":375000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA DE CAPITAL COOPERATIVA CRED LIVR ADMISSÃO","valor":2369.14},{"tipo":"OUTROS BENS E DIREITOS","descricao":"GLEBA DE TERRAS FAZENDA MATHEUS MACHADO","valor":29964.3},{"tipo":"OUTROS BENS E DIREITOS","descricao":"GLEBA DE TERRAS TRES RANCHOS","valor":10000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"EMPRESTIMO CONCEDIDO","valor":318396.03},{"tipo":"OUTROS BENS E DIREITOS","descricao":"INVESTIMENTO EM CONSTRUÇÃO FAZENDA MATEUS MACHADO","valor":900000},{"tipo":"Quotas ou quinhões de capital","descricao":"PARTICIPAÇAO CAPITAL SOCIAL EMPRESA MV PARTICIPAÇOES LTDA.","valor":406724},{"tipo":"Quotas ou quinhões de capital","descricao":"PARTICIPAÇÃO 25% DAS QUOTAS DE CAPITAL EMPRESA ITUMBIARA EMPREENDIMENTOS IMOBILIARIO SPE","valor":875000},{"tipo":"Apartamento","descricao":"APARTAMENTO RESIDENCIAL","valor":3121312.78},{"tipo":"OUTROS BENS E DIREITOS","descricao":"50% GLEBA DE TERRAS TRES RANCHOS","valor":14000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"PARTICIPAÇÃO CAPITAL SOCIAL EMPRESA MFPJ PARTICIPAÇOES E INVESTIMENTOS LTDA","valor":50000},{"tipo":"Quotas ou quinhões de capital","descricao":"CAPITAL SOCIAL EMPRESA SCP BOA ESPERANÇA","valor":800000},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA DE CAPITAL EMPRESA SNEQN HUBDE NEGOCIO LTDA","valor":50000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"VALORES EMPRESTADO","valor":240000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"EMPRESTIMO CONCEDIDO","valor":500000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"VALORES EMPRESTADO A MV PROJETOS E CONSULTORIA LTDA","valor":700000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 90002543463 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'marconi-perillo'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'GO'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=marcos-rogerio ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 2376169.92, '[{"tipo":"OUTROS BENS E DIREITOS","descricao":"CARTA DE CREDITO CONSORCIO IMOBILIARIO","valor":85972.5},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA DE CAPITAL SOCIAL - COOP DE CREDITO DO CENTRO DO ESTADO DE RONDONIA - SICOOB CENTRO","valor":25521.2},{"tipo":"Apartamento","descricao":"APARTAMENTO RESIDENCIAL LOCALIZADO NO BAIRRO EMBRATEL EM PORTO VELHO ¿ RO ADQUIRIDO ATRAVÉS DA VENDA DE APTO NO BAIRRO SÃO JOÃO BOSCO FINANCIADO COM RECURSOS DA CAIXA ECONOMICA FEDERAL.","valor":700000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CARTA DE CREDITO CONTEMPLADA ¿ CONSORCIO IMOBILIARIO","valor":152287.14},{"tipo":"Apartamento","descricao":"APARTAMENTO RESIDENCIAL LOCALIZADO NO BAIRRO NOVA BRASÍLIA EM JI-PARANA ¿ RO COM RECURSOS DE CONSÓRCIO IMOBILIÁRIO","valor":370000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO DE RENDA FIXA ¿ BB CDB","valor":10638.08},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE CAPITAL MEDIANTE INCORPORAÇÃO DE PROPRIEDADE RURAL SITUADA NO MUNICÍPIO DE VALE DO PARAISO PARA FORMACAO DO CAPITAL SOCIAL DA EMPRESA AGROPECUARIA MRB LTDA","valor":1000000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO DE RENDA FIXA ¿ CAIXA ECONÔMICA FEDERAL","valor":10751},{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"VGBL CONTRIBUICAO (CAIXA VIDA E PREVIDENCIA S/A)","valor":21000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 220002541939 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'marcos-rogerio'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RO'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=marcus-sodre ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 117000.00, '[{"tipo":"Apartamento","descricao":"IMÓVEL FINANCIADO PELA CAIXA SITUADO NO BAIRRO SÃO JUDAS EM BALNEÁRIO CAMBORIÚ/SC","valor":117000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 240002541913 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'marcus-sodre'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'SC'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=maria-do-carmo ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 118473769.48, '[{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA","valor":190000},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA","valor":100000},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA","valor":25000},{"tipo":"Outros fundos","descricao":"PREVIDENCIA PRIVADA","valor":2402509.27},{"tipo":"Consórcio não contemplado","descricao":"CONSORCIO NÃO CONTEMPLADO","valor":16104.12},{"tipo":"Outros fundos","descricao":"PREVIDENCIA PRIVADA","valor":1734239.57},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA","valor":5000},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA","valor":2500},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE","valor":13267.24},{"tipo":"Outros créditos e poupança vinculados","descricao":"CREDITO COM PESSOA JURIDICA","valor":92004111.43},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÃO FINANCEIRA","valor":999642},{"tipo":"Consórcio não contemplado","descricao":"CONSORCIO NÃO CONTEMPLADO","valor":9558.88},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÃO FINANCEIRA","valor":40306.36},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE","valor":636.87},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA","valor":1},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA","valor":7001400},{"tipo":"Outros bens imóveis","descricao":"IMOVEL","valor":5444036},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA","valor":50000},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA","valor":375000},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA","valor":1},{"tipo":"Consórcio não contemplado","descricao":"CONSORCIO NÃO CONTEMPLADO","valor":4962.09},{"tipo":"Depósito bancário em conta corrente no exterior","descricao":"MOEDAS EXTRANGEIRAS","valor":151628.09},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA","valor":7600000},{"tipo":"Consórcio não contemplado","descricao":"CONSORCIO NÃO CONTEMPLADO","valor":5306.68},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA","valor":97000},{"tipo":"Consórcio não contemplado","descricao":"CONSORCIO NÃO CONTEMPLADO","valor":9558.88},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA","valor":192000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 40002541626 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'maria-do-carmo'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'AM'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=mateus-simoes ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 2904492.23, '[{"tipo":"Outros bens móveis","descricao":"BEM DE CHRISTIANA - EMPRESTIMO PARA HELENICE FRANCISCA SANTOS - (240 PARCELAS DE R$600,00 VENCIVEIS A PARTIR DE 01/05/2018)","valor":53800},{"tipo":"Outros bens móveis","descricao":"BEM DE CHRISTIANA - DEPOSITO JUDICIAL RELATIVO A IR GANHO DE CAPITAL - ESPOLIO DE JOAO HENRIQUE RENAULT - MANDADO DE SEGURANCA 0024221- 69.2016.4.01.3800","valor":0},{"tipo":"Outros bens móveis","descricao":"50% DE 58,57% DAS QUOTAS: ICC INDÚSTRIA COMÉRCIO E CONSTRUÇÕES LTDA","valor":311869.85},{"tipo":"Outros bens móveis","descricao":"50% DE 40% DAS QUOTAS + AFAC: MAGURO PARTICIPAÇÕES LTDA","valor":102780},{"tipo":"Outros bens móveis","descricao":"LUCROS DISTRIBUÍDOS E NAO PAGOS DE ALMEIDA BEHRENS CARVALHO SOCIEDADE DE ADVOGADOS","valor":0},{"tipo":"Outros bens móveis","descricao":"BITCOIN BTC (MERCADO LIVRE) - EM 31/12/2025 - INFORMADO POR CNPJ [documento mascarado]","valor":0},{"tipo":"Outros bens móveis","descricao":"AFAC NA ALPHABTO PARTICIPAÇÕES LTDA","valor":0},{"tipo":"Outros bens móveis","descricao":"LUCROS DISTRIBUÍDOS E NÃO PAGOS DE ALMEIDA BEHRENS CARVALHO CONSULTORIA LTDA - ATA DE 23/12/2025","valor":0},{"tipo":"Outros créditos e poupança vinculados","descricao":"50% DO SALDO: POUPANCA CAIXA","valor":42.78},{"tipo":"Outros bens móveis","descricao":"50% DE 39,98% DAS QUOTAS: ALMEIDA BEHRENS CARVALHO SOCIEDADE DE ADVOGADOS","valor":6438},{"tipo":"Outros bens móveis","descricao":"50% DE 40% DAS QUOTAS + AFAC: MAGURO PARTICIPAÇÕES LTDA","valor":102780},{"tipo":"Outros bens móveis","descricao":"50% DO SALDO: RENDA FIXA XP INVESTIMENTOS CCTVM S/A","valor":7500},{"tipo":"Depósito bancário em conta corrente no País","descricao":"50% DO SALDO: CDB - SANTANDER","valor":157701.58},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"50% DO SALDO: BTG PACTUAL TESOURO SELIC FUNDO DE INVESTIMENTO RENDA FIXA","valor":6802.75},{"tipo":"Outros bens móveis","descricao":"50% DE 55% DAS QUOTAS + AFAC: ALBECA PARTICIPACOES LTDA.","valor":89420},{"tipo":"Apartamento","descricao":"50% DE 20% DO APARTAMENTO 501, ED. LIMOGES, EM BH/MG, COM USUFRUTO VITALICIO DE CLELIA RENAULT.","valor":114325.62},{"tipo":"Ouro, ativo financeiro","descricao":"12.500 U$ (DOZE MIL E QUINHENTOS DÓLARES)","valor":37562.5},{"tipo":"Outros bens móveis","descricao":"AFAC NA MAGURO PARTICIPAÇÕES LTDA","valor":0},{"tipo":"Apartamento","descricao":"50% DO APARTAMENTO 207 ED ALAGOAS EM BH/MG.","valor":107500},{"tipo":"Casa","descricao":"50% DA CASA NA ALAMEDA MERANO, 350 EM BH/MG. 1.786.835,67","valor":1786835.67},{"tipo":"Outros bens móveis","descricao":"50% DO SALDO: BTG PACTUAL - CC","valor":219.12},{"tipo":"Outros bens móveis","descricao":"50% DO SALDO: CAIXA - CC","valor":225.59},{"tipo":"Outros bens móveis","descricao":"50% DE 39,97% DAS QUOTAS: ALMEIDA BEHRENS CARVALHO CONSULTORIA LTDA.","valor":600},{"tipo":"Outros bens móveis","descricao":"50% DE QUOTAS: SICOOB COFAL - CAPITAL SOCIAL","valor":110.38},{"tipo":"Quotas ou quinhões de capital","descricao":"BEM DE CHRISTIANA - QUOTA AUTOMOVEL CLUBE - N.O 333","valor":1000},{"tipo":"Outros bens móveis","descricao":"AFAC JUNTO A ALBECA PARTCIPACOES LTDA., CONSTITUIDA EM 19 DE MARCO DE 2012","valor":0},{"tipo":"Outros bens móveis","descricao":"50% DO SALDO: SICCOB COFAL - CC","valor":210.62},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"50% DO SALDO: CDB - ITAU","valor":16767.77}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 130002541911 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'mateus-simoes'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'MG'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=omar-aziz ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 2070608.00, '[{"tipo":"Terreno","descricao":"LOTES DE TERRA","valor":320000},{"tipo":"Casa","descricao":"CASA","valor":670133.39},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÃO FINANCEIRA","valor":125.84},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"FUNDO DE INVESTIMENTO - RENDA FIXA","valor":993654.23},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÃO FINANCEIRA","valor":86694.54}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 40002532272 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'omar-aziz'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'AM'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=otaviano-pivetta ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 575680870.95, '[{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA REGISTRO DO FLUXO DE PAG. BANCO DO BRASIL ¿ AG. ****-*, CONTA ****-*","valor":38652.68},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA CORRENTE BANCO DO BRASIL ¿ AG. ****-*, CONTA ****-*","valor":134.77},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA CORRENTE BANCO SICREDI ¿ AG. ****, CONTA ***-*","valor":577.47},{"tipo":"Caderneta de poupança","descricao":"POUPANÇA BANCO S****** ¿ AG. ****, CONTA ***-*","valor":0.48},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO RENDA FIXA BANCO S***** ¿ AG. ****, CONTA *****-*","valor":0.17},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"AÇÕES ¿ O P******* P************* S.A. (CNPJ **.***.***/****-**)","valor":182528232},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA CORRENTE CAIXA ECONÔMICA FEDERAL ¿ AG. ****","valor":489.11},{"tipo":"OUTROS BENS E DIREITOS","descricao":"ADIANTAMENTO PARA FUTURO AUMENTO DE CAPITAL ¿ C******** (CNPJ **.***.***/****-**)","valor":10693.35},{"tipo":"Quotas ou quinhões de capital","descricao":"COTAS DE CAPITAL ¿ V******** S** P**** L******** DE T********** LTDA (CNPJ **.***.***/****-**)","valor":65000},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"AÇÕES ¿ V*** N*** P************* S.A. (CNPJ **.***.***/****-**)","valor":95603196},{"tipo":"Outros fundos","descricao":"D** E********* FUNDO DE INVESTIMENTO MULTIMERCADO ¿ INVESTIMENTO NO EXTERIOR (CNPJ FUNDO **.***.***/****- **)","valor":37179274.07},{"tipo":"Outros créditos e poupança vinculados","descricao":"VALOR A RECEBER REFERENTE CESSÃO DE DIREITOS PARA V*** N*** P************* S.A. (CNPJ **.***.***/****-**)","valor":378000},{"tipo":"Outros fundos","descricao":"APLICAÇÃO RF REF DI PLUS ÁGIL ¿ BANCO DO BRASIL (CNPJ FUNDO **.***.***/****-**)","valor":4806.73},{"tipo":"Outros fundos","descricao":"V* FUNDO DE INVESTIMENTO MULTIMERCADO CRÉDITO PRIVADO ¿ INVESTIMENTO NO EXTERIOR (CNPJ FUNDO **.***.***/****-**)","valor":257235023.95},{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"VGBL ¿ B********* SEGUROS E PREVIDÊNCIA S.A. (CNPJ **.***.***/****-**","valor":550000},{"tipo":"Outros créditos e poupança vinculados","descricao":"EMPRÉSTIMO A E****** J*** P****** (CPF ***.***.***-**)","valor":330000},{"tipo":"Quotas ou quinhões de capital","descricao":"COTAS DE CAPITAL ¿ S***** C******* (CNPJ **.***.***/****-**)","valor":3103.68},{"tipo":"Outros créditos e poupança vinculados","descricao":"EMPRÉSTIMO A O**** J***** P****** (CPF ***.***.***-**)","valor":362500},{"tipo":"Quotas ou quinhões de capital","descricao":"COTAS DE CAPITAL ¿ R**** R******* C***** N**** LTDA (CNPJ **.***.***/****-**)","valor":543334},{"tipo":"Quotas ou quinhões de capital","descricao":"COTAS DE CAPITAL ¿ C.C.P.I. O*** V**** DO M*** G***** (CNPJ **.***.***/****-**)","valor":838525.09},{"tipo":"Quotas ou quinhões de capital","descricao":"COTAS DE CAPITAL ¿ C******** - COOPERATIVA DE E***** D*** M** (CNPJ **.***.***/****-**)","valor":3627.4},{"tipo":"Quotas ou quinhões de capital","descricao":"COTAS DE CAPITAL ¿ C******** - COOPERATIVA DE B************* (CNPJ **.***.***/****-**)","valor":5700}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 110002551480 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'otaviano-pivetta'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'MT'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=patrus-ananias ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1247212.54, '[{"tipo":"Outros bens imóveis","descricao":"50% DE GARAGEM EM BELO HORIZONTE","valor":2738.75},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO DE PASSEIO","valor":49210},{"tipo":"Casa","descricao":"3,845% DE CASA RESIDENCIAL EM BOCAIÚVA","valor":4103.85},{"tipo":"Apartamento","descricao":"50% DE APARTAMENTO EM BELO HORIZONTE","valor":94495.5},{"tipo":"Apartamento","descricao":"3,845% DE APARTAMENTO EM BELO HORIZONTE","valor":15244.57},{"tipo":"Terreno","descricao":"50% DE LOTE EM BRUMADINHO","valor":44874.94},{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"PREVIDÊNCIA PRIVADA","valor":625481.71},{"tipo":"Outros fundos","descricao":"RENDA FIXA LONGO PRAZO","valor":385603.11},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE","valor":25460.11}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 130002550464 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'patrus-ananias'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'MG'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=paula-belmonte ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 10844220.79, '[{"tipo":"Crédito decorrente de empréstimo","descricao":"MUTUO COM EMPRESAS EM QUE É SÓCIA","valor":2292635.53},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÕES FINANCEIRAS","valor":2989385.26},{"tipo":"Outras participações societárias","descricao":"COTAS DE SOCIEDADE DE EMPRESAS","valor":5307200},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEICULOS","valor":255000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 70002552965 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'paula-belmonte'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'DF'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=pazolini ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1002342.77, '[{"tipo":"Apartamento","descricao":"50% DE APARTAMENTO EM GUARAPARI","valor":45000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE BANESTES","valor":585.57},{"tipo":"Outros créditos e poupança vinculados","descricao":"POUPANÇA BRADESCO","valor":32957.09},{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"VGBL BRADESCO","valor":100000},{"tipo":"Apartamento","descricao":"50% DE APARTAMENTO EM JARDIM DA PENHA","valor":195000},{"tipo":"Apartamento","descricao":"50% DE APARTAMENTO EM BARRO VERMELHO","valor":628514},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"CDB BRADESCO","valor":286.11}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 80002552682 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'pazolini'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'ES'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=priscila-voigt ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1000.00, '[{"tipo":"Depósito bancário em conta corrente no País","descricao":"DINHEIRO","valor":1000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 210002533355 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'priscila-voigt'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RS'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=professora-dorinha ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 2352740.28, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CAMIONETE","valor":321346},{"tipo":"Outros bens imóveis","descricao":"50% DE IMÓVEL RESIDENCIAL","valor":1555513.69},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"SALDO EM CONTA CORRENTE/CDB DI","valor":475880.59}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 270002544599 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'professora-dorinha'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'TO'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=rafael-fonteles ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1799948.60, '[{"tipo":"Outros bens imóveis","descricao":"IMÓVEL EM TERESINA CORRESPONDENTE A 20HA DE UM TOTAL DE 60HS, FINANCIADO","valor":950000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUTOMÓVEL CHEVROLET S10 LTZ DD4A 2021\\2022","valor":270000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUTOMÓVEL SW4 2021-2021","valor":290000},{"tipo":"Outras aplicações e Investimentos","descricao":"PARTICIPAÇÃO NO CAPITAL SOCIAL NA EMPRESA TF3 PARTICIPAÇÕES S.A. COM 79.200 AÇÕES","valor":198000},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO EM ESPÉCIE","valor":60000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA NO BANCO DO BRASIL","valor":27574.23},{"tipo":"Caderneta de poupança","descricao":"SALDO EM CARDENETA DE PUPANÇA NA CEF","valor":4374.37}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 180002532987 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'rafael-fonteles'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PI'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=ralf-zimmer ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1426599.97, '[{"tipo":"OUTROS BENS E DIREITOS","descricao":"IMÓVEL","valor":1365726},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUTOMOVEL","valor":60873.97}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 240002552157 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'ralf-zimmer'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'SC'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=raquel-lyra ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 359498.33, '[{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÕES FINANCEIRAS DIVERSAS","valor":69923.33},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITO EM CONTA BANCÁRIA","valor":1},{"tipo":"Apartamento","descricao":"LOCALIZADO EM JABOATÃO DOS GUARARAPES/PE","valor":289574}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 170002537227 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'raquel-lyra'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PE'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=ravenna-castro ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 91600.52, '[{"tipo":"Depósito bancário em conta corrente no País","descricao":"BANCO DO BRASIL AG 3507-6 CC 81280-3","valor":10.52},{"tipo":"Caderneta de poupança","descricao":"CAIXA ECONÔMICA FEDERAL AG 0029 CONTA 7833582582","valor":55},{"tipo":"Apartamento","descricao":"ÁGIO DE APARTAMENTO FINANCIADO","valor":60000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"NU PAGAMENTOS AG 0001 CONTA 00000000000044906811","valor":1535},{"tipo":"Caderneta de poupança","descricao":"BANCO DO BRASIL AG 3507-6 CC 81280-3","valor":0},{"tipo":"Apartamento","descricao":"ÁGIO DE APARTAMENTO FINANCIADO","valor":30000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 180002548388 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'ravenna-castro'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PI'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=rejane-oliveira ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 498000.00, '[{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":480000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO","valor":18000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 210002541367 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'rejane-oliveira'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RS'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=renan-santos ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 795089.00, '[{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS DE CAPITAL","valor":100000},{"tipo":"Bem relacionado com o exercício da atividade autônoma","descricao":"BEM RELACIONADO COM O EXERCÍCIO DA ATIVIDADE AUTÔNOMA","valor":275329},{"tipo":"Outras participações societárias","descricao":"QUOTAS DE SOCIEDADE","valor":119760},{"tipo":"Outros créditos e poupança vinculados","descricao":"OUTROS CRÉDITOS E POUPANÇA VINCULADOS","valor":300000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 280002540694 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'renan-santos'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Presidente'
  AND c.estado IS NULL
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=requiao-filho ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1876342.14, '[{"tipo":"Consórcio não contemplado","descricao":"CONSORCIO SERVOPA","valor":22359.86},{"tipo":"Outros créditos e poupança vinculados","descricao":"BB POUPANCA OURO","valor":3410.27},{"tipo":"Outros créditos e poupança vinculados","descricao":"BB CP ESTILO","valor":13731.13},{"tipo":"Outros bens imóveis","descricao":"50% GARAGEM NUM 32 EM BAL. CAMBORIU","valor":5000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUDI RS4 2001","valor":130000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"NISSAN X TERRA 2003","valor":75000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"ITAU APLICAÇÃO EM CDB","valor":28432.88},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MOTO S1000RR 2025","valor":135648},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VOLKS PASSAT 1999","valor":8000},{"tipo":"Outros créditos e poupança vinculados","descricao":"CEF CONTA CORRENTE","valor":9760},{"tipo":"Casa","descricao":"RESIDENCIA NO BAIRRO CAMPO COMPRIDO/ CURITIBA","valor":1445000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 160002547666 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'requiao-filho'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PR'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=ricardo-ferraco ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 27668789.55, '[{"tipo":"Apartamento","descricao":"APARTAMENTO (HERANÇA - PARTICIPAÇÕES DE 12,50%)","valor":26023.97},{"tipo":"Apartamento","descricao":"APARTAMENTO (HERANÇA - PARTICIPAÇÕES DE 12,50%)","valor":56072.33},{"tipo":"Apartamento","descricao":"APARTAMENTO (HERANÇA - PARTICIPAÇÕES DE 12,50%)","valor":16210.5},{"tipo":"Apartamento","descricao":"APARTAMENTO (HERANÇA - PARTICIPAÇÕES DE 12,50%)","valor":16210.5},{"tipo":"Outros bens imóveis","descricao":"2 VAGAS DE GARAGEM(HERANÇA - PARTICIPAÇÕES DE 12,50% E 14,29%)","valor":893},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"OUTRAS APLICAÇÕES E INVESTIMENTOS (POUPANÇA, APLICAÇÃO FINANCEIRA , RENDA FIXA, DEBÊNTURES DE INFRAESTRUTURA, LCA, CRÉDITO PRIVADO E FUNDO DE INVESTIMENTO IMOBILIÁRIO)","valor":16921087.71},{"tipo":"Apartamento","descricao":"APARTAMENTO (HERANÇA - PARTICIPAÇÕES DE 12,50 %)","valor":10453.93},{"tipo":"Apartamento","descricao":"APARTAMENTO (HERANÇA - PARTICIPAÇÕES DE 12,50%)","valor":7165.12},{"tipo":"OUTROS BENS E DIREITOS","descricao":"BENS IMOBILIÁRIOS","valor":152000},{"tipo":"Apartamento","descricao":"APARTAMENTO (HERANÇA - PARTICIPAÇÕES DE 12,50%)","valor":9339.63},{"tipo":"Casa","descricao":"CASA ( HERANÇA - PARTICIPAÇÃO DE 12,50%)","valor":148075.29},{"tipo":"Apartamento","descricao":"APARTAMENTO (HERANÇA - PARTICIPAÇÕES DE 12,50%)","valor":16210.5},{"tipo":"Terreno","descricao":"TERRENO ( HERANÇA - PARTICIPAÇÃO DE 12,50%)","valor":8934.97},{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":984964.93},{"tipo":"Apartamento","descricao":"APARTAMENTO (HERANÇA - PARTICIPAÇÕES DE 12,50%)","valor":10453.93},{"tipo":"Apartamento","descricao":"APARTAMENTO (HERANÇA - PARTICIPAÇÕES DE 14,29%)","valor":10677.07},{"tipo":"Apartamento","descricao":"APARTAMENTO (HERANÇA - PARTICIPAÇÕES DE 12,50%)","valor":20551.08},{"tipo":"Apartamento","descricao":"APARTAMENTO (DOAÇÃO - PARTICIPAÇÃO E 25%)","valor":46265.73},{"tipo":"Casa","descricao":"CASA (HERANÇA - PARTICIPAÇÃO 14,29%)","valor":1143.2},{"tipo":"Outras participações societárias","descricao":"OUTRAS PARTICIPAÇÕES SOCIETÁRIAS","valor":3169799},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"AÇÕES","valor":53816},{"tipo":"Apartamento","descricao":"APARTAMENTO (HERANÇA - PARTICIPAÇÕES DE 12,50%)","valor":16210.5},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITO BANCÁRIO EM CONTA CORRENTE NO PAÍS","valor":56367.07},{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":3615450},{"tipo":"Crédito decorrente de empréstimo","descricao":"CRÉDITO DECORRENTE DE EMPRÉSTIMO","valor":70000},{"tipo":"Apartamento","descricao":"APARTAMENTO (HERANÇA - PARTICIPAÇÕES DE 12,50%)","valor":13879.46},{"tipo":"Terreno","descricao":"TERRENO RURAL (PARTICIPAÇÃO DE 50%)","valor":176316},{"tipo":"Sala ou conjunto","descricao":"2 SALAS COMERCIAIS ( HERANÇA - PARTICIPAÇÃO DE 12,50% SOBRE CADA BEM)","valor":7741.28},{"tipo":"Apartamento","descricao":"APARTAMENTO (HERANÇA - PARTICIPAÇÕES DE 12,50%)","valor":12521.69},{"tipo":"Crédito decorrente de empréstimo","descricao":"CRÉDITO DECORRENTE DE EMPRÉSTIMO","valor":62084.16},{"tipo":"Terreno","descricao":"LOTE","valor":1951871}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 80002552172 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'ricardo-ferraco'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'ES'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=roberio-paulino ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 2194367.82, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO","valor":85667.82},{"tipo":"Apartamento","descricao":"RESIDENCIAL","valor":386590},{"tipo":"Apartamento","descricao":"RESIDENCIAL","valor":770440},{"tipo":"Apartamento","descricao":"RESIDENCIAL","valor":362800},{"tipo":"Apartamento","descricao":"RESIDENCIAL","valor":301150},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO","valor":20000},{"tipo":"Apartamento","descricao":"RESIDENCIAL","valor":267720}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 200002546757 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'roberio-paulino'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RN'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=roberto-cidade ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 4285400.80, '[{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA POUPANÇA CAIXA ECONOMICA FEDERAL","valor":22003.93},{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":450000},{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":492809.9},{"tipo":"Terreno","descricao":"TERRENO","valor":1350480},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BRADESCO (CBD)","valor":158337.86},{"tipo":"Depósito bancário em conta corrente no País","descricao":"BRADESCO","valor":1},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO EM ESPÉCIE","valor":150000},{"tipo":"Plano PAIT e caderneta de pecúlio","descricao":"PECULIO DA PREVIDENCIA PRIVADA","valor":16768.11},{"tipo":"Terreno","descricao":"TERRENO","valor":300000},{"tipo":"Terreno","descricao":"TERRENO","valor":1220000},{"tipo":"VGBL - Vida Gerador de Benefício Livre","descricao":"PREMIOS ACUMULADOS EM VGBL","valor":100000},{"tipo":"Terreno","descricao":"TERRENO/FRAÇÃO - LOTE","valor":25000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 40002541741 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'roberto-cidade'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'AM'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=robson-raymundo ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 900000.00, '[{"tipo":"Apartamento","descricao":"1 APARTAMENTO EM ÁGUAS CLARAS, BRASÍLIA-DF","valor":900000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 70002535930 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'robson-raymundo'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'DF'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=ronaldo-mansur ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 91397.22, '[{"tipo":"Caderneta de poupança","descricao":"CONTA POUPANÇA NA CEF","valor":923.52},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE NO BANCO DO BRASIL","valor":423.7},{"tipo":"Caderneta de poupança","descricao":"CONTA POUPANÇA BANCO DO BRASIL","valor":50},{"tipo":"Casa","descricao":"IMÓVEL RESIDENCIAL, LOCALIZADA NA CIDADE DE SALVADOR BA - ADIQUIRIDA COM O FGTS NO ANO DE 2024, SENDO R$ 59.827,52 COM RECURSOS DE FGTS E R$ 172,48 COM RECURSOS PRÓPRIOS.","valor":60000},{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO SOCIETÁRIA EM EMPRESA (BABAYAGA)","valor":30000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 50002532269 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'ronaldo-mansur'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'BA'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=samara-mineiro ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 69196.63, '[{"tipo":"OUTROS BENS E DIREITOS","descricao":"VEÍCULO AUTOMOTOR TERRESTRE: HYUNDAI HB20 ADQUIRIDO POR MEIO DE FINANCIAMENTO (ALIENAÇÃO FIDUCIÁRIA)","valor":60000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"DIREITOS RELATIVOS À AQUISIÇÃO DE APARTAMENTO RESIDENCIAL PELO PROGRAMA MINHA CASA MINHA VIDA, IMÓVEL AINDA EM CONSTRUÇÃO","valor":9196.63}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 70002537111 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'samara-mineiro'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'DF'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=samuel-costa ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 3631297.68, '[{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÕES FINANCEIRAS E LETRAS DE CRÉDITO","valor":240000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"DUCATI MONSTER, VERMELHA","valor":48000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"BRASIL 364 COMUNICAÇÃO LTDA","valor":100000},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DISPONIBILIDADE PARA INVESTIMENTO","valor":200000},{"tipo":"Caderneta de poupança","descricao":"CADERNETA DE POUPANÇA","valor":7870},{"tipo":"Prédio comercial","descricao":"50% DE PRÉDIO COMERCIAL LOCALIZADO NA AVENIDA AMAZONAS, EM PORTO VELHO, COMPOSTO POR UM PONTO COMERCIAL E QUATRO SALAS","valor":500000},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO EM ESPÉCIE","valor":70000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"GARAGEM NO RESIDENCIAL CASTELLATO","valor":70000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CHEVROLET S10, PRATA, FLEX","valor":87000},{"tipo":"Apartamento","descricao":"APARTAMENTO NO RESIDENCIAL CASTELLATO, COM DUAS VAGAS DE GARAGEM","valor":680000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"HILUX SRV 4X4, PRETA","valor":210000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"SOCIEDADE INDIVIDUAL DE ADVOCACIA","valor":200000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"HILUX SW4, PRATA","valor":320000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"HB20, PRETO","valor":45000},{"tipo":"Casa","descricao":"CASA DE 120 M² EM PORTO VELHO, EM TERRENO DE 360 M²","valor":150000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"PROPRIEDADE RURAL EM CANUTAMA (AM)","valor":130000},{"tipo":"Terreno","descricao":"50% DE TERRENO E CONSTRUÇÃO DE CASA NO CONDOMÍNIO VERANA","valor":555000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA CORRENTE","valor":18427.68}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 220002550927 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'samuel-costa'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RO'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=sandro-alex ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1667125.53, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"MOTOCICLETA","valor":20000},{"tipo":"Outros bens móveis","descricao":"ITENS PESSOAIS","valor":13173},{"tipo":"Outras aplicações e Investimentos","descricao":"CONTA CAPITAL JUNTO À COOPERATIVA DE CRÉDITO, POUPANÇA E INVESTIMENTOS CAMPOS GERAIS","valor":2922.68},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA CORRENTE JUNTO AO BANCO DO BRASIL","valor":146.64},{"tipo":"Caderneta de poupança","descricao":"CADERNETA DE POUPANÇA JUNTO AO SICREDI","valor":17.75},{"tipo":"Outros depósitos à vista e numerário","descricao":"DISPONIBILIDADE FINANCEIRA","valor":220000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA CORRENTE JUNTO AO SICREDI CAMPOS GERAIS","valor":10539.96},{"tipo":"Quotas ou quinhões de capital","descricao":"COTA EMPRESARIAL","valor":75000},{"tipo":"Casa","descricao":"50% DE CASA RESIDENCIAL","valor":1013076},{"tipo":"Outras aplicações e Investimentos","descricao":"TÍTULO PATRIMONIAL","valor":2500},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO FINANCEIRA DE RENDA FIXA - BB CDB RENDE FÁCIL - JUNTO AO BANCO DO BRASIL","valor":56749.5},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO AUTOMOTOR","valor":253000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 160002549553 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'sandro-alex'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PR'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=saulo-arcangeli ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 656409.64, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEICULO PRISMA LT 1.4 2015/2016","valor":37000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"HYUNDAY HB20 1.0 SENSE 2023/2024","valor":62200},{"tipo":"Outras aplicações e Investimentos","descricao":"BB MULTIMERCADO LP JUROS E MOEDAS FUNDO DE INVESTIMENTO EM COTAS DE FUNDOS DE INVESTIMENTO","valor":38990.68},{"tipo":"Apartamento","descricao":"IMOVEL FINANCIADO JUNTO A CAIXA ECONOMICA FEDERAL, CONTRATO 144441648088-0, PRAZO FINANCIADO: 366 MESES, PRAZO REMANESCENTE : 359 MESES, ENTRADA : R$ 100.175,00, TOTAL FINANCIADO : R$ 219.825,00","valor":320000},{"tipo":"Outras aplicações e Investimentos","descricao":"BB RENDA FIXA LONGO PRAZO HIGH FUNDO DE INVESTIMENTO EM COTAS DE FUNDOS DE INVESTIMENTO","valor":188632.52},{"tipo":"Outras aplicações e Investimentos","descricao":"BB MULTIMERCADO OURO FUNDO DE INVESTIMENTO FINANCEIRO RESPONSABILIDADE LIMITADA - INFORMADO","valor":9586.44}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 100002534190 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'saulo-arcangeli'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'MA'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=sergio-moro-gov-pr ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1036642.25, '[{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"LETRAS DE CRÉDITO IMOBILIÁRIO VINCULADAS AO ITAÚ UNIBANCO","valor":70615},{"tipo":"Quotas ou quinhões de capital","descricao":"COTAS DA EMPRESA MORO CONSULTORIA E ASSESSORIA EM GESTÃO EMPRESARIAL DE RISCOS LTDA.","valor":1000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"LETRAS DE CRÉDITO DO AGRONEGÓCIO VINCULADAS AO ITAÚ UNIBANCO","valor":60400},{"tipo":"Outros créditos e poupança vinculados","descricao":"CONTA POUPANÇA NA CAIXA ECONÔMICA FEDERAL","valor":3061.04},{"tipo":"Depósito bancário em conta corrente no exterior","descricao":"CONTA NO EXTERIOR","valor":185922},{"tipo":"Outras aplicações e Investimentos","descricao":"FUNDOS VINCULADOS AO ITAÚ INVESTIMENTOS","valor":239738.26},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE NO BANCO DO BRASIL","valor":305.63},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTAS CORRENTES NA CAIXA ECONÔMICA FEDERAL - PESSOAL E GABINETE","valor":37137.25},{"tipo":"Prédio comercial","descricao":"APARTAMENTO 703 (SALA COMERCIAL EM PRÉDIO), EDIFÍCIO ALBERTO ABUJAMRA","valor":45000},{"tipo":"Prédio residencial","descricao":"APARTAMENTO NO EDIFÍCIO FIT MARUMBI, FINANCIADO JUNTO À CAIXA ECONÔMICA FEDERAL","valor":238463.07},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TIGUAN ADQUIRIDO EM 2020","valor":155000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"Letra de Crédito do Agronegócio vinculada à Itaú Corretora","valor":0}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 160002540833 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'sergio-moro-gov-pr'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'PR'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=serley-leal ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 88094.69, '[{"tipo":"Outras aplicações e Investimentos","descricao":"DEMAIS APLICAÇÕES","valor":1842},{"tipo":"OUTROS BENS E DIREITOS","descricao":"PREVIDÊNCIA PRIVADA","valor":23717.54},{"tipo":"Ações (inclusive as provenientes de linha telefônica)","descricao":"FUNDOS E AÇÕES","valor":21035.15},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"RENAULT SANDERO 2020","valor":41500}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 60002533729 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'serley-leal'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'CE'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=tarcisio-gov-sp ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 2696808.40, '[{"tipo":"Caderneta de poupança","descricao":"SALDO EM CADERNETA DA POUPANÇA - POUPEX","valor":501.68},{"tipo":"Outros bens imóveis","descricao":"IMOVEL EM BRASÍLIA","valor":2137160},{"tipo":"Caderneta de poupança","descricao":"POUPANÇA OURO","valor":525624.39},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"RENDA FIXA","valor":33522.33}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 250002541303 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'tarcisio-gov-sp'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'SP'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=thor-dantas ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 761462.79, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"TOYOTA ETIOS HB CROSS ANO 2017/2018","valor":60000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BBDC4","valor":33580},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VOLKSWAGEN NIVUS HL TSI ANO 2023","valor":139900},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA DE CAPITAL DA EMPRESA LAGE E DANTAS SOCIEDADE SIMPLES ME","valor":1000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB NTNB PRINC","valor":115985.98},{"tipo":"Outras aplicações e Investimentos","descricao":"ACOES SMALL CAPS","valor":1000},{"tipo":"Outras aplicações e Investimentos","descricao":"AÇÕES BTC","valor":1000},{"tipo":"Depósito bancário em conta corrente no exterior","descricao":"BB AMERICAS - PERSONAL MONEY MARKET","valor":24868.88},{"tipo":"Outras aplicações e Investimentos","descricao":"COTAS DE INVESCO QQQ(QQQ) CUSTODIADAS NA CORRETORADRIVEWEALTH, LLC.","valor":6028.7},{"tipo":"Outros créditos e poupança vinculados","descricao":"BANCO CEF - POUPANÇA","valor":437.82},{"tipo":"Outras aplicações e Investimentos","descricao":"KNCR11 25","valor":22525},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"CORRETORA DRIVEWEALTH, LLC","valor":0},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BBAS3 - 600","valor":58308.06},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA DE CAPITAL DA EMPRESA LAGE E DANTAS EDUCACAO MEDICA LTDA","valor":1000},{"tipo":"Outras aplicações e Investimentos","descricao":"BB ACOES FX GLOBAL SELECT EQUITY VALUE INVESTIMENTO NO EXTERIOR FIF RESPONSABILIDADE LIMITADA","valor":2000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BTG - LCA","valor":18132.68},{"tipo":"Depósito bancário em conta corrente no exterior","descricao":"BANCO COMMUNITY FEDERAL SAVINGS BANK","valor":1},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB LTN","valor":10000.36},{"tipo":"Outras aplicações e Investimentos","descricao":"COTAS DE ISHARESTREASURY FLOATING RATE BOND ETF(TFLO) CUSTODIADAS NA CORRETORADRIVEWEALTH, LLC","valor":9805.75},{"tipo":"Outras aplicações e Investimentos","descricao":"ACOES TECNOLOGIA BDR","valor":1000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"COTAS DE ARK INNOVATIONETF (ARKK) CUSTODIADAS NACORRETORA DRIVEWEALTH, LLC","valor":2830.38},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB CONTA CORRENTE","valor":0},{"tipo":"Outras aplicações e Investimentos","descricao":"COTAS DE ISHARESBITCOIN TRUST (IBIT) CUSTODIADASNA CORRETORA DRIVEWEALTH, LLC","valor":1996.14},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"COTAS DE S P 500VANGUARD ETF (VOO) CUSTODIADASNA CORRETORA DRIVEWEALTH, LLC","valor":20086.93},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB RENDA FIXA LONGO PRAZO HIGH FUNDO DE INVESTIMENTO EM COTAS DE FUNDOS DE INVESTIMENTO","valor":96017.71},{"tipo":"Outros créditos e poupança vinculados","descricao":"POUPANCA - BANCO DO BRASIL","valor":0.06},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB CDB RENDE FACIL","valor":133957.34}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 10002550719 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'thor-dantas'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'AC'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=tiao-bocalom ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1216500.00, '[{"tipo":"Terreno","descricao":"83% DE LOTE DE TERRA URBANA EM ACRELÂNDIA","valor":80000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CAMIONETE AMAROK 2015","valor":90000},{"tipo":"Quotas ou quinhões de capital","descricao":"100% DAS QUOTAS DE CAPITAL DA EMPRESA SB RODRIGUES - INATIVA","valor":4000},{"tipo":"Outros bens imóveis","descricao":"TERRA RURAL NO RAMAL FLORESTA COM 81 HECTARES","valor":1000000},{"tipo":"Quotas ou quinhões de capital","descricao":"50% DAS QUOTAS DE CAPITAL DA EMPRESA INDUSTRIA E COMERCIO DE MADEIRAS COMANO - INATIVA","valor":6500},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO TOTAL EM CONTAS CORRENTE BANCO DO BRASIL, BRADESCO, BASA E CAIXA ECONÔMICA FEDERAL","valor":8000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"TOYOTA COROLLA 2007","valor":28000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 10002544015 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'tiao-bocalom'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'AC'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=valmir-de-francisquinho ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 258000.00, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"TOYOTA SW4","valor":233000},{"tipo":"Dinheiro em espécie - moeda estrangeira","descricao":"EM ESPÉCIE","valor":25000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 260002532010 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'valmir-de-francisquinho'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'SE'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=vicentinho-junior ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 3983398.00, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TOYOTA SW4, ANO 2025/2025","valor":383000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO FORD MAVERICK ANO 1976/1976","valor":30000},{"tipo":"Quotas ou quinhões de capital","descricao":"100% DAS QUOTAS DE CAPITAL DA EMPRESA AGROPECUÁRIA SÃO BENTO LTDA","valor":2380000},{"tipo":"Outras aplicações e Investimentos","descricao":"SALDO DE INVESTIMETOS EM DETRAS DE RENDA FIXA ¿ CEF","valor":493905},{"tipo":"Terreno","descricao":"LOTE DE TERRAS RURAIS (CHÁCARA) NO MUNICÍPIO DE MATEIROS-TO","valor":144000},{"tipo":"Sala ou conjunto","descricao":"SALA COMERCIAL","valor":100000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO HILUX SRX, ANO 2023/2024","valor":300000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA CORRENTE DA CAIXA ECONÔMICA FEDERAL","valor":49767},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO EM CONTA CORRENTE DO BANCO SICREDI S/A","valor":2726},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"NUMERÁRIO EM ESPÉCIE","valor":100000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 270002544544 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'vicentinho-junior'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'TO'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=vivian-mendes ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 80000.00, '[{"tipo":"Casa","descricao":"RESIDÊNCIA","valor":80000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 250002544912 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'vivian-mendes'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'SP'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=wellington-fagundes ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 13132463.00, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO MARCA VOLKSWAGEM I/VW AMAROK","valor":200000},{"tipo":"Outros bens móveis","descricao":"584 ¿ CABEÇAS DE GADO","valor":1636500},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO MARCA FIAT/ELBA WEEKEND CINZA","valor":2000},{"tipo":"Apartamento","descricao":"33% - APARTAMENTO NÚMERO 906, COM AREA PRIVATIVA 64,77M2, VILA JARDIM","valor":46666},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BANCO BRADESCO SA","valor":18486},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEICULO MARCA TOYOTA SWSRXA4RD ¿ ANO 2024","valor":334000},{"tipo":"Outros bens imóveis","descricao":"50%- DE UMA AREA TERRAS PASTAIS E LAVRADIAS C/746,00 HA DENOMINADA GLEBA PAURO - JUSCIMEIRA","valor":69397},{"tipo":"Outras aplicações e Investimentos","descricao":"BANCO BRADESCO SA - CDB","valor":2065158},{"tipo":"Outras aplicações e Investimentos","descricao":"BANCO DO BRASIL","valor":8106},{"tipo":"Aeronave","descricao":"AERONAVE MODELO EMB. 810C - ANO DE FABRICACAO 1980 - PREFIXO PT-RBO","valor":150000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO MARCA TOYOTA CCROSS XRV HYBRID","valor":180000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO MARCA - RENEGADE 1.3 TURBO T270","valor":117000},{"tipo":"Casa","descricao":"UMA CASA DE ALVENARIA COM TERRENO DE 300M2 - C/CONSTRUCÃO DE 550,00M2 - ENDERECO RUA LAURO MELO,34, PARQUE REAL, RONDONOPOLIS- MT","valor":126943},{"tipo":"Outras aplicações e Investimentos","descricao":"BANCO BRADESCO SA","valor":1018808},{"tipo":"Outros bens móveis","descricao":"13- EQUINO E MUAR","valor":49000},{"tipo":"Apartamento","descricao":"APARTAMENTO MEDINDO NÚMERO 2203, COM AREA PRIVATIVA 64,77M2, VILA JARDIM","valor":140000},{"tipo":"Outros bens imóveis","descricao":"50% DE UMA AREA 30 HEC. DE TERRAS PASTAIS E LAVRADIAS C/BALNEARIO DE ÁGUAS QUENTES E DEMAIS BENFEITURIAS C/58.632 HAS MUNICIPIO JUSCIMEIRA-MT","valor":69397},{"tipo":"Outros bens móveis","descricao":"15- BUFALINO","valor":48000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO MARCA TOYOTA YARIS SD XL PLUS","valor":83000},{"tipo":"Casa","descricao":"UMA CASA DE ALVENARIA COM TERRENO DE 300M2 NO LOTE 07 QUADRA H - TIPO C-3 ¿ N. 24 DA RUA PROJETADA N.2 LOCALIZADA NO BAIRRO COOPHARONDON","valor":70000},{"tipo":"Quotas ou quinhões de capital","descricao":"CAPITAL DA EMPRESA - WAF. ADMINISTRADORA DE EMPRESAS LTDA","valor":6012700},{"tipo":"Quotas ou quinhões de capital","descricao":"95% CAPITAL DA EMPRESA - WAF PUBLICIDADE E COMUNICACAO LTDA","valor":66500},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BANCO BRADESCO SA","valor":226173},{"tipo":"Outras aplicações e Investimentos","descricao":"BANCO SANTANDER","valor":19752},{"tipo":"Outros bens móveis","descricao":"15 ¿ OVINO","valor":9300},{"tipo":"Apartamento","descricao":"33% - APARTAMENTO MEDINDO NÚMERO 1.406, COM AREA PRIVATIVA 64,77M2, VILA JARDIM","valor":46666},{"tipo":"Terreno","descricao":"UMA AREA DE TERRENO PARA CONSTRUCAO MEDINDO 4.104,14M2 NA AV. JOAO PONCE ARRUDA, NO JARDIM IPANEMA EM RONDONOPOLIS-MT","valor":18911},{"tipo":"Quotas ou quinhões de capital","descricao":"100% CAPITAL DA EMPRESA - RADIO DIFUSORA NATIVA LTDA","valor":300000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 110002551737 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'wellington-fagundes'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'MT'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=wilder-morais ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 65160903.35, '[{"tipo":"OUTROS BENS E DIREITOS","descricao":"DEPÓSITO BANCÁRIO ¿ BANCO SANTANDER DEPÓSITO BANCÁRIO ¿ CNPJ [documento mascarado] (CONTA N. 000583942715-9) DEPÓSITO BANCÁRIO ¿ CNPJ [documento mascarado] (CONTA N. 000583942657-8) DEPÓSITO BANCÁRIO ¿ CNPJ","valor":765637.21},{"tipo":"OUTROS BENS E DIREITOS","descricao":"48% DAS QUOTAS DA PEDREIRA CALDAS LTDA. 48% DAS QUOTAS DA AURORA PARTICIPAÇÕES E INVESTIMENTOS LTDA. 48% DAS QUOTAS DA CENTRALMIX CONCRETOS E ARTEFATOS LTDA.","valor":74400},{"tipo":"OUTROS BENS E DIREITOS","descricao":"0,99% DAS QUOTAS DA 3WS EMPREENDIMENTOS E PARTICIPAÇÕES LTDA. 100% DAS QUOTAS DA WPM EMPREENDIMENTOS E PARTICIPAÇÕES LTDA. 30% DAS QUOTAS DA MINERADORA COLINAS DO SUL LTDA.","valor":6020112},{"tipo":"OUTROS BENS E DIREITOS","descricao":"SOBRADO RESIDENCIAL ¿ RUA 1131, LT. 03, QD. 235-A, SETOR MARISTA, GOIÂNIA/GO 84% DE LOTE DE TERRA COM 225 M² E CASA RESIDENCIAL ¿ TAQUARAL DE GOIÁS/GO VEÍCULO MMC PAJERO SPORT LGND DIESEL, ANO 2023/20","valor":15122630},{"tipo":"OUTROS BENS E DIREITOS","descricao":"48% DAS QUOTAS DA PETRUS PARTICIPAÇÕES E INVESTIMENTOS LTDA. 48% DAS QUOTAS DA ORCA CONSTRUTORA E CONCRETOS LTDA. 48% DAS QUOTAS DA ORCA INCORPORADORA LTDA. 49% DAS QUOTAS DA ORCA CONSTRUÇÕES E EMPREE","valor":5332650},{"tipo":"OUTROS BENS E DIREITOS","descricao":"49% DAS QUOTAS DA ORCA ENGENHARIA LTDA. 68,57% DAS QUOTAS DA ORCA CONSTRUTORA LTDA. CAPITAL SOCIAL ¿ SICOOB 20% DE PARTICIPAÇÃO NA BRASNORTE MINERAÇÃO LTDA. DEPÓSITO BANCÁRIO ¿ CAIXA ECONÔMICA FEDERAL","valor":17533412.04},{"tipo":"OUTROS BENS E DIREITOS","descricao":"FUNDO DE INVESTIMENTO ¿ CAIXA FÁCIL FIC RENDA FIXA SIMPLES FUNDO DE INVESTIMENTO ¿ FI CEF 6800 FUNDO DE INVESTIMENTO ¿ CAIXA GIRO IMEDIATO FIC RENDA FIXA A.F.A.C. ¿ WPM EMPREENDIMENTOS E PARTICIPAÇÕES","valor":10266944.9},{"tipo":"OUTROS BENS E DIREITOS","descricao":"DEPÓSITO BANCÁRIO ¿ CNPJ [documento mascarado] (CONTA N. 5060-1) DEPÓSITO BANCÁRIO ¿ CNPJ [documento mascarado] (CONTA N. 5059-8) DEPÓSITO BANCÁRIO ¿ CEF, AG. 3438 (CONTA N. 0005831784939)","valor":198382.8},{"tipo":"OUTROS BENS E DIREITOS","descricao":"DEPÓSITO BANCÁRIO ¿ CEF (CONTA N. 000100001228-7) DEPÓSITO BANCÁRIO ¿ SICOOB, C/C 26426-1 FUNDO DE INVESTIMENTO ¿ BB RENDA FIXA REFERENCIADO DI PLUS ÁGIL","valor":328262.25},{"tipo":"OUTROS BENS E DIREITOS","descricao":"50% DE AERONAVE RAYTHEON AIRCRAFT, MODELO BAE125-800A, PR-WSW HELICÓPTERO EUROCOPTER ESQUILO AS350, PREFIXO PR-YSW EMBARCAÇÃO MEU JOVEM LANCHA DE RECREIO COM PROPULSÃO, CASCO 911-APPEE","valor":9518472.15}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 90002551791 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'wilder-morais'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'GO'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=william-siri ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 120000.00, '[{"tipo":"Outras participações societárias","descricao":"PARTICIPACAO SOCIETARIA EMPRESA: CASAS THEREZA PRODUTOS ALIMENTICIOS LTDA","valor":120000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 190002536162 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'william-siri'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'RJ'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=ze-batista ano=2026 snapshot=2026-08-15_19:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 157000.00, '[{"tipo":"Casa","descricao":"UMA CASA","valor":140000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO","valor":17000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 60002549967 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'ze-batista'
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = 'Governador'
  AND c.estado = 'CE'
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = 108
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
  FROM public.candidatos c
  WHERE c.slug IN ('acm-neto', 'adailton-furia', 'alan-rick', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'carlos-machado', 'celina-leao', 'cicero-lucena', 'ciro-gomes-gov-ce', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia', 'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes', 'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho', 'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo', 'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'guilherme-fonseca', 'gustavo-henrique', 'haddad-gov-sp', 'hana-ghassan', 'helder-salomao', 'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao', 'jose-roberto-arruda', 'juliana-brizola', 'laurez-moreira', 'leandro-grass', 'lenilda-luna', 'lourdes-melo', 'lucas-ribeiro', 'lucia-santos', 'luciano-zucco', 'lucien-rezende', 'luis-cesar-bueno', 'mailza-assis', 'marcelo-brigadeiro', 'marcelo-maranata', 'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes', 'omar-aziz', 'otaviano-pivetta', 'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira', 'renan-santos', 'requiao-filho', 'ricardo-ferraco', 'roberio-paulino', 'roberto-cidade', 'robson-raymundo', 'ronaldo-mansur', 'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr', 'serley-leal', 'tarcisio-gov-sp', 'thor-dantas', 'tiao-bocalom', 'valmir-de-francisquinho', 'vicentinho-junior', 'vivian-mendes', 'wellington-fagundes', 'wilder-morais', 'william-siri', 'ze-batista')
    AND c.publicavel = true
    AND c.status <> 'removido';

  IF n_coorte = 0 THEN
    RETURN;
  END IF;
  IF n_coorte <> 108 THEN
    RETURN;
  END IF;

  WITH esperados(slug, valor_total, n_bens, fonte) AS (
    VALUES
    ('acm-neto', 84888809.63::numeric, 44, 'TSE Dados Abertos bem_candidato_2026 SQ 50002533190 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('adailton-furia', 1665086.74::numeric, 7, 'TSE Dados Abertos bem_candidato_2026 SQ 220002536806 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('alan-rick', 5244567.72::numeric, 25, 'TSE Dados Abertos bem_candidato_2026 SQ 10002532492 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('alexandre-kalil', 5941176.84::numeric, 42, 'TSE Dados Abertos bem_candidato_2026 SQ 130002539775 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('alysson-bezerra', 748869.84::numeric, 12, 'TSE Dados Abertos bem_candidato_2026 SQ 200002535255 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('andre-marinho', 407503.55::numeric, 6, 'TSE Dados Abertos bem_candidato_2026 SQ 190002537524 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('araceli-lemos', 534231.19::numeric, 6, 'TSE Dados Abertos bem_candidato_2026 SQ 140002542386 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('aroldo-felix', 857485.32::numeric, 3, 'TSE Dados Abertos bem_candidato_2026 SQ 50002544692 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('arthur-henrique', 578525.64::numeric, 8, 'TSE Dados Abertos bem_candidato_2026 SQ 230002549223 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('ataides-oliveira', 54458902.00::numeric, 6, 'TSE Dados Abertos bem_candidato_2026 SQ 270002548412 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('cabo-daciolo', 190750.00::numeric, 15, 'TSE Dados Abertos bem_candidato_2026 SQ 40002551740 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('carlos-machado', 27000.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 250002550913 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('celina-leao', 440131.39::numeric, 5, 'TSE Dados Abertos bem_candidato_2026 SQ 70002553055 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('cicero-lucena', 2517809.94::numeric, 22, 'TSE Dados Abertos bem_candidato_2026 SQ 150002544133 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('ciro-gomes-gov-ce', 1756648.94::numeric, 11, 'TSE Dados Abertos bem_candidato_2026 SQ 60002531351 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('cleber-rabelo', 52292.00::numeric, 1, 'TSE Dados Abertos bem_candidato_2026 SQ 140002538631 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('clecio-luis', 497990.00::numeric, 4, 'TSE Dados Abertos bem_candidato_2026 SQ 30002536311 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('cleitinho', 956564.03::numeric, 11, 'TSE Dados Abertos bem_candidato_2026 SQ 130002552296 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('coronel-busnello', 950000.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 190002544120 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('cyro-garcia', 385400.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 190002540198 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('daniel-vilela', 5627385.99::numeric, 15, 'TSE Dados Abertos bem_candidato_2026 SQ 90002540993 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('dario-barbosa', 170000.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 200002542481 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('douglas-ruas', 1467687.88::numeric, 18, 'TSE Dados Abertos bem_candidato_2026 SQ 190002542887 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('dr-furlan', 1168464.77::numeric, 6, 'TSE Dados Abertos bem_candidato_2026 SQ 30002530014 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('eduardo-braide', 1048910.76::numeric, 8, 'TSE Dados Abertos bem_candidato_2026 SQ 100002545679 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('eduardo-paes', 189210.63::numeric, 7, 'TSE Dados Abertos bem_candidato_2026 SQ 190002543380 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('eduardo-riedel', 16147849.34::numeric, 17, 'TSE Dados Abertos bem_candidato_2026 SQ 120002536582 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('efraim-filho', 1682784.38::numeric, 9, 'TSE Dados Abertos bem_candidato_2026 SQ 150002538692 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('elizeu-aguiar', 872808.00::numeric, 3, 'TSE Dados Abertos bem_candidato_2026 SQ 180002533958 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('elmano-de-freitas', 366457.71::numeric, 12, 'TSE Dados Abertos bem_candidato_2026 SQ 60002543969 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('emanuel-cacho', 600000.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 260002551712 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('expedito-netto', 351226.00::numeric, 3, 'TSE Dados Abertos bem_candidato_2026 SQ 220002542185 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('fabio-mitidieri', 1698945.66::numeric, 12, 'TSE Dados Abertos bem_candidato_2026 SQ 260002542491 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('fabio-trad', 3670880.45::numeric, 30, 'TSE Dados Abertos bem_candidato_2026 SQ 120002539834 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('felipe-camarao', 5208193.72::numeric, 5, 'TSE Dados Abertos bem_candidato_2026 SQ 100002542556 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('gabriel-azevedo', 1702153.88::numeric, 33, 'TSE Dados Abertos bem_candidato_2026 SQ 130002549557 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('gabriel-souza', 935461.08::numeric, 6, 'TSE Dados Abertos bem_candidato_2026 SQ 210002542892 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('garotinho', 167585.05::numeric, 8, 'TSE Dados Abertos bem_candidato_2026 SQ 190002550196 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('gelson-merisio', 652953.78::numeric, 8, 'TSE Dados Abertos bem_candidato_2026 SQ 240002548628 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('geraldo-carvalho', 200590.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 180002537422 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('guilherme-fonseca', 300000.00::numeric, 1, 'TSE Dados Abertos bem_candidato_2026 SQ 170002536575 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('gustavo-henrique', 148000.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 180002550421 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('haddad-gov-sp', 861217.25::numeric, 7, 'TSE Dados Abertos bem_candidato_2026 SQ 250002549705 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('hana-ghassan', 1670461.00::numeric, 7, 'TSE Dados Abertos bem_candidato_2026 SQ 140002551598 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('helder-salomao', 1206682.23::numeric, 10, 'TSE Dados Abertos bem_candidato_2026 SQ 80002551833 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('hildon-chaves', 30330625.02::numeric, 3, 'TSE Dados Abertos bem_candidato_2026 SQ 220002542916 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('indira-xavier', 479.89::numeric, 1, 'TSE Dados Abertos bem_candidato_2026 SQ 130002547874 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('ivan-moraes', 81452.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 170002538097 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('jeronimo', 886548.53::numeric, 12, 'TSE Dados Abertos bem_candidato_2026 SQ 50002536314 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('jhc', 2244732.19::numeric, 8, 'TSE Dados Abertos bem_candidato_2026 SQ 20002553350 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('joao-henrique-catan', 588097.38::numeric, 7, 'TSE Dados Abertos bem_candidato_2026 SQ 120002552191 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('joel-rodrigues', 1688256.20::numeric, 10, 'TSE Dados Abertos bem_candidato_2026 SQ 180002538530 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('jorginho-mello', 2818036.89::numeric, 11, 'TSE Dados Abertos bem_candidato_2026 SQ 240002537073 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('jose-estevao', 600000.00::numeric, 1, 'TSE Dados Abertos bem_candidato_2026 SQ 50002536579 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('jose-roberto-arruda', 830170.98::numeric, 10, 'TSE Dados Abertos bem_candidato_2026 SQ 70002552586 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('juliana-brizola', 376137.78::numeric, 3, 'TSE Dados Abertos bem_candidato_2026 SQ 210002551508 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('laurez-moreira', 9615406.23::numeric, 21, 'TSE Dados Abertos bem_candidato_2026 SQ 270002544494 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('leandro-grass', 285000.00::numeric, 1, 'TSE Dados Abertos bem_candidato_2026 SQ 70002552496 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('lenilda-luna', 115000.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 20002539642 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('lourdes-melo', 450000.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 180002553722 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('lucas-ribeiro', 385621.65::numeric, 6, 'TSE Dados Abertos bem_candidato_2026 SQ 150002551789 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('lucia-santos', 799134.68::numeric, 8, 'TSE Dados Abertos bem_candidato_2026 SQ 180002544216 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('luciano-zucco', 709304.00::numeric, 12, 'TSE Dados Abertos bem_candidato_2026 SQ 210002547857 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('lucien-rezende', 500000.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 120002532257 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('luis-cesar-bueno', 884607.32::numeric, 12, 'TSE Dados Abertos bem_candidato_2026 SQ 90002545476 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('mailza-assis', 167482.91::numeric, 5, 'TSE Dados Abertos bem_candidato_2026 SQ 10002544107 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('marcelo-brigadeiro', 1831261.11::numeric, 5, 'TSE Dados Abertos bem_candidato_2026 SQ 240002544118 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('marcelo-maranata', 249805.00::numeric, 8, 'TSE Dados Abertos bem_candidato_2026 SQ 210002535802 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('marconi-perillo', 11876815.71::numeric, 24, 'TSE Dados Abertos bem_candidato_2026 SQ 90002543463 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('marcos-rogerio', 2376169.92::numeric, 9, 'TSE Dados Abertos bem_candidato_2026 SQ 220002541939 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('marcus-sodre', 117000.00::numeric, 1, 'TSE Dados Abertos bem_candidato_2026 SQ 240002541913 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('maria-do-carmo', 118473769.48::numeric, 27, 'TSE Dados Abertos bem_candidato_2026 SQ 40002541626 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('mateus-simoes', 2904492.23::numeric, 28, 'TSE Dados Abertos bem_candidato_2026 SQ 130002541911 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('omar-aziz', 2070608.00::numeric, 5, 'TSE Dados Abertos bem_candidato_2026 SQ 40002532272 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('otaviano-pivetta', 575680870.95::numeric, 22, 'TSE Dados Abertos bem_candidato_2026 SQ 110002551480 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('patrus-ananias', 1247212.54::numeric, 9, 'TSE Dados Abertos bem_candidato_2026 SQ 130002550464 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('paula-belmonte', 10844220.79::numeric, 4, 'TSE Dados Abertos bem_candidato_2026 SQ 70002552965 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('pazolini', 1002342.77::numeric, 7, 'TSE Dados Abertos bem_candidato_2026 SQ 80002552682 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('priscila-voigt', 1000.00::numeric, 1, 'TSE Dados Abertos bem_candidato_2026 SQ 210002533355 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('professora-dorinha', 2352740.28::numeric, 3, 'TSE Dados Abertos bem_candidato_2026 SQ 270002544599 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('rafael-fonteles', 1799948.60::numeric, 7, 'TSE Dados Abertos bem_candidato_2026 SQ 180002532987 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('ralf-zimmer', 1426599.97::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 240002552157 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('raquel-lyra', 359498.33::numeric, 3, 'TSE Dados Abertos bem_candidato_2026 SQ 170002537227 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('ravenna-castro', 91600.52::numeric, 6, 'TSE Dados Abertos bem_candidato_2026 SQ 180002548388 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('rejane-oliveira', 498000.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 210002541367 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('renan-santos', 795089.00::numeric, 4, 'TSE Dados Abertos bem_candidato_2026 SQ 280002540694 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('requiao-filho', 1876342.14::numeric, 11, 'TSE Dados Abertos bem_candidato_2026 SQ 160002547666 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('ricardo-ferraco', 27668789.55::numeric, 31, 'TSE Dados Abertos bem_candidato_2026 SQ 80002552172 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('roberio-paulino', 2194367.82::numeric, 7, 'TSE Dados Abertos bem_candidato_2026 SQ 200002546757 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('roberto-cidade', 4285400.80::numeric, 12, 'TSE Dados Abertos bem_candidato_2026 SQ 40002541741 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('robson-raymundo', 900000.00::numeric, 1, 'TSE Dados Abertos bem_candidato_2026 SQ 70002535930 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('ronaldo-mansur', 91397.22::numeric, 5, 'TSE Dados Abertos bem_candidato_2026 SQ 50002532269 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('samara-mineiro', 69196.63::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 70002537111 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('samuel-costa', 3631297.68::numeric, 18, 'TSE Dados Abertos bem_candidato_2026 SQ 220002550927 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('sandro-alex', 1667125.53::numeric, 12, 'TSE Dados Abertos bem_candidato_2026 SQ 160002549553 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('saulo-arcangeli', 656409.64::numeric, 6, 'TSE Dados Abertos bem_candidato_2026 SQ 100002534190 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('sergio-moro-gov-pr', 1036642.25::numeric, 12, 'TSE Dados Abertos bem_candidato_2026 SQ 160002540833 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('serley-leal', 88094.69::numeric, 4, 'TSE Dados Abertos bem_candidato_2026 SQ 60002533729 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('tarcisio-gov-sp', 2696808.40::numeric, 4, 'TSE Dados Abertos bem_candidato_2026 SQ 250002541303 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('thor-dantas', 761462.79::numeric, 27, 'TSE Dados Abertos bem_candidato_2026 SQ 10002550719 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('tiao-bocalom', 1216500.00::numeric, 7, 'TSE Dados Abertos bem_candidato_2026 SQ 10002544015 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('valmir-de-francisquinho', 258000.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 260002532010 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('vicentinho-junior', 3983398.00::numeric, 10, 'TSE Dados Abertos bem_candidato_2026 SQ 270002544544 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('vivian-mendes', 80000.00::numeric, 1, 'TSE Dados Abertos bem_candidato_2026 SQ 250002544912 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('wellington-fagundes', 13132463.00::numeric, 28, 'TSE Dados Abertos bem_candidato_2026 SQ 110002551737 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('wilder-morais', 65160903.35::numeric, 10, 'TSE Dados Abertos bem_candidato_2026 SQ 90002551791 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('william-siri', 120000.00::numeric, 1, 'TSE Dados Abertos bem_candidato_2026 SQ 190002536162 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('ze-batista', 157000.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 60002549967 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)')
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

  IF n_corretos <> 108 THEN
    RAISE EXCEPTION 'P-PATRIMONIO-NACIONAL: esperadas 108 linhas exatas, encontradas %', n_corretos;
  END IF;
END $$;

COMMIT;
