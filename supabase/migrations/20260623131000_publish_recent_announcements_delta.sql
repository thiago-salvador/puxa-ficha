BEGIN;

-- Delta editorial do radar de anúncios recentes de 2026-06-23.
-- Fontes operacionais:
-- - output/candidacy-full-review-20260623/recent-announcements-20260623.json
-- - output/candidacy-full-review-20260623/recent-announcements-20260623.md
--
-- Escopo:
-- - Publica faltantes fortes de Governador e Vivian Mendes como item priorizado pelo Thiago.
-- - Corrige Paulo Serra para Deputado Federal.
-- - Corrige André do Prado e Capitão Wagner para Senado, sem publicá-los nesta rodada.
-- - Não publica Ana Paula Rezende por falta de confirmação suficiente.

WITH candidate_payload (
  slug,
  nome_completo,
  nome_urna,
  partido_atual,
  partido_sigla,
  cargo_atual,
  cargo_disputado,
  estado,
  status,
  situacao_candidatura,
  formacao,
  profissao_declarada,
  biografia,
  foto_url,
  publicavel,
  fonte_dados
) AS (
  VALUES
    (
      'samara-mineiro',
      'Samara Mineiro',
      'Samara Mineiro',
      'Unidade Popular',
      'UP',
      NULL,
      'Governador',
      'DF',
      'pre-candidato',
      'pre-candidato',
      NULL,
      NULL,
      'Samara Mineiro é apresentada pela Unidade Popular como pré-candidata ao Governo do Distrito Federal em 2026. O lançamento foi registrado pelo Brasil de Fato em 28 de maio de 2026 e pelo Metrópoles em 1 de junho de 2026.',
      NULL,
      true,
      ARRAY['curadoria', 'brasil-de-fato', 'metropoles', 'auditoria-cidada']::text[]
    ),
    (
      'jarbas-soares',
      'Jarbas Soares',
      'Jarbas Soares',
      'Partido Socialista Brasileiro',
      'PSB',
      NULL,
      'Governador',
      'MG',
      'pre-candidato',
      'pre-candidato',
      NULL,
      NULL,
      'Jarbas Soares é apresentado como pré-candidato do PSB ao Governo de Minas Gerais em 2026. O Tempo registrou em 3 de junho de 2026 o anúncio da pré-candidatura após o partido indicar candidatura própria.',
      NULL,
      true,
      ARRAY['curadoria', 'o-tempo']::text[]
    ),
    (
      'serley-leal',
      'Serley Leal',
      'Serley Leal',
      'Unidade Popular',
      'UP',
      NULL,
      'Governador',
      'CE',
      'pre-candidato',
      'pre-candidato',
      NULL,
      NULL,
      'Serley Leal foi oficializado pela Unidade Popular como pré-candidato ao Governo do Ceará em 2026. O Povo registrou em 9 de junho de 2026 que a UP Ceará apresentou a pré-candidatura no fim de maio.',
      NULL,
      true,
      ARRAY['curadoria', 'o-povo']::text[]
    ),
    (
      'francisco-dias',
      'Francisco Dias',
      'Francisco Dias',
      'Unidade Popular',
      'UP',
      NULL,
      'Governador',
      'RN',
      'pre-candidato',
      'pre-candidato',
      NULL,
      NULL,
      'Francisco Dias foi lançado pela Unidade Popular como pré-candidato ao Governo do Rio Grande do Norte em 2026. O Blog do Barreto registrou em 1 de junho de 2026 que o ato de lançamento ocorreu em 30 de maio.',
      NULL,
      true,
      ARRAY['curadoria', 'blog-do-barreto']::text[]
    ),
    (
      'vivian-mendes',
      'Vivian Mendes',
      'Vivian Mendes',
      'Unidade Popular',
      'UP',
      NULL,
      'Governador',
      'SP',
      'pre-candidato',
      'pre-candidato',
      NULL,
      NULL,
      'Vivian Mendes foi lançada pela Unidade Popular como pré-candidata ao Governo de São Paulo em 2026. ABCdoABC e A Verdade registraram em 1 de maio de 2026 o lançamento de pré-candidaturas da UP em São Paulo.',
      NULL,
      true,
      ARRAY['curadoria', 'abcdoabc', 'a-verdade']::text[]
    ),
    (
      'paulo-serra',
      'Paulo Henrique Pinto Serra',
      'Paulo Serra',
      'Partido da Social Democracia Brasileira',
      'PSDB',
      NULL,
      'Deputado Federal',
      'SP',
      'pre-candidato',
      'pre-candidato',
      NULL,
      NULL,
      'Paulo Serra deixou a disputa pelo Governo de São Paulo em 2026 e passou a mirar uma candidatura a deputado federal. CNN Brasil e Poder360 registraram a mudança em 21 de junho de 2026.',
      NULL,
      true,
      ARRAY['curadoria', 'cnn-brasil', 'poder360']::text[]
    ),
    (
      'andre-do-prado',
      'Andre Luis do Prado',
      'Andre do Prado',
      'Partido Liberal',
      'PL',
      NULL,
      'Senador',
      'SP',
      'pre-candidato',
      'pre-candidato',
      NULL,
      NULL,
      'André do Prado lançou pré-candidatura ao Senado por São Paulo em 2026. O Correio da Manhã registrou em 21 de junho de 2026 o lançamento em evento realizado no dia anterior.',
      NULL,
      false,
      ARRAY['curadoria', 'correio-da-manha']::text[]
    ),
    (
      'capitao-wagner',
      'Wagner Sousa Gomes',
      'Capitão Wagner',
      'União Brasil',
      'UNIAO',
      NULL,
      'Senador',
      'CE',
      'pre-candidato',
      'pre-candidato',
      NULL,
      NULL,
      'Capitão Wagner anunciou pré-candidatura ao Senado pelo Ceará em 2026. Frisson Online registrou em 5 de junho de 2026 a pré-candidatura e a aliança com Ciro Gomes.',
      NULL,
      false,
      ARRAY['curadoria', 'frisson-online']::text[]
    )
)
INSERT INTO public.candidatos (
  slug,
  nome_completo,
  nome_urna,
  partido_atual,
  partido_sigla,
  cargo_atual,
  cargo_disputado,
  estado,
  status,
  situacao_candidatura,
  formacao,
  profissao_declarada,
  biografia,
  foto_url,
  publicavel,
  fonte_dados,
  ultima_atualizacao
)
SELECT
  slug,
  nome_completo,
  nome_urna,
  partido_atual,
  partido_sigla,
  cargo_atual,
  cargo_disputado,
  estado,
  status,
  situacao_candidatura,
  formacao,
  profissao_declarada,
  biografia,
  foto_url,
  publicavel,
  fonte_dados,
  NOW()
FROM candidate_payload
ON CONFLICT (slug) DO UPDATE
SET
  nome_completo = EXCLUDED.nome_completo,
  nome_urna = EXCLUDED.nome_urna,
  partido_atual = EXCLUDED.partido_atual,
  partido_sigla = EXCLUDED.partido_sigla,
  cargo_atual = EXCLUDED.cargo_atual,
  cargo_disputado = EXCLUDED.cargo_disputado,
  estado = EXCLUDED.estado,
  status = EXCLUDED.status,
  situacao_candidatura = EXCLUDED.situacao_candidatura,
  formacao = EXCLUDED.formacao,
  profissao_declarada = EXCLUDED.profissao_declarada,
  biografia = EXCLUDED.biografia,
  foto_url = COALESCE(EXCLUDED.foto_url, public.candidatos.foto_url),
  publicavel = EXCLUDED.publicavel,
  fonte_dados = EXCLUDED.fonte_dados,
  ultima_atualizacao = EXCLUDED.ultima_atualizacao;

WITH noticias (slug, titulo, fonte, url, data_publicacao, snippet) AS (
  VALUES
    (
      'samara-mineiro',
      'Unidade Popular lança Samara Mineiro como pré-candidata ao Governo do DF',
      'Brasil de Fato',
      'https://www.brasildefato.com.br/2026/05/28/unidade-popular-lanca-samara-mineiro-como-pre-candidata-ao-governo-do-df/',
      '2026-05-28T11:36:11+00:00'::timestamptz,
      'Brasil de Fato registrou o lançamento de Samara Mineiro como pré-candidata da UP ao Governo do Distrito Federal.'
    ),
    (
      'jarbas-soares',
      'Jarbas Soares anuncia pré-candidatura ao governo após PSB indicar candidato próprio ao governo de MG',
      'O Tempo',
      'https://www.otempo.com.br/eleicoes/2026/governadores/2026/6/3/jarbas-soares-anuncia-pre-candidatura-ao-governo-apos-psb-indicar-candidato-proprio-ao-governo-de-mg',
      '2026-06-03T12:00:00-03:00'::timestamptz,
      'O Tempo registrou o anúncio da pré-candidatura de Jarbas Soares ao Governo de Minas Gerais pelo PSB.'
    ),
    (
      'serley-leal',
      'UP Ceará oficializa pré-candidato ao governo e nomes para Câmara e Assembleia',
      'O Povo',
      'https://mais.opovo.com.br/jornal/politica/2026/06/09/up-ceara-oficializa-pre-candidato-ao-governo-e-nomes-para-camara-e-assembleia.html',
      '2026-06-09T01:15:00+00:00'::timestamptz,
      'O Povo registrou que a UP Ceará lançou Serley Leal como pré-candidato ao Governo do Ceará.'
    ),
    (
      'francisco-dias',
      'Unidade Popular (UP) lança pré-candidaturas no Rio Grande do Norte',
      'Blog do Barreto',
      'https://blogdobarreto.com.br/unidade-popular-up-lanca-pre-candidaturas-no-rio-grande-do-norte/',
      '2026-06-01T12:00:00-03:00'::timestamptz,
      'Blog do Barreto registrou ato da UP em 30 de maio com lançamento de Francisco Dias ao Governo do RN.'
    ),
    (
      'vivian-mendes',
      'Unidade Popular lança pré-candidaturas em SP',
      'ABCdoABC',
      'https://www.abcdoabc.com.br/abc/noticia/unidade-popular-lanca-pre-candidaturas-2026-defesa-moradia-transporte-publicos-272443',
      '2026-05-01T12:00:00-03:00'::timestamptz,
      'ABCdoABC registrou o lançamento de Vivian Mendes como pré-candidata da UP ao Governo de São Paulo.'
    ),
    (
      'paulo-serra',
      'Paulo Serra desiste de disputar governo de SP',
      'CNN Brasil',
      'https://www.cnnbrasil.com.br/eleicoes/paulo-serra-desiste-de-disputar-governo-de-sp/',
      '2026-06-21T12:00:00-03:00'::timestamptz,
      'CNN Brasil registrou que Paulo Serra desistiu da disputa pelo Governo de São Paulo e passou a mirar a Câmara dos Deputados.'
    ),
    (
      'andre-do-prado',
      'André do Prado lança pré-candidatura ao Senado',
      'Correio da Manhã',
      'https://www.correiodamanha.com.br/nacional/sao-paulo/estado-de-sao-paulo/2026/06/295590-andre-do-prado-lanca-pre-candidatura-ao-senado.html',
      '2026-06-21T12:00:00-03:00'::timestamptz,
      'Correio da Manhã registrou lançamento de André do Prado como pré-candidato ao Senado por São Paulo.'
    ),
    (
      'capitao-wagner',
      'Capitão Wagner anuncia pré-candidatura ao Senado',
      'Frisson Online',
      'https://www.frissononline.com.br/entrevistas/168357/capitao-wagner-anuncia-pre-candidatura-ao-senado-e-detalha-alianca-com-ciro-gomes-para-2026',
      '2026-06-05T12:00:00-03:00'::timestamptz,
      'Frisson Online registrou anúncio de Capitão Wagner como pré-candidato ao Senado pelo Ceará.'
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

COMMIT;
