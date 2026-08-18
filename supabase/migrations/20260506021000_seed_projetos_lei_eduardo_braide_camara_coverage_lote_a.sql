-- ============================================
-- Legislacao full-site: eduardo-braide / Camara Dados Abertos / projetos_lei
-- Coverage ampliado parcial: Lote A autoria principal Camara
-- ============================================
-- Fonte oficial: Camara dos Deputados - Dados Abertos
--   https://dadosabertos.camara.leg.br/api/v2/deputados/204552
--   https://dadosabertos.camara.leg.br/api/v2/proposicoes/{id}
--   https://dadosabertos.camara.leg.br/api/v2/proposicoes/{id}/autores
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506
--   coverage_scope = inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506
--
-- Filtro factual: das 100 rows Camara legacy existentes, somente 21
-- foram marcadas com coverage_id porque a API oficial confirmou
-- idDeputado=204552, tipo Deputado(a), ordemAssinatura=1.
-- 79 rows permanecem sem coverage por coautoria/sem autoria verificavel.
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'eduardo-braide';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'eduardo-braide: candidato ausente neste banco local/CI minimo; coverage Camara pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO total_pl FROM projetos_lei WHERE candidato_id = cand_id;
  IF total_pl <> 100 THEN
    RAISE EXCEPTION 'Pre-condicao eduardo-braide: esperadas 100 rows legacy em projetos_lei, encontradas %', total_pl;
  END IF;

  SELECT count(*) INTO target_present
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Camara'
    AND proposicao_id_api IN ('2220809', '2220785', '2219052', '2220966', '2213945', '2263377', '2239386', '2231563', '2226567', '2224813', '2263376', '2252530', '2224808', '2251637', '2256598', '2251635', '2232000', '2222078', '2250558', '2231907', '2228843');
  IF target_present <> 21 THEN
    RAISE EXCEPTION 'Pre-condicao eduardo-braide: esperadas 21 rows alvo Camara presentes, encontradas %', target_present;
  END IF;

  SELECT count(*) INTO target_with_other_coverage
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('2220809', '2220785', '2219052', '2220966', '2213945', '2263377', '2239386', '2231563', '2226567', '2224813', '2263376', '2252530', '2224808', '2251637', '2256598', '2251635', '2232000', '2222078', '2250558', '2231907', '2228843')
    AND coverage_id IS NOT NULL
    AND coverage_id <> 'eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506';
  IF target_with_other_coverage <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao eduardo-braide: % rows alvo ja tem coverage_id divergente', target_with_other_coverage;
  END IF;

  SELECT count(*) INTO lme_count FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
  IF lme_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao eduardo-braide: legislacao_mandato_executivo deve permanecer 0, encontrado %', lme_count;
  END IF;
END $$;

CREATE TEMP TABLE _coverage_eduardo_braide_camara_lote_a ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('2220809', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220809', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220809/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220809', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2220809","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220809","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220809/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220809","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2220785', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220785', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220785/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220785', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2220785","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220785","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220785/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220785","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2219052', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2219052', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2219052/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2219052', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2219052","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2219052","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2219052/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2219052","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2220966', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220966', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220966/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220966', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2220966","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220966","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220966/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2220966","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2213945', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2213945', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2213945/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2213945', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2213945","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2213945","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2213945/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2213945","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2263377', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2263377', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2263377/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2263377', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2263377","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2263377","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2263377/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2263377","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2239386', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2239386', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2239386/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2239386', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2239386","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2239386","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2239386/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2239386","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2231563', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2231563', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2231563/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2231563', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2231563","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2231563","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2231563/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2231563","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2226567', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2226567', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2226567/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2226567', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2226567","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2226567","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2226567/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2226567","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2224813', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2224813', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2224813/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2224813', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2224813","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2224813","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2224813/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2224813","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2263376', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2263376', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2263376/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2263376', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2263376","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2263376","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2263376/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2263376","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2252530', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2252530', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2252530/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2252530', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2252530","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2252530","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2252530/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2252530","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2224808', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2224808', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2224808/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2224808', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2224808","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2224808","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2224808/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2224808","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2251637', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2251637', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2251637/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2251637', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2251637","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2251637","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2251637/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2251637","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2256598', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2256598', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2256598/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2256598', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2256598","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2256598","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2256598/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2256598","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2251635', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2251635', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2251635/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2251635', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2251635","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2251635","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2251635/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2251635","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2232000', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2232000', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2232000/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2232000', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2232000","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2232000","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2232000/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2232000","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2222078', 1, 189, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2222078', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2222078/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2222078', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2222078","ordem_assinatura":1,"total_autores":189,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2222078","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2222078/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2222078","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2250558', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2250558', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2250558/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2250558', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2250558","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2250558","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2250558/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2250558","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2231907', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2231907', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2231907/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2231907', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2231907","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2231907","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2231907/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2231907","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb),
    ('2228843', 1, 1, 'Eduardo Braide', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2228843', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2228843/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/2228843', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"eduardo-braide-camara-lote-a-20260506","coverage_id":"eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":204552,"proposicao_id_api":"2228843","ordem_assinatura":1,"total_autores":1,"autor_nome":"Eduardo Braide","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2228843","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2228843/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2228843","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T04:49:21.619Z"}'::jsonb)
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
  WHERE c.slug = 'eduardo-braide'
)
UPDATE projetos_lei pl
SET
  coverage_id = 'eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506',
  coverage_scope = 'inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506',
  metadata = COALESCE(pl.metadata, '{}'::jsonb) || seed.metadata_patch
FROM target
JOIN _coverage_eduardo_braide_camara_lote_a seed ON TRUE
WHERE pl.candidato_id = target.candidato_id
  AND pl.fonte = 'Camara'
  AND pl.proposicao_id_api = seed.proposicao_id_api
  AND (pl.coverage_id IS NULL OR pl.coverage_id = 'eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506');

DO $$
DECLARE
  cand_id uuid;
  with_target_coverage int;
  remaining_null int;
  lme_count int;
  other_slugs_with_target int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'eduardo-braide';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'eduardo-braide: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO with_target_coverage
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506'
    AND coverage_scope = 'inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506';
  IF with_target_coverage <> 21 THEN
    RAISE EXCEPTION 'Pos-apply eduardo-braide: esperadas 21 rows com coverage_id alvo, encontradas %', with_target_coverage;
  END IF;

  SELECT count(*) INTO remaining_null
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id IS NULL;
  IF remaining_null <> 79 THEN
    RAISE EXCEPTION 'Pos-apply eduardo-braide: esperadas 79 rows sem coverage por limite documentado, encontradas %', remaining_null;
  END IF;

  SELECT count(*) INTO lme_count FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
  IF lme_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply eduardo-braide: legislacao_mandato_executivo deve permanecer 0, encontrado %', lme_count;
  END IF;

  SELECT count(*) INTO other_slugs_with_target
  FROM projetos_lei
  WHERE candidato_id <> cand_id
    AND coverage_id = 'eduardo-braide-camara-autoria-principal-ampliado-parcial-lote-a-20260506';
  IF other_slugs_with_target <> 0 THEN
    RAISE EXCEPTION 'Pos-apply eduardo-braide: % rows de outros slugs com coverage_id alvo', other_slugs_with_target;
  END IF;

  RAISE NOTICE 'Pos-apply eduardo-braide Camara Lote A: coverage=% sem_coverage=% lme=%', with_target_coverage, remaining_null, lme_count;
END $$;
