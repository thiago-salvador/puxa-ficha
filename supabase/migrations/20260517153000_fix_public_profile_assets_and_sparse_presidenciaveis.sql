-- Corrige assets e contexto público dos novos presidenciáveis sem inventar dado eleitoral.
-- Aplicação remota exige autorização explícita do usuário, conforme curadoria interna.

UPDATE public.candidatos
SET
  foto_url = 'https://upload.wikimedia.org/wikipedia/commons/1/1f/Cabo_Daciolo_em_maio_de_2017.jpg',
  fonte_dados = (
    SELECT array_agg(DISTINCT source ORDER BY source)
    FROM unnest(
      COALESCE(public.candidatos.fonte_dados, '{}'::text[])
      || ARRAY['Wikimedia Commons/Câmara dos Deputados']
    ) AS source
  ),
  ultima_atualizacao = NOW()
WHERE slug = 'cabo-daciolo'
  AND foto_url IN (
    'https://www.camara.leg.br/internet/deputado/bandep/178938.jpg',
    'https://www.camara.leg.br/internet/deputado/bandep/178938.jpgmaior.jpg'
  );

UPDATE public.candidatos
SET
  foto_url = 'https://upload.wikimedia.org/wikipedia/commons/0/02/Dr._Daniel_Santos.jpg',
  fonte_dados = (
    SELECT array_agg(DISTINCT source ORDER BY source)
    FROM unnest(
      COALESCE(public.candidatos.fonte_dados, '{}'::text[])
      || ARRAY['Wikimedia Commons/Flickr']
    ) AS source
  ),
  ultima_atualizacao = NOW()
WHERE slug = 'dr-daniel'
  AND (
    foto_url IS NULL
    OR foto_url = 'https://www.ananindeua.pa.gov.br/midias/gcon/gestor_25_30185759.jpg'
  );

UPDATE public.candidatos
SET
  foto_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Lucas_Ribeiro_-_Vice-governador_da_Para%C3%ADba_2025.jpg/960px-Lucas_Ribeiro_-_Vice-governador_da_Para%C3%ADba_2025.jpg',
  fonte_dados = (
    SELECT array_agg(DISTINCT source ORDER BY source)
    FROM unnest(
      COALESCE(public.candidatos.fonte_dados, '{}'::text[])
      || ARRAY['Wikimedia Commons/Ascomlr']
    ) AS source
  ),
  ultima_atualizacao = NOW()
WHERE slug = 'lucas-ribeiro'
  AND (
    foto_url IS NULL
    OR foto_url = 'https://paraiba.pb.gov.br/governadoria/imagens/copy_of_LucosRibeiro.jpeg/@@images/f4330518-18f3-452c-b7fb-4eb2e0d1c516.jpeg'
  );

UPDATE public.candidatos
SET
  foto_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Dr.natasha_Slhessarenko.jpg/960px-Dr.natasha_Slhessarenko.jpg',
  fonte_dados = (
    SELECT array_agg(DISTINCT source ORDER BY source)
    FROM unnest(
      COALESCE(public.candidatos.fonte_dados, '{}'::text[])
      || ARRAY['Wikimedia Commons']
    ) AS source
  ),
  ultima_atualizacao = NOW()
WHERE slug = 'natasha-slhessarenko'
  AND (
    foto_url IS NULL
    OR foto_url = 'https://cdn.olivre.com.br/wp-content/uploads/2022/05/16144825/Natasha-Slhessarenko-PSB.jpg'
  );

UPDATE public.candidatos
SET
  biografia = 'Augusto Jorge Cury é médico psiquiatra, professor e escritor. O Avante o apresentou como pré-candidato à Presidência em 5 de abril de 2026, e a Band registrou o lançamento da pré-candidatura em Belo Horizonte em 6 de maio de 2026. Não há registro deferido no TSE para 2026 nem SQ eleitoral anterior localizado nesta curadoria; por isso patrimônio, receitas de campanha e votos eleitorais estruturados ficam ausentes até novo registro oficial.',
  fonte_dados = (
    SELECT array_agg(DISTINCT source ORDER BY source)
    FROM unnest(
      COALESCE(public.candidatos.fonte_dados, '{}'::text[])
      || ARRAY['Avante', 'Band', 'curadoria']
    ) AS source
  ),
  ultima_atualizacao = NOW()
WHERE slug = 'augusto-cury';

UPDATE public.candidatos
SET
  biografia = 'Edmilson Silva Costa é economista, professor universitário e dirigente do PCB. O Comitê Central do Partido Comunista Brasileiro anunciou sua pré-candidatura à Presidência em fevereiro de 2026; a FAPESP registra seu perfil acadêmico como pesquisador. Não há registro deferido no TSE para 2026 nem SQ eleitoral local confirmado nesta curadoria; por isso patrimônio, receitas e votos eleitorais estruturados ficam ausentes por limite de fonte, não por falha de ingestão.',
  fonte_dados = (
    SELECT array_agg(DISTINCT source ORDER BY source)
    FROM unnest(
      COALESCE(public.candidatos.fonte_dados, '{}'::text[])
      || ARRAY['PCB', 'FAPESP', 'curadoria']
    ) AS source
  ),
  ultima_atualizacao = NOW()
WHERE slug = 'edmilson-costa';

WITH noticias(slug, titulo, fonte, url, data_publicacao, snippet) AS (
  VALUES
    (
      'augusto-cury',
      'Augusto Cury é apresentado como pré-candidato à Presidência da República pelo Avante',
      'Avante',
      'https://avante70.org.br/noticias/augusto-cury-e-apresentado-como-pre-candidato-a-presidencia-da-republica-pelo-avante/',
      '2026-04-05T12:00:00-03:00'::timestamptz,
      'O Avante apresentou oficialmente Augusto Cury como pré-candidato à Presidência, destacando inteligência emocional, educação e gestão humanizada.'
    ),
    (
      'augusto-cury',
      'Augusto Cury lança pré-candidatura à Presidência da República',
      'Band',
      'https://www.band.com.br/politica/eleicoes/2026/augusto-cury-lanca-pre-candidatura-a-presidencia-da-republica',
      '2026-05-07T00:46:00-03:00'::timestamptz,
      'A Band registrou o lançamento da pré-candidatura de Augusto Cury pelo Avante em Belo Horizonte, com propostas apresentadas no evento.'
    ),
    (
      'edmilson-costa',
      'Edmilson Costa pré-candidato à presidência do Brasil',
      'PCB',
      'https://pcb.org.br/portal2/33675',
      '2026-02-24T12:00:00-03:00'::timestamptz,
      'O PCB anunciou a decisão do Comitê Central de lançar Edmilson Costa como pré-candidato à Presidência da República em 2026.'
    ),
    (
      'edmilson-costa',
      'Edmilson Silva Costa',
      'FAPESP',
      'https://bv.fapesp.br/pt/pesquisador/103200/edmilson-silva-costa/',
      '2026-05-17T12:00:00-03:00'::timestamptz,
      'A Biblioteca Virtual da FAPESP mantém perfil acadêmico de Edmilson Silva Costa, usado aqui como fonte biográfica complementar.'
    )
)
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
FROM noticias n
JOIN public.candidatos c ON c.slug = n.slug
ON CONFLICT (candidato_id, url) DO UPDATE
SET
  titulo = EXCLUDED.titulo,
  fonte = EXCLUDED.fonte,
  data_publicacao = EXCLUDED.data_publicacao,
  snippet = EXCLUDED.snippet;
