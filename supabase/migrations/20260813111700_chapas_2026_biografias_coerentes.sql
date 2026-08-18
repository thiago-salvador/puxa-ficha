-- Corrige biografias que ainda descreviam o papel anterior ao snapshot TSE.
DO $$
DECLARE predecessor_count integer := 0; atualizadas integer;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version=''20260813040200''' INTO predecessor_count;
  END IF;
  IF predecessor_count = 0 THEN
    RAISE NOTICE 'replay sem predecessor 20260813040200; correção de biografias ignorada';
    RETURN;
  END IF;

  -- @write tabela=candidatos slug=eduardo-girao campos=biografia,ultima_atualizacao
  -- @write tabela=candidatos slug=francisco-dias campos=biografia,ultima_atualizacao
  -- @write tabela=candidatos slug=geraldo-alckmin campos=biografia,ultima_atualizacao
  -- @write tabela=candidatos slug=luiz-carlos-teodoro campos=biografia,ultima_atualizacao
  -- @write tabela=candidatos slug=rafael-greca campos=biografia,ultima_atualizacao
  -- @write tabela=candidatos slug=raquel-bricio campos=biografia,ultima_atualizacao
  UPDATE public.candidatos c
  SET biografia=e.biografia_nova,
      ultima_atualizacao='2026-08-13T11:17:09Z'::timestamptz
  FROM (VALUES
    ('eduardo-girao', 'Luís Eduardo Grangeiro Girão é político cearense, filiado ao Novo. Foi eleito senador pelo Ceará em 2018 pelo PROS, filiou-se ao Podemos em 2019 e ao Novo em 2023; mandato de senador em curso. Figura como pré-candidato ao governo do Ceará em 2026, sem registro deferido no TSE na data de curadoria.', 'Luís Eduardo Grangeiro Girão é político cearense, filiado ao Novo. Foi eleito senador pelo Ceará em 2018 pelo PROS, filiou-se ao Podemos em 2019 e ao Novo em 2023; mandato de senador em curso. Em 2026, o snapshot oficial do TSE de 12/08/2026 o registra como candidato a vice-presidente na chapa encabeçada por Romeu Zema.'),
    ('francisco-dias', 'Francisco Dias foi lançado pela Unidade Popular como pré-candidato ao Governo do Rio Grande do Norte em 2026. O Blog do Barreto registrou em 1 de junho de 2026 que o ato de lançamento ocorreu em 30 de maio.', 'Francisco Dias foi lançado pela Unidade Popular como pré-candidato ao Governo do Rio Grande do Norte em 2026. O Blog do Barreto registrou em 1 de junho de 2026 que o ato de lançamento ocorreu em 30 de maio. No snapshot oficial do TSE de 12/08/2026, Francisco Dias aparece como candidato a vice-governador na chapa encabeçada por Arinalda do MLB.'),
    ('geraldo-alckmin', 'Geraldo Alckmin é médico e político brasileiro, filiado ao PSB. Foi governador de São Paulo em vários mandatos (2001–2006 e 2011–2018) pelo PSDB; é vice-presidente da República e ministro no governo federal desde 2023. Citado em pesquisas para o governo de São Paulo em 2026, permanece no exercício do mandato federal; o pleito estadual permanece incerto na data de curadoria.', 'Geraldo Alckmin é médico e político brasileiro, filiado ao PSB. Foi governador de São Paulo em vários mandatos (2001–2006 e 2011–2018) pelo PSDB; é vice-presidente da República e ministro no governo federal desde 2023. Em 2026, o snapshot oficial do TSE de 12/08/2026 o registra como candidato a vice-presidente na chapa encabeçada por Lula.'),
    ('luiz-carlos-teodoro', 'Luiz Carlos Teodoro é advogado e ativista na área de direitos humanos, filiado ao Partido Socialismo e Liberdade em Rondônia. Preside a Comissão de Direitos Humanos da OAB-RO desde outubro de 2023 e teve o nome oficializado pelo PSOL como pré-candidato ao governo de Rondônia em 2026, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.', 'Luiz Carlos Teodoro é advogado e ativista na área de direitos humanos, filiado ao Partido Socialismo e Liberdade em Rondônia. Preside a Comissão de Direitos Humanos da OAB-RO desde outubro de 2023 e teve o nome oficializado pelo PSOL como pré-candidato ao governo de Rondônia em 2026, em cenário anterior às convenções partidárias e ao registro oficial de candidatura. No snapshot oficial do TSE de 12/08/2026, Luiz Carlos Teodoro aparece como candidato a vice-governador na chapa encabeçada por Expedito Netto.'),
    ('rafael-greca', 'Rafael Valdomiro Greca de Macedo é economista, engenheiro civil, escritor e político brasileiro, filiado ao Movimento Democrático Brasileiro (MDB) em 2026. A trajetória partidária documentada na auditoria editorial e no TSE segue a sequência PFL (mandatos legislativos até 2006), PMDB/MDB, PMN, DEM, PSD e MDB, considerando que PMDB e MDB são a mesma legenda partidária com mudança institucional de sigla em 2017. Foi prefeito de Curitiba por três mandatos. Após deixar a prefeitura, assumiu a Secretaria de Desenvolvimento Sustentável do Paraná; figura como pré-candidato ao governo do estado em 2026, sem registro deferido no TSE na data de curadoria.', 'Rafael Valdomiro Greca de Macedo é economista, engenheiro civil, escritor e político brasileiro, filiado ao Movimento Democrático Brasileiro (MDB) em 2026. A trajetória partidária documentada na auditoria editorial e no TSE segue a sequência PFL (mandatos legislativos até 2006), PMDB/MDB, PMN, DEM, PSD e MDB, considerando que PMDB e MDB são a mesma legenda partidária com mudança institucional de sigla em 2017. Foi prefeito de Curitiba por três mandatos. Após deixar a prefeitura, assumiu a Secretaria de Desenvolvimento Sustentável do Paraná; o snapshot oficial do TSE de 12/08/2026 o registra como candidato a vice-governador na chapa encabeçada por Sandro Alex.'),
    ('raquel-bricio', 'Raquel Nonato de Brício, nascida em 12 de outubro de 1991 em Moju (PA), mudou-se para Belém aos 12 anos. É guarda portuária federal na Companhia Docas do Pará e diretora do Sindicato dos Portuários do Pará e Amapá (Sindiporto PA/AP). Tem formação em gestão de recursos humanos e cursa Direito na Universidade Federal do Pará (UFPA). Iniciou a militância no movimento estudantil, tendo sido presidente do grêmio estudantil em 2007 no atual Instituto Federal do Pará. Já disputou eleições anteriores: candidata a vereadora de Belém em 2020, a deputada estadual em 2022 e a prefeita de Belém pela Unidade Popular em 2024 (número 80), sem ser eleita. Em 2026 é pré-candidata ao Governo do Pará pela Unidade Popular.', 'Raquel Nonato de Brício, nascida em 12 de outubro de 1991 em Moju (PA), mudou-se para Belém aos 12 anos. É guarda portuária federal na Companhia Docas do Pará e diretora do Sindicato dos Portuários do Pará e Amapá (Sindiporto PA/AP). Tem formação em gestão de recursos humanos e cursa Direito na Universidade Federal do Pará (UFPA). Iniciou a militância no movimento estudantil, tendo sido presidente do grêmio estudantil em 2007 no atual Instituto Federal do Pará. Já disputou eleições anteriores: candidata a vereadora de Belém em 2020, a deputada estadual em 2022 e a prefeita de Belém pela Unidade Popular em 2024 (número 80), sem ser eleita. Em 2026, o snapshot oficial do TSE de 12/08/2026 a registra como candidata a vice-presidente na chapa encabeçada por Samara Martins.')
  ) AS e(slug,biografia_antiga,biografia_nova)
  WHERE c.slug=e.slug
    AND c.biografia=e.biografia_antiga
    AND c.ultima_atualizacao='2026-08-13T07:37:13Z'::timestamptz;
  GET DIAGNOSTICS atualizadas = ROW_COUNT;
  IF atualizadas <> 6 THEN
    RAISE EXCEPTION 'compare-and-swap: esperava atualizar 6 biografias antigas exatas, atualizou %', atualizadas;
  END IF;
END $$;
