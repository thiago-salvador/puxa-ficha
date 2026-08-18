-- ============================================
-- Legislacao full-site: haddad-gov-sp / Prefeitura de Sao Paulo / legislacao_mandato_executivo
-- Seed ampliado parcial: Lote A leis municipais promulgadas como Prefeito
-- ============================================
-- Fonte oficial: Prefeitura de Sao Paulo - Catalogo de Legislacao Municipal
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = haddad-sp-prefeitura-leis-ampliado-parcial-lote-a-20260507
--   coverage_scope = inventario_ampliado_parcial_sp_prefeitura_leis_lote_a_20260507
--
-- Filtro factual: paginas oficiais PMSP com numero, data, ementa,
-- formula Fernando Haddad, Prefeito do Municipio de Sao Paulo,
-- decretou e eu promulgo, e assinatura nominal.
-- Nao e inventario completo do mandato municipal.
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'haddad-gov-sp';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'haddad-gov-sp: candidato ausente neste banco local/CI minimo; seed LME PMSP pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO lme_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO target_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'haddad-sp-prefeitura-leis-ampliado-parcial-lote-a-20260507';

  IF lme_total NOT IN (0, 5) THEN
    RAISE EXCEPTION 'Pre-condicao haddad-gov-sp: esperadas 0 rows atuais ou 5 rows alvo idempotentes em legislacao_mandato_executivo, encontradas %', lme_total;
  END IF;

  IF lme_total = 5 AND target_count <> 5 THEN
    RAISE EXCEPTION 'Pre-condicao haddad-gov-sp: 5 rows existentes, mas apenas % com coverage_id alvo', target_count;
  END IF;

  SELECT count(*) INTO projetos_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  IF projetos_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao haddad-gov-sp: projetos_lei deve permanecer 0, encontrado %', projetos_count;
  END IF;

  SELECT count(*) INTO mandato_count
  FROM historico_politico hp
  WHERE hp.candidato_id = cand_id
    AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
    AND (hp.cargo ILIKE '%Prefeito%' OR hp.cargo_canonico = 'Prefeito')
    AND UPPER(COALESCE(hp.estado, '')) = 'SP'
    AND (hp.cargo ILIKE '%São Paulo%' OR hp.cargo ILIKE '%Sao Paulo%' OR hp.observacoes ILIKE '%Prefeitura de São Paulo%' OR hp.observacoes ILIKE '%Prefeitura de Sao Paulo%')
    AND COALESCE(hp.periodo_inicio, 9999) <= 2014
    AND COALESCE(hp.periodo_fim, 0) >= 2016;

  IF mandato_count < 1 THEN
    RAISE EXCEPTION 'Pre-condicao haddad-gov-sp: mandato Prefeito/Sao Paulo compativel com 2014-2016 nao encontrado em historico_politico';
  END IF;
END $$;

CREATE TEMP TABLE _seed_haddad_sp_prefeitura_lote_a_lme ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('lei_sancionada', 'municipal', 'SP', 'São Paulo', 'lei', '15.967', 2014, '2014-01-24', 'Dispõe sobre a Política Municipal de Educação Ambiental de São Paulo e dá outras providências.', 'FERNANDO HADDAD', 'titular', 'https://legislacao.prefeitura.sp.gov.br/leis/lei-15967-de-24-de-janeiro-de-2014', 'Prefeitura de São Paulo - Catálogo de Legislação Municipal', NULL, 'PMSP:LEI:15967:2014', '{"source":"Prefeitura de São Paulo - Catálogo de Legislação Municipal","data_real":true,"fluxo":"Legislacao full-site","case_id":"pmsp-lei-15967-2014","curation_batch_id":"haddad-sp-prefeitura-leis-lote-a-20260507","coverage_id":"haddad-sp-prefeitura-leis-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_sp_prefeitura_leis_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"formula_prefeito_municipal_promulgo_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-07T22:34:50.963Z","source_proof":{"identificador_fonte":"PMSP:LEI:15967:2014","fonte_primaria_url":"https://legislacao.prefeitura.sp.gov.br/leis/lei-15967-de-24-de-janeiro-de-2014","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_formula_prefeito_promulgo":true,"contains_signatario":true,"contains_autoridade":true,"source_text_length":27629}}'::jsonb),
    ('lei_sancionada', 'municipal', 'SP', 'São Paulo', 'lei', '15.997', 2014, '2014-05-27', 'Estabelece a política municipal de incentivo ao uso de carros elétricos ou movidos a hidrogênio, e dá outras providências.', 'FERNANDO HADDAD', 'titular', 'https://legislacao.prefeitura.sp.gov.br/leis/lei-15997-de-27-de-maio-de-2014', 'Prefeitura de São Paulo - Catálogo de Legislação Municipal', NULL, 'PMSP:LEI:15997:2014', '{"source":"Prefeitura de São Paulo - Catálogo de Legislação Municipal","data_real":true,"fluxo":"Legislacao full-site","case_id":"pmsp-lei-15997-2014","curation_batch_id":"haddad-sp-prefeitura-leis-lote-a-20260507","coverage_id":"haddad-sp-prefeitura-leis-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_sp_prefeitura_leis_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"formula_prefeito_municipal_promulgo_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-07T22:34:50.963Z","source_proof":{"identificador_fonte":"PMSP:LEI:15997:2014","fonte_primaria_url":"https://legislacao.prefeitura.sp.gov.br/leis/lei-15997-de-27-de-maio-de-2014","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_formula_prefeito_promulgo":true,"contains_signatario":true,"contains_autoridade":true,"source_text_length":5319}}'::jsonb),
    ('lei_sancionada', 'municipal', 'SP', 'São Paulo', 'lei', '16.050', 2014, '2014-07-31', 'Aprova a Política de Desenvolvimento Urbano e o Plano Diretor Estratégico do Município de São Paulo e revoga a Lei nº 13.430/2002.', 'FERNANDO HADDAD', 'titular', 'https://legislacao.prefeitura.sp.gov.br/leis/lei-16050-de-31-de-julho-de-2014', 'Prefeitura de São Paulo - Catálogo de Legislação Municipal', NULL, 'PMSP:LEI:16050:2014', '{"source":"Prefeitura de São Paulo - Catálogo de Legislação Municipal","data_real":true,"fluxo":"Legislacao full-site","case_id":"pmsp-lei-16050-2014","curation_batch_id":"haddad-sp-prefeitura-leis-lote-a-20260507","coverage_id":"haddad-sp-prefeitura-leis-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_sp_prefeitura_leis_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"formula_prefeito_municipal_promulgo_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-07T22:34:50.963Z","source_proof":{"identificador_fonte":"PMSP:LEI:16050:2014","fonte_primaria_url":"https://legislacao.prefeitura.sp.gov.br/leis/lei-16050-de-31-de-julho-de-2014","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_formula_prefeito_promulgo":true,"contains_signatario":true,"contains_autoridade":true,"source_text_length":618045}}'::jsonb),
    ('lei_sancionada', 'municipal', 'SP', 'São Paulo', 'lei', '16.164', 2015, '2015-04-13', 'Dispõe sobre o Programa Municipal de Combate à Sexualização de Crianças e Adolescentes, e dá outras providências.', 'FERNANDO HADDAD', 'titular', 'https://legislacao.prefeitura.sp.gov.br/leis/lei-16164-de-13-de-abril-de-2015', 'Prefeitura de São Paulo - Catálogo de Legislação Municipal', NULL, 'PMSP:LEI:16164:2015', '{"source":"Prefeitura de São Paulo - Catálogo de Legislação Municipal","data_real":true,"fluxo":"Legislacao full-site","case_id":"pmsp-lei-16164-2015","curation_batch_id":"haddad-sp-prefeitura-leis-lote-a-20260507","coverage_id":"haddad-sp-prefeitura-leis-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_sp_prefeitura_leis_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"formula_prefeito_municipal_promulgo_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-07T22:34:50.963Z","source_proof":{"identificador_fonte":"PMSP:LEI:16164:2015","fonte_primaria_url":"https://legislacao.prefeitura.sp.gov.br/leis/lei-16164-de-13-de-abril-de-2015","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_formula_prefeito_promulgo":true,"contains_signatario":true,"contains_autoridade":true,"source_text_length":5258}}'::jsonb),
    ('lei_sancionada', 'municipal', 'SP', 'São Paulo', 'lei', '16.497', 2016, '2016-07-20', 'Institui a Rede de Reabilitação e Cuidados para a Pessoa com Deficiência no Município de São Paulo.', 'FERNANDO HADDAD', 'titular', 'https://legislacao.prefeitura.sp.gov.br/leis/lei-16497-de-20-de-julho-de-2016', 'Prefeitura de São Paulo - Catálogo de Legislação Municipal', NULL, 'PMSP:LEI:16497:2016', '{"source":"Prefeitura de São Paulo - Catálogo de Legislação Municipal","data_real":true,"fluxo":"Legislacao full-site","case_id":"pmsp-lei-16497-2016","curation_batch_id":"haddad-sp-prefeitura-leis-lote-a-20260507","coverage_id":"haddad-sp-prefeitura-leis-ampliado-parcial-lote-a-20260507","coverage_scope":"inventario_ampliado_parcial_sp_prefeitura_leis_lote_a_20260507","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"formula_prefeito_municipal_promulgo_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-07T22:34:50.963Z","source_proof":{"identificador_fonte":"PMSP:LEI:16497:2016","fonte_primaria_url":"https://legislacao.prefeitura.sp.gov.br/leis/lei-16497-de-20-de-julho-de-2016","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_formula_prefeito_promulgo":true,"contains_signatario":true,"contains_autoridade":true,"source_text_length":4103}}'::jsonb)
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
        AND UPPER(COALESCE(hp.estado, '')) = 'SP'
        AND (hp.cargo ILIKE '%São Paulo%' OR hp.cargo ILIKE '%Sao Paulo%' OR hp.observacoes ILIKE '%Prefeitura de São Paulo%' OR hp.observacoes ILIKE '%Prefeitura de Sao Paulo%')
        AND COALESCE(hp.periodo_inicio, 9999) <= seed.ano
        AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
      ORDER BY hp.periodo_inicio DESC NULLS LAST, hp.id
      LIMIT 1
    ) AS historico_politico_id
  FROM candidatos c
  CROSS JOIN _seed_haddad_sp_prefeitura_lote_a_lme seed
  WHERE c.slug = 'haddad-gov-sp'
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'haddad-gov-sp';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'haddad-gov-sp: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO total_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO scope_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'haddad-sp-prefeitura-leis-ampliado-parcial-lote-a-20260507'
    AND metadata->>'coverage_scope' = 'inventario_ampliado_parcial_sp_prefeitura_leis_lote_a_20260507'
    AND signatario = 'FERNANDO HADDAD'
    AND autoridade_papel = 'titular';

  SELECT count(*) INTO projetos_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  IF total_count <> 5 THEN
    RAISE EXCEPTION 'Pos-apply haddad-gov-sp: total legislacao_mandato_executivo esperado 5, encontrado %', total_count;
  END IF;

  IF scope_count <> 5 THEN
    RAISE EXCEPTION 'Pos-apply haddad-gov-sp: esperadas 5 rows com coverage_id/scope/signatario alvo, encontradas %', scope_count;
  END IF;

  IF projetos_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply haddad-gov-sp: projetos_lei deve permanecer 0, encontrado %', projetos_count;
  END IF;

  RAISE NOTICE 'Pos-apply haddad-gov-sp PMSP Lote A: legislacao_mandato_executivo=% coverage_scope=% projetos_lei=%', total_count, scope_count, projetos_count;
END $$;
