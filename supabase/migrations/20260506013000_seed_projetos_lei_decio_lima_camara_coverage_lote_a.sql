-- ============================================
-- Legislacao full-site: decio-lima / Camara Dados Abertos / projetos_lei
-- Coverage ampliado parcial: Lote A autoria principal Camara
-- ============================================
-- Fonte oficial: Camara dos Deputados - Dados Abertos
--   https://dadosabertos.camara.leg.br/api/v2/deputados/141413
--   https://dadosabertos.camara.leg.br/api/v2/proposicoes/{id}
--   https://dadosabertos.camara.leg.br/api/v2/proposicoes/{id}/autores
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506
--   coverage_scope = inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506
--
-- Filtro factual: das 200 rows Camara legacy existentes, somente 13
-- foram marcadas com coverage_id porque a API oficial confirmou
-- idDeputado=141413, tipo Deputado(a), ordemAssinatura=1.
-- 187 rows permanecem sem coverage por coautoria/sem autoria verificavel.
--
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO insere, deleta ou trunca rows.
-- ============================================

DO $$
DECLARE
  cand_id uuid;
  total_pl int;
  target_present int;
  target_with_other_coverage int;
  lme_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'decio-lima';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'decio-lima: candidato ausente neste banco local/CI minimo; coverage Camara pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO total_pl FROM projetos_lei WHERE candidato_id = cand_id;
  IF total_pl <> 200 THEN
    RAISE EXCEPTION 'Pre-condicao decio-lima: esperadas 200 rows legacy em projetos_lei, encontradas %', total_pl;
  END IF;

  SELECT count(*) INTO target_present
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Camara'
    AND proposicao_id_api IN ('2158131', '2149487', '2168023', '2176632', '2184086', '2166444', '2160235', '2166445', '2149311', '2129463', '2128586', '2126557', '2125478');
  IF target_present <> 13 THEN
    RAISE EXCEPTION 'Pre-condicao decio-lima: esperadas 13 rows alvo Camara presentes, encontradas %', target_present;
  END IF;

  SELECT count(*) INTO target_with_other_coverage
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('2158131', '2149487', '2168023', '2176632', '2184086', '2166444', '2160235', '2166445', '2149311', '2129463', '2128586', '2126557', '2125478')
    AND coverage_id IS NOT NULL
    AND coverage_id <> 'decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506';
  IF target_with_other_coverage <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao decio-lima: % rows alvo ja tem coverage_id divergente', target_with_other_coverage;
  END IF;

  SELECT count(*) INTO lme_count FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
  IF lme_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao decio-lima: legislacao_mandato_executivo deve permanecer 0, encontrado %', lme_count;
  END IF;
END $$;

CREATE TEMP TABLE _coverage_decio_lima_camara_lote_a ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('2158131', 1, 1, 'Décio Lima', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2158131', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2158131/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2158131', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"decio-lima-camara-lote-a-20260506","coverage_id":"decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":141413,"proposicao_id_api":"2158131","ordem_assinatura":1,"total_autores":1,"autor_nome":"Décio Lima","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2158131","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2158131/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2158131","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:18:02.057Z"}'::jsonb),
    ('2149487', 1, 1, 'Décio Lima', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2149487', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2149487/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2149487', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"decio-lima-camara-lote-a-20260506","coverage_id":"decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":141413,"proposicao_id_api":"2149487","ordem_assinatura":1,"total_autores":1,"autor_nome":"Décio Lima","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2149487","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2149487/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2149487","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:18:02.057Z"}'::jsonb),
    ('2168023', 1, 1, 'Décio Lima', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2168023', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2168023/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2168023', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"decio-lima-camara-lote-a-20260506","coverage_id":"decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":141413,"proposicao_id_api":"2168023","ordem_assinatura":1,"total_autores":1,"autor_nome":"Décio Lima","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2168023","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2168023/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2168023","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:18:02.057Z"}'::jsonb),
    ('2176632', 1, 1, 'Décio Lima', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2176632', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2176632/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2176632', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"decio-lima-camara-lote-a-20260506","coverage_id":"decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":141413,"proposicao_id_api":"2176632","ordem_assinatura":1,"total_autores":1,"autor_nome":"Décio Lima","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2176632","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2176632/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2176632","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:18:02.057Z"}'::jsonb),
    ('2184086', 1, 1, 'Décio Lima', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2184086', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2184086/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2184086', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"decio-lima-camara-lote-a-20260506","coverage_id":"decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":141413,"proposicao_id_api":"2184086","ordem_assinatura":1,"total_autores":1,"autor_nome":"Décio Lima","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2184086","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2184086/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2184086","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:18:02.057Z"}'::jsonb),
    ('2166444', 1, 1, 'Décio Lima', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2166444', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2166444/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2166444', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"decio-lima-camara-lote-a-20260506","coverage_id":"decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":141413,"proposicao_id_api":"2166444","ordem_assinatura":1,"total_autores":1,"autor_nome":"Décio Lima","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2166444","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2166444/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2166444","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:18:02.057Z"}'::jsonb),
    ('2160235', 1, 4, 'Décio Lima', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2160235', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2160235/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2160235', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"decio-lima-camara-lote-a-20260506","coverage_id":"decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":141413,"proposicao_id_api":"2160235","ordem_assinatura":1,"total_autores":4,"autor_nome":"Décio Lima","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2160235","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2160235/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2160235","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:18:02.057Z"}'::jsonb),
    ('2166445', 1, 1, 'Décio Lima', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2166445', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2166445/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2166445', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"decio-lima-camara-lote-a-20260506","coverage_id":"decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":141413,"proposicao_id_api":"2166445","ordem_assinatura":1,"total_autores":1,"autor_nome":"Décio Lima","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2166445","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2166445/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2166445","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:18:02.057Z"}'::jsonb),
    ('2149311', 1, 1, 'Décio Lima', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2149311', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2149311/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2149311', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"decio-lima-camara-lote-a-20260506","coverage_id":"decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":141413,"proposicao_id_api":"2149311","ordem_assinatura":1,"total_autores":1,"autor_nome":"Décio Lima","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2149311","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2149311/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2149311","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:18:02.057Z"}'::jsonb),
    ('2129463', 1, 1, 'Décio Lima', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2129463', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2129463/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2129463', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"decio-lima-camara-lote-a-20260506","coverage_id":"decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":141413,"proposicao_id_api":"2129463","ordem_assinatura":1,"total_autores":1,"autor_nome":"Décio Lima","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2129463","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2129463/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2129463","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:18:02.057Z"}'::jsonb),
    ('2128586', 1, 1, 'Décio Lima', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2128586', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2128586/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2128586', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"decio-lima-camara-lote-a-20260506","coverage_id":"decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":141413,"proposicao_id_api":"2128586","ordem_assinatura":1,"total_autores":1,"autor_nome":"Décio Lima","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2128586","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2128586/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2128586","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:18:02.057Z"}'::jsonb),
    ('2126557', 1, 1, 'Décio Lima', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2126557', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2126557/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2126557', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"decio-lima-camara-lote-a-20260506","coverage_id":"decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":141413,"proposicao_id_api":"2126557","ordem_assinatura":1,"total_autores":1,"autor_nome":"Décio Lima","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2126557","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2126557/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2126557","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:18:02.057Z"}'::jsonb),
    ('2125478', 1, 2, 'Décio Lima', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2125478', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2125478/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2125478', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"decio-lima-camara-lote-a-20260506","coverage_id":"decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":141413,"proposicao_id_api":"2125478","ordem_assinatura":1,"total_autores":2,"autor_nome":"Décio Lima","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2125478","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2125478/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2125478","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:18:02.057Z"}'::jsonb)
) AS v(
  proposicao_id_api,
  ordem_assinatura,
  total_autores,
  autor_nome,
  autor_tipo,
  detalhe_endpoint,
  autores_endpoint,
  public_url,
  metadata_patch
);

WITH target AS (
  SELECT c.id AS candidato_id
  FROM candidatos c
  WHERE c.slug = 'decio-lima'
)
UPDATE projetos_lei pl
SET
  coverage_id = 'decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506',
  coverage_scope = 'inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506',
  metadata = COALESCE(pl.metadata, '{}'::jsonb) || seed.metadata_patch
FROM target
JOIN _coverage_decio_lima_camara_lote_a seed ON TRUE
WHERE pl.candidato_id = target.candidato_id
  AND pl.fonte = 'Camara'
  AND pl.proposicao_id_api = seed.proposicao_id_api
  AND (pl.coverage_id IS NULL OR pl.coverage_id = 'decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506');

DO $$
DECLARE
  cand_id uuid;
  with_target_coverage int;
  remaining_null int;
  lme_count int;
  other_slugs_with_target int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'decio-lima';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'decio-lima: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO with_target_coverage
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506'
    AND coverage_scope = 'inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506';
  IF with_target_coverage <> 13 THEN
    RAISE EXCEPTION 'Pos-apply decio-lima: esperadas 13 rows com coverage_id alvo, encontradas %', with_target_coverage;
  END IF;

  SELECT count(*) INTO remaining_null
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id IS NULL;
  IF remaining_null <> 187 THEN
    RAISE EXCEPTION 'Pos-apply decio-lima: esperadas 187 rows sem coverage por limite documentado, encontradas %', remaining_null;
  END IF;

  SELECT count(*) INTO lme_count FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
  IF lme_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply decio-lima: legislacao_mandato_executivo deve permanecer 0, encontrado %', lme_count;
  END IF;

  SELECT count(*) INTO other_slugs_with_target
  FROM projetos_lei
  WHERE candidato_id <> cand_id
    AND coverage_id = 'decio-lima-camara-autoria-principal-ampliado-parcial-lote-a-20260506';
  IF other_slugs_with_target <> 0 THEN
    RAISE EXCEPTION 'Pos-apply decio-lima: % rows de outros slugs com coverage_id alvo', other_slugs_with_target;
  END IF;

  RAISE NOTICE 'Pos-apply decio-lima Camara Lote A: coverage=% sem_coverage=% lme=%', with_target_coverage, remaining_null, lme_count;
END $$;
