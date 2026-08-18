-- PE matriz estadual: materializa os quatro gaps acionaveis que ainda apareciam no HTML.
-- Escopo: Camila Falcao/Renan Hallais perfil estruturado; Joao Campos/Raquel Lyra legislacao executiva.
-- Fontes:
-- - JC, 2026-04-27, Unidade Popular lanca Professora Camila como pre-candidata ao governo de Pernambuco.
-- - Blog do Mario Flavio / Portal de Prefeitura, 2026-01-15, Renan Hallais confirmado pelo Missao.
-- - Prefeitura do Recife, 2021-08-30, Joao Campos sanciona leis de PPPs e leilao de bens imoveis.
-- - ADEPE/Governo de Pernambuco, maio/2024, Raquel Lyra sanciona a Lei 18.531.

BEGIN;

UPDATE public.candidatos
SET
  naturalidade = 'Vitoria de Santo Antao/PE',
  formacao = 'Historia',
  profissao_declarada = 'Professora da educacao popular',
  ultima_atualizacao = now()
WHERE slug = 'camila-falcao';

UPDATE public.candidatos
SET
  formacao = 'Contabilidade; pos-graduacao em Financas, Investimentos e Banking',
  profissao_declarada = 'Diretor jornalistico e coordenador do MBL em Pernambuco',
  ultima_atualizacao = now()
WHERE slug = 'renan-hallais';

CREATE TEMP TABLE _pe_legislacao_exec_html_gap ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (
      'joao-campos',
      'lei_sancionada',
      'municipal',
      'PE',
      'Recife',
      'lei municipal',
      'PL 12/2021',
      2021,
      '2021-08-30',
      'Atualiza a Lei Municipal 17.856/2013 sobre Parcerias Publico-Privadas e concessoes no Recife; a mesma sanção tambem abrangeu lei sobre venda de bens imoveis por leilao.',
      'JOAO CAMPOS',
      'titular',
      'https://www2.recife.pe.gov.br/noticias/30/08/2021/prefeitura-sanciona-leis-regulamentando-novas-ppps-e-leilao-para-venda-de-bens',
      'Prefeitura sanciona leis regulamentando as novas PPPs e leilao para venda de bens imoveis da Prefeitura do Recife',
      'RECIFE-PREFEITURA-2021-08-30-PPPS-LEILAO',
      '{"source":"Prefeitura do Recife","data_real":true,"slug":"joao-campos","coverage_id":"joao-campos-recife-legislacao-executiva-recorte-oficial-20260708","coverage_scope":"recorte_oficial_prefeitura_recife_sancao_2021_ppps_leilao","coverage_status":"recorte_oficial","tabela_alvo":"legislacao_mandato_executivo","source_verified_at":"2026-07-08","official_source_url":"https://www2.recife.pe.gov.br/noticias/30/08/2021/prefeitura-sanciona-leis-regulamentando-novas-ppps-e-leilao-para-venda-de-bens"}'::jsonb
    ),
    (
      'raquel-lyra',
      'lei_sancionada',
      'estadual',
      'PE',
      NULL::text,
      'lei',
      '18.531',
      2024,
      '2024-05-03',
      'Institui o Programa de Desenvolvimento do Polo de Confeccoes do Agreste de Pernambuco - PE Produz Polo de Confeccoes.',
      'RAQUEL LYRA',
      'titular',
      'https://www.adepe.pe.gov.br/governadora-raquel-lyra-sanciona-lei-que-cria-o-pe-produz-polo-de-confeccoes-e-fortalece-empresas-do-agreste/',
      'Governadora Raquel Lyra sanciona lei que cria o PE Produz Polo de Confeccoes e fortalece empresas do Agreste',
      'PE-ADEPE-LEI-18531-2024',
      '{"source":"ADEPE / Governo de Pernambuco","data_real":true,"slug":"raquel-lyra","coverage_id":"raquel-lyra-pe-legislacao-executiva-recorte-oficial-20260708","coverage_scope":"recorte_oficial_lei_18531_2024_pe_produz_polo_confeccoes","coverage_status":"recorte_oficial","tabela_alvo":"legislacao_mandato_executivo","source_verified_at":"2026-07-08","official_source_url":"https://www.adepe.pe.gov.br/governadora-raquel-lyra-sanciona-lei-que-cria-o-pe-produz-polo-de-confeccoes-e-fortalece-empresas-do-agreste/"}'::jsonb
    )
) AS v(
  slug,
  tipo_relacao,
  esfera,
  uf_norma,
  municipio_norma,
  tipo_norma,
  numero,
  ano,
  data_norma,
  ementa,
  signatario,
  autoridade_papel,
  fonte_primaria_url,
  fonte_primaria_titulo,
  identificador_fonte,
  metadata
);

WITH target AS (
  SELECT
    c.id AS candidato_id,
    seed.*,
    (
      SELECT hp.id
      FROM public.historico_politico hp
      WHERE hp.candidato_id = c.id
        AND hp.tipo_evento = 'mandato'
        AND hp.cargo_canonico IN ('Prefeito', 'Governador')
        AND UPPER(COALESCE(hp.estado, '')) = 'PE'
        AND COALESCE(hp.periodo_inicio, 9999) <= seed.ano
        AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
      ORDER BY hp.periodo_inicio DESC NULLS LAST, hp.id
      LIMIT 1
    ) AS historico_politico_id
  FROM public.candidatos c
  JOIN _pe_legislacao_exec_html_gap seed ON seed.slug = c.slug
)
INSERT INTO public.legislacao_mandato_executivo (
  candidato_id,
  historico_politico_id,
  tipo_relacao,
  esfera,
  uf_norma,
  municipio_norma,
  tipo_norma,
  numero,
  ano,
  data_norma,
  ementa,
  signatario,
  autoridade_papel,
  fonte_primaria_url,
  fonte_primaria_titulo,
  identificador_fonte,
  metadata
)
SELECT
  candidato_id,
  historico_politico_id,
  tipo_relacao,
  esfera,
  uf_norma,
  municipio_norma,
  tipo_norma,
  numero,
  ano,
  data_norma::date,
  ementa,
  signatario,
  autoridade_papel,
  fonte_primaria_url,
  fonte_primaria_titulo,
  identificador_fonte,
  metadata
FROM target
WHERE historico_politico_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.legislacao_mandato_executivo lme
    WHERE lme.candidato_id = target.candidato_id
      AND lme.identificador_fonte = target.identificador_fonte
  );

DO $$
DECLARE
  missing_profile integer;
  missing_legislacao integer;
BEGIN
  SELECT count(*) INTO missing_profile
  FROM public.candidatos
  WHERE slug IN ('camila-falcao', 'renan-hallais')
    AND (
      formacao IS NULL
      OR profissao_declarada IS NULL
      OR (slug = 'camila-falcao' AND naturalidade IS NULL)
    );

  SELECT count(*) INTO missing_legislacao
  FROM public.candidatos c
  WHERE c.slug IN ('joao-campos', 'raquel-lyra')
    AND NOT EXISTS (
      SELECT 1
      FROM public.legislacao_mandato_executivo lme
      WHERE lme.candidato_id = c.id
        AND lme.identificador_fonte IN ('RECIFE-PREFEITURA-2021-08-30-PPPS-LEILAO', 'PE-ADEPE-LEI-18531-2024')
    );

  IF missing_profile > 0 THEN
    RAISE EXCEPTION 'PE matriz estadual: perfil estruturado incompleto para % candidatos', missing_profile;
  END IF;

  IF missing_legislacao > 0 THEN
    RAISE EXCEPTION 'PE matriz estadual: legislacao executiva incompleta para % candidatos', missing_legislacao;
  END IF;
END $$;

COMMIT;
