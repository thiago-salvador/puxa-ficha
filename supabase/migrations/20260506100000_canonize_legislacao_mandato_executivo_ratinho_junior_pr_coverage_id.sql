-- ============================================
-- Legislacao full-site: ratinho-junior / Sistema Legislacao PR / legislacao_mandato_executivo
-- Canonizacao de coverage_id parcial em rows existentes
-- ============================================
-- Fonte oficial: Sistema Legislacao do Estado do Parana
--   https://www.legislacao.pr.gov.br/legislacao/exibirAto.do
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id = ratinho-junior-pr-legislacao-executivo-ampliado-parcial-20260506
--
-- Filtro factual: as 11 rows LME existentes para ratinho-junior
-- recebem coverage_id porque a fonte oficial PR ja provava numero/data/fonte,
-- signatario CARLOS MASSA RATINHO JUNIOR e autoridade_papel titular.
--
-- Esta migration NAO escreve em projetos_lei; valida baseline read-only de 100 rows.
-- Esta migration NAO insere, deleta ou trunca rows.
-- ============================================

DO $$
DECLARE
  cand_id uuid;
  total_lme int;
  target_pr int;
  target_other_coverage int;
  pl_rows int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'ratinho-junior';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'ratinho-junior: candidato ausente neste banco local/CI minimo; canonizacao PR pulada';
    RETURN;
  END IF;

  SELECT count(*) INTO total_lme
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;
  IF total_lme = 0 THEN
    RAISE NOTICE 'ratinho-junior PR: baseline LME ausente neste banco local/CI minimo; canonizacao sera no-op';
    RETURN;
  END IF;
  IF total_lme <> 11 THEN
    RAISE EXCEPTION 'Pre-condicao ratinho-junior PR: esperadas 11 rows LME, encontradas %', total_lme;
  END IF;

  SELECT count(*) INTO target_pr
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_scope' IN (
      'inventario_ampliado_parcial_pr_lote_b_20260430',
      'inventario_ampliado_parcial_pr_lote_a_20260428',
      'inventario_ampliado_parcial_pr_lei_21355_20260423'
    )
    AND signatario = 'CARLOS MASSA RATINHO JUNIOR'
    AND autoridade_papel = 'titular'
    AND esfera = 'estadual'
    AND uf_norma = 'PR'
    AND (
      fonte_primaria_url LIKE '%legislacao.pr.gov.br%'
      OR identificador_fonte LIKE 'PR-LEGISLACAO:%'
    );
  IF target_pr <> 11 THEN
    RAISE EXCEPTION 'Pre-condicao ratinho-junior PR: esperadas 11 rows alvo, encontradas %', target_pr;
  END IF;

  SELECT count(*) INTO target_other_coverage
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_scope' IN (
      'inventario_ampliado_parcial_pr_lote_b_20260430',
      'inventario_ampliado_parcial_pr_lote_a_20260428',
      'inventario_ampliado_parcial_pr_lei_21355_20260423'
    )
    AND metadata->>'coverage_id' IS NOT NULL
    AND metadata->>'coverage_id' <> 'ratinho-junior-pr-legislacao-executivo-ampliado-parcial-20260506';
  IF target_other_coverage <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao ratinho-junior PR: % rows alvo ja tem coverage_id divergente', target_other_coverage;
  END IF;

  SELECT count(*) INTO pl_rows FROM projetos_lei WHERE candidato_id = cand_id;
  IF pl_rows NOT IN (0, 100) THEN
    RAISE EXCEPTION 'Pre-condicao ratinho-junior PR: baseline projetos_lei esperado 100, encontrado %', pl_rows;
  END IF;
  IF pl_rows = 0 THEN
    RAISE NOTICE 'ratinho-junior PR: baseline projetos_lei ausente neste banco local/CI minimo; validacao read-only pulada';
  END IF;
END $$;

WITH target AS (
  SELECT id AS candidato_id
  FROM candidatos
  WHERE slug = 'ratinho-junior'
)
UPDATE legislacao_mandato_executivo lme
SET metadata = COALESCE(lme.metadata, '{}'::jsonb) || jsonb_build_object(
  'coverage_id', 'ratinho-junior-pr-legislacao-executivo-ampliado-parcial-20260506',
  'coverage_id_canonized_at', '2026-05-06',
  'coverage_id_canonization_scope', 'inventario_ampliado_parcial_pr_lote_a_20260428+inventario_ampliado_parcial_pr_lote_b_20260430+inventario_ampliado_parcial_pr_lei_21355_20260423',
  'fonte_oficial', 'Sistema Legislacao do Estado do Parana',
  'tabela_alvo', 'legislacao_mandato_executivo',
  'projetos_lei_mixed', false,
  'legislacao_mandato_executivo_mixed', false
)
FROM target
WHERE lme.candidato_id = target.candidato_id
  AND lme.metadata->>'coverage_scope' IN (
    'inventario_ampliado_parcial_pr_lote_b_20260430',
    'inventario_ampliado_parcial_pr_lote_a_20260428',
    'inventario_ampliado_parcial_pr_lei_21355_20260423'
  )
  AND lme.signatario = 'CARLOS MASSA RATINHO JUNIOR'
  AND lme.autoridade_papel = 'titular'
  AND lme.esfera = 'estadual'
  AND lme.uf_norma = 'PR'
  AND (
    lme.fonte_primaria_url LIKE '%legislacao.pr.gov.br%'
    OR lme.identificador_fonte LIKE 'PR-LEGISLACAO:%'
  )
  AND (
    lme.metadata->>'coverage_id' IS NULL
    OR lme.metadata->>'coverage_id' = 'ratinho-junior-pr-legislacao-executivo-ampliado-parcial-20260506'
  );

DO $$
DECLARE
  cand_id uuid;
  total_lme int;
  coverage_rows int;
  metadata_ok_rows int;
  pl_rows int;
  other_slug_rows int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'ratinho-junior';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'ratinho-junior: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO total_lme
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;
  IF total_lme = 0 THEN
    RAISE NOTICE 'ratinho-junior PR: pos-condicao canonizacao pulada porque baseline LME nao existe neste banco local/CI minimo';
    RETURN;
  END IF;
  IF total_lme <> 11 THEN
    RAISE EXCEPTION 'Pos-apply ratinho-junior PR: esperadas 11 rows LME, encontradas %', total_lme;
  END IF;

  SELECT count(*) INTO coverage_rows
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'ratinho-junior-pr-legislacao-executivo-ampliado-parcial-20260506';
  IF coverage_rows <> 11 THEN
    RAISE EXCEPTION 'Pos-apply ratinho-junior PR: esperadas 11 rows com coverage_id, encontradas %', coverage_rows;
  END IF;

  SELECT count(*) INTO metadata_ok_rows
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'ratinho-junior-pr-legislacao-executivo-ampliado-parcial-20260506'
    AND metadata->>'tabela_alvo' = 'legislacao_mandato_executivo'
    AND metadata->>'projetos_lei_mixed' = 'false'
    AND metadata->>'legislacao_mandato_executivo_mixed' = 'false';
  IF metadata_ok_rows <> 11 THEN
    RAISE EXCEPTION 'Pos-apply ratinho-junior PR: esperadas 11 rows metadata_ok, encontradas %', metadata_ok_rows;
  END IF;

  SELECT count(*) INTO pl_rows FROM projetos_lei WHERE candidato_id = cand_id;
  IF pl_rows NOT IN (0, 100) THEN
    RAISE EXCEPTION 'Pos-apply ratinho-junior PR: baseline projetos_lei esperado 100, encontrado %', pl_rows;
  END IF;
  IF pl_rows = 0 THEN
    RAISE NOTICE 'ratinho-junior PR: pos-condicao read-only projetos_lei pulada porque baseline nao existe neste banco local/CI minimo';
  END IF;

  SELECT count(*) INTO other_slug_rows
  FROM legislacao_mandato_executivo
  WHERE candidato_id <> cand_id
    AND metadata->>'coverage_id' = 'ratinho-junior-pr-legislacao-executivo-ampliado-parcial-20260506';
  IF other_slug_rows <> 0 THEN
    RAISE EXCEPTION 'Pos-apply ratinho-junior PR: % rows de outros slugs com coverage_id alvo', other_slug_rows;
  END IF;

  RAISE NOTICE 'Pos-apply ratinho-junior PR coverage canonizado: coverage=% projetos_lei=%', coverage_rows, pl_rows;
END $$;
