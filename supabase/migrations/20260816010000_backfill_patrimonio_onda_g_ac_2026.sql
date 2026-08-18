-- P-AC-POS-REGISTRO: patrimônio 2026 dos seis candidatos do Acre.
-- Fonte 2026: https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip
-- SHA-256 2026: 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1; Last-Modified Sat, 15 Aug 2026 19:33:34 GMT.
-- Evidência 2020 Dr. Luisinho: https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2020.zip
-- SHA-256 2020: 04353565306af1a894811520d8b9c73ea50730bd271dee25b1d1407e2ef8ba74; SQ 40000972144.

DO $$
DECLARE
  n_coorte integer;
  n_contradicoes integer;
BEGIN
  SELECT COUNT(*) INTO n_coorte FROM public.candidatos WHERE slug IN ('alan-rick', 'thor-dantas', 'eudo-raffael', 'mailza-assis', 'tiao-bocalom', 'dr-luisinho');
  IF n_coorte = 0 THEN
    RETURN;
  END IF;
  IF n_coorte NOT IN (0, 6)
     AND to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'P-AC-POS-REGISTRO: coorte parcial em banco com ledger, esperados 6, encontrados %', n_coorte;
  END IF;

  SELECT COUNT(*) INTO n_contradicoes
  FROM public.candidatos c
  JOIN public.patrimonio p ON p.candidato_id = c.id
  JOIN public.patrimonio_ausencia_oficial a
    ON a.candidato_id = c.id AND a.ano_eleicao = p.ano_eleicao
  WHERE c.slug IN ('alan-rick', 'thor-dantas', 'eudo-raffael', 'mailza-assis', 'tiao-bocalom', 'dr-luisinho') AND p.ano_eleicao IN (2020, 2026);
  IF n_contradicoes <> 0 THEN
    RAISE EXCEPTION 'P-AC-POS-REGISTRO: patrimônio e ausência oficial coexistem em % célula(s)', n_contradicoes;
  END IF;
END $$;

-- @write tabela=patrimonio slug=alan-rick ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 5244567.72, '[{"tipo":"Outras aplicações e Investimentos","descricao":"CERTIFICADO DE OPERACAO ESTRUTURAL","valor":50000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"BTG PACTUAL - PROD.: CDB-SR","valor":69891.86},{"tipo":"Outras aplicações e Investimentos","descricao":"CERTIFICADO DE RECEBIVEIS DO AGRONEGOCIO BTG PACTUAL","valor":105105.93},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"DEBENTURE DE INFRAESTRUTURA BTG PACTUAL","valor":48825.71},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BTG PACTUAL - VIRTUS FUNDO INCENTIVADO DE INVEST EM INFRAESTRUTURA REN","valor":800000},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BTG PACTUAL - TITULO: TERRAMAGNA II FIAGRO -","valor":50000},{"tipo":"Outras aplicações e Investimentos","descricao":"COTA DE FERIAS JUNTO AO GOLDEN LAGHETTO EMPREENDIMENTOS IMOBILIARIOS SPE LTDA","valor":48524.85},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO","valor":150000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA LIVRE MOVIMENTACAO - AG./CONTA: 0534-","valor":12982.34},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"PROD.: PIPO CAPITAL I FUNDO DE INVESTIMENTO EM PARTICIPACOES MULTIEST - FUNDO DE INVESTIMENTO BTG PACTUAL.","valor":18415.46},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BTG PACTUAL - ESPECIFICACAO: FI IE JGP ECOSSISTEMA FIC FDS COTAS PRINCIPAL","valor":65000.04},{"tipo":"Outras aplicações e Investimentos","descricao":"COTA DE FERIAS JUNTO AO GOLDEN LAGHETTO EMPREENDIMENTOS IMOBILIARIOS SPE LTDA - CONTRATO NR 84073 // CT.01-F277/13 UNIDADE 277/13 VR","valor":48524.85},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BTG PACTUAL - PROD.: CDB-SR-","valor":3321.13},{"tipo":"Outras aplicações e Investimentos","descricao":"CERTIFICADO DE RECEBIVEIS DO AGRONEGOCIO BTG PACTUAL","valor":200000},{"tipo":"Outras aplicações e Investimentos","descricao":"CERTIFICADO DE DIREITOS CREDITORIOS DO AGRONEGOCIO","valor":16000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEICULO JEEP GRAND CHEROKEE","valor":236794.96},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BTG PACTUAL - FIP IE AZ QUEST PRE INFRA IX -","valor":26000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"RF REF DI PLUS AGIL -","valor":573106.16},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BB RENDA FIXA LONGO PRAZO HIGH FUNDO DE INVESTIMENTO EM COTAS DE FIF","valor":174762.67},{"tipo":"Outras aplicações e Investimentos","descricao":"COTA DE FERIAS JUNTO AO GOLDEN LAGHETTO EMPREENDIMENTOS IMOBILIARIOS SPE LTDA","valor":48524.85},{"tipo":"Casa","descricao":"IMOVEL RESIDENCIAL","valor":1319000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BANCO DO BRASIL - SALDO CDB/DI CFE INFORME DE RENDIMENTOS","valor":19000},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"PROD.: PIPO CAPITAL I FUNDO DE INVESTIMENTO RENDA FIXA - FUNDO DE INVESTIMENTO","valor":11172.12},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"CEF - FI - FUNDO DE INVESTIMENTO","valor":999614.79},{"tipo":"Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes, Invest.Participação e Invest. Índice Mercado","descricao":"BTG PACTUAL - FII ENERGIA REAL - 6454225UN1","valor":150000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 10002532492 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; SHA-256 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'alan-rick'
  AND (SELECT COUNT(*) FROM public.candidatos WHERE slug IN ('alan-rick', 'thor-dantas', 'eudo-raffael', 'mailza-assis', 'tiao-bocalom', 'dr-luisinho')) = 6
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=thor-dantas ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 761462.79, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"TOYOTA ETIOS HB CROSS ANO 2017/2018","valor":60000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BBDC4","valor":33580},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VOLKSWAGEN NIVUS HL TSI ANO 2023","valor":139900},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA DE CAPITAL DA EMPRESA LAGE E DANTAS SOCIEDADE SIMPLES ME","valor":1000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB NTNB PRINC","valor":115985.98},{"tipo":"Outras aplicações e Investimentos","descricao":"ACOES SMALL CAPS","valor":1000},{"tipo":"Outras aplicações e Investimentos","descricao":"AÇÕES BTC","valor":1000},{"tipo":"Depósito bancário em conta corrente no exterior","descricao":"BB AMERICAS - PERSONAL MONEY MARKET","valor":24868.88},{"tipo":"Outras aplicações e Investimentos","descricao":"COTAS DE INVESCO QQQ(QQQ) CUSTODIADAS NA CORRETORADRIVEWEALTH, LLC.","valor":6028.7},{"tipo":"Outros créditos e poupança vinculados","descricao":"BANCO CEF - POUPANÇA","valor":437.82},{"tipo":"Outras aplicações e Investimentos","descricao":"KNCR11 25","valor":22525},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"CORRETORA DRIVEWEALTH, LLC","valor":0},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BBAS3 - 600","valor":58308.06},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA DE CAPITAL DA EMPRESA LAGE E DANTAS EDUCACAO MEDICA LTDA","valor":1000},{"tipo":"Outras aplicações e Investimentos","descricao":"BB ACOES FX GLOBAL SELECT EQUITY VALUE INVESTIMENTO NO EXTERIOR FIF RESPONSABILIDADE LIMITADA","valor":2000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BTG - LCA","valor":18132.68},{"tipo":"Depósito bancário em conta corrente no exterior","descricao":"BANCO COMMUNITY FEDERAL SAVINGS BANK","valor":1},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB LTN","valor":10000.36},{"tipo":"Outras aplicações e Investimentos","descricao":"COTAS DE ISHARESTREASURY FLOATING RATE BOND ETF(TFLO) CUSTODIADAS NA CORRETORADRIVEWEALTH, LLC","valor":9805.75},{"tipo":"Outras aplicações e Investimentos","descricao":"ACOES TECNOLOGIA BDR","valor":1000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"COTAS DE ARK INNOVATIONETF (ARKK) CUSTODIADAS NACORRETORA DRIVEWEALTH, LLC","valor":2830.38},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB CONTA CORRENTE","valor":0},{"tipo":"Outras aplicações e Investimentos","descricao":"COTAS DE ISHARESBITCOIN TRUST (IBIT) CUSTODIADASNA CORRETORA DRIVEWEALTH, LLC","valor":1996.14},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"COTAS DE S P 500VANGUARD ETF (VOO) CUSTODIADASNA CORRETORA DRIVEWEALTH, LLC","valor":20086.93},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB RENDA FIXA LONGO PRAZO HIGH FUNDO DE INVESTIMENTO EM COTAS DE FUNDOS DE INVESTIMENTO","valor":96017.71},{"tipo":"Outros créditos e poupança vinculados","descricao":"POUPANCA - BANCO DO BRASIL","valor":0.06},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB CDB RENDE FACIL","valor":133957.34}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 10002550719 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; SHA-256 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'thor-dantas'
  AND (SELECT COUNT(*) FROM public.candidatos WHERE slug IN ('alan-rick', 'thor-dantas', 'eudo-raffael', 'mailza-assis', 'tiao-bocalom', 'dr-luisinho')) = 6
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=eudo-raffael ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 165000.00, '[{"tipo":"Terreno","descricao":"TERRENO NO RAMAL DO MUTUM AQUIRIDO APOS UMA IDENIZACAO TRABALHISTA","valor":65000},{"tipo":"Apartamento","descricao":"APART RESIDENCIAL ADQUIRIDO ATRAVÉS DO PROGRAMA MINHA CASA MINHA VIDA DO GOVERNO FEDERAL","valor":100000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 10002549500 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; SHA-256 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'eudo-raffael'
  AND (SELECT COUNT(*) FROM public.candidatos WHERE slug IN ('alan-rick', 'thor-dantas', 'eudo-raffael', 'mailza-assis', 'tiao-bocalom', 'dr-luisinho')) = 6
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=mailza-assis ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 167482.91, '[{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTA BANCARIA - CEF - AGE 2278","valor":46000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTA BANCARIA - BANCO DO BRASIL","valor":0},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTA BANCARIA - CEF - AGE 3706","valor":255.27},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTA BANCARIA - CEF PERSONAL FIC RENDA FIXA LP","valor":121227.64},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTA BANCARIA - CREDISIS","valor":0}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 10002544107 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; SHA-256 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'mailza-assis'
  AND (SELECT COUNT(*) FROM public.candidatos WHERE slug IN ('alan-rick', 'thor-dantas', 'eudo-raffael', 'mailza-assis', 'tiao-bocalom', 'dr-luisinho')) = 6
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio slug=tiao-bocalom ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, 1216500.00, '[{"tipo":"Terreno","descricao":"83% DE LOTE DE TERRA URBANA EM ACRELÂNDIA","valor":80000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CAMIONETE AMAROK 2015","valor":90000},{"tipo":"Quotas ou quinhões de capital","descricao":"100% DAS QUOTAS DE CAPITAL DA EMPRESA SB RODRIGUES - INATIVA","valor":4000},{"tipo":"Outros bens imóveis","descricao":"TERRA RURAL NO RAMAL FLORESTA COM 81 HECTARES","valor":1000000},{"tipo":"Quotas ou quinhões de capital","descricao":"50% DAS QUOTAS DE CAPITAL DA EMPRESA INDUSTRIA E COMERCIO DE MADEIRAS COMANO - INATIVA","valor":6500},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO TOTAL EM CONTAS CORRENTE BANCO DO BRASIL, BRADESCO, BASA E CAIXA ECONÔMICA FEDERAL","valor":8000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"TOYOTA COROLLA 2007","valor":28000}]'::jsonb, 'TSE Dados Abertos bem_candidato_2026 SQ 10002544015 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; SHA-256 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
FROM public.candidatos c
WHERE c.slug = 'tiao-bocalom'
  AND (SELECT COUNT(*) FROM public.candidatos WHERE slug IN ('alan-rick', 'thor-dantas', 'eudo-raffael', 'mailza-assis', 'tiao-bocalom', 'dr-luisinho')) = 6
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);

-- @write tabela=patrimonio_ausencia_oficial slug=dr-luisinho ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial
  (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, '10002533539', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-16T03:59:31Z'::timestamptz,
       'Pacote oficial bem_candidato_2026 do TSE lido de ponta a ponta sem bens para o SQ 10002533539; snapshot 2026-08-15 16:35 BRT; SHA-256 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1.'
FROM public.candidatos c
WHERE c.slug = 'dr-luisinho'
  AND (SELECT COUNT(*) FROM public.candidatos WHERE slug IN ('alan-rick', 'thor-dantas', 'eudo-raffael', 'mailza-assis', 'tiao-bocalom', 'dr-luisinho')) = 6
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  )
ON CONFLICT (candidato_id, ano_eleicao) DO NOTHING;

-- @write tabela=patrimonio_ausencia_oficial slug=dr-luisinho ano=2020 snapshot=2026-08-16 campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial
  (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2020, '40000972144', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2020.zip', '2026-08-16T03:59:31Z'::timestamptz,
       'Pacote oficial bem_candidato_2020 do TSE lido de ponta a ponta sem bens para o SQ 40000972144; SHA-256 04353565306af1a894811520d8b9c73ea50730bd271dee25b1d1407e2ef8ba74.'
FROM public.candidatos c
WHERE c.slug = 'dr-luisinho'
  AND (SELECT COUNT(*) FROM public.candidatos WHERE slug IN ('alan-rick', 'thor-dantas', 'eudo-raffael', 'mailza-assis', 'tiao-bocalom', 'dr-luisinho')) = 6
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p WHERE p.candidato_id = c.id AND p.ano_eleicao = 2020
  )
ON CONFLICT (candidato_id, ano_eleicao) DO NOTHING;

DO $$
DECLARE
  n_coorte integer;
  n_corretos integer;
  n_ausencias integer;
BEGIN
  SELECT COUNT(*) INTO n_coorte FROM public.candidatos WHERE slug IN ('alan-rick', 'thor-dantas', 'eudo-raffael', 'mailza-assis', 'tiao-bocalom', 'dr-luisinho');
  IF n_coorte <> 6 THEN RETURN; END IF;

  WITH esperados(slug, valor_total, n_bens, fonte) AS (
    VALUES
    ('alan-rick', 5244567.72::numeric, 25, 'TSE Dados Abertos bem_candidato_2026 SQ 10002532492 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; SHA-256 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('thor-dantas', 761462.79::numeric, 27, 'TSE Dados Abertos bem_candidato_2026 SQ 10002550719 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; SHA-256 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('eudo-raffael', 165000.00::numeric, 2, 'TSE Dados Abertos bem_candidato_2026 SQ 10002549500 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; SHA-256 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('mailza-assis', 167482.91::numeric, 5, 'TSE Dados Abertos bem_candidato_2026 SQ 10002544107 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; SHA-256 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'),
    ('tiao-bocalom', 1216500.00::numeric, 7, 'TSE Dados Abertos bem_candidato_2026 SQ 10002544015 (total agregado, snapshot 2026-08-15 16:35 BRT; CSV gerado 15/08/2026 16:30:08 BRT; SHA-256 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)')
  )
  SELECT COUNT(*) INTO n_corretos
  FROM esperados e
  JOIN public.candidatos c ON c.slug = e.slug
  JOIN public.patrimonio p ON p.candidato_id = c.id AND p.ano_eleicao = 2026
  WHERE p.valor_total = e.valor_total
    AND jsonb_array_length(p.bens) = e.n_bens
    AND p.fonte = e.fonte;
  IF n_corretos <> 5 THEN
    RAISE EXCEPTION 'P-AC-POS-REGISTRO: esperados 5 patrimônios exatos, encontrados %', n_corretos;
  END IF;

  SELECT COUNT(*) INTO n_ausencias
  FROM public.candidatos c
  JOIN public.patrimonio_ausencia_oficial a ON a.candidato_id = c.id
  WHERE c.slug = 'dr-luisinho'
    AND (
      (a.ano_eleicao = 2026 AND a.sq_candidato = '10002533539' AND a.fonte_url = 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip' AND a.detalhe = 'Pacote oficial bem_candidato_2026 do TSE lido de ponta a ponta sem bens para o SQ 10002533539; snapshot 2026-08-15 16:35 BRT; SHA-256 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1.')
      OR
      (a.ano_eleicao = 2020 AND a.sq_candidato = '40000972144' AND a.fonte_url = 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2020.zip' AND a.detalhe = 'Pacote oficial bem_candidato_2020 do TSE lido de ponta a ponta sem bens para o SQ 40000972144; SHA-256 04353565306af1a894811520d8b9c73ea50730bd271dee25b1d1407e2ef8ba74.')
    );
  IF n_ausencias <> 2 THEN
    RAISE EXCEPTION 'P-AC-POS-REGISTRO: esperadas 2 ausências oficiais exatas, encontradas %', n_ausencias;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.candidatos c
    JOIN public.patrimonio p ON p.candidato_id = c.id
    JOIN public.patrimonio_ausencia_oficial a
      ON a.candidato_id = c.id AND a.ano_eleicao = p.ano_eleicao
    WHERE c.slug IN ('alan-rick', 'thor-dantas', 'eudo-raffael', 'mailza-assis', 'tiao-bocalom', 'dr-luisinho') AND p.ano_eleicao IN (2020, 2026)
  ) THEN
    RAISE EXCEPTION 'P-AC-POS-REGISTRO: patrimônio e ausência oficial coexistem após a migration';
  END IF;
END $$;
