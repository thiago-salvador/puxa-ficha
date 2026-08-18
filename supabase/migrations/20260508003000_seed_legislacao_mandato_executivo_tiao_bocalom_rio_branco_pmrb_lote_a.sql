-- ============================================
-- Legislacao full-site: tiao-bocalom / Prefeitura Municipal de Rio Branco / legislacao_mandato_executivo
-- Seed ampliado parcial: leis municipais sancionadas pelo Prefeito
-- ============================================
-- Fonte oficial: Prefeitura Municipal de Rio Branco - Portal CGM/LAI
-- Artefato: fonte interna de curadoria
-- Coverage: tiao-bocalom-rio-branco-pmrb-leis-sancionadas-ampliado-parcial-lote-a-20260507
-- Esta migration NAO escreve em projetos_lei.

DO $$
DECLARE
  cand_id uuid;
  lme_total int;
  projetos_count int;
  mandato_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'tiao-bocalom' AND publicavel = true;
  IF cand_id IS NULL THEN
    RAISE NOTICE 'tiao-bocalom: candidato ausente neste banco local/CI minimo; seed LME PMRB pulado';
    RETURN;
  END IF;
  SELECT count(*) INTO lme_total FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
  SELECT count(*) INTO projetos_count FROM projetos_lei WHERE candidato_id = cand_id;
  IF lme_total NOT IN (0, 5) THEN
    RAISE EXCEPTION 'Pre-condicao tiao-bocalom: esperadas 0 rows atuais ou 5 idempotentes em LME, encontradas %', lme_total;
  END IF;
  IF projetos_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao tiao-bocalom: projetos_lei deve permanecer 0, encontrado %', projetos_count;
  END IF;
  SELECT count(*) INTO mandato_count
  FROM historico_politico hp
  WHERE hp.candidato_id = cand_id
    AND hp.tipo_evento = 'mandato'
    AND UPPER(COALESCE(hp.estado, '')) = 'AC'
    AND (hp.cargo ILIKE '%Prefeito%' OR hp.cargo_canonico = 'Prefeito')
    AND COALESCE(hp.periodo_inicio, 9999) <= 2025
    AND COALESCE(hp.periodo_fim, 0) >= 2024;
  IF mandato_count < 1 THEN
    RAISE EXCEPTION 'Pre-condicao tiao-bocalom: mandato Prefeito/Rio Branco compativel com 2024-2025 nao encontrado';
  END IF;
END $$;

CREATE TEMP TABLE _seed_tiao_bocalom_rio_branco_pmrb_lote_a_lme ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('lei_sancionada', 'municipal', 'AC', 'Rio Branco', 'lei municipal', '2.515/2024', 2024, '2024-04-05', 'Dispõe sobre a implantação do projeto Adote Uma Praça no âmbito do Município de Rio Branco e dá outras providências.', 'Tião Bocalom', 'titular', 'https://portalcgm.riobranco.ac.gov.br/lai/wp-content/uploads/2021/07/LEI-MUNICIPAL-N%C2%BA-2.515-DE-05.04.2024-%E2%80%93-Disp%C3%B5e-sobre-a-implanta%C3%A7%C3%A3o-do-projeto-%E2%80%9CAdote-Uma-Pra%C3%A7a%E2%80%9D-no-%C3%A2mbito-do-Munic%C3%ADpio-de-Rio-Branco.pdf', 'Prefeitura Municipal de Rio Branco - Portal CGM/LAI', NULL, 'PMRB:LEI-MUNICIPAL:2515:2024', '{"source":"Prefeitura Municipal de Rio Branco CGM/LAI","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"tiao-bocalom-rio-branco-pmrb-leis-sancionadas-lote-a-20260507","coverage_id":"tiao-bocalom-rio-branco-pmrb-leis-sancionadas-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_rio_branco_pmrb_leis_sancionadas_2024_2025_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"PDF oficial contem Tião Bocalom como Prefeito de Rio Branco e formula de sancao","fonte_oficial_verificada_em":"2026-05-07T23:24:35.116Z","source_proof":{"identificador_fonte":"PMRB:LEI-MUNICIPAL:2515:2024","fonte_primaria_url":"https://portalcgm.riobranco.ac.gov.br/lai/wp-content/uploads/2021/07/LEI-MUNICIPAL-N%C2%BA-2.515-DE-05.04.2024-%E2%80%93-Disp%C3%B5e-sobre-a-implanta%C3%A7%C3%A3o-do-projeto-%E2%80%9CAdote-Uma-Pra%C3%A7a%E2%80%9D-no-%C3%A2mbito-do-Munic%C3%ADpio-de-Rio-Branco.pdf","http_status":200,"file_path":"/tmp/puxa-ficha-tiao-bocalom-pmrb-lote-a/PMRB-LEI-MUNICIPAL-2515-2024.pdf","contains_prefeitura":true,"contains_title":true,"contains_sanction_formula":true,"contains_signatario":true,"contains_autoridade":true,"contains_data":true,"contains_ementa":true,"ementa_tokens_checked":["dispoe","implantacao","projeto","adote","praca","ambito","municipio","branco"],"text_chars":3157}}'::jsonb),
    ('lei_sancionada', 'municipal', 'AC', 'Rio Branco', 'lei complementar', '293/2024', 2024, '2024-04-06', 'Altera a Lei Complementar Municipal n° 140, de 29 de abril de 2022.', 'Tião Bocalom', 'titular', 'https://portalcgm.riobranco.ac.gov.br/portal/wp-content/uploads/2013/10/LEI-COMPLEMENTAR-N%C2%BA-293-DE-06-DE-ABRIL-DE-2024-Altera-a-Lei-Complementar-Municipal-n%C2%B0-140-2022-PCCR-SEMSA.pdf', 'Prefeitura Municipal de Rio Branco - Portal CGM/LAI', NULL, 'PMRB:LEI-COMPLEMENTAR:293:2024', '{"source":"Prefeitura Municipal de Rio Branco CGM/LAI","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"tiao-bocalom-rio-branco-pmrb-leis-sancionadas-lote-a-20260507","coverage_id":"tiao-bocalom-rio-branco-pmrb-leis-sancionadas-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_rio_branco_pmrb_leis_sancionadas_2024_2025_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"PDF oficial contem Tião Bocalom como Prefeito de Rio Branco e formula de sancao","fonte_oficial_verificada_em":"2026-05-07T23:24:35.116Z","source_proof":{"identificador_fonte":"PMRB:LEI-COMPLEMENTAR:293:2024","fonte_primaria_url":"https://portalcgm.riobranco.ac.gov.br/portal/wp-content/uploads/2013/10/LEI-COMPLEMENTAR-N%C2%BA-293-DE-06-DE-ABRIL-DE-2024-Altera-a-Lei-Complementar-Municipal-n%C2%B0-140-2022-PCCR-SEMSA.pdf","http_status":200,"file_path":"/tmp/puxa-ficha-tiao-bocalom-pmrb-lote-a/PMRB-LEI-COMPLEMENTAR-293-2024.pdf","contains_prefeitura":true,"contains_title":true,"contains_sanction_formula":true,"contains_signatario":true,"contains_autoridade":true,"contains_data":true,"contains_ementa":true,"ementa_tokens_checked":["altera","complementar","municipal","abril","2022"],"text_chars":15621}}'::jsonb),
    ('lei_sancionada', 'municipal', 'AC', 'Rio Branco', 'lei complementar', '304/2024', 2024, '2024-05-29', 'Altera a Lei Complementar n° 276, de 20 de dezembro de 2023, e dá outras providências.', 'Tião Bocalom', 'titular', 'https://portalcgm.riobranco.ac.gov.br/portal/wp-content/uploads/2013/10/LEI-COMPLEMENTAR-N%C2%BA-304-DE-29-DE-MAIO-DE-2024-%E2%80%93-Altera-a-Lei-Complementar-n%C2%B0-276-de-20-de-dezembro-de-2023-e-d%C3%A1-outras-provid%C3%AAncias.pdf', 'Prefeitura Municipal de Rio Branco - Portal CGM/LAI', NULL, 'PMRB:LEI-COMPLEMENTAR:304:2024', '{"source":"Prefeitura Municipal de Rio Branco CGM/LAI","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"tiao-bocalom-rio-branco-pmrb-leis-sancionadas-lote-a-20260507","coverage_id":"tiao-bocalom-rio-branco-pmrb-leis-sancionadas-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_rio_branco_pmrb_leis_sancionadas_2024_2025_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"PDF oficial contem Tião Bocalom como Prefeito de Rio Branco e formula de sancao","fonte_oficial_verificada_em":"2026-05-07T23:24:35.116Z","source_proof":{"identificador_fonte":"PMRB:LEI-COMPLEMENTAR:304:2024","fonte_primaria_url":"https://portalcgm.riobranco.ac.gov.br/portal/wp-content/uploads/2013/10/LEI-COMPLEMENTAR-N%C2%BA-304-DE-29-DE-MAIO-DE-2024-%E2%80%93-Altera-a-Lei-Complementar-n%C2%B0-276-de-20-de-dezembro-de-2023-e-d%C3%A1-outras-provid%C3%AAncias.pdf","http_status":200,"file_path":"/tmp/puxa-ficha-tiao-bocalom-pmrb-lote-a/PMRB-LEI-COMPLEMENTAR-304-2024.pdf","contains_prefeitura":true,"contains_title":true,"contains_sanction_formula":true,"contains_signatario":true,"contains_autoridade":true,"contains_data":true,"contains_ementa":true,"ementa_tokens_checked":["altera","complementar","dezembro","2023"],"text_chars":14122}}'::jsonb),
    ('lei_sancionada', 'municipal', 'AC', 'Rio Branco', 'lei complementar', '319/2024', 2024, '2024-10-15', 'Dispõe sobre Abertura de Crédito Adicional Suplementar por Superávit Financeiro, em favor da Secretaria Municipal de Agropecuária - SEAGRO.', 'Tião Bocalom', 'titular', 'https://portalcgm.riobranco.ac.gov.br/portal/wp-content/uploads/2013/10/LEI-COMPLEMENTAR-N%C2%BA-319-DE-15-DE-OUTUBRO-DE-2024-Abertura-de-Cr%C3%A9dito-Adicional-Suplementar-SEGAGRO.pdf', 'Prefeitura Municipal de Rio Branco - Portal CGM/LAI', NULL, 'PMRB:LEI-COMPLEMENTAR:319:2024', '{"source":"Prefeitura Municipal de Rio Branco CGM/LAI","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"tiao-bocalom-rio-branco-pmrb-leis-sancionadas-lote-a-20260507","coverage_id":"tiao-bocalom-rio-branco-pmrb-leis-sancionadas-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_rio_branco_pmrb_leis_sancionadas_2024_2025_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"PDF oficial contem Tião Bocalom como Prefeito de Rio Branco e formula de sancao","fonte_oficial_verificada_em":"2026-05-07T23:24:35.116Z","source_proof":{"identificador_fonte":"PMRB:LEI-COMPLEMENTAR:319:2024","fonte_primaria_url":"https://portalcgm.riobranco.ac.gov.br/portal/wp-content/uploads/2013/10/LEI-COMPLEMENTAR-N%C2%BA-319-DE-15-DE-OUTUBRO-DE-2024-Abertura-de-Cr%C3%A9dito-Adicional-Suplementar-SEGAGRO.pdf","http_status":200,"file_path":"/tmp/puxa-ficha-tiao-bocalom-pmrb-lote-a/PMRB-LEI-COMPLEMENTAR-319-2024.pdf","contains_prefeitura":true,"contains_title":true,"contains_sanction_formula":true,"contains_signatario":true,"contains_autoridade":true,"contains_data":true,"contains_ementa":true,"ementa_tokens_checked":["dispoe","abertura","credito","adicional","suplementar","superavit","financeiro","favor","secretaria","municipal"],"text_chars":4492}}'::jsonb),
    ('lei_sancionada', 'municipal', 'AC', 'Rio Branco', 'lei municipal', '2.547/2025', 2025, '2025-01-02', 'Altera a Lei Municipal n° 2.512, de 7 de fevereiro de 2024.', 'Tião Bocalom', 'titular', 'https://portalcgm.riobranco.ac.gov.br/portal/wp-content/uploads/2015/05/LEI-MUNICIPAL-N%C2%BA-2.547-DE-02.01.2025-Altera-a-Lei-n%C2%BA-2.512-2024-Remunera%C3%A7%C3%A3o-Secret%C3%A1rios-Municipais.pdf', 'Prefeitura Municipal de Rio Branco - Portal CGM/LAI', NULL, 'PMRB:LEI-MUNICIPAL:2547:2025', '{"source":"Prefeitura Municipal de Rio Branco CGM/LAI","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"tiao-bocalom-rio-branco-pmrb-leis-sancionadas-lote-a-20260507","coverage_id":"tiao-bocalom-rio-branco-pmrb-leis-sancionadas-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_rio_branco_pmrb_leis_sancionadas_2024_2025_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"PDF oficial contem Tião Bocalom como Prefeito de Rio Branco e formula de sancao","fonte_oficial_verificada_em":"2026-05-07T23:24:35.116Z","source_proof":{"identificador_fonte":"PMRB:LEI-MUNICIPAL:2547:2025","fonte_primaria_url":"https://portalcgm.riobranco.ac.gov.br/portal/wp-content/uploads/2015/05/LEI-MUNICIPAL-N%C2%BA-2.547-DE-02.01.2025-Altera-a-Lei-n%C2%BA-2.512-2024-Remunera%C3%A7%C3%A3o-Secret%C3%A1rios-Municipais.pdf","http_status":200,"file_path":"/tmp/puxa-ficha-tiao-bocalom-pmrb-lote-a/PMRB-LEI-MUNICIPAL-2547-2025.pdf","contains_prefeitura":true,"contains_title":true,"contains_sanction_formula":true,"contains_signatario":true,"contains_autoridade":true,"contains_data":true,"contains_ementa":true,"ementa_tokens_checked":["altera","municipal","fevereiro","2024"],"text_chars":1821}}'::jsonb)
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
        AND UPPER(COALESCE(hp.estado, '')) = 'AC'
        AND (hp.cargo ILIKE '%Prefeito%' OR hp.cargo_canonico = 'Prefeito')
        AND COALESCE(hp.periodo_inicio, 9999) <= seed.ano
        AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
      ORDER BY hp.periodo_inicio DESC NULLS LAST, hp.id
      LIMIT 1
    ) AS historico_politico_id
  FROM candidatos c
  CROSS JOIN _seed_tiao_bocalom_rio_branco_pmrb_lote_a_lme seed
  WHERE c.slug = 'tiao-bocalom' AND c.publicavel = true
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'tiao-bocalom' AND publicavel = true;
  IF cand_id IS NULL THEN
    RAISE NOTICE 'tiao-bocalom: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;
  SELECT count(*) INTO total_count FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
  SELECT count(*) INTO scope_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'tiao-bocalom-rio-branco-pmrb-leis-sancionadas-ampliado-parcial-lote-a-20260507'
    AND metadata->>'coverage_scope' = 'inventario_ampliado_parcial_rio_branco_pmrb_leis_sancionadas_2024_2025_lote_a_20260507'
    AND signatario = 'Tião Bocalom'
    AND autoridade_papel = 'titular';
  SELECT count(*) INTO projetos_count FROM projetos_lei WHERE candidato_id = cand_id;
  IF total_count <> 5 THEN
    RAISE EXCEPTION 'Pos-apply tiao-bocalom: total LME esperado 5, encontrado %', total_count;
  END IF;
  IF scope_count <> 5 THEN
    RAISE EXCEPTION 'Pos-apply tiao-bocalom: esperadas 5 rows com coverage/signatario/autoridade alvo, encontradas %', scope_count;
  END IF;
  IF projetos_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply tiao-bocalom: projetos_lei deve permanecer 0, encontrado %', projetos_count;
  END IF;
  RAISE NOTICE 'Pos-apply tiao-bocalom PMRB Lote A: legislacao_mandato_executivo=% coverage_scope=% projetos_lei=%', total_count, scope_count, projetos_count;
END $$;
