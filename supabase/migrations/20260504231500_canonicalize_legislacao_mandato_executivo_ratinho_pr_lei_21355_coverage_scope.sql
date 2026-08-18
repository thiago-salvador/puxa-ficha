-- ============================================
-- Fluxo 5B canonicalizacao do residual eliminavel
-- Canonicaliza identificador_fonte e metadata.coverage_scope
-- da row legacy Lei estadual no 21.355/2023 (PR) sancionada por
-- Carlos Massa Ratinho Junior, sem promover a coverage_id completo.
-- ============================================
-- Fonte primaria oficial: Sistema Legislacao do Estado do Parana
--   https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=279043&codItemAto=1770781
-- Migration original que inseriu a row legacy:
--   supabase/migrations/20260423180000_seed_legislacao_mandato_executivo_ratinho_pr_lei_21355.sql
-- Audit-blocked artefato motivador:
--   fonte interna de curadoria
-- Artefato desta canonicalizacao:
--   fonte interna de curadoria
--
-- Escopo autorizado nesta migration:
--   * UPDATE-only sobre legislacao_mandato_executivo
--   * exatamente 1 row alvo
--   * preserva metadata existente (source, data_real, fluxo, case_id)
--   * adiciona metadata.coverage_scope, metadata.curation_batch_id,
--     metadata.projetos_lei_mixed, metadata.historico_politico_id_inferido_por_data
--   * grava identificador_fonte = PR-LEGISLACAO:279043:1770781
--   * NAO altera projetos_lei
--   * NAO altera historico_politico
--   * NAO usa INSERT, DELETE, TRUNCATE
--   * NAO grava metadata.coverage_id
--   * NAO promove a coverage_id completo

DO $$
DECLARE
  target_count integer;
  total_count integer;
  legacy_null_before integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM candidatos c WHERE c.slug = 'ratinho-junior'
  ) THEN
    RAISE EXCEPTION 'ratinho-junior nao encontrado em candidatos';
  END IF;

  SELECT count(*) INTO target_count
  FROM legislacao_mandato_executivo lme
  JOIN candidatos c ON c.id = lme.candidato_id
  WHERE c.slug = 'ratinho-junior'
    AND lme.tipo_norma = 'lei'
    AND lme.numero = '21.355'
    AND lme.ano = 2023
    AND lme.fonte_primaria_url = 'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=279043&codItemAto=1770781'
    AND lme.metadata->>'case_id' = 'ratinho-junior-pr-lei-21355';

  IF target_count <> 1 THEN
    RAISE EXCEPTION 'Pre-condicao falhou: esperava 1 row alvo legacy 21.355 para ratinho-junior, achei %', target_count;
  END IF;

  SELECT count(*) INTO total_count
  FROM legislacao_mandato_executivo lme
  JOIN candidatos c ON c.id = lme.candidato_id
  WHERE c.slug = 'ratinho-junior';

  IF total_count <> 11 THEN
    RAISE EXCEPTION 'Pre-condicao falhou: esperava 11 rows totais em legislacao_mandato_executivo para ratinho-junior, achei %', total_count;
  END IF;

  SELECT count(*) INTO legacy_null_before
  FROM legislacao_mandato_executivo lme
  JOIN candidatos c ON c.id = lme.candidato_id
  WHERE c.slug = 'ratinho-junior'
    AND (lme.metadata->>'coverage_scope') IS NULL;

  IF legacy_null_before <> 1 THEN
    RAISE EXCEPTION 'Pre-condicao falhou: esperava exatamente 1 row legacy_null sem coverage_scope para ratinho-junior, achei %', legacy_null_before;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM legislacao_mandato_executivo lme
    JOIN candidatos c ON c.id = lme.candidato_id
    WHERE c.slug = 'ratinho-junior'
      AND (lme.metadata->>'coverage_id') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Pre-condicao falhou: ratinho-junior nao deve ter nenhum metadata.coverage_id antes desta canonicalizacao';
  END IF;
END $$;

UPDATE legislacao_mandato_executivo lme
SET
  identificador_fonte = 'PR-LEGISLACAO:279043:1770781',
  metadata = COALESCE(lme.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'coverage_scope', 'inventario_ampliado_parcial_pr_lei_21355_20260423',
      'curation_batch_id', 'ratinho-junior-pr-legacy-lei-21355-20260423',
      'projetos_lei_mixed', false,
      'historico_politico_id_inferido_por_data', false
    )
FROM candidatos c
WHERE c.id = lme.candidato_id
  AND c.slug = 'ratinho-junior'
  AND lme.tipo_norma = 'lei'
  AND lme.numero = '21.355'
  AND lme.ano = 2023
  AND lme.fonte_primaria_url = 'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=279043&codItemAto=1770781'
  AND lme.metadata->>'case_id' = 'ratinho-junior-pr-lei-21355';

DO $$
DECLARE
  post_target_with_scope integer;
  post_total integer;
  post_with_coverage_id integer;
  post_legacy_null integer;
BEGIN
  SELECT count(*) INTO post_target_with_scope
  FROM legislacao_mandato_executivo lme
  JOIN candidatos c ON c.id = lme.candidato_id
  WHERE c.slug = 'ratinho-junior'
    AND lme.tipo_norma = 'lei'
    AND lme.numero = '21.355'
    AND lme.ano = 2023
    AND lme.identificador_fonte = 'PR-LEGISLACAO:279043:1770781'
    AND lme.metadata->>'coverage_scope' = 'inventario_ampliado_parcial_pr_lei_21355_20260423'
    AND lme.metadata->>'case_id' = 'ratinho-junior-pr-lei-21355'
    AND lme.metadata->>'curation_batch_id' = 'ratinho-junior-pr-legacy-lei-21355-20260423'
    AND lme.metadata->>'projetos_lei_mixed' = 'false'
    AND lme.metadata->>'historico_politico_id_inferido_por_data' = 'false';

  IF post_target_with_scope <> 1 THEN
    RAISE EXCEPTION 'Pos-condicao falhou: esperava exatamente 1 row legacy 21.355 canonicalizada, achei %', post_target_with_scope;
  END IF;

  SELECT count(*) INTO post_total
  FROM legislacao_mandato_executivo lme
  JOIN candidatos c ON c.id = lme.candidato_id
  WHERE c.slug = 'ratinho-junior';

  IF post_total <> 11 THEN
    RAISE EXCEPTION 'Pos-condicao falhou: total mudou para % (esperado 11)', post_total;
  END IF;

  SELECT count(*) INTO post_with_coverage_id
  FROM legislacao_mandato_executivo lme
  JOIN candidatos c ON c.id = lme.candidato_id
  WHERE c.slug = 'ratinho-junior'
    AND (lme.metadata->>'coverage_id') IS NOT NULL;

  IF post_with_coverage_id <> 0 THEN
    RAISE EXCEPTION 'Pos-condicao falhou: nenhuma row de ratinho-junior pode ter metadata.coverage_id (encontrei %)', post_with_coverage_id;
  END IF;

  SELECT count(*) INTO post_legacy_null
  FROM legislacao_mandato_executivo lme
  JOIN candidatos c ON c.id = lme.candidato_id
  WHERE c.slug = 'ratinho-junior'
    AND (lme.metadata->>'coverage_scope') IS NULL;

  IF post_legacy_null <> 0 THEN
    RAISE EXCEPTION 'Pos-condicao falhou: esperava 0 rows sem metadata.coverage_scope, achei %', post_legacy_null;
  END IF;
END $$;
