-- ============================================
-- Legislacao full-site: gilberto-kassab / Camara Dados Abertos / projetos_lei
-- Coverage ampliado parcial: Lote A autoria principal Camara
-- ============================================
-- Fonte oficial: Camara dos Deputados - Dados Abertos
--   https://dadosabertos.camara.leg.br/api/v2/deputados/74778
--   https://dadosabertos.camara.leg.br/api/v2/proposicoes/{id}
--   https://dadosabertos.camara.leg.br/api/v2/proposicoes/{id}/autores
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506
--   coverage_scope = inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506
--
-- Filtro factual: das 100 rows Camara legacy existentes, somente 24
-- foram marcadas com coverage_id porque a API oficial confirmou
-- idDeputado=74778, tipo Deputado(a), ordemAssinatura=1.
-- 76 rows permanecem sem coverage por coautoria/sem autoria verificavel.
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'gilberto-kassab';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'gilberto-kassab: candidato ausente neste banco local/CI minimo; coverage Camara pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO total_pl FROM projetos_lei WHERE candidato_id = cand_id;
  IF total_pl <> 100 THEN
    RAISE EXCEPTION 'Pre-condicao gilberto-kassab: esperadas 100 rows legacy em projetos_lei, encontradas %', total_pl;
  END IF;

  SELECT count(*) INTO target_present
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Camara'
    AND proposicao_id_api IN ('273825', '270195', '255131', '157524', '259778', '255130', '157329', '255137', '255129', '250991', '157310', '257612', '255135', '157258', '254570', '250503', '157525', '272969', '265563', '261723', '259777', '255140', '255133', '255138');
  IF target_present <> 24 THEN
    RAISE EXCEPTION 'Pre-condicao gilberto-kassab: esperadas 24 rows alvo Camara presentes, encontradas %', target_present;
  END IF;

  SELECT count(*) INTO target_with_other_coverage
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('273825', '270195', '255131', '157524', '259778', '255130', '157329', '255137', '255129', '250991', '157310', '257612', '255135', '157258', '254570', '250503', '157525', '272969', '265563', '261723', '259777', '255140', '255133', '255138')
    AND coverage_id IS NOT NULL
    AND coverage_id <> 'gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506';
  IF target_with_other_coverage <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao gilberto-kassab: % rows alvo ja tem coverage_id divergente', target_with_other_coverage;
  END IF;

  SELECT count(*) INTO lme_count FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
  IF lme_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao gilberto-kassab: legislacao_mandato_executivo deve permanecer 0, encontrado %', lme_count;
  END IF;
END $$;

CREATE TEMP TABLE _coverage_gilberto_kassab_camara_lote_a ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('273825', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/273825', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/273825/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/273825', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"273825","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/273825","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/273825/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/273825","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('270195', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/270195', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/270195/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/270195', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"270195","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/270195","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/270195/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/270195","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('255131', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255131', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255131/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255131', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"255131","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255131","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255131/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255131","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('157524', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/157524', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/157524/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/157524', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"157524","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/157524","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/157524/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/157524","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('259778', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/259778', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/259778/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/259778', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"259778","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/259778","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/259778/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/259778","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('255130', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255130', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255130/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255130', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"255130","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255130","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255130/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255130","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('157329', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/157329', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/157329/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/157329', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"157329","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/157329","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/157329/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/157329","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('255137', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255137', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255137/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255137', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"255137","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255137","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255137/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255137","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('255129', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255129', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255129/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255129', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"255129","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255129","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255129/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255129","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('250991', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/250991', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/250991/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/250991', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"250991","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/250991","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/250991/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/250991","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('157310', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/157310', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/157310/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/157310', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"157310","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/157310","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/157310/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/157310","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('257612', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/257612', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/257612/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/257612', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"257612","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/257612","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/257612/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/257612","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('255135', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255135', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255135/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255135', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"255135","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255135","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255135/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255135","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('157258', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/157258', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/157258/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/157258', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"157258","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/157258","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/157258/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/157258","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('254570', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/254570', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/254570/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/254570', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"254570","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/254570","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/254570/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/254570","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('250503', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/250503', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/250503/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/250503', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"250503","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/250503","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/250503/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/250503","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('157525', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/157525', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/157525/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/157525', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"157525","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/157525","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/157525/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/157525","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('272969', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/272969', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/272969/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/272969', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"272969","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/272969","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/272969/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/272969","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('265563', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/265563', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/265563/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/265563', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"265563","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/265563","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/265563/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/265563","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('261723', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/261723', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/261723/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/261723', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"261723","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/261723","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/261723/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/261723","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('259777', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/259777', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/259777/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/259777', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"259777","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/259777","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/259777/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/259777","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('255140', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255140', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255140/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255140', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"255140","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255140","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255140/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255140","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('255133', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255133', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255133/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255133', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"255133","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255133","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255133/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255133","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb),
    ('255138', 1, 1, 'Gilberto Kassab', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255138', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255138/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/255138', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"gilberto-kassab-camara-lote-a-20260506","coverage_id":"gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":74778,"proposicao_id_api":"255138","ordem_assinatura":1,"total_autores":1,"autor_nome":"Gilberto Kassab","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255138","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255138/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/255138","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T06:06:11.921Z"}'::jsonb)
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
  WHERE c.slug = 'gilberto-kassab'
)
UPDATE projetos_lei pl
SET
  coverage_id = 'gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506',
  coverage_scope = 'inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506',
  metadata = COALESCE(pl.metadata, '{}'::jsonb) || seed.metadata_patch
FROM target
JOIN _coverage_gilberto_kassab_camara_lote_a seed ON TRUE
WHERE pl.candidato_id = target.candidato_id
  AND pl.fonte = 'Camara'
  AND pl.proposicao_id_api = seed.proposicao_id_api
  AND (pl.coverage_id IS NULL OR pl.coverage_id = 'gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506');

DO $$
DECLARE
  cand_id uuid;
  with_target_coverage int;
  remaining_null int;
  lme_count int;
  other_slugs_with_target int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'gilberto-kassab';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'gilberto-kassab: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO with_target_coverage
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506'
    AND coverage_scope = 'inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506';
  IF with_target_coverage <> 24 THEN
    RAISE EXCEPTION 'Pos-apply gilberto-kassab: esperadas 24 rows com coverage_id alvo, encontradas %', with_target_coverage;
  END IF;

  SELECT count(*) INTO remaining_null
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id IS NULL;
  IF remaining_null <> 76 THEN
    RAISE EXCEPTION 'Pos-apply gilberto-kassab: esperadas 76 rows sem coverage por limite documentado, encontradas %', remaining_null;
  END IF;

  SELECT count(*) INTO lme_count FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
  IF lme_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply gilberto-kassab: legislacao_mandato_executivo deve permanecer 0, encontrado %', lme_count;
  END IF;

  SELECT count(*) INTO other_slugs_with_target
  FROM projetos_lei
  WHERE candidato_id <> cand_id
    AND coverage_id = 'gilberto-kassab-camara-autoria-principal-ampliado-parcial-lote-a-20260506';
  IF other_slugs_with_target <> 0 THEN
    RAISE EXCEPTION 'Pos-apply gilberto-kassab: % rows de outros slugs com coverage_id alvo', other_slugs_with_target;
  END IF;

  RAISE NOTICE 'Pos-apply gilberto-kassab Camara Lote A: coverage=% sem_coverage=% lme=%', with_target_coverage, remaining_null, lme_count;
END $$;
