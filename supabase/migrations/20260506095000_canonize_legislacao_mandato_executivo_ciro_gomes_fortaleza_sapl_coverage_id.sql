-- ============================================
-- Legislacao full-site: ciro-gomes / SAPL Fortaleza / legislacao_mandato_executivo
-- Canonizacao de coverage_id parcial em rows existentes
-- ============================================
-- Fonte oficial: SAPL Fortaleza
--   https://sapl.fortaleza.ce.leg.br/norma/{id}
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id = ciro-gomes-fortaleza-sapl-pdf-ocr-signatario-ampliado-parcial-20260506
--
-- Filtro factual: das 108 rows LME existentes para ciro-gomes,
-- somente 103 rows SAPL Fortaleza dos scopes PDF/OCR ja aplicados recebem
-- coverage_id. As 5 rows CE estaduais ficam sem novo coverage_id neste lote.
--
-- Esta migration NAO escreve em projetos_lei; valida baseline read-only de 95 rows.
-- Esta migration NAO insere, deleta ou trunca rows.
-- ============================================

DO $$
DECLARE
  cand_id uuid;
  total_lme int;
  target_sapl int;
  target_other_coverage int;
  ce_rows int;
  pl_rows int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'ciro-gomes';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'ciro-gomes: candidato ausente neste banco local/CI minimo; canonizacao SAPL Fortaleza pulada';
    RETURN;
  END IF;

  SELECT count(*) INTO total_lme
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;
  IF total_lme IN (0, 5) THEN
    RAISE NOTICE 'ciro-gomes SAPL Fortaleza: baseline SAPL ausente neste banco local/CI minimo; canonizacao sera no-op';
    RETURN;
  END IF;
  IF total_lme <> 108 THEN
    RAISE EXCEPTION 'Pre-condicao ciro-gomes SAPL Fortaleza: esperadas 108 rows LME, encontradas %', total_lme;
  END IF;

  SELECT count(*) INTO target_sapl
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_scope' IN (
      'fortaleza_municipal_lote_a_pdf_signatario_20260504',
      'fortaleza_municipal_lote_b_ocr_signatario_20260504'
    )
    AND signatario = 'CIRO FERREIRA GOMES'
    AND autoridade_papel = 'titular'
    AND (
      fonte_primaria_url LIKE 'https://sapl.fortaleza.ce.leg.br/norma/%'
      OR identificador_fonte LIKE 'SAPL-FOR:%'
    );
  IF target_sapl <> 103 THEN
    RAISE EXCEPTION 'Pre-condicao ciro-gomes SAPL Fortaleza: esperadas 103 rows alvo, encontradas %', target_sapl;
  END IF;

  SELECT count(*) INTO target_other_coverage
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_scope' IN (
      'fortaleza_municipal_lote_a_pdf_signatario_20260504',
      'fortaleza_municipal_lote_b_ocr_signatario_20260504'
    )
    AND metadata->>'coverage_id' IS NOT NULL
    AND metadata->>'coverage_id' <> 'ciro-gomes-fortaleza-sapl-pdf-ocr-signatario-ampliado-parcial-20260506';
  IF target_other_coverage <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao ciro-gomes SAPL Fortaleza: % rows alvo ja tem coverage_id divergente', target_other_coverage;
  END IF;

  SELECT count(*) INTO ce_rows
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_scope' = 'inventario_ampliado_parcial_ce_lote_a_20260429';
  IF ce_rows <> 5 THEN
    RAISE EXCEPTION 'Pre-condicao ciro-gomes SAPL Fortaleza: esperadas 5 rows CE fora do recorte, encontradas %', ce_rows;
  END IF;

  SELECT count(*) INTO pl_rows FROM projetos_lei WHERE candidato_id = cand_id;
  IF pl_rows NOT IN (0, 95) THEN
    RAISE EXCEPTION 'Pre-condicao ciro-gomes SAPL Fortaleza: baseline projetos_lei esperado 95, encontrado %', pl_rows;
  END IF;
  IF pl_rows = 0 THEN
    RAISE NOTICE 'ciro-gomes SAPL Fortaleza: baseline projetos_lei ausente neste banco local/CI minimo; validacao read-only pulada';
  END IF;
END $$;

WITH target AS (
  SELECT id AS candidato_id
  FROM candidatos
  WHERE slug = 'ciro-gomes'
)
UPDATE legislacao_mandato_executivo lme
SET metadata = COALESCE(lme.metadata, '{}'::jsonb) || jsonb_build_object(
  'coverage_id', 'ciro-gomes-fortaleza-sapl-pdf-ocr-signatario-ampliado-parcial-20260506',
  'coverage_id_canonized_at', '2026-05-06',
  'coverage_id_canonization_scope', 'fortaleza_municipal_lote_a_pdf_signatario_20260504+fortaleza_municipal_lote_b_ocr_signatario_20260504',
  'fonte_oficial', 'SAPL Fortaleza',
  'tabela_alvo', 'legislacao_mandato_executivo',
  'projetos_lei_mixed', false,
  'legislacao_mandato_executivo_mixed', false
)
FROM target
WHERE lme.candidato_id = target.candidato_id
  AND lme.metadata->>'coverage_scope' IN (
    'fortaleza_municipal_lote_a_pdf_signatario_20260504',
    'fortaleza_municipal_lote_b_ocr_signatario_20260504'
  )
  AND lme.signatario = 'CIRO FERREIRA GOMES'
  AND lme.autoridade_papel = 'titular'
  AND (
    lme.fonte_primaria_url LIKE 'https://sapl.fortaleza.ce.leg.br/norma/%'
    OR lme.identificador_fonte LIKE 'SAPL-FOR:%'
  )
  AND (
    lme.metadata->>'coverage_id' IS NULL
    OR lme.metadata->>'coverage_id' = 'ciro-gomes-fortaleza-sapl-pdf-ocr-signatario-ampliado-parcial-20260506'
  );

DO $$
DECLARE
  cand_id uuid;
  total_lme int;
  coverage_rows int;
  metadata_ok_rows int;
  ce_without_coverage int;
  pl_rows int;
  other_slug_rows int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'ciro-gomes';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'ciro-gomes: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO total_lme
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;
  IF total_lme IN (0, 5) THEN
    RAISE NOTICE 'ciro-gomes SAPL Fortaleza: pos-condicao canonizacao pulada porque baseline SAPL nao existe neste banco local/CI minimo';
    RETURN;
  END IF;
  IF total_lme <> 108 THEN
    RAISE EXCEPTION 'Pos-apply ciro-gomes SAPL Fortaleza: esperadas 108 rows LME, encontradas %', total_lme;
  END IF;

  SELECT count(*) INTO coverage_rows
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'ciro-gomes-fortaleza-sapl-pdf-ocr-signatario-ampliado-parcial-20260506';
  IF coverage_rows <> 103 THEN
    RAISE EXCEPTION 'Pos-apply ciro-gomes SAPL Fortaleza: esperadas 103 rows com coverage_id, encontradas %', coverage_rows;
  END IF;

  SELECT count(*) INTO metadata_ok_rows
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'ciro-gomes-fortaleza-sapl-pdf-ocr-signatario-ampliado-parcial-20260506'
    AND metadata->>'tabela_alvo' = 'legislacao_mandato_executivo'
    AND metadata->>'projetos_lei_mixed' = 'false'
    AND metadata->>'legislacao_mandato_executivo_mixed' = 'false';
  IF metadata_ok_rows <> 103 THEN
    RAISE EXCEPTION 'Pos-apply ciro-gomes SAPL Fortaleza: esperadas 103 rows metadata_ok, encontradas %', metadata_ok_rows;
  END IF;

  SELECT count(*) INTO ce_without_coverage
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_scope' = 'inventario_ampliado_parcial_ce_lote_a_20260429'
    AND metadata->>'coverage_id' IS NULL;
  IF ce_without_coverage <> 5 THEN
    RAISE EXCEPTION 'Pos-apply ciro-gomes SAPL Fortaleza: esperadas 5 rows CE sem novo coverage_id, encontradas %', ce_without_coverage;
  END IF;

  SELECT count(*) INTO pl_rows FROM projetos_lei WHERE candidato_id = cand_id;
  IF pl_rows NOT IN (0, 95) THEN
    RAISE EXCEPTION 'Pos-apply ciro-gomes SAPL Fortaleza: baseline projetos_lei esperado 95, encontrado %', pl_rows;
  END IF;
  IF pl_rows = 0 THEN
    RAISE NOTICE 'ciro-gomes SAPL Fortaleza: pos-condicao read-only projetos_lei pulada porque baseline nao existe neste banco local/CI minimo';
  END IF;

  SELECT count(*) INTO other_slug_rows
  FROM legislacao_mandato_executivo
  WHERE candidato_id <> cand_id
    AND metadata->>'coverage_id' = 'ciro-gomes-fortaleza-sapl-pdf-ocr-signatario-ampliado-parcial-20260506';
  IF other_slug_rows <> 0 THEN
    RAISE EXCEPTION 'Pos-apply ciro-gomes SAPL Fortaleza: % rows de outros slugs com coverage_id alvo', other_slug_rows;
  END IF;

  RAISE NOTICE 'Pos-apply ciro-gomes SAPL Fortaleza coverage canonizado: coverage=% ce_sem_coverage=% projetos_lei=%', coverage_rows, ce_without_coverage, pl_rows;
END $$;
