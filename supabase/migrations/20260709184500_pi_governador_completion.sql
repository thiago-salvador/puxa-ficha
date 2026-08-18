-- PI Governador: fechamento estrutural da coorte publica.
-- Fontes: TSE Dados Abertos consulta_cand/bem_candidato/prestacao de contas
-- 2010-2024, Governo do Piaui, SAPL ALEPI, Municipio de Floriano e fontes
-- publicas atuais registradas na curadoria PI de 2026.

BEGIN;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.candidatos
    WHERE slug IN (
      'elizeu-aguiar',
      'francisco-jurity',
      'geraldo-carvalho',
      'gisvaldo-oliveira',
      'gustavo-henrique',
      'jesus-rodrigues',
      'joel-rodrigues',
      'lourdes-melo',
      'lucia-santos',
      'mainha',
      'rafael-fonteles',
      'ravenna-castro',
      'santiago-belizario',
      'toni-rodrigues',
      'tonny-kerley'
    )
      AND publicavel = true
  ) <> 15 THEN
    RAISE EXCEPTION 'PI Governador: coorte publica esperada nao encontrada';
  END IF;
END $$;

CREATE TEMP TABLE _pi_historico_2026 ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (
      'francisco-jurity',
      'candidatura',
      'Pré-candidato a Governador do Piauí',
      'Governador',
      'PI',
      2026,
      NULL::integer,
      'DC',
      NULL::text,
      'Pré-candidatura do Democracia Cristã confirmada em entrevistas e cobertura pública de 2026; a varredura oficial TSE consulta_cand 2010-2024 não encontrou SQ seguro para o perfil Francisco Jurity/Juriti.',
      'manual'
    ),
    (
      'gisvaldo-oliveira',
      'candidatura',
      'Pré-candidato a Governador do Piauí',
      'Governador',
      'PI',
      2026,
      NULL::integer,
      'PSOL',
      NULL::text,
      'Pré-candidatura do PSOL confirmada por sabatina pública da Band Piauí e por comunicação da chapa estadual; a varredura oficial TSE consulta_cand 2010-2024 não encontrou SQ seguro para o perfil.',
      'manual'
    ),
    (
      'santiago-belizario',
      'candidatura',
      'Pré-candidato a Governador do Piauí',
      'Governador',
      'PI',
      2026,
      NULL::integer,
      'UP',
      NULL::text,
      'Pré-candidatura aprovada pelo diretório estadual da Unidade Popular em 31/05/2026; fontes públicas GP1 e Portal Clube News. O histórico TSE 2024 permanece separado e identificado pelo SQ 180001905702.',
      'manual'
    ),
    (
      'tonny-kerley',
      'candidatura',
      'Pré-candidato a Governador do Piauí',
      'Governador',
      'PI',
      2026,
      NULL::integer,
      'NOVO',
      NULL::text,
      'Nome publicado no recorte de pré-candidaturas de 2026 e testado em pesquisa AtlasIntel; fontes públicas Portal AZ, Poder360 e curadoria PI. O histórico TSE 2024 permanece separado e identificado pelo SQ 180001885637.',
      'manual'
    )
) AS v(
  slug,
  tipo_evento,
  cargo,
  cargo_canonico,
  estado,
  periodo_inicio,
  periodo_fim,
  partido,
  eleito_por,
  observacoes,
  proveniencia
);

INSERT INTO public.historico_politico (
  candidato_id,
  tipo_evento,
  cargo,
  cargo_canonico,
  estado,
  periodo_inicio,
  periodo_fim,
  partido,
  eleito_por,
  observacoes,
  proveniencia
)
SELECT
  c.id,
  h.tipo_evento,
  h.cargo,
  h.cargo_canonico,
  h.estado,
  h.periodo_inicio,
  h.periodo_fim,
  h.partido,
  h.eleito_por,
  h.observacoes,
  h.proveniencia
FROM _pi_historico_2026 h
JOIN public.candidatos c ON c.slug = h.slug
ON CONFLICT (candidato_id, cargo_canonico, periodo_inicio)
WHERE periodo_inicio IS NOT NULL AND cargo_canonico IS NOT NULL
DO UPDATE SET
  tipo_evento = EXCLUDED.tipo_evento,
  cargo = EXCLUDED.cargo,
  estado = EXCLUDED.estado,
  periodo_fim = EXCLUDED.periodo_fim,
  partido = EXCLUDED.partido,
  eleito_por = EXCLUDED.eleito_por,
  observacoes = EXCLUDED.observacoes,
  proveniencia = EXCLUDED.proveniencia;

UPDATE public.historico_politico hp
SET proveniencia = CASE
  WHEN hp.observacoes ILIKE '%curadoria%'
    OR hp.observacoes ILIKE '%Governo do Piauí%'
  THEN 'misto'
  ELSE 'tse'
END
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug IN ('joel-rodrigues', 'rafael-fonteles')
  AND hp.proveniencia IS NULL
  AND hp.observacoes ILIKE '%TSE%';

UPDATE public.candidatos c
SET
  nome_completo = 'Elizeu Morais de Aguiar',
  data_nascimento = DATE '1966-05-28',
  naturalidade = 'Teresina (PI)',
  formacao = 'Superior incompleto',
  profissao_declarada = 'Empresário',
  fonte_dados = CASE
    WHEN c.fonte_dados IS NULL THEN ARRAY['TSE']::text[]
    WHEN NOT ('TSE' = ANY(c.fonte_dados)) THEN array_append(c.fonte_dados, 'TSE')
    ELSE c.fonte_dados
  END,
  ultima_atualizacao = now()
WHERE c.slug = 'elizeu-aguiar';

UPDATE public.candidatos c
SET
  nome_completo = 'Geraldo do Nascimento Carvalho',
  data_nascimento = DATE '1958-07-16',
  naturalidade = 'Piracuruca (PI)',
  formacao = 'Superior completo',
  profissao_declarada = 'Professor de ensino superior',
  fonte_dados = CASE
    WHEN c.fonte_dados IS NULL THEN ARRAY['TSE']::text[]
    WHEN NOT ('TSE' = ANY(c.fonte_dados)) THEN array_append(c.fonte_dados, 'TSE')
    ELSE c.fonte_dados
  END,
  ultima_atualizacao = now()
WHERE c.slug = 'geraldo-carvalho';

UPDATE public.candidatos c
SET
  nome_completo = 'Gustavo Henrique Leite Feijó',
  data_nascimento = DATE '1973-11-29',
  formacao = 'Superior completo',
  profissao_declarada = 'Servidor público municipal',
  fonte_dados = CASE
    WHEN c.fonte_dados IS NULL THEN ARRAY['TSE']::text[]
    WHEN NOT ('TSE' = ANY(c.fonte_dados)) THEN array_append(c.fonte_dados, 'TSE')
    ELSE c.fonte_dados
  END,
  ultima_atualizacao = now()
WHERE c.slug = 'gustavo-henrique';

UPDATE public.candidatos c
SET
  nome_completo = 'Jesus Rodrigues Alves',
  data_nascimento = DATE '1959-04-09',
  naturalidade = 'Rio de Janeiro (RJ)',
  formacao = 'Superior completo',
  profissao_declarada = 'Empresário',
  fonte_dados = CASE
    WHEN c.fonte_dados IS NULL THEN ARRAY['TSE']::text[]
    WHEN NOT ('TSE' = ANY(c.fonte_dados)) THEN array_append(c.fonte_dados, 'TSE')
    ELSE c.fonte_dados
  END,
  ultima_atualizacao = now()
WHERE c.slug = 'jesus-rodrigues';

UPDATE public.candidatos c
SET
  nome_completo = 'Ravenna de Castro Lima Azevedo',
  data_nascimento = DATE '1986-05-15',
  formacao = 'Superior completo',
  profissao_declarada = 'Advogada',
  fonte_dados = CASE
    WHEN c.fonte_dados IS NULL THEN ARRAY['TSE']::text[]
    WHEN NOT ('TSE' = ANY(c.fonte_dados)) THEN array_append(c.fonte_dados, 'TSE')
    ELSE c.fonte_dados
  END,
  ultima_atualizacao = now()
WHERE c.slug = 'ravenna-castro';

UPDATE public.candidatos c
SET
  naturalidade = COALESCE(c.naturalidade, 'Parnaíba (PI)'),
  profissao_declarada = COALESCE(c.profissao_declarada, 'Professor aposentado e empresário'),
  fonte_dados = CASE
    WHEN c.fonte_dados IS NULL THEN ARRAY['curadoria-verificada-PI-20260709']::text[]
    WHEN NOT ('curadoria-verificada-PI-20260709' = ANY(c.fonte_dados))
      THEN array_append(c.fonte_dados, 'curadoria-verificada-PI-20260709')
    ELSE c.fonte_dados
  END,
  ultima_atualizacao = now()
WHERE c.slug = 'francisco-jurity';

UPDATE public.candidatos c
SET
  nome_completo = 'Gisvaldo Oliveira da Silva',
  formacao = 'Mestre em História do Brasil',
  profissao_declarada = 'Professor universitario',
  fonte_dados = CASE
    WHEN c.fonte_dados IS NULL THEN ARRAY['DOE-PI', 'curadoria-verificada-PI-20260709']::text[]
    ELSE (
      SELECT ARRAY(
        SELECT DISTINCT source
        FROM unnest(c.fonte_dados || ARRAY['DOE-PI', 'curadoria-verificada-PI-20260709']) AS sources(source)
      )
    )
  END,
  ultima_atualizacao = now()
WHERE c.slug = 'gisvaldo-oliveira';

-- Pontos gerados por IA sem verificacao nao podem sustentar a ficha publica.
UPDATE public.pontos_atencao pa
SET
  visivel = false,
  verificado = false,
  descricao = pa.descricao || ' [Oculto em 2026-07-09: ponto gerado por IA sem verificacao suficiente no fechamento PI Governador.]'
FROM public.candidatos c
WHERE pa.candidato_id = c.id
  AND c.slug IN (
    'elizeu-aguiar', 'francisco-jurity', 'geraldo-carvalho', 'gisvaldo-oliveira',
    'gustavo-henrique', 'jesus-rodrigues', 'joel-rodrigues', 'lourdes-melo',
    'lucia-santos', 'mainha', 'rafael-fonteles', 'ravenna-castro',
    'santiago-belizario', 'toni-rodrigues', 'tonny-kerley'
  )
  AND pa.gerado_por = 'ia'
  AND pa.verificado = false
  AND pa.visivel = true;

DO $$
DECLARE
  short_history_rows integer;
  null_history_rows integer;
  visible_unverified_ai_points integer;
  profile_rows integer;
BEGIN
  SELECT count(*) INTO short_history_rows
  FROM public.candidatos c
  WHERE c.slug IN ('francisco-jurity', 'gisvaldo-oliveira', 'santiago-belizario', 'tonny-kerley')
    AND (
      SELECT count(*)
      FROM public.historico_politico hp
      WHERE hp.candidato_id = c.id
    ) < 1;

  SELECT count(*) INTO null_history_rows
  FROM public.historico_politico hp
  JOIN public.candidatos c ON c.id = hp.candidato_id
  WHERE c.slug IN ('joel-rodrigues', 'rafael-fonteles')
    AND hp.proveniencia IS NULL;

  SELECT count(*) INTO visible_unverified_ai_points
  FROM public.pontos_atencao pa
  JOIN public.candidatos c ON c.id = pa.candidato_id
  WHERE c.slug IN (
    'elizeu-aguiar', 'francisco-jurity', 'geraldo-carvalho', 'gisvaldo-oliveira',
    'gustavo-henrique', 'jesus-rodrigues', 'joel-rodrigues', 'lourdes-melo',
    'lucia-santos', 'mainha', 'rafael-fonteles', 'ravenna-castro',
    'santiago-belizario', 'toni-rodrigues', 'tonny-kerley'
  )
    AND pa.gerado_por = 'ia'
    AND pa.verificado = false
    AND pa.visivel = true;

  SELECT count(*) INTO profile_rows
  FROM public.candidatos_publico
  WHERE slug IN ('elizeu-aguiar', 'geraldo-carvalho', 'gustavo-henrique', 'jesus-rodrigues', 'ravenna-castro')
    AND data_nascimento IS NOT NULL
    AND formacao IS NOT NULL
    AND profissao_declarada IS NOT NULL;

  IF short_history_rows > 0 THEN
    RAISE EXCEPTION 'PI Governador: historico 2026 nao materializado: %', short_history_rows;
  END IF;
  IF null_history_rows > 0 THEN
    RAISE EXCEPTION 'PI Governador: historico com proveniencia nula: %', null_history_rows;
  END IF;
  IF visible_unverified_ai_points > 0 THEN
    RAISE EXCEPTION 'PI Governador: pontos IA visiveis sem verificacao: %', visible_unverified_ai_points;
  END IF;
  IF profile_rows <> 5 THEN
    RAISE EXCEPTION 'PI Governador: perfis TSE esperados nao materializados: %', profile_rows;
  END IF;
END $$;

COMMIT;
