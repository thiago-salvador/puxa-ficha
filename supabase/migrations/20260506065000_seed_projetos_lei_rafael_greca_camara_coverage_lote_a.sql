-- ============================================
-- Legislacao full-site: rafael-greca / Camara Dados Abertos / projetos_lei
-- Coverage ampliado parcial: Lote A autoria principal Camara
-- ============================================
-- Fonte oficial: Camara dos Deputados - Dados Abertos
--   https://dadosabertos.camara.leg.br/api/v2/deputados/73465
--   https://dadosabertos.camara.leg.br/api/v2/proposicoes/{id}
--   https://dadosabertos.camara.leg.br/api/v2/proposicoes/{id}/autores
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506
--   coverage_scope = inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506
--
-- Filtro factual: das 118 rows Camara legacy existentes, somente 16
-- foram marcadas com coverage_id porque a API oficial confirmou
-- idDeputado=73465, tipo Deputado(a), ordemAssinatura=1.
-- 102 rows permanecem sem coverage por coautoria/sem autoria verificavel.
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'rafael-greca';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'rafael-greca: candidato ausente neste banco local/CI minimo; coverage Camara pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO total_pl FROM projetos_lei WHERE candidato_id = cand_id;
  IF total_pl <> 118 THEN
    RAISE EXCEPTION 'Pre-condicao rafael-greca: esperadas 118 rows legacy em projetos_lei, encontradas %', total_pl;
  END IF;

  SELECT count(*) INTO target_present
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Camara'
    AND proposicao_id_api IN ('100304', '44037', '44036', '44035', '20292', '20297', '20294', '44038', '40453', '102807', '102808', '100305', '44039', '44034', '20290', '20288');
  IF target_present <> 16 THEN
    RAISE EXCEPTION 'Pre-condicao rafael-greca: esperadas 16 rows alvo Camara presentes, encontradas %', target_present;
  END IF;

  SELECT count(*) INTO target_with_other_coverage
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('100304', '44037', '44036', '44035', '20292', '20297', '20294', '44038', '40453', '102807', '102808', '100305', '44039', '44034', '20290', '20288')
    AND coverage_id IS NOT NULL
    AND coverage_id <> 'rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506';
  IF target_with_other_coverage <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao rafael-greca: % rows alvo ja tem coverage_id divergente', target_with_other_coverage;
  END IF;

  SELECT count(*) INTO lme_count FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
  IF lme_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao rafael-greca: legislacao_mandato_executivo deve permanecer 0, encontrado %', lme_count;
  END IF;
END $$;

CREATE TEMP TABLE _coverage_rafael_greca_camara_lote_a ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('100304', 1, 1, 'Rafael Greca', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/100304', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/100304/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/100304', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"100304","ordem_assinatura":1,"total_autores":1,"autor_nome":"Rafael Greca","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/100304","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/100304/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/100304","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb),
    ('44037', 1, 1, 'Rafael Greca', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44037', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44037/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44037', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"44037","ordem_assinatura":1,"total_autores":1,"autor_nome":"Rafael Greca","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44037","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44037/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44037","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb),
    ('44036', 1, 1, 'Rafael Greca', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44036', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44036/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44036', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"44036","ordem_assinatura":1,"total_autores":1,"autor_nome":"Rafael Greca","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44036","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44036/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44036","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb),
    ('44035', 1, 1, 'Rafael Greca', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44035', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44035/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44035', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"44035","ordem_assinatura":1,"total_autores":1,"autor_nome":"Rafael Greca","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44035","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44035/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44035","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb),
    ('20292', 1, 1, 'Rafael Greca', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/20292', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/20292/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/20292', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"20292","ordem_assinatura":1,"total_autores":1,"autor_nome":"Rafael Greca","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/20292","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/20292/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/20292","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb),
    ('20297', 1, 1, 'Rafael Greca', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/20297', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/20297/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/20297', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"20297","ordem_assinatura":1,"total_autores":1,"autor_nome":"Rafael Greca","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/20297","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/20297/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/20297","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb),
    ('20294', 1, 1, 'Rafael Greca', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/20294', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/20294/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/20294', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"20294","ordem_assinatura":1,"total_autores":1,"autor_nome":"Rafael Greca","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/20294","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/20294/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/20294","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb),
    ('44038', 1, 1, 'Rafael Greca', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44038', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44038/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44038', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"44038","ordem_assinatura":1,"total_autores":1,"autor_nome":"Rafael Greca","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44038","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44038/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44038","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb),
    ('40453', 1, 1, 'RAFAEL VALDOMIRO GRECA DE MACEDO', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/40453', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/40453/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/40453', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"40453","ordem_assinatura":1,"total_autores":1,"autor_nome":"RAFAEL VALDOMIRO GRECA DE MACEDO","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/40453","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/40453/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/40453","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb),
    ('102807', 1, 1, 'Rafael Greca', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/102807', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/102807/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/102807', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"102807","ordem_assinatura":1,"total_autores":1,"autor_nome":"Rafael Greca","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/102807","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/102807/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/102807","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb),
    ('102808', 1, 1, 'Rafael Greca', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/102808', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/102808/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/102808', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"102808","ordem_assinatura":1,"total_autores":1,"autor_nome":"Rafael Greca","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/102808","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/102808/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/102808","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb),
    ('100305', 1, 1, 'Rafael Greca', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/100305', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/100305/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/100305', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"100305","ordem_assinatura":1,"total_autores":1,"autor_nome":"Rafael Greca","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/100305","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/100305/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/100305","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb),
    ('44039', 1, 1, 'Rafael Greca', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44039', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44039/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44039', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"44039","ordem_assinatura":1,"total_autores":1,"autor_nome":"Rafael Greca","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44039","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44039/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44039","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb),
    ('44034', 1, 1, 'Rafael Greca', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44034', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44034/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/44034', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"44034","ordem_assinatura":1,"total_autores":1,"autor_nome":"Rafael Greca","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44034","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44034/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/44034","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb),
    ('20290', 1, 1, 'Rafael Greca', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/20290', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/20290/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/20290', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"20290","ordem_assinatura":1,"total_autores":1,"autor_nome":"Rafael Greca","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/20290","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/20290/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/20290","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb),
    ('20288', 1, 1, 'Rafael Greca', 'Deputado(a)', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/20288', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/20288/autores', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/20288', '{"source":"Camara Dados Abertos","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"rafael-greca-camara-lote-a-20260506","coverage_id":"rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"camara_id_deputado":73465,"proposicao_id_api":"20288","ordem_assinatura":1,"total_autores":1,"autor_nome":"Rafael Greca","autor_tipo":"Deputado(a)","autoria_principal_verificada":true,"detalhe_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/20288","autores_endpoint":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/20288/autores","public_url":"https://dadosabertos.camara.leg.br/api/v2/proposicoes/20288","list_endpoint_page_1_contains_id":true,"fonte_oficial_verificada_em":"2026-05-06T08:39:07.814Z"}'::jsonb)
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
  WHERE c.slug = 'rafael-greca'
)
UPDATE projetos_lei pl
SET
  coverage_id = 'rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506',
  coverage_scope = 'inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506',
  metadata = COALESCE(pl.metadata, '{}'::jsonb) || seed.metadata_patch
FROM target
JOIN _coverage_rafael_greca_camara_lote_a seed ON TRUE
WHERE pl.candidato_id = target.candidato_id
  AND pl.fonte = 'Camara'
  AND pl.proposicao_id_api = seed.proposicao_id_api
  AND (pl.coverage_id IS NULL OR pl.coverage_id = 'rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506');

DO $$
DECLARE
  cand_id uuid;
  with_target_coverage int;
  remaining_null int;
  lme_count int;
  other_slugs_with_target int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'rafael-greca';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'rafael-greca: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO with_target_coverage
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506'
    AND coverage_scope = 'inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506';
  IF with_target_coverage <> 16 THEN
    RAISE EXCEPTION 'Pos-apply rafael-greca: esperadas 16 rows com coverage_id alvo, encontradas %', with_target_coverage;
  END IF;

  SELECT count(*) INTO remaining_null
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id IS NULL;
  IF remaining_null <> 102 THEN
    RAISE EXCEPTION 'Pos-apply rafael-greca: esperadas 102 rows sem coverage por limite documentado, encontradas %', remaining_null;
  END IF;

  SELECT count(*) INTO lme_count FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
  IF lme_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply rafael-greca: legislacao_mandato_executivo deve permanecer 0, encontrado %', lme_count;
  END IF;

  SELECT count(*) INTO other_slugs_with_target
  FROM projetos_lei
  WHERE candidato_id <> cand_id
    AND coverage_id = 'rafael-greca-camara-autoria-principal-ampliado-parcial-lote-a-20260506';
  IF other_slugs_with_target <> 0 THEN
    RAISE EXCEPTION 'Pos-apply rafael-greca: % rows de outros slugs com coverage_id alvo', other_slugs_with_target;
  END IF;

  RAISE NOTICE 'Pos-apply rafael-greca Camara Lote A: coverage=% sem_coverage=% lme=%', with_target_coverage, remaining_null, lme_count;
END $$;
