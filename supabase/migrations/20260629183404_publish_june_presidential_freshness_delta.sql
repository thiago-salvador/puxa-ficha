BEGIN;

-- Delta de frescor Junho/2026:
-- - publica Aécio Neves como pré-candidato presidencial com fonte de junho;
-- - retira enquadramento de governador de João Roma, Gilson Machado e Lahesio Bonfim.

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
  data_nascimento,
  naturalidade,
  formacao,
  profissao_declarada,
  biografia,
  foto_url,
  publicavel,
  fonte_dados
) AS (
  VALUES
    (
      'aecio-neves',
      'Aécio Neves da Cunha',
      'Aécio Neves',
      'Partido da Social Democracia Brasileira',
      'PSDB',
      'Deputado federal por Minas Gerais',
      'Presidente',
      NULL,
      'pre-candidato',
      'pre-candidato',
      '1960-03-10'::date,
      'Belo Horizonte/MG',
      'Superior',
      'Deputado federal',
      'Aécio Neves da Cunha é deputado federal por Minas Gerais pelo PSDB. A Câmara dos Deputados registra seu mandato em exercício, e fontes jornalísticas de junho de 2026 o listaram ou testaram no campo de pré-candidatos à Presidência da República.',
      'https://www.camara.leg.br/internet/deputado/bandep/74646.jpg',
      true,
      ARRAY['curadoria', 'camara-dados-abertos', 'gazeta-do-povo', 'folha-datafolha']::text[]
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
  data_nascimento,
  naturalidade,
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
  data_nascimento,
  naturalidade,
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
  data_nascimento = EXCLUDED.data_nascimento,
  naturalidade = EXCLUDED.naturalidade,
  formacao = EXCLUDED.formacao,
  profissao_declarada = EXCLUDED.profissao_declarada,
  biografia = EXCLUDED.biografia,
  foto_url = EXCLUDED.foto_url,
  publicavel = EXCLUDED.publicavel,
  fonte_dados = EXCLUDED.fonte_dados,
  ultima_atualizacao = EXCLUDED.ultima_atualizacao;

WITH updates (slug, estado, biografia, fonte) AS (
  VALUES
    (
      'joao-roma',
      'BA',
      'João Inácio Ribeiro Roma Neto é ex-deputado federal pela Bahia, ex-ministro da Cidadania e presidente do PL na Bahia. Em junho de 2026, a curadoria passou a tratá-lo como nome ao Senado, não como pré-candidato ao Governo da Bahia.',
      'auditoria-junho-2026'
    ),
    (
      'gilson-machado',
      'PE',
      'Gilson Machado Guimarães Neto foi ministro do Turismo no governo Jair Bolsonaro. Em junho de 2026, a curadoria passou a tratá-lo como nome ao Senado por Pernambuco e apoiador de Raquel Lyra, não como pré-candidato ao Governo de Pernambuco.',
      'auditoria-junho-2026'
    ),
    (
      'lahesio-bonfim',
      'MA',
      'Lahesio Rodrigues Bonfim é médico, ex-prefeito de São Pedro dos Crentes e foi candidato ao Governo do Maranhão em 2022. Em junho de 2026, fonte local registrou a migração do projeto eleitoral para o Senado, retirando o enquadramento de pré-candidato ao governo.',
      'auditoria-junho-2026'
    )
)
UPDATE public.candidatos c
SET
  cargo_disputado = 'Senador',
  estado = u.estado,
  status = 'pre-candidato',
  situacao_candidatura = 'pre-candidato',
  publicavel = false,
  biografia = u.biografia,
  fonte_dados = (
    SELECT ARRAY(
      SELECT DISTINCT value
      FROM unnest(COALESCE(c.fonte_dados, ARRAY[]::text[]) || ARRAY[u.fonte]::text[]) AS source(value)
      ORDER BY value
    )
  ),
  ultima_atualizacao = NOW()
FROM updates u
WHERE c.slug = u.slug;

WITH noticias (slug, titulo, fonte, url, data_publicacao, snippet) AS (
  VALUES
    (
      'aecio-neves',
      'Candidatos à presidência da República em 2026: quem segue na corrida',
      'Gazeta do Povo',
      'https://www.gazetadopovo.com.br/eleicoes/2026/candidatos-presidente-da-republica-quem-segue-na-corrida-e-quem-ja-caiu-fora/',
      '2026-06-15T12:00:00-03:00'::timestamptz,
      'Gazeta do Povo listou Aécio Neves entre nomes da corrida presidencial de 2026.'
    ),
    (
      'aecio-neves',
      'Datafolha divulga nova pesquisa sobre a eleição presidencial',
      'Folha/Datafolha',
      'https://www1.folha.uol.com.br/amp/poder/2026/06/datafolha-nova-pesquisa-sobre-eleicao-presidencial-e-divulgada-neste-sabado-20.shtml',
      '2026-06-20T12:00:00-03:00'::timestamptz,
      'Folha/Datafolha testou Aécio Neves em cenário presidencial divulgado em junho de 2026.'
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

INSERT INTO public.historico_politico (
  candidato_id,
  cargo,
  periodo_inicio,
  periodo_fim,
  partido,
  estado,
  eleito_por,
  observacoes
)
SELECT
  c.id,
  'Deputado Federal',
  2023,
  NULL,
  'PSDB',
  'MG',
  'voto direto',
  'Mandato em exercício confirmado pela Câmara dos Deputados; usado como lastro oficial mínimo para a ficha presidencial de junho de 2026.'
FROM public.candidatos c
WHERE c.slug = 'aecio-neves'
ON CONFLICT (candidato_id, cargo, periodo_inicio) DO UPDATE
SET
  periodo_fim = EXCLUDED.periodo_fim,
  partido = EXCLUDED.partido,
  estado = EXCLUDED.estado,
  eleito_por = EXCLUDED.eleito_por,
  observacoes = EXCLUDED.observacoes;

DO $$
DECLARE
  public_aecio_count integer;
  senate_reclassified_count integer;
BEGIN
  SELECT count(*) INTO public_aecio_count
  FROM public.candidatos_publico
  WHERE slug = 'aecio-neves'
    AND cargo_disputado = 'Presidente'
    AND status = 'pre-candidato';

  IF public_aecio_count <> 1 THEN
    RAISE EXCEPTION 'freshness delta: aecio-neves nao ficou publico como Presidente: %', public_aecio_count;
  END IF;

  SELECT count(*) INTO senate_reclassified_count
  FROM public.candidatos
  WHERE slug IN ('joao-roma', 'gilson-machado', 'lahesio-bonfim')
    AND cargo_disputado = 'Senador'
    AND publicavel = false
    AND status = 'pre-candidato';

  IF senate_reclassified_count <> 3 THEN
    RAISE EXCEPTION 'freshness delta: esperava 3 reclassificados para Senado, encontrei %', senate_reclassified_count;
  END IF;
END $$;

COMMIT;
