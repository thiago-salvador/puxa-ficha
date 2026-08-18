BEGIN;

CREATE TEMP TABLE raw_core_news_lote5 (
  slug text NOT NULL,
  titulo text NOT NULL,
  fonte text NOT NULL,
  url text NOT NULL,
  data_publicacao timestamptz NOT NULL,
  snippet text NOT NULL,
  PRIMARY KEY (slug, url)
) ON COMMIT DROP;

INSERT INTO raw_core_news_lote5 (
  slug,
  titulo,
  fonte,
  url,
  data_publicacao,
  snippet
)
VALUES
  (
    'eudo-raffael',
    'Pesquisa Real Time Big Data para governador do Acre, junho 2026',
    'Gazeta do Povo',
    'https://www.gazetadopovo.com.br/eleicoes/2026/pesquisa-eleitoral-2026/real-time-big-data-governador-senador-acre-junho-2026/',
    '2026-06-18T08:48:00-03:00'::timestamptz,
    'Levantamento Real Time Big Data publicado em junho testou Eudo Raffael no cenario para o governo do Acre.'
  ),
  (
    'thor-dantas',
    'Pesquisa Real Time Big Data para governador do Acre, junho 2026',
    'Gazeta do Povo',
    'https://www.gazetadopovo.com.br/eleicoes/2026/pesquisa-eleitoral-2026/real-time-big-data-governador-senador-acre-junho-2026/',
    '2026-06-18T08:48:00-03:00'::timestamptz,
    'Levantamento Real Time Big Data publicado em junho testou Thor Dantas no cenario para o governo do Acre.'
  ),
  (
    'huggo-leonardo',
    'Disputa pelo Governo do Ceara',
    'Ipsos',
    'https://www.ipsos.com/pt-br/disputa-pelo-governo-do-ceara',
    '2026-06-03T12:00:00-03:00'::timestamptz,
    'Pesquisa Ipsos de junho listou Huggo Leonardo entre os nomes testados para o governo do Ceara.'
  ),
  (
    'jarir-pereira',
    'Disputa pelo Governo do Ceara',
    'Ipsos',
    'https://www.ipsos.com/pt-br/disputa-pelo-governo-do-ceara',
    '2026-06-03T12:00:00-03:00'::timestamptz,
    'Pesquisa Ipsos de junho listou Jarir Pereira entre os nomes testados para o governo do Ceara.'
  ),
  (
    'ze-batista',
    'Disputa pelo Governo do Ceara',
    'Ipsos',
    'https://www.ipsos.com/pt-br/disputa-pelo-governo-do-ceara',
    '2026-06-03T12:00:00-03:00'::timestamptz,
    'Pesquisa Ipsos de junho listou Ze Batista entre os nomes testados para o governo do Ceara.'
  ),
  (
    'kiko-caputo',
    'Pesquisa mostra disputa aberta pelo Palacio do Buriti em 2026',
    'Correio Braziliense',
    'https://www.correiobraziliense.com.br/cidades-df/2026/06/7443099-pesquisa-mostra-disputa-aberta-pelo-palacio-do-buriti-em-2026.html',
    '2026-06-17T00:10:00-03:00'::timestamptz,
    'Materia de junho sobre pesquisa para o Palacio do Buriti incluiu Kiko Caputo entre os nomes testados.'
  ),
  (
    'henrique-areas',
    'Henrique Areas: PCO tem um programa unificado nacionalmente',
    'Diario Causa Operaria',
    'https://causaoperaria.org.br/2026/henrique-areas-pco-tem-um-programa-unificado-nacionalmente/',
    '2026-06-11T12:00:00-03:00'::timestamptz,
    'Entrevista publicada em junho registrou Henrique Areas como pre-candidato do PCO ao governo de Minas Gerais.'
  ),
  (
    'renato-gomes',
    'Renato Gomes: economista detalha propostas e mira o governo de MS',
    'Diario MS News',
    'https://diariomsnews.com.br/noticias/renato-gomes-economista-detalha-propostas-e-mira-o-governo-de-ms/',
    '2026-06-26T12:00:00-03:00'::timestamptz,
    'Materia de junho apresentou Renato Gomes como economista que mira o governo de Mato Grosso do Sul.'
  ),
  (
    'renan-hallais',
    'Pesquisa Real Time Big Data para governador de Pernambuco, junho 2026',
    'Gazeta do Povo',
    'https://www.gazetadopovo.com.br/eleicoes/2026/pesquisa-eleitoral-2026/real-time-big-data-pesquisa-governador-senador-pernambuco-junho-2026/',
    '2026-06-11T13:23:00-03:00'::timestamptz,
    'Levantamento Real Time Big Data publicado em junho testou Renan Hallais no cenario para o governo de Pernambuco.'
  ),
  (
    'francisco-jurity',
    'Pesquisa AtlasIntel para governador do Piaui, junho 2026',
    'Gazeta do Povo',
    'https://www.gazetadopovo.com.br/eleicoes/2026/pesquisa-eleitoral-2026/atlasintel-governador-senador-piaui-junho-2026/',
    '2026-06-22T23:07:00-03:00'::timestamptz,
    'Levantamento AtlasIntel publicado em junho testou Francisco Jurity no cenario para o governo do Piaui.'
  ),
  (
    'gisvaldo-oliveira',
    'Pesquisa AtlasIntel para governador do Piaui, junho 2026',
    'Gazeta do Povo',
    'https://www.gazetadopovo.com.br/eleicoes/2026/pesquisa-eleitoral-2026/atlasintel-governador-senador-piaui-junho-2026/',
    '2026-06-22T23:07:00-03:00'::timestamptz,
    'Levantamento AtlasIntel publicado em junho testou Gisvaldo Oliveira no cenario para o governo do Piaui.'
  ),
  (
    'santiago-belizario',
    'Pesquisa AtlasIntel para governador do Piaui, junho 2026',
    'Gazeta do Povo',
    'https://www.gazetadopovo.com.br/eleicoes/2026/pesquisa-eleitoral-2026/atlasintel-governador-senador-piaui-junho-2026/',
    '2026-06-22T23:07:00-03:00'::timestamptz,
    'Levantamento AtlasIntel publicado em junho testou Santiago Belizario no cenario para o governo do Piaui.'
  ),
  (
    'tony-garcia',
    'Pesquisa eleitoral para governador do Parana, junho 2026',
    'Gazeta do Povo',
    'https://www.gazetadopovo.com.br/eleicoes/2026/pesquisa-eleitoral-2026/governador-senador-parana-pesquisa-parana-pesquisas-junho-2026/',
    '2026-06-09T12:37:00-03:00'::timestamptz,
    'Pesquisa Parana Pesquisas publicada em junho testou Tony Garcia no cenario para o governo do Parana.'
  ),
  (
    'rafael-luz',
    'Quaest para governador do RJ: Claudio Castro tem 20%',
    'SBT News',
    'https://sbtnews.sbt.com.br/noticia/eleicoes/quaest-para-governador-do-rj-claudio-castro-tem-20',
    '2026-06-04T12:00:00-03:00'::timestamptz,
    'Levantamento Quaest publicado em junho testou Rafael Luz no cenario para o governo do Rio de Janeiro.'
  ),
  (
    'pedro-abib',
    'Pedro Abib defende industrializacao, dialogo e desenvolvimento ao lancar pre-candidatura ao Governo de Rondonia pelo MDB',
    'Rondonia Dinamica',
    'https://www.rondoniadinamica.com/noticias/2026/06/pedro-abib-defende-industrializacao-dialogo-e-desenvolvimento-ao-lancar-pre-candidatura-ao-governo-de-rondonia-pelo-mdb%2C246005.shtml',
    '2026-06-02T08:40:00-03:00'::timestamptz,
    'Materia de junho registrou o lancamento da pre-candidatura de Pedro Abib ao governo de Rondonia pelo MDB.'
  ),
  (
    'ricardo-frota',
    'Da direita a centro-esquerda, Frota explica ida ao PDT',
    'Rondonia Dinamica',
    'https://www.rondoniadinamica.com/noticias/2026/06/da-direita-a-centro-esquerda-frota-explica-ida-ao-pdt-e-diz-que-acusacao-de-euma-tourinho-prejudica-sua-imagem-ate-hoje%2C245907.shtml',
    '2026-06-01T08:31:00-03:00'::timestamptz,
    'Entrevista publicada em junho contextualizou a ida de Ricardo Frota ao PDT e sua movimentacao eleitoral em Rondonia.'
  ),
  (
    'dr-helton-monteiro',
    'Eleicoes 2026: pesquisa aponta favoritismo de Fabio Mitidieri para Governo de Sergipe',
    'AJN1',
    'https://ajn1.com.br/eleicoes-2026-pesquisa-aponta-favoritismo-de-fabio-mitidieri-para-governo-de-sergipe/',
    '2026-06-15T12:00:00-03:00'::timestamptz,
    'Pesquisa divulgada em junho incluiu Dr. Helton Monteiro entre os nomes testados para o governo de Sergipe.'
  ),
  (
    'ricardo-marques',
    'Eleicoes 2026: pesquisa aponta favoritismo de Fabio Mitidieri para Governo de Sergipe',
    'AJN1',
    'https://ajn1.com.br/eleicoes-2026-pesquisa-aponta-favoritismo-de-fabio-mitidieri-para-governo-de-sergipe/',
    '2026-06-15T12:00:00-03:00'::timestamptz,
    'Pesquisa divulgada em junho incluiu Ricardo Marques entre os nomes testados para o governo de Sergipe.'
  ),
  (
    'izadora-dias',
    'Comeca o XII Congresso do Partido da Causa Operaria',
    'Diario Causa Operaria',
    'https://causaoperaria.org.br/2026/comeca-o-xii-congresso-do-partido-da-causa-operaria/',
    '2026-06-06T12:00:00-03:00'::timestamptz,
    'Materia de junho registrou a participacao de Izadora Dias na direcao do PCO; a validacao da pre-candidatura permanece na curadoria previa.'
  );

INSERT INTO public.noticias_candidato (
  candidato_id,
  titulo,
  fonte,
  url,
  data_publicacao,
  snippet
)
SELECT
  c.id,
  n.titulo,
  n.fonte,
  n.url,
  n.data_publicacao,
  n.snippet
FROM raw_core_news_lote5 n
JOIN public.candidatos c ON c.slug = n.slug
WHERE c.publicavel IS TRUE
ON CONFLICT (candidato_id, url) DO UPDATE
SET
  titulo = EXCLUDED.titulo,
  fonte = EXCLUDED.fonte,
  data_publicacao = EXCLUDED.data_publicacao,
  snippet = EXCLUDED.snippet;

DO $$
DECLARE
  expected integer;
  actual integer;
  missing_public integer;
  still_without_news integer;
BEGIN
  SELECT count(*) INTO expected FROM raw_core_news_lote5;

  IF expected <> 19 THEN
    RAISE EXCEPTION 'raw core news lote5 expected 19 rows, got %', expected;
  END IF;

  SELECT count(*) INTO missing_public
  FROM raw_core_news_lote5 n
  LEFT JOIN public.candidatos c
    ON c.slug = n.slug
   AND c.publicavel IS TRUE
  WHERE c.id IS NULL;

  IF missing_public <> 0 THEN
    RAISE EXCEPTION 'raw core news lote5 has % missing or non-public slugs', missing_public;
  END IF;

  SELECT count(*) INTO actual
  FROM raw_core_news_lote5 n
  JOIN public.candidatos c ON c.slug = n.slug
  JOIN public.noticias_candidato nc
    ON nc.candidato_id = c.id
   AND nc.url = n.url;

  IF actual <> expected THEN
    RAISE EXCEPTION 'raw core news lote5 noticias mismatch: expected %, got %', expected, actual;
  END IF;

  SELECT count(*) INTO still_without_news
  FROM raw_core_news_lote5 n
  JOIN public.candidatos c ON c.slug = n.slug
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.noticias_candidato nc
    WHERE nc.candidato_id = c.id
  );

  IF still_without_news <> 0 THEN
    RAISE EXCEPTION 'raw core news lote5 still without any news after enrichment: %', still_without_news;
  END IF;
END $$;

COMMIT;
