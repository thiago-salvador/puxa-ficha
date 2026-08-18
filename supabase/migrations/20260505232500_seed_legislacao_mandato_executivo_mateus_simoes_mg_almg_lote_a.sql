-- ============================================
-- Legislacao full-site: mateus-simoes / MG ALMG / legislacao_mandato_executivo
-- Seed ampliado parcial: Lote A leis sancionadas estaduais MG 2026
-- ============================================
-- Fonte oficial: Assembleia Legislativa de Minas Gerais - Legislacao Mineira
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = mateus-simoes-mg-almg-ampliado-parcial-lote-a-20260505
--   coverage_scope = inventario_ampliado_parcial_mg_almg_lote_a_20260505
--
-- Filtro factual: paginas oficiais ALMG com numero, data, ementa,
-- formula O GOVERNADOR DO ESTADO DE MINAS GERAIS e assinatura
-- Mateus Simoes de Almeida. Nao e inventario completo MG.
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
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'mateus-simoes';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'mateus-simoes: candidato ausente neste banco local/CI minimo; seed LME MG ALMG pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO lme_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO target_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'mateus-simoes-mg-almg-ampliado-parcial-lote-a-20260505';

  IF lme_total NOT IN (0, 5) THEN
    RAISE EXCEPTION 'Pre-condicao mateus-simoes: esperadas 0 rows atuais ou 5 rows alvo idempotentes em legislacao_mandato_executivo, encontradas %', lme_total;
  END IF;

  IF lme_total = 5 AND target_count <> 5 THEN
    RAISE EXCEPTION 'Pre-condicao mateus-simoes: 5 rows existentes, mas apenas % com coverage_id alvo', target_count;
  END IF;

  SELECT count(*) INTO mandato_count
  FROM historico_politico hp
  WHERE hp.candidato_id = cand_id
    AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
    AND (hp.cargo ILIKE '%Governador%' OR hp.cargo_canonico = 'Governador')
    AND NOT (hp.cargo ILIKE '%Vice-Governador%' OR hp.cargo ILIKE '%Vice Governador%' OR hp.cargo_canonico = 'Vice-Governador')
    AND UPPER(COALESCE(hp.estado, '')) = 'MG'
    AND COALESCE(hp.periodo_inicio, 9999) <= 2026
    AND COALESCE(hp.periodo_fim, 9999) >= 2026;

  IF mandato_count < 1 THEN
    RAISE EXCEPTION 'Pre-condicao mateus-simoes: mandato Governador/MG 2026 nao encontrado em historico_politico';
  END IF;
END $$;

CREATE TEMP TABLE _seed_mateus_simoes_mg_almg_lote_a_lme ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('lei_sancionada', 'estadual', 'MG', NULL, 'lei', '25.839', 2026, '2026-04-29', 'Dá denominação ao trecho da Rodovia LMG-760 que liga o Distrito de Cava Grande, no Município de Marliéria, ao Município de Timóteo.', 'MATEUS SIMÕES DE ALMEIDA', 'titular', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/25839/2026/', 'Assembleia Legislativa de Minas Gerais - Legislação Mineira', NULL, 'ALMG-MG:LEI:25839:2026', '{"source":"ALMG Legislação Mineira","data_real":true,"fluxo":"Legislacao full-site","case_id":"almg-mg-lei-25839-2026","curation_batch_id":"mateus-simoes-mg-almg-lote-a-20260505","coverage_id":"mateus-simoes-mg-almg-ampliado-parcial-lote-a-20260505","coverage_scope":"inventario_ampliado_parcial_mg_almg_lote_a_20260505","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"fonte_oficial_verificada_em":"2026-05-06T02:25:27.352Z","source_proof":{"http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_formula_sancao":true,"contains_signatario":true,"contains_autoridade":true,"meta_description":"Dá denominação ao trecho da Rodovia LMG-760 que liga o Distrito de Cava Grande, no Município de Marliéria, ao Município de Timóteo.","source_text_length":5347}}'::jsonb),
    ('lei_sancionada', 'estadual', 'MG', NULL, 'lei', '25.829', 2026, '2026-04-22', 'Autoriza o Poder Executivo a doar ao Município de Borda da Mata o imóvel que especifica.', 'MATEUS SIMÕES DE ALMEIDA', 'titular', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/25829/2026/', 'Assembleia Legislativa de Minas Gerais - Legislação Mineira', NULL, 'ALMG-MG:LEI:25829:2026', '{"source":"ALMG Legislação Mineira","data_real":true,"fluxo":"Legislacao full-site","case_id":"almg-mg-lei-25829-2026","curation_batch_id":"mateus-simoes-mg-almg-lote-a-20260505","coverage_id":"mateus-simoes-mg-almg-ampliado-parcial-lote-a-20260505","coverage_scope":"inventario_ampliado_parcial_mg_almg_lote_a_20260505","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"fonte_oficial_verificada_em":"2026-05-06T02:25:27.352Z","source_proof":{"http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_formula_sancao":true,"contains_signatario":true,"contains_autoridade":true,"meta_description":"Autoriza o Poder Executivo a doar ao Município de Borda da Mata o imóvel que especifica.","source_text_length":5698}}'::jsonb),
    ('lei_sancionada', 'estadual', 'MG', NULL, 'lei', '25.825', 2026, '2026-04-22', 'Dispõe sobre a oferta de ingressos gratuitos para partidas esportivas a pessoas com Transtorno do Espectro Autista – TEA – ou outras deficiências que acarretem hipersensibilidade sensorial.', 'MATEUS SIMÕES DE ALMEIDA', 'titular', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/25825/2026/', 'Assembleia Legislativa de Minas Gerais - Legislação Mineira', NULL, 'ALMG-MG:LEI:25825:2026', '{"source":"ALMG Legislação Mineira","data_real":true,"fluxo":"Legislacao full-site","case_id":"almg-mg-lei-25825-2026","curation_batch_id":"mateus-simoes-mg-almg-lote-a-20260505","coverage_id":"mateus-simoes-mg-almg-ampliado-parcial-lote-a-20260505","coverage_scope":"inventario_ampliado_parcial_mg_almg_lote_a_20260505","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"fonte_oficial_verificada_em":"2026-05-06T02:25:27.352Z","source_proof":{"http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_formula_sancao":true,"contains_signatario":true,"contains_autoridade":true,"meta_description":"Dispõe sobre a oferta de ingressos gratuitos para partidas esportivas a pessoas com Transtorno do Espectro Autista – TEA – ou outras deficiências que acarretem hipersensibilidade sensorial.","source_text_length":5697}}'::jsonb),
    ('lei_sancionada', 'estadual', 'MG', NULL, 'lei', '25.814', 2026, '2026-04-16', 'Autoriza a abertura de crédito suplementar ao Orçamento Fiscal do Estado em favor da Procuradoria-Geral de Justiça, do Fundo Estadual de Proteção e Defesa do Consumidor, do Fundo Especial do Ministério Público do Estado e do Fundo de Desenvolvimento do Ministério Público.', 'MATEUS SIMÕES DE ALMEIDA', 'titular', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/25814/2026/', 'Assembleia Legislativa de Minas Gerais - Legislação Mineira', NULL, 'ALMG-MG:LEI:25814:2026', '{"source":"ALMG Legislação Mineira","data_real":true,"fluxo":"Legislacao full-site","case_id":"almg-mg-lei-25814-2026","curation_batch_id":"mateus-simoes-mg-almg-lote-a-20260505","coverage_id":"mateus-simoes-mg-almg-ampliado-parcial-lote-a-20260505","coverage_scope":"inventario_ampliado_parcial_mg_almg_lote_a_20260505","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"fonte_oficial_verificada_em":"2026-05-06T02:25:27.352Z","source_proof":{"http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_formula_sancao":true,"contains_signatario":true,"contains_autoridade":true,"meta_description":"Autoriza a abertura de crédito suplementar ao Orçamento Fiscal do Estado em favor da Procuradoria-Geral de Justiça, do Fundo Estadual de Proteção e Defesa do Consumidor, do Fundo Especial do Ministério Público do Estado e do Fundo de Desenvolvimento do Ministério Público.","source_text_length":9166}}'::jsonb),
    ('lei_sancionada', 'estadual', 'MG', NULL, 'lei', '25.804', 2026, '2026-03-31', 'Dispõe sobre a revisão geral do subsídio e do vencimento básico dos servidores públicos civis e dos militares da administração direta, autárquica e fundacional do Poder Executivo e dá outras providências.', 'MATEUS SIMÕES DE ALMEIDA', 'titular', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/25804/2026/', 'Assembleia Legislativa de Minas Gerais - Legislação Mineira', NULL, 'ALMG-MG:LEI:25804:2026', '{"source":"ALMG Legislação Mineira","data_real":true,"fluxo":"Legislacao full-site","case_id":"almg-mg-lei-25804-2026","curation_batch_id":"mateus-simoes-mg-almg-lote-a-20260505","coverage_id":"mateus-simoes-mg-almg-ampliado-parcial-lote-a-20260505","coverage_scope":"inventario_ampliado_parcial_mg_almg_lote_a_20260505","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"fonte_oficial_verificada_em":"2026-05-06T02:25:27.352Z","source_proof":{"http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_formula_sancao":true,"contains_signatario":true,"contains_autoridade":true,"meta_description":"Dispõe sobre a revisão geral do subsídio e do vencimento básico dos servidores públicos civis e dos militares da administração direta, autárquica e fundacional do Poder Executivo e dá outras providências.","source_text_length":18455}}'::jsonb)
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
        AND NOT (hp.cargo ILIKE '%Vice-Governador%' OR hp.cargo ILIKE '%Vice Governador%' OR hp.cargo_canonico = 'Vice-Governador')
        AND UPPER(COALESCE(hp.estado, '')) = 'MG'
        AND COALESCE(hp.periodo_inicio, 9999) <= seed.ano
        AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
      ORDER BY hp.periodo_inicio DESC NULLS LAST, hp.id
      LIMIT 1
    ) AS historico_politico_id
  FROM candidatos c
  CROSS JOIN _seed_mateus_simoes_mg_almg_lote_a_lme seed
  WHERE c.slug = 'mateus-simoes'
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'mateus-simoes';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'mateus-simoes: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO total_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO scope_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'mateus-simoes-mg-almg-ampliado-parcial-lote-a-20260505'
    AND metadata->>'coverage_scope' = 'inventario_ampliado_parcial_mg_almg_lote_a_20260505';

  SELECT count(*) INTO projetos_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  IF total_count <> 5 THEN
    RAISE EXCEPTION 'Pos-apply mateus-simoes: total legislacao_mandato_executivo esperado 5, encontrado %', total_count;
  END IF;

  IF scope_count <> 5 THEN
    RAISE EXCEPTION 'Pos-apply mateus-simoes: esperadas 5 rows com coverage_id/scope alvo, encontradas %', scope_count;
  END IF;

  IF projetos_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply mateus-simoes: projetos_lei deve permanecer 0, encontrado %', projetos_count;
  END IF;

  RAISE NOTICE 'Pos-apply mateus-simoes MG ALMG Lote A: legislacao_mandato_executivo=% coverage_scope=% projetos_lei=%', total_count, scope_count, projetos_count;
END $$;
