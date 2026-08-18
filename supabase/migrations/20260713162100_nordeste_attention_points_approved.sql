-- Pontos de atencao editoriais aprovados para a regiao Nordeste.
-- Os sete fatos possuem comprovacao nos dossies por UF e aprovacao em
-- fonte interna de curadoria
-- Idempotente por candidato_id, categoria e titulo.
BEGIN;

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n
  FROM public.candidatos
  WHERE (id, slug) IN (
    ('2df15aa1-0bd3-4bab-89bf-13d780645e54'::uuid, 'ciro-gomes-gov-ce'),
    ('8bef8b10-5c52-4e34-bf65-7af2ccc6caae'::uuid, 'efraim-filho'),
    ('b8ad0e9c-eb0f-4b37-bdf9-840c5d167016'::uuid, 'lucas-ribeiro'),
    ('3721c0c9-3b8b-4258-b453-6350b51dc0c8'::uuid, 'anderson-ferreira'),
    ('57b743d5-db7b-4048-862d-9378a9fff366'::uuid, 'rafael-fonteles'),
    ('c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid, 'alvaro-dias-rn'),
    ('8e6f8d4c-7981-499e-b03b-5778e1db704d'::uuid, 'valmir-de-francisquinho')
  );

  IF n <> 7 THEN
    RAISE EXCEPTION 'Alertas Nordeste: esperados 7 candidatos com id e slug confirmados, encontrados %', n;
  END IF;
END $$;

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '2df15aa1-0bd3-4bab-89bf-13d780645e54',
  'processo_grave',
  'Denúncia por violência política de gênero foi recebida pela Justiça Eleitoral',
  'Em julho de 2024, a 115ª Zona Eleitoral recebeu denúncia do Ministério Público contra Ciro Gomes por violência política de gênero, relacionada a declarações sobre a senadora Janaína Farias. O recebimento da denúncia tornou-o réu, mas não equivale a condenação.',
  '[{"url":"https://mpce.mp.br/denuncia-do-mp-contra-ciro-gomes-por-crime-de-violencia-politica-de-genero-e-aceita-pela-justica-eleitoral/","data":"2024-07-11","titulo":"Denúncia do MP contra Ciro Gomes é aceita pela Justiça Eleitoral"}]'::jsonb,
  'media', true, 'curadoria', true, '2024-07-11'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = '2df15aa1-0bd3-4bab-89bf-13d780645e54'
    AND categoria = 'processo_grave'
    AND titulo = 'Denúncia por violência política de gênero foi recebida pela Justiça Eleitoral'
);

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '8bef8b10-5c52-4e34-bf65-7af2ccc6caae',
  'justica_eleitoral',
  'MP Eleitoral ajuizou representação por propaganda antecipada em evento público',
  'Em junho de 2026, o MP Eleitoral ajuizou representação contra Efraim Filho por suposta propaganda eleitoral antecipada e conduta vedada durante o São João de Campina Grande. O órgão pediu remoção de conteúdo e multas; o ajuizamento não representa condenação.',
  '[{"url":"https://www.mpf.mp.br/o-mpf/unidades/pr-pb/noticias/mp-eleitoral-ajuiza-representacao-por-propaganda-eleitoral-antecipada-e-conduta-vedada-durante-sao-joao-de-campina-grande","data":"2026-06-09","titulo":"Representação eleitoral, processo 0600091-10.2026.6.15.0000"}]'::jsonb,
  'baixa', true, 'curadoria', true, '2026-06-09'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = '8bef8b10-5c52-4e34-bf65-7af2ccc6caae'
    AND categoria = 'justica_eleitoral'
    AND titulo = 'MP Eleitoral ajuizou representação por propaganda antecipada em evento público'
);

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  'b8ad0e9c-eb0f-4b37-bdf9-840c5d167016',
  'justica_eleitoral',
  'Multado pelo TRE-PB por propaganda eleitoral antecipada em 2026',
  'Em julho de 2026, o TRE-PB reconheceu propaganda eleitoral antecipada em vídeo gravado em unidade pública de saúde e aplicou multa de R$ 10 mil a Lucas Ribeiro. A decisão também determinou a remoção e vedou a republicação do conteúdo.',
  '[{"url":"https://www.tre-pb.jus.br/comunicacao/noticias/2026/Julho/tre-pb-decide-acoes-sobre-propaganda-eleitoral-na-pre-campanha","data":"2026-07-01","titulo":"TRE-PB decide ações sobre propaganda eleitoral na pré-campanha"}]'::jsonb,
  'baixa', true, 'curadoria', true, '2026-07-01'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = 'b8ad0e9c-eb0f-4b37-bdf9-840c5d167016'
    AND categoria = 'justica_eleitoral'
    AND titulo = 'Multado pelo TRE-PB por propaganda eleitoral antecipada em 2026'
);

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '3721c0c9-3b8b-4258-b453-6350b51dc0c8',
  'justica_eleitoral',
  'TRE-PE aplicou multa de R$ 50 mil por propaganda eleitoral antecipada',
  'Em julho de 2022, o TRE-PE condenou Anderson Ferreira e o PL por propaganda eleitoral antecipada em 100 outdoors e aplicou multa de R$ 50 mil a cada um. A decisão divulgada pelo tribunal ainda admitia recurso ao TSE.',
  '[{"url":"https://www.tre-pe.jus.br/comunicacao/noticias/2022/Julho/tre-pe-condena-pl-e-presidente-estadual-do-partido-por-propaganda-antecipada","data":"2022-07-04","titulo":"TRE-PE condena PL e presidente estadual por propaganda antecipada"}]'::jsonb,
  'baixa', true, 'curadoria', true, '2022-07-04'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = '3721c0c9-3b8b-4258-b453-6350b51dc0c8'
    AND categoria = 'justica_eleitoral'
    AND titulo = 'TRE-PE aplicou multa de R$ 50 mil por propaganda eleitoral antecipada'
);

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '57b743d5-db7b-4048-862d-9378a9fff366',
  'justica_eleitoral',
  'MP Eleitoral abriu procedimento sobre possível promoção em evento público',
  'Em maio de 2026, o MP Eleitoral no Piauí abriu procedimento preparatório para apurar suposto abuso de poder político e propaganda antecipada em evento carnavalesco oficial que teria promovido Rafael Fonteles. O procedimento é preliminar e não representa condenação.',
  '[{"url":"https://biblioteca.mpf.mp.br/server/api/core/bitstreams/635c7912-de13-462b-88a4-55fcc21b99dc/content","data":"2026-05-18","titulo":"Portaria de conversão em Procedimento Preparatório Eleitoral"}]'::jsonb,
  'baixa', true, 'curadoria', true, '2026-05-18'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = '57b743d5-db7b-4048-862d-9378a9fff366'
    AND categoria = 'justica_eleitoral'
    AND titulo = 'MP Eleitoral abriu procedimento sobre possível promoção em evento público'
);

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  'c89aaf3b-a9a7-4a95-856a-5b65df38cc80',
  'justica_eleitoral',
  'Réu em ação eleitoral sobre abuso de poder nas eleições de 2024',
  'Em fevereiro de 2025, o MPRN informou que Álvaro Dias permaneceu no polo passivo de ação de investigação judicial eleitoral sobre suposto abuso de poder político e econômico nas eleições municipais de 2024. A ação pede inelegibilidade, mas a fonte não registra julgamento de mérito.',
  '[{"url":"https://www.mprn.mp.br/noticias/natal-mprn-obtem-decisao-favoravel-e-mantem-ex-prefeito-de-natal-no-polo-passivo-de-acao-eleitoral/","data":"2025-02-20","titulo":"MPRN mantém ex-prefeito no polo passivo de ação eleitoral"}]'::jsonb,
  'media', true, 'curadoria', true, '2025-02-20'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'
    AND categoria = 'justica_eleitoral'
    AND titulo = 'Réu em ação eleitoral sobre abuso de poder nas eleições de 2024'
);

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '8e6f8d4c-7981-499e-b03b-5778e1db704d',
  'justica_eleitoral',
  'TSE manteve a negativa do registro de candidatura em 2022',
  'Em setembro de 2022, o TSE manteve a decisão do TRE-SE que negou o registro de candidatura de Valmir de Francisquinho ao governo de Sergipe. O indeferimento se baseou em decisão de 2019 que havia decretado sua inelegibilidade; este alerta descreve o pleito de 2022 e não presume a situação eleitoral atual.',
  '[{"url":"https://www.tre-se.jus.br/comunicacao/noticias/2022/Setembro/nota-de-esclarecimento-sobre-a-candidatura-de-valmir-de-francisquinho","data":"2022-09-29","titulo":"Nota de esclarecimento sobre a candidatura de Valmir de Francisquinho"},{"url":"https://noticias.stf.jus.br/postsnoticias/decisao-do-ministro-barroso-mantem-inelegibilidade-de-pre-candidato-ao-governo-de-sergipe/","data":"2022-08-23","titulo":"Decisão do ministro Barroso mantém inelegibilidade no contexto de 2022"}]'::jsonb,
  'media', true, 'curadoria', true, '2022-09-29'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = '8e6f8d4c-7981-499e-b03b-5778e1db704d'
    AND categoria = 'justica_eleitoral'
    AND titulo = 'TSE manteve a negativa do registro de candidatura em 2022'
);

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n
  FROM (
    SELECT candidato_id, categoria, titulo
    FROM public.pontos_atencao
    WHERE (candidato_id, categoria, titulo) IN (
      ('2df15aa1-0bd3-4bab-89bf-13d780645e54'::uuid, 'processo_grave', 'Denúncia por violência política de gênero foi recebida pela Justiça Eleitoral'),
      ('8bef8b10-5c52-4e34-bf65-7af2ccc6caae'::uuid, 'justica_eleitoral', 'MP Eleitoral ajuizou representação por propaganda antecipada em evento público'),
      ('b8ad0e9c-eb0f-4b37-bdf9-840c5d167016'::uuid, 'justica_eleitoral', 'Multado pelo TRE-PB por propaganda eleitoral antecipada em 2026'),
      ('3721c0c9-3b8b-4258-b453-6350b51dc0c8'::uuid, 'justica_eleitoral', 'TRE-PE aplicou multa de R$ 50 mil por propaganda eleitoral antecipada'),
      ('57b743d5-db7b-4048-862d-9378a9fff366'::uuid, 'justica_eleitoral', 'MP Eleitoral abriu procedimento sobre possível promoção em evento público'),
      ('c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid, 'justica_eleitoral', 'Réu em ação eleitoral sobre abuso de poder nas eleições de 2024'),
      ('8e6f8d4c-7981-499e-b03b-5778e1db704d'::uuid, 'justica_eleitoral', 'TSE manteve a negativa do registro de candidatura em 2022')
    )
      AND verificado = true
      AND gerado_por = 'curadoria'
      AND visivel = true
      AND jsonb_typeof(fontes) = 'array'
      AND jsonb_array_length(fontes) >= 1
      AND data_referencia IS NOT NULL
    GROUP BY candidato_id, categoria, titulo
    HAVING COUNT(*) = 1
  ) AS verified_semantic_rows;

  IF n <> 7 THEN
    RAISE EXCEPTION 'Alertas Nordeste: esperados 7 pontos públicos verificados, encontrados %', n;
  END IF;
END $$;

COMMIT;
