-- ============================================
-- Legislacao full-site: elmano-de-freitas / CE BELT / legislacao_mandato_executivo
-- Seed ampliado parcial: Lote A leis sancionadas estaduais CE 2023
-- ============================================
-- Fonte oficial: Assembleia Legislativa do Estado do Ceara - Banco Eletronico
-- de Leis Tematicas (BELT)
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = elmano-de-freitas-ce-belt-ampliado-parcial-lote-a-20260505
--   coverage_scope = inventario_ampliado_parcial_ce_belt_lote_a_20260505
--
-- Filtro factual: paginas oficiais BELT com numero, data, ementa,
-- formula de sancao, assinatura Elmano de Freitas da Costa e papel
-- GOVERNADOR DO ESTADO. Nao e inventario completo CE.
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'elmano-de-freitas';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'elmano-de-freitas: candidato ausente neste banco local/CI minimo; seed LME CE BELT pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO lme_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO target_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'elmano-de-freitas-ce-belt-ampliado-parcial-lote-a-20260505';

  IF lme_total NOT IN (0, 5) THEN
    RAISE EXCEPTION 'Pre-condicao elmano-de-freitas: esperadas 0 rows atuais ou 5 rows alvo idempotentes em legislacao_mandato_executivo, encontradas %', lme_total;
  END IF;

  IF lme_total = 5 AND target_count <> 5 THEN
    RAISE EXCEPTION 'Pre-condicao elmano-de-freitas: 5 rows existentes, mas apenas % com coverage_id alvo', target_count;
  END IF;

  SELECT count(*) INTO mandato_count
  FROM historico_politico hp
  WHERE hp.candidato_id = cand_id
    AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
    AND (hp.cargo ILIKE '%Governador%' OR hp.cargo_canonico = 'Governador')
    AND UPPER(COALESCE(hp.estado, '')) = 'CE'
    AND COALESCE(hp.periodo_inicio, 9999) <= 2023
    AND COALESCE(hp.periodo_fim, 9999) >= 2023;

  IF mandato_count < 1 THEN
    RAISE EXCEPTION 'Pre-condicao elmano-de-freitas: mandato Governador/CE 2023 nao encontrado em historico_politico';
  END IF;
END $$;

CREATE TEMP TABLE _seed_elmano_de_freitas_ce_belt_lote_a_lme ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('lei_sancionada', 'estadual', 'CE', NULL, 'lei', '18.334', 2023, '2023-03-30', 'Revoga a Lei n.º 18.307, de 16 de fevereiro de 2023, que institui o Fundo Estadual de Sustentabilidade Fiscal do Estado do Ceara - FESF.', 'ELMANO DE FREITAS DA COSTA', 'titular', 'https://belt.al.ce.gov.br/index.php/legislacao-do-ceara/organizacao-tematica/orcamento-financas-e-tributacao/item/8294-lei-n-18-334-de-30-03-23-d-o-30-03-23?print=1&tmpl=component', 'Assembleia Legislativa do Estado do Ceara - Banco Eletronico de Leis Tematicas', NULL, 'BELT-CE:LEI:18334:2023', '{"source":"BELT/ALECE","data_real":true,"fluxo":"5B","case_id":"belt-ce-lei-18334-2023","curation_batch_id":"elmano-de-freitas-ce-belt-lote-a-20260505","coverage_id":"elmano-de-freitas-ce-belt-ampliado-parcial-lote-a-20260505","coverage_scope":"inventario_ampliado_parcial_ce_belt_lote_a_20260505","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"fonte_oficial_verificada_em":"2026-05-06T01:48:39.875Z","source_proof":{"http_status":200,"contains_numero":true,"contains_ementa":true,"contains_formula_sancao":true,"contains_signatario":true,"contains_autoridade":true,"contains_autoria_poder_executivo":true,"source_text_length":1934}}'::jsonb),
    ('lei_sancionada', 'estadual', 'CE', NULL, 'lei', '18.338', 2023, '2023-04-04', 'Dispoe sobre o fortalecimento do modelo de gestao do servico publico estadual da area da saude, a ser observado pela Secretaria da Saude, alinhado a uma gestao por resultado, com foco na eficiencia, na reducao da contratacao precaria nos servicos de saude, no controle administrativo, na economicidade e na uniformizacao dos procedimentos relativos a area da saude no Estado.', 'ELMANO DE FREITAS DA COSTA', 'titular', 'https://belt.al.ce.gov.br/index.php/legislacao-do-ceara/organizacao-tematica/seguridade-social-e-saude/item/8298-lei-n-18-338-de-04-04-23-d-o-04-04-23?print=1&tmpl=component', 'Assembleia Legislativa do Estado do Ceara - Banco Eletronico de Leis Tematicas', NULL, 'BELT-CE:LEI:18338:2023', '{"source":"BELT/ALECE","data_real":true,"fluxo":"5B","case_id":"belt-ce-lei-18338-2023","curation_batch_id":"elmano-de-freitas-ce-belt-lote-a-20260505","coverage_id":"elmano-de-freitas-ce-belt-ampliado-parcial-lote-a-20260505","coverage_scope":"inventario_ampliado_parcial_ce_belt_lote_a_20260505","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"fonte_oficial_verificada_em":"2026-05-06T01:48:39.875Z","source_proof":{"http_status":200,"contains_numero":true,"contains_ementa":true,"contains_formula_sancao":true,"contains_signatario":true,"contains_autoridade":true,"contains_autoria_poder_executivo":true,"source_text_length":14467}}'::jsonb),
    ('lei_sancionada', 'estadual', 'CE', NULL, 'lei', '18.413', 2023, '2023-07-10', 'Altera a Lei n.º 18.312, de 17 de fevereiro de 2023, que institui o Programa Ceara Sem Fome e cria as redes de unidades sociais produtoras de refeicoes no combate a fome no Estado do Ceara.', 'ELMANO DE FREITAS DA COSTA', 'titular', 'https://belt.al.ce.gov.br/index.php/legislacao-do-ceara/organizacao-tematica/seguridade-social-e-saude/item/8406-lei-n-18-413-de-10-07-23?print=1&tmpl=component', 'Assembleia Legislativa do Estado do Ceara - Banco Eletronico de Leis Tematicas', NULL, 'BELT-CE:LEI:18413:2023', '{"source":"BELT/ALECE","data_real":true,"fluxo":"5B","case_id":"belt-ce-lei-18413-2023","curation_batch_id":"elmano-de-freitas-ce-belt-lote-a-20260505","coverage_id":"elmano-de-freitas-ce-belt-ampliado-parcial-lote-a-20260505","coverage_scope":"inventario_ampliado_parcial_ce_belt_lote_a_20260505","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"fonte_oficial_verificada_em":"2026-05-06T01:48:39.875Z","source_proof":{"http_status":200,"contains_numero":true,"contains_ementa":true,"contains_formula_sancao":true,"contains_signatario":true,"contains_autoridade":true,"contains_autoria_poder_executivo":false,"source_text_length":6731}}'::jsonb),
    ('lei_sancionada', 'estadual', 'CE', NULL, 'lei', '18.430', 2023, '2023-07-21', 'Dispoe sobre as diretrizes para a elaboracao e execucao da Lei Orcamentaria para o exercicio de 2024.', 'ELMANO DE FREITAS DA COSTA', 'titular', 'https://belt.al.ce.gov.br/index.php/legislacao-do-ceara/organizacao-tematica/leis-orcamentaria/item/8429-lei-n-18-430-de-21-07-23-d-o-24-07-23?print=1&tmpl=component', 'Assembleia Legislativa do Estado do Ceara - Banco Eletronico de Leis Tematicas', NULL, 'BELT-CE:LEI:18430:2023', '{"source":"BELT/ALECE","data_real":true,"fluxo":"5B","case_id":"belt-ce-lei-18430-2023","curation_batch_id":"elmano-de-freitas-ce-belt-lote-a-20260505","coverage_id":"elmano-de-freitas-ce-belt-ampliado-parcial-lote-a-20260505","coverage_scope":"inventario_ampliado_parcial_ce_belt_lote_a_20260505","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"fonte_oficial_verificada_em":"2026-05-06T01:48:39.875Z","source_proof":{"http_status":200,"contains_numero":true,"contains_ementa":true,"contains_formula_sancao":true,"contains_signatario":true,"contains_autoridade":true,"contains_autoria_poder_executivo":true,"source_text_length":130530}}'::jsonb),
    ('lei_sancionada', 'estadual', 'CE', NULL, 'lei complementar', '303', 2023, '2023-03-20', 'Altera as Leis Complementares n.º 58, de 31 de marco de 2006, que dispoe sobre a Lei Organica da Procuradoria-Geral do Estado, n.º 65, de 3 de janeiro de 2008, n.º 70, de 10 de novembro de 2008, e a Lei n.º 17.162, de 27 de dezembro de 2019.', 'ELMANO DE FREITAS DA COSTA', 'titular', 'https://belt.al.ce.gov.br/index.php/legislacao-do-ceara/organizacao-tematica/trabalho-administracao-e-servico-publico/item/8338-lei-complementar-n-303-de-20-03-23-d-o-21-03-23?print=1&tmpl=component', 'Assembleia Legislativa do Estado do Ceara - Banco Eletronico de Leis Tematicas', NULL, 'BELT-CE:LCP:303:2023', '{"source":"BELT/ALECE","data_real":true,"fluxo":"5B","case_id":"belt-ce-lcp-303-2023","curation_batch_id":"elmano-de-freitas-ce-belt-lote-a-20260505","coverage_id":"elmano-de-freitas-ce-belt-ampliado-parcial-lote-a-20260505","coverage_scope":"inventario_ampliado_parcial_ce_belt_lote_a_20260505","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"fonte_oficial_verificada_em":"2026-05-06T01:48:39.875Z","source_proof":{"http_status":200,"contains_numero":true,"contains_ementa":true,"contains_formula_sancao":true,"contains_signatario":true,"contains_autoridade":true,"contains_autoria_poder_executivo":true,"source_text_length":16734}}'::jsonb)
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
        AND UPPER(COALESCE(hp.estado, '')) = 'CE'
        AND COALESCE(hp.periodo_inicio, 9999) <= seed.ano
        AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
      ORDER BY hp.periodo_inicio DESC NULLS LAST, hp.id
      LIMIT 1
    ) AS historico_politico_id
  FROM candidatos c
  CROSS JOIN _seed_elmano_de_freitas_ce_belt_lote_a_lme seed
  WHERE c.slug = 'elmano-de-freitas'
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'elmano-de-freitas';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'elmano-de-freitas: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO total_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO scope_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'elmano-de-freitas-ce-belt-ampliado-parcial-lote-a-20260505'
    AND metadata->>'coverage_scope' = 'inventario_ampliado_parcial_ce_belt_lote_a_20260505';

  SELECT count(*) INTO projetos_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  IF total_count <> 5 THEN
    RAISE EXCEPTION 'Pos-apply elmano-de-freitas: total legislacao_mandato_executivo esperado 5, encontrado %', total_count;
  END IF;

  IF scope_count <> 5 THEN
    RAISE EXCEPTION 'Pos-apply elmano-de-freitas: esperadas 5 rows com coverage_id/scope alvo, encontradas %', scope_count;
  END IF;

  IF projetos_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply elmano-de-freitas: projetos_lei deve permanecer 0, encontrado %', projetos_count;
  END IF;

  RAISE NOTICE 'Pos-apply elmano-de-freitas CE BELT Lote A: legislacao_mandato_executivo=% coverage_scope=% projetos_lei=%', total_count, scope_count, projetos_count;
END $$;
