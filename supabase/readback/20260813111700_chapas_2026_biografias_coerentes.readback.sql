-- Readback fail-closed das seis biografias coerentes com a chapa oficial.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
  FROM public.candidatos c
  JOIN (VALUES
    ('eduardo-girao', 'Luís Eduardo Grangeiro Girão é político cearense, filiado ao Novo. Foi eleito senador pelo Ceará em 2018 pelo PROS, filiou-se ao Podemos em 2019 e ao Novo em 2023; mandato de senador em curso. Em 2026, o snapshot oficial do TSE de 12/08/2026 o registra como candidato a vice-presidente na chapa encabeçada por Romeu Zema.', 'Vice-Presidente', NULL::text),
    ('francisco-dias', 'Francisco Dias foi lançado pela Unidade Popular como pré-candidato ao Governo do Rio Grande do Norte em 2026. O Blog do Barreto registrou em 1 de junho de 2026 que o ato de lançamento ocorreu em 30 de maio. No snapshot oficial do TSE de 12/08/2026, Francisco Dias aparece como candidato a vice-governador na chapa encabeçada por Arinalda do MLB.', 'Vice-Governador', 'RN'),
    ('geraldo-alckmin', 'Geraldo Alckmin é médico e político brasileiro, filiado ao PSB. Foi governador de São Paulo em vários mandatos (2001–2006 e 2011–2018) pelo PSDB; é vice-presidente da República e ministro no governo federal desde 2023. Em 2026, o snapshot oficial do TSE de 12/08/2026 o registra como candidato a vice-presidente na chapa encabeçada por Lula.', 'Vice-Presidente', NULL::text),
    ('luiz-carlos-teodoro', 'Luiz Carlos Teodoro é advogado e ativista na área de direitos humanos, filiado ao Partido Socialismo e Liberdade em Rondônia. Preside a Comissão de Direitos Humanos da OAB-RO desde outubro de 2023 e teve o nome oficializado pelo PSOL como pré-candidato ao governo de Rondônia em 2026, em cenário anterior às convenções partidárias e ao registro oficial de candidatura. No snapshot oficial do TSE de 12/08/2026, Luiz Carlos Teodoro aparece como candidato a vice-governador na chapa encabeçada por Expedito Netto.', 'Vice-Governador', 'RO'),
    ('rafael-greca', 'Rafael Valdomiro Greca de Macedo é economista, engenheiro civil, escritor e político brasileiro, filiado ao Movimento Democrático Brasileiro (MDB) em 2026. A trajetória partidária documentada na auditoria editorial e no TSE segue a sequência PFL (mandatos legislativos até 2006), PMDB/MDB, PMN, DEM, PSD e MDB, considerando que PMDB e MDB são a mesma legenda partidária com mudança institucional de sigla em 2017. Foi prefeito de Curitiba por três mandatos. Após deixar a prefeitura, assumiu a Secretaria de Desenvolvimento Sustentável do Paraná; o snapshot oficial do TSE de 12/08/2026 o registra como candidato a vice-governador na chapa encabeçada por Sandro Alex.', 'Vice-Governador', 'PR'),
    ('raquel-bricio', 'Raquel Nonato de Brício, nascida em 12 de outubro de 1991 em Moju (PA), mudou-se para Belém aos 12 anos. É guarda portuária federal na Companhia Docas do Pará e diretora do Sindicato dos Portuários do Pará e Amapá (Sindiporto PA/AP). Tem formação em gestão de recursos humanos e cursa Direito na Universidade Federal do Pará (UFPA). Iniciou a militância no movimento estudantil, tendo sido presidente do grêmio estudantil em 2007 no atual Instituto Federal do Pará. Já disputou eleições anteriores: candidata a vereadora de Belém em 2020, a deputada estadual em 2022 e a prefeita de Belém pela Unidade Popular em 2024 (número 80), sem ser eleita. Em 2026, o snapshot oficial do TSE de 12/08/2026 a registra como candidata a vice-presidente na chapa encabeçada por Samara Martins.', 'Vice-Presidente', NULL::text)
  ) AS e(slug,biografia_nova,cargo,uf)
    ON c.slug=e.slug
   AND c.biografia=e.biografia_nova
   AND c.cargo_disputado=e.cargo
   AND c.estado IS NOT DISTINCT FROM e.uf
   AND c.ultima_atualizacao='2026-08-13T11:17:09Z'::timestamptz;
  IF n<>6 THEN RAISE EXCEPTION 'readback: esperava 6 biografias novas exatas, encontrou %',n; END IF;
END $$;
