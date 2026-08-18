-- ============================================
-- Legislacao full-site P0-A2 desbloqueado final: projetos_lei
-- ============================================
-- Fonte oficial primaria por linha: ALEP/ALMT PDFs oficiais.
-- Sem noticia/blog/release/homepage generica.
-- Artifact: fonte interna de curadoria
-- Coverage: legislacao-p0a2-unlocked-projetos-lei-final-20260508
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO escreve em historico_politico.
-- Esta migration NAO promove completo_provado.
-- ============================================

CREATE TEMP TABLE _seed_p0a2_unlocked_final_projetos_lei (
  slug text NOT NULL,
  tipo text NOT NULL,
  numero text NOT NULL,
  ano int NOT NULL,
  ementa text NOT NULL,
  fonte text NOT NULL,
  proposicao_id_api text NOT NULL,
  url_inteiro_teor text NOT NULL,
  coverage_id text NOT NULL,
  coverage_scope text NOT NULL,
  metadata jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO _seed_p0a2_unlocked_final_projetos_lei (
  slug, tipo, numero, ano, ementa, fonte, proposicao_id_api, url_inteiro_teor,
  coverage_id, coverage_scope, metadata
)
VALUES
    ('guto-silva', 'PL', '476', 2022, 'Concede o Titulo de Cidadao Benemerito do Estado do Parana ao Excelentissimo Senhor Marlon Bonilha.', 'Assembleia Legislativa do Parana', 'ALEP:PL-476-2022:GUTO-SILVA', 'https://storage.assembleia.pr.leg.br/ordem_dia/gbYXv4myPrtTcWZLfL9D3GlCSDIuO1oIbQDP9y6j.pdf', 'legislacao-p0a2-unlocked-projetos-lei-final-20260508', 'inventario_ampliado_parcial_p0a2_unlocked_projetos_lei_final_20260508', '{"official_source_url":"https://storage.assembleia.pr.leg.br/ordem_dia/gbYXv4myPrtTcWZLfL9D3GlCSDIuO1oIbQDP9y6j.pdf","official_source_title":"Assembleia Legislativa do Parana - Projeto de Lei Ordinaria n. 476/2022","official_number_label":"Projeto de Lei Ordinaria nº 476/2022","official_date":"2022-11-08","official_author":"Deputado Guto Silva","official_proof_summary":"PDF oficial ALEP traz numero, autoria, ementa, assinatura eletronica e autuacao.","coverage_id":"legislacao-p0a2-unlocked-projetos-lei-final-20260508","coverage_scope":"inventario_ampliado_parcial_p0a2_unlocked_projetos_lei_final_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-p0a2-unlocked-projetos-lei-final-20260508","fonte_oficial":"Assembleia Legislativa do Parana","source_kind":"pdf","source_http_status":200,"author_name":"Guto Silva","autoria_literal":"AUTORES:DEPUTADO GUTO SILVA","autoria_principal_verificada":true,"no_news_blog_release_homepage_as_source":true,"no_completo_provado_promotion":true,"source_verified_at":"2026-05-08T18:43:50.161Z"}'::jsonb),
    ('otaviano-pivetta', 'PL', '191', 2009, 'Dispoe sobre a instalacao de sistema de aquecimento solar de agua em predio publico no Estado de Mato Grosso e nas habitacoes edificadas atraves de fundos publicos estaduais para atendimento da populacao de baixa renda.', 'Assembleia Legislativa do Estado de Mato Grosso', 'ALMT-ATA:2010-06-16:PL-191-2009:OTAVIANO-PIVETTA', 'https://www.al.mt.gov.br/storage/webdisco/docs_administrativos/doc_1138.pdf', 'legislacao-p0a2-unlocked-projetos-lei-final-20260508', 'inventario_ampliado_parcial_p0a2_unlocked_projetos_lei_final_20260508', '{"official_source_url":"https://www.al.mt.gov.br/storage/webdisco/docs_administrativos/doc_1138.pdf","official_source_title":"ALMT - Ata da 52a Sessao Ordinaria de 16 de junho de 2010","official_number_label":"Projeto de Lei nº 191/09","official_date":"2010-06-16","official_author":"Deputado Otaviano Pivetta","official_proof_summary":"PDF oficial ALMT enumera numero, autoria e ementa em sessao legislativa.","coverage_id":"legislacao-p0a2-unlocked-projetos-lei-final-20260508","coverage_scope":"inventario_ampliado_parcial_p0a2_unlocked_projetos_lei_final_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-p0a2-unlocked-projetos-lei-final-20260508","fonte_oficial":"Assembleia Legislativa do Estado de Mato Grosso","source_kind":"pdf","source_http_status":200,"author_name":"Otaviano Pivetta","autoria_literal":"Projeto de Lei nº 191/09, de autoria do Deputado Otaviano Pivetta","autoria_principal_verificada":true,"no_news_blog_release_homepage_as_source":true,"no_completo_provado_promotion":true,"source_verified_at":"2026-05-08T18:43:50.162Z"}'::jsonb);

DO $$
DECLARE
  seed_row record;
  cand_id uuid;
  current_pl_count int;
  current_lme_count int;
  target_count int;
  coverage_count int;
BEGIN
  FOR seed_row IN SELECT slug, count(*) AS expected_count FROM _seed_p0a2_unlocked_final_projetos_lei GROUP BY slug LOOP
    SELECT id INTO cand_id FROM candidatos WHERE slug = seed_row.slug AND publicavel = true;

    IF cand_id IS NULL THEN
      RAISE NOTICE '%: candidato ausente neste banco local/CI minimo; seed projetos_lei pulado', seed_row.slug;
      CONTINUE;
    END IF;

    SELECT count(*) INTO current_pl_count FROM projetos_lei WHERE candidato_id = cand_id;
    SELECT count(*) INTO current_lme_count FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
    SELECT count(*) INTO target_count FROM _seed_p0a2_unlocked_final_projetos_lei WHERE slug = seed_row.slug;
    SELECT count(*) INTO coverage_count
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND coverage_id = 'legislacao-p0a2-unlocked-projetos-lei-final-20260508';

    IF current_pl_count NOT IN (0, target_count) THEN
      RAISE EXCEPTION 'Pre-condicao %: projetos_lei esperado 0 ou alvo idempotente %, encontrado %', seed_row.slug, target_count, current_pl_count;
    END IF;

    IF current_pl_count = target_count AND coverage_count <> target_count THEN
      RAISE EXCEPTION 'Pre-condicao %: % rows existentes em projetos_lei mas apenas % com coverage_id alvo', seed_row.slug, target_count, coverage_count;
    END IF;

    IF current_lme_count <> 0 THEN
      RAISE EXCEPTION 'Pre-condicao %: legislacao_mandato_executivo esperado 0, encontrado %', seed_row.slug, current_lme_count;
    END IF;
  END LOOP;
END $$;

WITH target AS (
  SELECT c.id AS candidato_id, seed.*
  FROM _seed_p0a2_unlocked_final_projetos_lei seed
  JOIN candidatos c ON c.slug = seed.slug
  WHERE c.publicavel = true
)
INSERT INTO projetos_lei (
  candidato_id,
  tipo,
  numero,
  ano,
  ementa,
  fonte,
  proposicao_id_api,
  url_inteiro_teor,
  coverage_id,
  coverage_scope,
  metadata
)
SELECT
  target.candidato_id,
  target.tipo,
  target.numero,
  target.ano,
  target.ementa,
  target.fonte,
  target.proposicao_id_api,
  target.url_inteiro_teor,
  target.coverage_id,
  target.coverage_scope,
  target.metadata
FROM target
ON CONFLICT (candidato_id, proposicao_id_api) DO UPDATE SET
  tipo = EXCLUDED.tipo,
  numero = EXCLUDED.numero,
  ano = EXCLUDED.ano,
  ementa = EXCLUDED.ementa,
  fonte = EXCLUDED.fonte,
  url_inteiro_teor = EXCLUDED.url_inteiro_teor,
  coverage_id = EXCLUDED.coverage_id,
  coverage_scope = EXCLUDED.coverage_scope,
  metadata = COALESCE(projetos_lei.metadata, '{}'::jsonb) || EXCLUDED.metadata
WHERE projetos_lei.coverage_id IS NULL
   OR projetos_lei.coverage_id = EXCLUDED.coverage_id;

DO $$
DECLARE
  seed_row record;
  cand_id uuid;
  target_count int;
  coverage_count int;
  wrong_lme_count int;
  total_count int;
BEGIN
  FOR seed_row IN SELECT slug, count(*) AS expected_count FROM _seed_p0a2_unlocked_final_projetos_lei GROUP BY slug LOOP
    SELECT id INTO cand_id FROM candidatos WHERE slug = seed_row.slug AND publicavel = true;

    IF cand_id IS NULL THEN
      RAISE NOTICE '%: pos-condicao pulada porque candidato publico nao existe neste banco local/CI minimo', seed_row.slug;
      CONTINUE;
    END IF;

    SELECT count(*) INTO target_count
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND proposicao_id_api IN (
        SELECT proposicao_id_api FROM _seed_p0a2_unlocked_final_projetos_lei WHERE slug = seed_row.slug
      );

    SELECT count(*) INTO coverage_count
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND coverage_id = 'legislacao-p0a2-unlocked-projetos-lei-final-20260508'
      AND coverage_scope = 'inventario_ampliado_parcial_p0a2_unlocked_projetos_lei_final_20260508';

    SELECT count(*) INTO wrong_lme_count
    FROM legislacao_mandato_executivo
    WHERE candidato_id = cand_id;

    SELECT count(*) INTO total_count
    FROM projetos_lei
    WHERE candidato_id = cand_id;

    IF target_count <> seed_row.expected_count THEN
      RAISE EXCEPTION 'Pos-apply %: esperadas % rows alvo em projetos_lei, encontradas %', seed_row.slug, seed_row.expected_count, target_count;
    END IF;

    IF coverage_count <> seed_row.expected_count THEN
      RAISE EXCEPTION 'Pos-apply %: esperadas % rows com coverage alvo, encontradas %', seed_row.slug, seed_row.expected_count, coverage_count;
    END IF;

    IF total_count <> target_count THEN
      RAISE EXCEPTION 'Pos-apply %: total projetos_lei esperado igual ao lote %, encontrado %', seed_row.slug, target_count, total_count;
    END IF;

    IF wrong_lme_count <> 0 THEN
      RAISE EXCEPTION 'Pos-apply %: legislacao_mandato_executivo deveria permanecer 0, encontrado %', seed_row.slug, wrong_lme_count;
    END IF;
  END LOOP;
END $$;
