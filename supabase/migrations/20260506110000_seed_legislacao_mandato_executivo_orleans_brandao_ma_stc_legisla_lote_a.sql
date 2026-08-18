-- ============================================
-- Legislacao full-site: orleans-brandao / MA STC Legisla / legislacao_mandato_executivo
-- Seed ampliado parcial: Lote A leis sancionadas estaduais MA 2026
-- ============================================
-- Fonte oficial: Secretaria de Estado de Transparencia e Controle do Maranhao - Legisla
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = orleans-brandao-ma-stc-legisla-ampliado-parcial-lote-a-20260506
--   coverage_scope = inventario_ampliado_parcial_ma_stc_legisla_lote_a_20260506
--
-- Filtro factual: paginas oficiais STC/MA Legisla com numero, data,
-- resenha/ementa, formula de sancao, assinatura Carlos Brandao e papel
-- Governador do Estado do Maranhao. Nao e inventario completo MA.
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'orleans-brandao';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'orleans-brandao: candidato ausente neste banco local/CI minimo; seed LME MA STC pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO lme_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO target_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'orleans-brandao-ma-stc-legisla-ampliado-parcial-lote-a-20260506';

  IF lme_total NOT IN (0, 3) THEN
    RAISE EXCEPTION 'Pre-condicao orleans-brandao: esperadas 0 rows atuais ou 3 rows alvo idempotentes em legislacao_mandato_executivo, encontradas %', lme_total;
  END IF;

  IF lme_total = 3 AND target_count <> 3 THEN
    RAISE EXCEPTION 'Pre-condicao orleans-brandao: 3 rows existentes, mas apenas % com coverage_id alvo', target_count;
  END IF;

  SELECT count(*) INTO mandato_count
  FROM historico_politico hp
  WHERE hp.candidato_id = cand_id
    AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
    AND (hp.cargo ILIKE '%Governador%' OR hp.cargo_canonico = 'Governador')
    AND UPPER(COALESCE(hp.estado, '')) = 'MA'
    AND COALESCE(hp.periodo_inicio, 9999) <= 2026
    AND COALESCE(hp.periodo_fim, 9999) >= 2026;

  IF mandato_count < 1 THEN
    RAISE EXCEPTION 'Pre-condicao orleans-brandao: mandato Governador/MA 2026 nao encontrado em historico_politico';
  END IF;
END $$;

CREATE TEMP TABLE _seed_orleans_brandao_ma_stc_lote_a_lme ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('lei_sancionada', 'estadual', 'MA', NULL, 'lei', '12.486', 2026, '2026-04-28', 'Dispoe sobre a extincao da Secretaria de Estado Extraordinaria de Igualdade Racial, cria a Secretaria de Estado de Igualdade Racial, no ambito do Estado do Maranhao, disciplina a transferencia de cargos em comissao, e da outras providencias.', 'CARLOS BRANDÃO', 'titular', 'https://app.stc.ma.gov.br/legisla/consulta/publicacao/8185', 'Secretaria de Estado de Transparencia e Controle do Maranhao - Legisla', 'https://app.stc.ma.gov.br/legisla/consulta/publicacoes?orgao=1&coletanea=&chave=&norma=10&dtaInicial=2023-01-01&dtaFinal=2026-05-06&numero=', 'STC-MA:LEI:12486:2026:PUBLICACAO:8185', '{"source":"STC-MA/Legisla","data_real":true,"fluxo":"5B","case_id":"stc-ma-lei-12486-2026-publicacao-8185","curation_batch_id":"orleans-brandao-ma-stc-legisla-lote-a-20260506","coverage_id":"orleans-brandao-ma-stc-legisla-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_ma_stc_legisla_lote_a_20260506","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"fonte_oficial_verificada_em":"2026-05-06T16:53:01.091Z","source_proof":{"http_status":200,"list_query_status":200,"list_query_contains_publicacao_id":true,"contains_numero":true,"contains_ementa":true,"contains_formula_sancao":true,"contains_signatario":true,"contains_autoridade":true,"contains_official_footer":true,"source_text_length":4438,"source_html_length":21262}}'::jsonb),
    ('lei_sancionada', 'estadual', 'MA', NULL, 'lei', '12.813', 2026, '2026-03-26', 'Institui a Carteira de Identificacao da Pessoa com Fibromialgia (CIPFibro) no ambito do Estado do Maranhao e da outras providencias.', 'CARLOS BRANDÃO', 'titular', 'https://app.stc.ma.gov.br/legisla/consulta/publicacao/8143', 'Secretaria de Estado de Transparencia e Controle do Maranhao - Legisla', 'https://app.stc.ma.gov.br/legisla/consulta/publicacoes?orgao=1&coletanea=&chave=&norma=10&dtaInicial=2023-01-01&dtaFinal=2026-05-06&numero=', 'STC-MA:LEI:12813:2026:PUBLICACAO:8143', '{"source":"STC-MA/Legisla","data_real":true,"fluxo":"5B","case_id":"stc-ma-lei-12813-2026-publicacao-8143","curation_batch_id":"orleans-brandao-ma-stc-legisla-lote-a-20260506","coverage_id":"orleans-brandao-ma-stc-legisla-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_ma_stc_legisla_lote_a_20260506","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"fonte_oficial_verificada_em":"2026-05-06T16:53:01.091Z","source_proof":{"http_status":200,"list_query_status":200,"list_query_contains_publicacao_id":true,"contains_numero":true,"contains_ementa":true,"contains_formula_sancao":true,"contains_signatario":true,"contains_autoridade":true,"contains_official_footer":true,"source_text_length":2441,"source_html_length":18881}}'::jsonb),
    ('lei_sancionada', 'estadual', 'MA', NULL, 'lei', '12.815', 2026, '2026-03-26', 'Dispoe sobre prioridade no atendimento psicologico aos familiares e atendentes pessoais da pessoa com deficiencia no ambito do Estado do Maranhao.', 'CARLOS BRANDÃO', 'titular', 'https://app.stc.ma.gov.br/legisla/consulta/publicacao/8145', 'Secretaria de Estado de Transparencia e Controle do Maranhao - Legisla', 'https://app.stc.ma.gov.br/legisla/consulta/publicacoes?orgao=1&coletanea=&chave=&norma=10&dtaInicial=2023-01-01&dtaFinal=2026-05-06&numero=', 'STC-MA:LEI:12815:2026:PUBLICACAO:8145', '{"source":"STC-MA/Legisla","data_real":true,"fluxo":"5B","case_id":"stc-ma-lei-12815-2026-publicacao-8145","curation_batch_id":"orleans-brandao-ma-stc-legisla-lote-a-20260506","coverage_id":"orleans-brandao-ma-stc-legisla-ampliado-parcial-lote-a-20260506","coverage_scope":"inventario_ampliado_parcial_ma_stc_legisla_lote_a_20260506","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"fonte_oficial_verificada_em":"2026-05-06T16:53:01.091Z","source_proof":{"http_status":200,"list_query_status":200,"list_query_contains_publicacao_id":true,"contains_numero":true,"contains_ementa":true,"contains_formula_sancao":true,"contains_signatario":true,"contains_autoridade":true,"contains_official_footer":true,"source_text_length":1629,"source_html_length":17741}}'::jsonb)
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
        AND UPPER(COALESCE(hp.estado, '')) = 'MA'
        AND COALESCE(hp.periodo_inicio, 9999) <= seed.ano
        AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
      ORDER BY hp.periodo_inicio DESC NULLS LAST, hp.id
      LIMIT 1
    ) AS historico_politico_id
  FROM candidatos c
  CROSS JOIN _seed_orleans_brandao_ma_stc_lote_a_lme seed
  WHERE c.slug = 'orleans-brandao'
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'orleans-brandao';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'orleans-brandao: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO total_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO scope_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'orleans-brandao-ma-stc-legisla-ampliado-parcial-lote-a-20260506'
    AND metadata->>'coverage_scope' = 'inventario_ampliado_parcial_ma_stc_legisla_lote_a_20260506';

  SELECT count(*) INTO projetos_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  IF total_count <> 3 THEN
    RAISE EXCEPTION 'Pos-apply orleans-brandao: total legislacao_mandato_executivo esperado 3, encontrado %', total_count;
  END IF;

  IF scope_count <> 3 THEN
    RAISE EXCEPTION 'Pos-apply orleans-brandao: esperadas 3 rows com coverage_id/scope alvo, encontradas %', scope_count;
  END IF;

  RAISE NOTICE 'Pos-apply orleans-brandao MA STC Lote A: legislacao_mandato_executivo=% coverage_scope=% projetos_lei_preservado=%', total_count, scope_count, projetos_count;
END $$;
