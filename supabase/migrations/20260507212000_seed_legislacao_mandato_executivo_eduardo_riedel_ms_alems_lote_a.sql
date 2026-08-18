-- ============================================
-- Legislacao full-site: eduardo-riedel / MS ALEMS / legislacao_mandato_executivo
-- Seed ampliado parcial: Lote A projetos enviados pelo Poder Executivo
-- ============================================
-- Fonte oficial: Assembleia Legislativa de Mato Grosso do Sul - Diario Oficial Eletronico
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = eduardo-riedel-ms-alems-projetos-executivo-ampliado-parcial-lote-a-20260507
--   coverage_scope = inventario_ampliado_parcial_ms_alems_projetos_executivo_lote_a_20260507
--
-- Filtro factual: Diario Oficial ALEMS com Mensagem/GABGOV/MS,
-- Projeto de Lei, Processo, ementa, formula de envio ao Legislativo,
-- assinatura Eduardo Correa Riedel e autoridade Governador do Estado.
-- Nao e lei sancionada numerada nem inventario completo MS.
--
-- Esta migration NAO escreve em projetos_lei.
-- Esta migration NAO escreve em historico_politico.
-- ============================================

DO $$
DECLARE
  cand_id uuid;
  lme_total int;
  target_count int;
  mandato_count int;
  projetos_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'eduardo-riedel';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'eduardo-riedel: candidato ausente neste banco local/CI minimo; seed LME ALEMS pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO lme_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO target_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'eduardo-riedel-ms-alems-projetos-executivo-ampliado-parcial-lote-a-20260507';

  IF lme_total NOT IN (0, 5) THEN
    RAISE EXCEPTION 'Pre-condicao eduardo-riedel: esperadas 0 rows atuais ou 5 rows alvo idempotentes em legislacao_mandato_executivo, encontradas %', lme_total;
  END IF;

  IF lme_total = 5 AND target_count <> 5 THEN
    RAISE EXCEPTION 'Pre-condicao eduardo-riedel: 5 rows existentes, mas apenas % com coverage_id alvo', target_count;
  END IF;

  SELECT count(*) INTO projetos_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  IF projetos_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao eduardo-riedel: projetos_lei deve permanecer 0, encontrado %', projetos_count;
  END IF;

  SELECT count(*) INTO mandato_count
  FROM historico_politico hp
  WHERE hp.candidato_id = cand_id
    AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
    AND (hp.cargo ILIKE '%Governador%' OR hp.cargo_canonico = 'Governador')
    AND UPPER(COALESCE(hp.estado, '')) = 'MS'
    AND COALESCE(hp.periodo_inicio, 9999) <= 2023
    AND COALESCE(hp.periodo_fim, 9999) >= 2023;

  IF mandato_count < 1 THEN
    RAISE EXCEPTION 'Pre-condicao eduardo-riedel: mandato Governador/MS compativel com 2023 nao encontrado em historico_politico';
  END IF;
END $$;

CREATE TEMP TABLE _seed_eduardo_riedel_ms_alems_lote_a_lme ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('projeto_enviado_pelo_executivo', 'estadual', 'MS', NULL, 'projeto de lei', '329/2023', 2023, '2023-11-21', 'Cria o Programa Mananciais Sustentáveis, para recuperação e perenização hídrica, no âmbito do território do Estado de Mato Grosso do Sul, na forma que especifica.', 'EDUARDO CORREA RIEDEL', 'titular', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=sCqe3cq5jvJ8MF9x5txLcw%3D%3D', 'Assembleia Legislativa de Mato Grosso do Sul - Diário Oficial Eletrônico', NULL, 'ALEMS:MSG-GABGOV-MS:54:2023', '{"source":"ALEMS Diário Oficial Eletrônico","data_real":true,"fluxo":"Legislacao full-site","case_id":"alems-ms-msg-54-2023","curation_batch_id":"eduardo-riedel-ms-alems-projetos-executivo-lote-a-20260507","coverage_id":"eduardo-riedel-ms-alems-projetos-executivo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_ms_alems_projetos_executivo_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"mensagem_gabgov_assinada_como_governador_do_estado","mensagem_gabgov_ms":"54/2023","projeto_lei_alems":"329/2023","processo_alems":"485/2023","diario_oficial_alems_numero":"2554","fonte_oficial_verificada_em":"2026-05-07T22:41:23.414Z","source_proof":{"identificador_fonte":"ALEMS:MSG-GABGOV-MS:54:2023","fonte_primaria_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=sCqe3cq5jvJ8MF9x5txLcw%3D%3D","diario_numero":"2554","http_status":200,"contains_mensagem":true,"contains_projeto_numero":true,"contains_processo_numero":true,"contains_data":true,"contains_ementa":true,"contains_formula_envio":true,"contains_signatario":true,"contains_autoridade":true,"source_text_length":218242}}'::jsonb),
    ('projeto_enviado_pelo_executivo', 'estadual', 'MS', NULL, 'projeto de lei', '330/2023', 2023, '2023-11-21', 'Reorganiza o Programa Energia Social: Conta de Luz Zero, no âmbito do Estado de Mato Grosso do Sul, e dá outras providências.', 'EDUARDO CORREA RIEDEL', 'titular', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=sCqe3cq5jvJ8MF9x5txLcw%3D%3D', 'Assembleia Legislativa de Mato Grosso do Sul - Diário Oficial Eletrônico', NULL, 'ALEMS:MSG-GABGOV-MS:55:2023', '{"source":"ALEMS Diário Oficial Eletrônico","data_real":true,"fluxo":"Legislacao full-site","case_id":"alems-ms-msg-55-2023","curation_batch_id":"eduardo-riedel-ms-alems-projetos-executivo-lote-a-20260507","coverage_id":"eduardo-riedel-ms-alems-projetos-executivo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_ms_alems_projetos_executivo_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"mensagem_gabgov_assinada_como_governador_do_estado","mensagem_gabgov_ms":"55/2023","projeto_lei_alems":"330/2023","processo_alems":"486/2023","diario_oficial_alems_numero":"2554","fonte_oficial_verificada_em":"2026-05-07T22:41:23.414Z","source_proof":{"identificador_fonte":"ALEMS:MSG-GABGOV-MS:55:2023","fonte_primaria_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=sCqe3cq5jvJ8MF9x5txLcw%3D%3D","diario_numero":"2554","http_status":200,"contains_mensagem":true,"contains_projeto_numero":true,"contains_processo_numero":true,"contains_data":true,"contains_ementa":true,"contains_formula_envio":true,"contains_signatario":true,"contains_autoridade":true,"source_text_length":218242}}'::jsonb),
    ('projeto_enviado_pelo_executivo', 'estadual', 'MS', NULL, 'projeto de lei', '333/2023', 2023, '2023-11-22', 'Altera a redação e acrescenta dispositivos à Lei Estadual nº 90, de 2 de junho de 1980, que dispõe sobre as alterações do meio ambiente, estabelece normas de proteção ambiental, e dá outras providências.', 'EDUARDO CORREA RIEDEL', 'titular', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=sCqe3cq5jvJ8MF9x5txLcw%3D%3D', 'Assembleia Legislativa de Mato Grosso do Sul - Diário Oficial Eletrônico', NULL, 'ALEMS:MSG-GABGOV-MS:56:2023', '{"source":"ALEMS Diário Oficial Eletrônico","data_real":true,"fluxo":"Legislacao full-site","case_id":"alems-ms-msg-56-2023","curation_batch_id":"eduardo-riedel-ms-alems-projetos-executivo-lote-a-20260507","coverage_id":"eduardo-riedel-ms-alems-projetos-executivo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_ms_alems_projetos_executivo_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"mensagem_gabgov_assinada_como_governador_do_estado","mensagem_gabgov_ms":"56/2023","projeto_lei_alems":"333/2023","processo_alems":"489/2023","diario_oficial_alems_numero":"2554","fonte_oficial_verificada_em":"2026-05-07T22:41:23.414Z","source_proof":{"identificador_fonte":"ALEMS:MSG-GABGOV-MS:56:2023","fonte_primaria_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=sCqe3cq5jvJ8MF9x5txLcw%3D%3D","diario_numero":"2554","http_status":200,"contains_mensagem":true,"contains_projeto_numero":true,"contains_processo_numero":true,"contains_data":true,"contains_ementa":true,"contains_formula_envio":true,"contains_signatario":true,"contains_autoridade":true,"source_text_length":218242}}'::jsonb),
    ('projeto_enviado_pelo_executivo', 'estadual', 'MS', NULL, 'projeto de lei', '346/2023', 2023, '2023-11-28', 'Altera a redação e acrescenta dispositivos à Lei Estadual nº 6.035, de 26 de dezembro de 2022, que reorganiza a Estrutura Básica do Poder Executivo do Estado de Mato Grosso do Sul, e dá outras providências.', 'EDUARDO CORREA RIEDEL', 'titular', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=kcL9bAN3qtrocaAdi1FQ0Nx6lwqEw%3D%3D', 'Assembleia Legislativa de Mato Grosso do Sul - Diário Oficial Eletrônico', NULL, 'ALEMS:MSG-GABGOV-MS:60:2023', '{"source":"ALEMS Diário Oficial Eletrônico","data_real":true,"fluxo":"Legislacao full-site","case_id":"alems-ms-msg-60-2023","curation_batch_id":"eduardo-riedel-ms-alems-projetos-executivo-lote-a-20260507","coverage_id":"eduardo-riedel-ms-alems-projetos-executivo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_ms_alems_projetos_executivo_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"mensagem_gabgov_assinada_como_governador_do_estado","mensagem_gabgov_ms":"60/2023","projeto_lei_alems":"346/2023","processo_alems":"503/2023","diario_oficial_alems_numero":"2559","fonte_oficial_verificada_em":"2026-05-07T22:41:23.414Z","source_proof":{"identificador_fonte":"ALEMS:MSG-GABGOV-MS:60:2023","fonte_primaria_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=kcL9bAN3qtrocaAdi1FQ0Nx6lwqEw%3D%3D","diario_numero":"2559","http_status":200,"contains_mensagem":true,"contains_projeto_numero":true,"contains_processo_numero":true,"contains_data":true,"contains_ementa":true,"contains_formula_envio":true,"contains_signatario":true,"contains_autoridade":true,"source_text_length":218072}}'::jsonb),
    ('projeto_enviado_pelo_executivo', 'estadual', 'MS', NULL, 'projeto de lei', '347/2023', 2023, '2023-11-28', 'Dispõe sobre a administração, a aquisição, a alienação, a oneração e a utilização dos bens imóveis do Estado de Mato Grosso do Sul, de suas autarquias e de suas fundações, e dá outras providências.', 'EDUARDO CORREA RIEDEL', 'titular', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=kcL9bAN3qtrocaAdi1FQ0Nx6lwqEw%3D%3D', 'Assembleia Legislativa de Mato Grosso do Sul - Diário Oficial Eletrônico', NULL, 'ALEMS:MSG-GABGOV-MS:62:2023', '{"source":"ALEMS Diário Oficial Eletrônico","data_real":true,"fluxo":"Legislacao full-site","case_id":"alems-ms-msg-62-2023","curation_batch_id":"eduardo-riedel-ms-alems-projetos-executivo-lote-a-20260507","coverage_id":"eduardo-riedel-ms-alems-projetos-executivo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_ms_alems_projetos_executivo_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"mensagem_gabgov_assinada_como_governador_do_estado","mensagem_gabgov_ms":"62/2023","projeto_lei_alems":"347/2023","processo_alems":"505/2023","diario_oficial_alems_numero":"2559","fonte_oficial_verificada_em":"2026-05-07T22:41:23.414Z","source_proof":{"identificador_fonte":"ALEMS:MSG-GABGOV-MS:62:2023","fonte_primaria_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=kcL9bAN3qtrocaAdi1FQ0Nx6lwqEw%3D%3D","diario_numero":"2559","http_status":200,"contains_mensagem":true,"contains_projeto_numero":true,"contains_processo_numero":true,"contains_data":true,"contains_ementa":true,"contains_formula_envio":true,"contains_signatario":true,"contains_autoridade":true,"source_text_length":218072}}'::jsonb)
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
        AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
        AND (hp.cargo ILIKE '%Governador%' OR hp.cargo_canonico = 'Governador')
        AND UPPER(COALESCE(hp.estado, '')) = 'MS'
        AND COALESCE(hp.periodo_inicio, 9999) <= seed.ano
        AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
      ORDER BY hp.periodo_inicio DESC NULLS LAST, hp.id
      LIMIT 1
    ) AS historico_politico_id
  FROM candidatos c
  CROSS JOIN _seed_eduardo_riedel_ms_alems_lote_a_lme seed
  WHERE c.slug = 'eduardo-riedel'
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'eduardo-riedel';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'eduardo-riedel: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO total_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO scope_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'eduardo-riedel-ms-alems-projetos-executivo-ampliado-parcial-lote-a-20260507'
    AND metadata->>'coverage_scope' = 'inventario_ampliado_parcial_ms_alems_projetos_executivo_lote_a_20260507'
    AND signatario = 'EDUARDO CORREA RIEDEL'
    AND autoridade_papel = 'titular';

  SELECT count(*) INTO projetos_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  IF total_count <> 5 THEN
    RAISE EXCEPTION 'Pos-apply eduardo-riedel: total legislacao_mandato_executivo esperado 5, encontrado %', total_count;
  END IF;

  IF scope_count <> 5 THEN
    RAISE EXCEPTION 'Pos-apply eduardo-riedel: esperadas 5 rows com coverage_id/scope/signatario alvo, encontradas %', scope_count;
  END IF;

  IF projetos_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply eduardo-riedel: projetos_lei deve permanecer 0, encontrado %', projetos_count;
  END IF;

  RAISE NOTICE 'Pos-apply eduardo-riedel ALEMS Lote A: legislacao_mandato_executivo=% coverage_scope=% projetos_lei=%', total_count, scope_count, projetos_count;
END $$;
