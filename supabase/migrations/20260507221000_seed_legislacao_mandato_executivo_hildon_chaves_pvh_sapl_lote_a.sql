-- ============================================
-- Legislacao full-site: hildon-chaves / Porto Velho SAPL / legislacao_mandato_executivo
-- Seed ampliado parcial: Lote A projetos enviados pelo Prefeito
-- ============================================
-- Fonte oficial: Camara Municipal de Porto Velho - SAPL
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = hildon-chaves-pvh-sapl-projetos-executivo-ampliado-parcial-lote-a-20260507
--   coverage_scope = inventario_ampliado_parcial_pvh_sapl_projetos_executivo_lote_a_20260507
--
-- Filtro factual: paginas oficiais SAPL de expediente/sessao com Projeto de Lei,
-- Autor Hildon de Lima Chaves - Prefeito, ementa, resultado e data de sessao.
-- Nao e lei sancionada nem autoria parlamentar em projetos_lei.
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'hildon-chaves';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'hildon-chaves: candidato ausente neste banco local/CI minimo; seed LME SAPL pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO lme_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO target_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'hildon-chaves-pvh-sapl-projetos-executivo-ampliado-parcial-lote-a-20260507';

  IF lme_total NOT IN (0, 5) THEN
    RAISE EXCEPTION 'Pre-condicao hildon-chaves: esperadas 0 rows atuais ou 5 rows alvo idempotentes em legislacao_mandato_executivo, encontradas %', lme_total;
  END IF;

  IF lme_total = 5 AND target_count <> 5 THEN
    RAISE EXCEPTION 'Pre-condicao hildon-chaves: 5 rows existentes, mas apenas % com coverage_id alvo', target_count;
  END IF;

  SELECT count(*) INTO projetos_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  IF projetos_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao hildon-chaves: projetos_lei deve permanecer 0, encontrado %', projetos_count;
  END IF;

  SELECT count(*) INTO mandato_count
  FROM historico_politico hp
  WHERE hp.candidato_id = cand_id
    AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
    AND (hp.cargo ILIKE '%Prefeito%' OR hp.cargo_canonico = 'Prefeito')
    AND UPPER(COALESCE(hp.estado, '')) = 'RO'
    AND COALESCE(hp.periodo_inicio, 9999) <= 2021
    AND COALESCE(hp.periodo_fim, 0) >= 2023;

  IF mandato_count < 1 THEN
    RAISE EXCEPTION 'Pre-condicao hildon-chaves: mandato Prefeito/Porto Velho compativel com 2021-2023 nao encontrado em historico_politico';
  END IF;
END $$;

CREATE TEMP TABLE _seed_hildon_chaves_pvh_sapl_lote_a_lme ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('projeto_enviado_pelo_executivo', 'municipal', 'RO', 'Porto Velho', 'projeto de lei', '4310/2021', 2021, '2021-11-30', 'Denomina o antigo prédio da Câmara Municipal de Porto Velho.', NULL, 'titular', 'https://sapl.portovelho.ro.leg.br/sessao/171/expedientemateria', 'Câmara Municipal de Porto Velho - SAPL', 'https://sapl.portovelho.ro.leg.br/sessao/171', 'SAPL-PVH:PL:4310:2021', '{"source":"SAPL Câmara Municipal de Porto Velho","data_real":true,"fluxo":"Legislacao full-site","case_id":"sapl-pvh-hildon-pl-4310-2021","curation_batch_id":"hildon-chaves-pvh-sapl-projetos-executivo-lote-a-20260507","coverage_id":"hildon-chaves-pvh-sapl-projetos-executivo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_pvh_sapl_projetos_executivo_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"SAPL lista Autor Hildon de Lima Chaves - Prefeito","sapl_sessao_id":"171","sapl_materia_label":"Projeto de Lei nº 4310 de 2021","fonte_oficial_verificada_em":"2026-05-07T22:47:54.875Z","source_proof":{"identificador_fonte":"SAPL-PVH:PL:4310:2021","fonte_primaria_url":"https://sapl.portovelho.ro.leg.br/sessao/171/expedientemateria","fonte_tramitacao_url":"https://sapl.portovelho.ro.leg.br/sessao/171","http_status_expediente":200,"http_status_sessao":200,"contains_materia":true,"contains_autor_prefeito":true,"contains_ementa":true,"contains_resultado":true,"contains_sessao_data":true,"contains_camara_porto_velho":true,"source_text_length":4011}}'::jsonb),
    ('projeto_enviado_pelo_executivo', 'municipal', 'RO', 'Porto Velho', 'projeto de lei', '4312/2021', 2021, '2021-11-30', 'Institui a Semana do Empreendedorismo Feminino no âmbito do Município de Porto Velho.', NULL, 'titular', 'https://sapl.portovelho.ro.leg.br/sessao/171/expedientemateria', 'Câmara Municipal de Porto Velho - SAPL', 'https://sapl.portovelho.ro.leg.br/sessao/171', 'SAPL-PVH:PL:4312:2021', '{"source":"SAPL Câmara Municipal de Porto Velho","data_real":true,"fluxo":"Legislacao full-site","case_id":"sapl-pvh-hildon-pl-4312-2021","curation_batch_id":"hildon-chaves-pvh-sapl-projetos-executivo-lote-a-20260507","coverage_id":"hildon-chaves-pvh-sapl-projetos-executivo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_pvh_sapl_projetos_executivo_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"SAPL lista Autor Hildon de Lima Chaves - Prefeito","sapl_sessao_id":"171","sapl_materia_label":"Projeto de Lei nº 4312 de 2021","fonte_oficial_verificada_em":"2026-05-07T22:47:54.875Z","source_proof":{"identificador_fonte":"SAPL-PVH:PL:4312:2021","fonte_primaria_url":"https://sapl.portovelho.ro.leg.br/sessao/171/expedientemateria","fonte_tramitacao_url":"https://sapl.portovelho.ro.leg.br/sessao/171","http_status_expediente":200,"http_status_sessao":200,"contains_materia":true,"contains_autor_prefeito":true,"contains_ementa":true,"contains_resultado":true,"contains_sessao_data":true,"contains_camara_porto_velho":true,"source_text_length":4011}}'::jsonb),
    ('projeto_enviado_pelo_executivo', 'municipal', 'RO', 'Porto Velho', 'projeto de lei complementar', '1194/2021', 2021, '2021-11-30', 'Altera dispositivos da Lei Complementar n° 804, de 20 de dezembro de 2019, e dá outras providências.', NULL, 'titular', 'https://sapl.portovelho.ro.leg.br/sessao/171/expedientemateria', 'Câmara Municipal de Porto Velho - SAPL', 'https://sapl.portovelho.ro.leg.br/sessao/171', 'SAPL-PVH:PLC:1194:2021', '{"source":"SAPL Câmara Municipal de Porto Velho","data_real":true,"fluxo":"Legislacao full-site","case_id":"sapl-pvh-hildon-plc-1194-2021","curation_batch_id":"hildon-chaves-pvh-sapl-projetos-executivo-lote-a-20260507","coverage_id":"hildon-chaves-pvh-sapl-projetos-executivo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_pvh_sapl_projetos_executivo_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"SAPL lista Autor Hildon de Lima Chaves - Prefeito","sapl_sessao_id":"171","sapl_materia_label":"Projeto de Lei Complementar nº 1194 de 2021","fonte_oficial_verificada_em":"2026-05-07T22:47:54.875Z","source_proof":{"identificador_fonte":"SAPL-PVH:PLC:1194:2021","fonte_primaria_url":"https://sapl.portovelho.ro.leg.br/sessao/171/expedientemateria","fonte_tramitacao_url":"https://sapl.portovelho.ro.leg.br/sessao/171","http_status_expediente":200,"http_status_sessao":200,"contains_materia":true,"contains_autor_prefeito":true,"contains_ementa":true,"contains_resultado":true,"contains_sessao_data":true,"contains_camara_porto_velho":true,"source_text_length":4011}}'::jsonb),
    ('projeto_enviado_pelo_executivo', 'municipal', 'RO', 'Porto Velho', 'projeto de lei', '4509/2023', 2023, '2023-06-19', 'Revoga a Lei n. 2.550, de 07 de dezembro de 2018, que autoriza o Município de Porto Velho a doar área de terra urbana ao Instituto de Previdência e Assistência dos Servidores do Município de Porto Velho -IPAM, para fins de construção da sua nova sede.', NULL, 'titular', 'https://sapl.portovelho.ro.leg.br/sessao/311/expedientemateria', 'Câmara Municipal de Porto Velho - SAPL', 'https://sapl.portovelho.ro.leg.br/sessao/311', 'SAPL-PVH:PL:4509:2023', '{"source":"SAPL Câmara Municipal de Porto Velho","data_real":true,"fluxo":"Legislacao full-site","case_id":"sapl-pvh-hildon-pl-4509-2023","curation_batch_id":"hildon-chaves-pvh-sapl-projetos-executivo-lote-a-20260507","coverage_id":"hildon-chaves-pvh-sapl-projetos-executivo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_pvh_sapl_projetos_executivo_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"SAPL lista Autor Hildon de Lima Chaves - Prefeito","sapl_sessao_id":"311","sapl_materia_label":"Projeto de Lei nº 4509 de 2023","fonte_oficial_verificada_em":"2026-05-07T22:47:54.875Z","source_proof":{"identificador_fonte":"SAPL-PVH:PL:4509:2023","fonte_primaria_url":"https://sapl.portovelho.ro.leg.br/sessao/311/expedientemateria","fonte_tramitacao_url":"https://sapl.portovelho.ro.leg.br/sessao/311","http_status_expediente":200,"http_status_sessao":200,"contains_materia":true,"contains_autor_prefeito":true,"contains_ementa":true,"contains_resultado":true,"contains_sessao_data":true,"contains_camara_porto_velho":true,"source_text_length":4460}}'::jsonb),
    ('projeto_enviado_pelo_executivo', 'municipal', 'RO', 'Porto Velho', 'projeto de lei', '4510/2023', 2023, '2023-06-19', 'Altera dispositivos da Lei n. 3.044, de 14 de junho de 2023, que autoriza o Poder Executivo a contratar operação de crédito com o Banco do Brasil S/A e/ou Caixa Econômica Federal, e dá outras providências', NULL, 'titular', 'https://sapl.portovelho.ro.leg.br/sessao/311/expedientemateria', 'Câmara Municipal de Porto Velho - SAPL', 'https://sapl.portovelho.ro.leg.br/sessao/311', 'SAPL-PVH:PL:4510:2023', '{"source":"SAPL Câmara Municipal de Porto Velho","data_real":true,"fluxo":"Legislacao full-site","case_id":"sapl-pvh-hildon-pl-4510-2023","curation_batch_id":"hildon-chaves-pvh-sapl-projetos-executivo-lote-a-20260507","coverage_id":"hildon-chaves-pvh-sapl-projetos-executivo-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_pvh_sapl_projetos_executivo_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"SAPL lista Autor Hildon de Lima Chaves - Prefeito","sapl_sessao_id":"311","sapl_materia_label":"Projeto de Lei nº 4510 de 2023","fonte_oficial_verificada_em":"2026-05-07T22:47:54.875Z","source_proof":{"identificador_fonte":"SAPL-PVH:PL:4510:2023","fonte_primaria_url":"https://sapl.portovelho.ro.leg.br/sessao/311/expedientemateria","fonte_tramitacao_url":"https://sapl.portovelho.ro.leg.br/sessao/311","http_status_expediente":200,"http_status_sessao":200,"contains_materia":true,"contains_autor_prefeito":true,"contains_ementa":true,"contains_resultado":true,"contains_sessao_data":true,"contains_camara_porto_velho":true,"source_text_length":4460}}'::jsonb)
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
        AND (hp.cargo ILIKE '%Prefeito%' OR hp.cargo_canonico = 'Prefeito')
        AND UPPER(COALESCE(hp.estado, '')) = 'RO'
        AND COALESCE(hp.periodo_inicio, 9999) <= seed.ano
        AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
      ORDER BY hp.periodo_inicio DESC NULLS LAST, hp.id
      LIMIT 1
    ) AS historico_politico_id
  FROM candidatos c
  CROSS JOIN _seed_hildon_chaves_pvh_sapl_lote_a_lme seed
  WHERE c.slug = 'hildon-chaves'
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'hildon-chaves';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'hildon-chaves: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO total_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO scope_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'hildon-chaves-pvh-sapl-projetos-executivo-ampliado-parcial-lote-a-20260507'
    AND metadata->>'coverage_scope' = 'inventario_ampliado_parcial_pvh_sapl_projetos_executivo_lote_a_20260507'
    AND autoridade_papel = 'titular';

  SELECT count(*) INTO projetos_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  IF total_count <> 5 THEN
    RAISE EXCEPTION 'Pos-apply hildon-chaves: total legislacao_mandato_executivo esperado 5, encontrado %', total_count;
  END IF;

  IF scope_count <> 5 THEN
    RAISE EXCEPTION 'Pos-apply hildon-chaves: esperadas 5 rows com coverage_id/scope/autoridade alvo, encontradas %', scope_count;
  END IF;

  IF projetos_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply hildon-chaves: projetos_lei deve permanecer 0, encontrado %', projetos_count;
  END IF;

  RAISE NOTICE 'Pos-apply hildon-chaves SAPL Lote A: legislacao_mandato_executivo=% coverage_scope=% projetos_lei=%', total_count, scope_count, projetos_count;
END $$;
