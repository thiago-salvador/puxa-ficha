-- ============================================
-- Legislacao full-site P0-A2 desbloqueado final: legislacao_mandato_executivo
-- ============================================
-- Fonte oficial primaria por linha: diario oficial/pagina oficial municipal.
-- Sem noticia/blog/release/homepage generica.
-- Artifact: fonte interna de curadoria
-- Coverage: legislacao-p0a2-unlocked-lme-final-20260508
-- Esta migration NAO escreve em projetos_lei.
-- Esta migration NAO escreve em historico_politico.
-- Esta migration NAO promove completo_provado.
-- ============================================

CREATE TEMP TABLE _seed_p0a2_unlocked_final_lme (
  slug text NOT NULL,
  uf_mandato text NOT NULL,
  tipo_relacao text NOT NULL,
  esfera text NOT NULL,
  uf_norma text NOT NULL,
  municipio_norma text NOT NULL,
  tipo_norma text NOT NULL,
  numero text NOT NULL,
  ano int NOT NULL,
  data_norma date NOT NULL,
  ementa text NOT NULL,
  signatario text NOT NULL,
  autoridade_papel text NOT NULL,
  fonte_primaria_url text NOT NULL,
  fonte_primaria_titulo text NOT NULL,
  fonte_tramitacao_url text,
  identificador_fonte text NOT NULL,
  metadata jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO _seed_p0a2_unlocked_final_lme (
  slug,
  uf_mandato,
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
  fonte_tramitacao_url,
  identificador_fonte,
  metadata
)
VALUES
    ('alysson-bezerra', 'RN', 'lei_sancionada', 'municipal', 'RN', 'Mossoro', 'lei complementar', '195/2023', 2023, '2023-06-26', 'Dispoe sobre a Lei Organica da Procuradoria-Geral do Municipio de Mossoro e o Estatuto dos Procuradores do Municipio, e da outras providencias.', 'ALLYSON LEANDRO BEZERRA SILVA', 'titular', 'https://dom.mossoro.rn.gov.br/pmm/uploads/publicacao/pdf/1044/DOM_-_N_117_-_Segunda-Feira%2C_26_de_Junho_de_2023.pdf', 'Diario Oficial de Mossoro DOM n. 117', 'https://dom.mossoro.rn.gov.br/dom/publicacao/1044', 'DOM-MOSSORO:117:LC-195-2023', '{"official_source_url":"https://dom.mossoro.rn.gov.br/pmm/uploads/publicacao/pdf/1044/DOM_-_N_117_-_Segunda-Feira%2C_26_de_Junho_de_2023.pdf","official_source_title":"Diario Oficial de Mossoro DOM n. 117","official_proof_summary":"PDF oficial do DOM traz prefeito, numero, data, ementa e assinatura.","coverage_id":"legislacao-p0a2-unlocked-lme-final-20260508","coverage_scope":"inventario_ampliado_parcial_p0a2_unlocked_legislacao_mandato_executivo_final_20260508","data_real":true,"fluxo":"Legislacao full-site","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"curation_batch_id":"legislacao-p0a2-unlocked-lme-final-20260508","source_kind":"pdf","source_http_status":200,"signatario":"ALLYSON LEANDRO BEZERRA SILVA","autoridade_papel_basis":"Fonte primaria oficial traz ato assinado/sancionado pelo prefeito durante mandato compativel.","no_news_blog_release_homepage_as_source":true,"no_completo_provado_promotion":true,"source_verified_at":"2026-05-08T18:43:50.164Z"}'::jsonb),
    ('clecio-luis', 'AP', 'lei_sancionada', 'municipal', 'AP', 'Macapa', 'lei complementar', '126/2018-PMM', 2018, '2018-11-14', 'Altera as Leis Complementares n. 053/2008-PMM e n. 089/2011-PMM, que dispoem sobre o Plano de Carreira e Remuneracao dos Profissionais do Grupo Ocupacional de Tributacao, Arrecadacao e Fiscalizacao do Municipio de Macapa, e da outras providencias.', 'CLECIO LUIS VILHENA VIEIRA', 'titular', 'https://macapa.ap.gov.br/portal/wp-content/uploads/2019/02/DIARIO_OF_3451_2018.pdf', 'Diario do Municipio de Macapa n. 3451', NULL, 'DOM-MACAPA:3451:LC-126-2018-PMM', '{"official_source_url":"https://macapa.ap.gov.br/portal/wp-content/uploads/2019/02/DIARIO_OF_3451_2018.pdf","official_source_title":"Diario do Municipio de Macapa n. 3451","official_proof_summary":"PDF oficial municipal traz numero, ementa, data, prefeito e autora Prefeitura Municipal de Macapa.","coverage_id":"legislacao-p0a2-unlocked-lme-final-20260508","coverage_scope":"inventario_ampliado_parcial_p0a2_unlocked_legislacao_mandato_executivo_final_20260508","data_real":true,"fluxo":"Legislacao full-site","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"curation_batch_id":"legislacao-p0a2-unlocked-lme-final-20260508","source_kind":"pdf","source_http_status":200,"signatario":"CLECIO LUIS VILHENA VIEIRA","autoridade_papel_basis":"Fonte primaria oficial traz ato assinado/sancionado pelo prefeito durante mandato compativel.","no_news_blog_release_homepage_as_source":true,"no_completo_provado_promotion":true,"source_verified_at":"2026-05-08T18:43:50.164Z"}'::jsonb),
    ('joel-rodrigues', 'PI', 'lei_sancionada', 'municipal', 'PI', 'Floriano', 'lei complementar', '018/2017', 2017, '2017-09-26', 'Atualiza e altera dispositivos da Lei Complementar nº 008 de 2005, que instituiu o Codigo Tributario do Municipio de Floriano, Estado do Piaui, e da outras providencias.', 'Joel Rodrigues da Silva', 'titular', 'https://www2.floriano.pi.gov.br/download/201905/SF24_eb42a6adab.pdf', 'Municipio de Floriano - Lei Complementar n. 018/2017', NULL, 'PM-FLORIANO:LC-018-2017', '{"official_source_url":"https://www2.floriano.pi.gov.br/download/201905/SF24_eb42a6adab.pdf","official_source_title":"Municipio de Floriano - Lei Complementar n. 018/2017","official_proof_summary":"PDF oficial municipal traz numero, data, ementa e signatario prefeito.","coverage_id":"legislacao-p0a2-unlocked-lme-final-20260508","coverage_scope":"inventario_ampliado_parcial_p0a2_unlocked_legislacao_mandato_executivo_final_20260508","data_real":true,"fluxo":"Legislacao full-site","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"curation_batch_id":"legislacao-p0a2-unlocked-lme-final-20260508","source_kind":"pdf","source_http_status":200,"signatario":"Joel Rodrigues da Silva","autoridade_papel_basis":"Fonte primaria oficial traz ato assinado/sancionado pelo prefeito durante mandato compativel.","no_news_blog_release_homepage_as_source":true,"no_completo_provado_promotion":true,"source_verified_at":"2026-05-08T18:43:50.164Z"}'::jsonb),
    ('valmir-de-francisquinho', 'SE', 'lei_sancionada', 'municipal', 'SE', 'Itabaiana', 'lei', '1.741/2014', 2014, '2014-02-20', 'Dispoe sobre a criacao do Programa de Coleta Seletiva com inclusao Social e Economica dos Catadores de Material Reciclavel e o Sistema de Logistica Reversa e seu Conselho Gestor e da outras providencias.', 'VALMIR DOS SANTOS COSTA', 'titular', 'https://itabaiana.se.gov.br/lei/lei-no-1-741-2/4062', 'Prefeitura Municipal de Itabaiana - Lei n. 1.741', NULL, 'PM-ITABAIANA:LEI-1741-2014', '{"official_source_url":"https://itabaiana.se.gov.br/lei/lei-no-1-741-2/4062","official_source_title":"Prefeitura Municipal de Itabaiana - Lei n. 1.741","official_proof_summary":"Pagina oficial da Prefeitura traz numero, data, ementa e prefeito signatario.","coverage_id":"legislacao-p0a2-unlocked-lme-final-20260508","coverage_scope":"inventario_ampliado_parcial_p0a2_unlocked_legislacao_mandato_executivo_final_20260508","data_real":true,"fluxo":"Legislacao full-site","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"curation_batch_id":"legislacao-p0a2-unlocked-lme-final-20260508","source_kind":"html","source_http_status":200,"signatario":"VALMIR DOS SANTOS COSTA","autoridade_papel_basis":"Fonte primaria oficial traz ato assinado/sancionado pelo prefeito durante mandato compativel.","no_news_blog_release_homepage_as_source":true,"no_completo_provado_promotion":true,"source_verified_at":"2026-05-08T18:43:50.164Z"}'::jsonb);

DO $$
DECLARE
  seed_row record;
  cand_id uuid;
  current_lme_count int;
  current_pl_count int;
  target_count int;
  coverage_count int;
  mandato_count int;
BEGIN
  FOR seed_row IN SELECT slug, uf_mandato, min(ano) AS min_ano, max(ano) AS max_ano, count(*) AS expected_count FROM _seed_p0a2_unlocked_final_lme GROUP BY slug, uf_mandato LOOP
    SELECT id INTO cand_id FROM candidatos WHERE slug = seed_row.slug AND publicavel = true;

    IF cand_id IS NULL THEN
      RAISE NOTICE '%: candidato ausente neste banco local/CI minimo; seed LME pulado', seed_row.slug;
      CONTINUE;
    END IF;

    SELECT count(*) INTO current_lme_count FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
    SELECT count(*) INTO current_pl_count FROM projetos_lei WHERE candidato_id = cand_id;
    SELECT count(*) INTO target_count FROM _seed_p0a2_unlocked_final_lme WHERE slug = seed_row.slug;
    SELECT count(*) INTO coverage_count
    FROM legislacao_mandato_executivo
    WHERE candidato_id = cand_id
      AND metadata->>'coverage_id' = 'legislacao-p0a2-unlocked-lme-final-20260508';
    SELECT count(*) INTO mandato_count
    FROM historico_politico hp
    WHERE hp.candidato_id = cand_id
      AND hp.tipo_evento = 'mandato'
      AND UPPER(COALESCE(hp.estado, '')) = seed_row.uf_mandato
      AND (hp.cargo ILIKE '%Prefeito%' OR hp.cargo_canonico = 'Prefeito')
      AND COALESCE(hp.periodo_inicio, 9999) <= seed_row.max_ano
      AND COALESCE(hp.periodo_fim, 9999) >= seed_row.min_ano;

    IF current_lme_count NOT IN (0, target_count) THEN
      RAISE EXCEPTION 'Pre-condicao %: LME esperado 0 ou alvo idempotente %, encontrado %', seed_row.slug, target_count, current_lme_count;
    END IF;

    IF current_lme_count = target_count AND coverage_count <> target_count THEN
      RAISE EXCEPTION 'Pre-condicao %: % rows existentes em LME mas apenas % com coverage_id alvo', seed_row.slug, target_count, coverage_count;
    END IF;

    IF current_pl_count <> 0 THEN
      RAISE EXCEPTION 'Pre-condicao %: projetos_lei esperado 0, encontrado %', seed_row.slug, current_pl_count;
    END IF;

    IF mandato_count < 1 THEN
      RAISE EXCEPTION 'Pre-condicao %: mandato Prefeito/% compativel com ano da norma nao encontrado', seed_row.slug, seed_row.uf_mandato;
    END IF;
  END LOOP;
END $$;

WITH target AS (
  SELECT
    c.id AS candidato_id,
    seed.*,
    (
      SELECT hp.id
      FROM historico_politico hp
      WHERE hp.candidato_id = c.id
        AND hp.tipo_evento = 'mandato'
        AND UPPER(COALESCE(hp.estado, '')) = seed.uf_mandato
        AND (hp.cargo ILIKE '%Prefeito%' OR hp.cargo_canonico = 'Prefeito')
        AND COALESCE(hp.periodo_inicio, 9999) <= seed.ano
        AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
      ORDER BY hp.periodo_inicio DESC NULLS LAST, hp.id
      LIMIT 1
    ) AS historico_politico_id
  FROM candidatos c
  JOIN _seed_p0a2_unlocked_final_lme seed ON seed.slug = c.slug
  WHERE c.publicavel = true
)
INSERT INTO legislacao_mandato_executivo (
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
  fonte_tramitacao_url,
  identificador_fonte,
  metadata
)
SELECT
  target.candidato_id,
  target.historico_politico_id,
  target.tipo_relacao,
  target.esfera,
  target.uf_norma,
  target.municipio_norma,
  target.tipo_norma,
  target.numero,
  target.ano,
  target.data_norma,
  target.ementa,
  target.signatario,
  target.autoridade_papel,
  target.fonte_primaria_url,
  target.fonte_primaria_titulo,
  target.fonte_tramitacao_url,
  target.identificador_fonte,
  target.metadata
FROM target
WHERE target.historico_politico_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM legislacao_mandato_executivo lme
    WHERE lme.candidato_id = target.candidato_id
      AND lme.identificador_fonte = target.identificador_fonte
  );

DO $$
DECLARE
  seed_row record;
  cand_id uuid;
  target_count int;
  coverage_count int;
  wrong_pl_count int;
BEGIN
  FOR seed_row IN SELECT slug, count(*) AS expected_count FROM _seed_p0a2_unlocked_final_lme GROUP BY slug LOOP
    SELECT id INTO cand_id FROM candidatos WHERE slug = seed_row.slug AND publicavel = true;

    IF cand_id IS NULL THEN
      RAISE NOTICE '%: pos-condicao pulada porque candidato publico nao existe neste banco local/CI minimo', seed_row.slug;
      CONTINUE;
    END IF;

    SELECT count(*) INTO target_count
    FROM legislacao_mandato_executivo
    WHERE candidato_id = cand_id
      AND identificador_fonte IN (
        SELECT identificador_fonte FROM _seed_p0a2_unlocked_final_lme WHERE slug = seed_row.slug
      );

    SELECT count(*) INTO coverage_count
    FROM legislacao_mandato_executivo
    WHERE candidato_id = cand_id
      AND metadata->>'coverage_id' = 'legislacao-p0a2-unlocked-lme-final-20260508'
      AND metadata->>'coverage_scope' = 'inventario_ampliado_parcial_p0a2_unlocked_legislacao_mandato_executivo_final_20260508';

    SELECT count(*) INTO wrong_pl_count
    FROM projetos_lei
    WHERE candidato_id = cand_id;

    IF target_count <> seed_row.expected_count THEN
      RAISE EXCEPTION 'Pos-apply %: esperadas % rows alvo em LME, encontradas %', seed_row.slug, seed_row.expected_count, target_count;
    END IF;

    IF coverage_count <> seed_row.expected_count THEN
      RAISE EXCEPTION 'Pos-apply %: esperadas % rows com coverage alvo, encontradas %', seed_row.slug, seed_row.expected_count, coverage_count;
    END IF;

    IF wrong_pl_count <> 0 THEN
      RAISE EXCEPTION 'Pos-apply %: projetos_lei deveria permanecer 0, encontrado %', seed_row.slug, wrong_pl_count;
    END IF;
  END LOOP;
END $$;
