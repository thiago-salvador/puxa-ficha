-- ============================================
-- Legislacao full-site: rafael-fonteles / ALEPI SAPL / legislacao_mandato_executivo
-- Seed ampliado parcial: projetos de lei enviados pelo Governador
-- ============================================
-- Fonte oficial: Assembleia Legislativa do Estado do Piaui - SAPL
-- Artefato: fonte interna de curadoria
-- Coverage: rafael-fonteles-pi-sapl-projetos-governo-ampliado-parcial-lote-a-20260507
-- Esta migration NAO escreve em projetos_lei.

DO $$
DECLARE
  cand_id uuid;
  lme_total int;
  projetos_count int;
  mandato_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'rafael-fonteles' AND publicavel = true;
  IF cand_id IS NULL THEN
    RAISE NOTICE 'rafael-fonteles: candidato ausente neste banco local/CI minimo; seed LME SAPL pulado';
    RETURN;
  END IF;
  SELECT count(*) INTO lme_total FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
  SELECT count(*) INTO projetos_count FROM projetos_lei WHERE candidato_id = cand_id;
  IF lme_total NOT IN (0, 7) THEN
    RAISE EXCEPTION 'Pre-condicao rafael-fonteles: esperadas 0 rows atuais ou 7 idempotentes em LME, encontradas %', lme_total;
  END IF;
  IF projetos_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao rafael-fonteles: projetos_lei deve permanecer 0, encontrado %', projetos_count;
  END IF;
  SELECT count(*) INTO mandato_count
  FROM historico_politico hp
  WHERE hp.candidato_id = cand_id
    AND hp.tipo_evento = 'mandato'
    AND UPPER(COALESCE(hp.estado, '')) = 'PI'
    AND (hp.cargo ILIKE '%Governador%' OR hp.cargo_canonico = 'Governador')
    AND COALESCE(hp.periodo_inicio, 9999) <= 2024
    AND COALESCE(hp.periodo_fim, 9999) >= 2023;
  IF mandato_count < 1 THEN
    RAISE EXCEPTION 'Pre-condicao rafael-fonteles: mandato Governador/PI compativel com 2023-2024 nao encontrado';
  END IF;
END $$;

CREATE TEMP TABLE _seed_rafael_fonteles_pi_sapl_lote_a_lme ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('projeto_enviado_pelo_executivo', 'estadual', 'PI', NULL, 'projeto de lei ordinaria do governo', '4/2023', 2023, '2023-03-21', 'Cria o Instituto da Regularização Fundiária e do Patrimônio Imobiliário Piauí - INTERPI e dá outras providências.', NULL, 'titular', 'https://sapl.al.pi.leg.br/materia/17924/autoria', 'Assembleia Legislativa do Estado do Piaui - SAPL', 'https://sapl.al.pi.leg.br/sessao/2278/ordemdia', 'SAPL-ALEPI:PLOG:4:2023:MATERIA-17924', '{"source":"SAPL ALEPI","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-fonteles-pi-sapl-projetos-governo-lote-a-20260507","coverage_id":"rafael-fonteles-pi-sapl-projetos-governo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_pi_sapl_projetos_governo_2023_2024_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"SAPL autoria lista Rafael Tajra Fonteles - Governador como Primeiro Autor Sim","sapl_materia_id":"17924","sapl_sessao_id":"2278","fonte_oficial_verificada_em":"2026-05-07T23:14:14.842Z","source_proof":{"identificador_fonte":"SAPL-ALEPI:PLOG:4:2023:MATERIA-17924","fonte_primaria_url":"https://sapl.al.pi.leg.br/materia/17924/autoria","fonte_tramitacao_url":"https://sapl.al.pi.leg.br/sessao/2278/ordemdia","http_status_autoria":200,"http_status_sessao":200,"http_status_sessao_data":200,"contains_titulo":true,"contains_autor_governador":true,"contains_primeiro_autor_sim":true,"contains_ementa":true,"ementa_tokens_checked":["cria","instituto","regularizacao","fundiaria","patrimonio","imobiliario","piaui","interpi","outras","providencias"],"contains_data_sessao":true,"source_text_length":6454}}'::jsonb),
    ('projeto_enviado_pelo_executivo', 'estadual', 'PI', NULL, 'projeto de lei ordinaria do governo', '11/2023', 2023, '2023-03-21', 'Altera a Lei nº 4.761, de 31 de maio de 1995, e o art. 4º da Lei nº 5.493, de 09 de setembro de 2005.', NULL, 'titular', 'https://sapl.al.pi.leg.br/materia/17939/autoria', 'Assembleia Legislativa do Estado do Piaui - SAPL', 'https://sapl.al.pi.leg.br/sessao/2278/ordemdia', 'SAPL-ALEPI:PLOG:11:2023:MATERIA-17939', '{"source":"SAPL ALEPI","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-fonteles-pi-sapl-projetos-governo-lote-a-20260507","coverage_id":"rafael-fonteles-pi-sapl-projetos-governo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_pi_sapl_projetos_governo_2023_2024_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"SAPL autoria lista Rafael Tajra Fonteles - Governador como Primeiro Autor Sim","sapl_materia_id":"17939","sapl_sessao_id":"2278","fonte_oficial_verificada_em":"2026-05-07T23:14:14.842Z","source_proof":{"identificador_fonte":"SAPL-ALEPI:PLOG:11:2023:MATERIA-17939","fonte_primaria_url":"https://sapl.al.pi.leg.br/materia/17939/autoria","fonte_tramitacao_url":"https://sapl.al.pi.leg.br/sessao/2278/ordemdia","http_status_autoria":200,"http_status_sessao":200,"http_status_sessao_data":200,"contains_titulo":true,"contains_autor_governador":true,"contains_primeiro_autor_sim":true,"contains_ementa":true,"ementa_tokens_checked":["altera","maio","1995","setembro","2005"],"contains_data_sessao":true,"source_text_length":6455}}'::jsonb),
    ('projeto_enviado_pelo_executivo', 'estadual', 'PI', NULL, 'projeto de lei ordinaria do governo', '19/2023', 2023, '2023-03-21', 'Autoriza o Poder Executivo a contratar operação de crédito junto ao Banco do Brasil S.A, com a garantia da União, até o valor de R$ 2.000.000.000,00, destinados à viabilização de investimentos nas áreas de infraestrutura de transportes, mobilidade urbana, obras de urbanização, segurança pública, saúde, infraestrutura hídrica e aporte de capital para empresas estatais ou sociedades de economia mista.', NULL, 'titular', 'https://sapl.al.pi.leg.br/materia/17966/autoria', 'Assembleia Legislativa do Estado do Piaui - SAPL', 'https://sapl.al.pi.leg.br/sessao/2278/ordemdia', 'SAPL-ALEPI:PLOG:19:2023:MATERIA-17966', '{"source":"SAPL ALEPI","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-fonteles-pi-sapl-projetos-governo-lote-a-20260507","coverage_id":"rafael-fonteles-pi-sapl-projetos-governo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_pi_sapl_projetos_governo_2023_2024_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"SAPL autoria lista Rafael Tajra Fonteles - Governador como Primeiro Autor Sim","sapl_materia_id":"17966","sapl_sessao_id":"2278","fonte_oficial_verificada_em":"2026-05-07T23:14:14.842Z","source_proof":{"identificador_fonte":"SAPL-ALEPI:PLOG:19:2023:MATERIA-17966","fonte_primaria_url":"https://sapl.al.pi.leg.br/materia/17966/autoria","fonte_tramitacao_url":"https://sapl.al.pi.leg.br/sessao/2278/ordemdia","http_status_autoria":200,"http_status_sessao":200,"http_status_sessao_data":200,"contains_titulo":true,"contains_autor_governador":true,"contains_primeiro_autor_sim":true,"contains_ementa":true,"ementa_tokens_checked":["autoriza","poder","executivo","contratar","operacao","credito","junto","banco","brasil","garantia"],"contains_data_sessao":true,"source_text_length":6455}}'::jsonb),
    ('projeto_enviado_pelo_executivo', 'estadual', 'PI', NULL, 'projeto de lei ordinaria do governo', '22/2024', 2024, '2024-05-22', 'Altera dispositivos da Lei nº 4.257, de 06 de janeiro de 1989, da Lei nº 4.254, de 27 de dezembro de 1988, e da Lei nº 7.001, de 13 de julho de 2017.', NULL, 'titular', 'https://sapl.al.pi.leg.br/materia/19418/autoria', 'Assembleia Legislativa do Estado do Piaui - SAPL', 'https://sapl.al.pi.leg.br/sessao/2450/ordemdia', 'SAPL-ALEPI:PLOG:22:2024:MATERIA-19418', '{"source":"SAPL ALEPI","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-fonteles-pi-sapl-projetos-governo-lote-a-20260507","coverage_id":"rafael-fonteles-pi-sapl-projetos-governo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_pi_sapl_projetos_governo_2023_2024_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"SAPL autoria lista Rafael Tajra Fonteles - Governador como Primeiro Autor Sim","sapl_materia_id":"19418","sapl_sessao_id":"2450","fonte_oficial_verificada_em":"2026-05-07T23:14:14.842Z","source_proof":{"identificador_fonte":"SAPL-ALEPI:PLOG:22:2024:MATERIA-19418","fonte_primaria_url":"https://sapl.al.pi.leg.br/materia/19418/autoria","fonte_tramitacao_url":"https://sapl.al.pi.leg.br/sessao/2450/ordemdia","http_status_autoria":200,"http_status_sessao":200,"http_status_sessao_data":200,"contains_titulo":true,"contains_autor_governador":true,"contains_primeiro_autor_sim":true,"contains_ementa":true,"ementa_tokens_checked":["altera","dispositivos","janeiro","1989","dezembro","1988","julho","2017"],"contains_data_sessao":true,"source_text_length":12420}}'::jsonb),
    ('projeto_enviado_pelo_executivo', 'estadual', 'PI', NULL, 'projeto de lei ordinaria do governo', '27/2024', 2024, '2024-05-22', 'Altera a Lei nº 3.808, de 16 de julho de 1981; a Lei nº 3.936, de 3 de julho de 1984; a Lei Complementar nº 17, de 8 de janeiro de 1996; a Lei Complementar nº 68, de 23 de março de 2006, e dá outras providências.', NULL, 'titular', 'https://sapl.al.pi.leg.br/materia/19558/autoria', 'Assembleia Legislativa do Estado do Piaui - SAPL', 'https://sapl.al.pi.leg.br/sessao/2450/ordemdia', 'SAPL-ALEPI:PLOG:27:2024:MATERIA-19558', '{"source":"SAPL ALEPI","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-fonteles-pi-sapl-projetos-governo-lote-a-20260507","coverage_id":"rafael-fonteles-pi-sapl-projetos-governo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_pi_sapl_projetos_governo_2023_2024_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"SAPL autoria lista Rafael Tajra Fonteles - Governador como Primeiro Autor Sim","sapl_materia_id":"19558","sapl_sessao_id":"2450","fonte_oficial_verificada_em":"2026-05-07T23:14:14.842Z","source_proof":{"identificador_fonte":"SAPL-ALEPI:PLOG:27:2024:MATERIA-19558","fonte_primaria_url":"https://sapl.al.pi.leg.br/materia/19558/autoria","fonte_tramitacao_url":"https://sapl.al.pi.leg.br/sessao/2450/ordemdia","http_status_autoria":200,"http_status_sessao":200,"http_status_sessao_data":200,"contains_titulo":true,"contains_autor_governador":true,"contains_primeiro_autor_sim":true,"contains_ementa":true,"ementa_tokens_checked":["altera","julho","1981","julho","1984","complementar","janeiro","1996","complementar","marco"],"contains_data_sessao":true,"source_text_length":12420}}'::jsonb),
    ('projeto_enviado_pelo_executivo', 'estadual', 'PI', NULL, 'projeto de lei ordinaria do governo', '31/2024', 2024, '2024-05-22', 'Autoriza a convocação para o Exame de Saúde do Concurso Público regido pelo Edital nº 001/2021, que visa o ingresso em Curso de Formação de Oficiais PM, da Polícia Militar do Estado do Piauí.', NULL, 'titular', 'https://sapl.al.pi.leg.br/materia/19554/autoria', 'Assembleia Legislativa do Estado do Piaui - SAPL', 'https://sapl.al.pi.leg.br/sessao/2450/ordemdia', 'SAPL-ALEPI:PLOG:31:2024:MATERIA-19554', '{"source":"SAPL ALEPI","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-fonteles-pi-sapl-projetos-governo-lote-a-20260507","coverage_id":"rafael-fonteles-pi-sapl-projetos-governo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_pi_sapl_projetos_governo_2023_2024_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"SAPL autoria lista Rafael Tajra Fonteles - Governador como Primeiro Autor Sim","sapl_materia_id":"19554","sapl_sessao_id":"2450","fonte_oficial_verificada_em":"2026-05-07T23:14:14.842Z","source_proof":{"identificador_fonte":"SAPL-ALEPI:PLOG:31:2024:MATERIA-19554","fonte_primaria_url":"https://sapl.al.pi.leg.br/materia/19554/autoria","fonte_tramitacao_url":"https://sapl.al.pi.leg.br/sessao/2450/ordemdia","http_status_autoria":200,"http_status_sessao":200,"http_status_sessao_data":200,"contains_titulo":true,"contains_autor_governador":true,"contains_primeiro_autor_sim":true,"contains_ementa":true,"ementa_tokens_checked":["autoriza","convocacao","exame","saude","concurso","publico","regido","edital","2021","visa"],"contains_data_sessao":true,"source_text_length":12420}}'::jsonb),
    ('projeto_enviado_pelo_executivo', 'estadual', 'PI', NULL, 'projeto de lei ordinaria do governo', '32/2024', 2024, '2024-05-22', 'Altera a Lei nº 8.327, de 02 de abril de 2024, que dispõe sobre a criação do Programa Alfabetiza Piauí, destinado à alfabetização de jovens e adultos no Estado do Piauí, e revoga a Lei nº 7.497, de 20 de abril de 2021, e a Lei nº 7.880, de 25 de novembro de 2022.', NULL, 'titular', 'https://sapl.al.pi.leg.br/materia/19559/autoria', 'Assembleia Legislativa do Estado do Piaui - SAPL', 'https://sapl.al.pi.leg.br/sessao/2450/ordemdia', 'SAPL-ALEPI:PLOG:32:2024:MATERIA-19559', '{"source":"SAPL ALEPI","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-fonteles-pi-sapl-projetos-governo-lote-a-20260507","coverage_id":"rafael-fonteles-pi-sapl-projetos-governo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_pi_sapl_projetos_governo_2023_2024_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"SAPL autoria lista Rafael Tajra Fonteles - Governador como Primeiro Autor Sim","sapl_materia_id":"19559","sapl_sessao_id":"2450","fonte_oficial_verificada_em":"2026-05-07T23:14:14.842Z","source_proof":{"identificador_fonte":"SAPL-ALEPI:PLOG:32:2024:MATERIA-19559","fonte_primaria_url":"https://sapl.al.pi.leg.br/materia/19559/autoria","fonte_tramitacao_url":"https://sapl.al.pi.leg.br/sessao/2450/ordemdia","http_status_autoria":200,"http_status_sessao":200,"http_status_sessao_data":200,"contains_titulo":true,"contains_autor_governador":true,"contains_primeiro_autor_sim":true,"contains_ementa":true,"ementa_tokens_checked":["altera","abril","2024","dispoe","criacao","programa","alfabetiza","piaui","destinado","alfabetizacao"],"contains_data_sessao":true,"source_text_length":12420}}'::jsonb)
) AS v(
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
);

WITH target AS (
  SELECT
    c.id AS candidato_id,
    seed.*,
    (
      SELECT hp.id
      FROM historico_politico hp
      WHERE hp.candidato_id = c.id
        AND hp.tipo_evento = 'mandato'
        AND UPPER(COALESCE(hp.estado, '')) = 'PI'
        AND (hp.cargo ILIKE '%Governador%' OR hp.cargo_canonico = 'Governador')
        AND COALESCE(hp.periodo_inicio, 9999) <= seed.ano
        AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
      ORDER BY hp.periodo_inicio DESC NULLS LAST, hp.id
      LIMIT 1
    ) AS historico_politico_id
  FROM candidatos c
  CROSS JOIN _seed_rafael_fonteles_pi_sapl_lote_a_lme seed
  WHERE c.slug = 'rafael-fonteles' AND c.publicavel = true
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
  target.data_norma::date,
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
  cand_id uuid;
  total_count int;
  scope_count int;
  projetos_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'rafael-fonteles' AND publicavel = true;
  IF cand_id IS NULL THEN
    RAISE NOTICE 'rafael-fonteles: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;
  SELECT count(*) INTO total_count FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
  SELECT count(*) INTO scope_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'rafael-fonteles-pi-sapl-projetos-governo-ampliado-parcial-lote-a-20260507'
    AND metadata->>'coverage_scope' = 'inventario_ampliado_parcial_pi_sapl_projetos_governo_2023_2024_lote_a_20260507'
    AND autoridade_papel = 'titular';
  SELECT count(*) INTO projetos_count FROM projetos_lei WHERE candidato_id = cand_id;
  IF total_count <> 7 THEN
    RAISE EXCEPTION 'Pos-apply rafael-fonteles: total LME esperado 7, encontrado %', total_count;
  END IF;
  IF scope_count <> 7 THEN
    RAISE EXCEPTION 'Pos-apply rafael-fonteles: esperadas 7 rows com coverage alvo, encontradas %', scope_count;
  END IF;
  IF projetos_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply rafael-fonteles: projetos_lei deve permanecer 0, encontrado %', projetos_count;
  END IF;
  RAISE NOTICE 'Pos-apply rafael-fonteles ALEPI SAPL Lote A: legislacao_mandato_executivo=% coverage_scope=% projetos_lei=%', total_count, scope_count, projetos_count;
END $$;
