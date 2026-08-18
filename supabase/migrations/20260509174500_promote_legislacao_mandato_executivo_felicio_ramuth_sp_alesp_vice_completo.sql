-- ============================================
-- Legislacao full-site: felicio-ramuth / ALESP / vice em exercicio completo scoped
-- ============================================
-- Fonte oficial: Assembleia Legislativa do Estado de Sao Paulo (https://www.al.sp.gov.br)
-- Artefato: fonte interna de curadoria
-- Coverage anterior: felicio-ramuth-sp-alesp-vice-ampliado-parcial-lote-a-20260505
-- Coverage novo: felicio-ramuth-sp-alesp-vice-completo-leis-ordinarias-complementares-2023-2026-cutoff-20260509
-- Cutoff inclusivo: 2026-05-09
-- Esta migration atualiza apenas legislacao_mandato_executivo.
-- Esta migration nao escreve em projetos_lei nem historico_politico.
-- ============================================

DO $$
DECLARE
  v_candidato_id uuid;
  v_lme_total int;
  v_old_coverage int;
  v_new_coverage int;
  v_projetos int;
  v_outside_scope int;
BEGIN
  SELECT id INTO v_candidato_id FROM candidatos WHERE slug = 'felicio-ramuth';

  IF v_candidato_id IS NULL THEN
    RAISE NOTICE 'felicio-ramuth: candidato ausente neste banco local/CI minimo; promocao LME completo scoped pulada';
    RETURN;
  END IF;

  SELECT count(*) INTO v_lme_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = v_candidato_id;

  SELECT count(*) INTO v_old_coverage
  FROM legislacao_mandato_executivo
  WHERE candidato_id = v_candidato_id
    AND metadata->>'coverage_id' = 'felicio-ramuth-sp-alesp-vice-ampliado-parcial-lote-a-20260505';

  SELECT count(*) INTO v_new_coverage
  FROM legislacao_mandato_executivo
  WHERE candidato_id = v_candidato_id
    AND metadata->>'coverage_id' = 'felicio-ramuth-sp-alesp-vice-completo-leis-ordinarias-complementares-2023-2026-cutoff-20260509';

  SELECT count(*) INTO v_projetos
  FROM projetos_lei
  WHERE candidato_id = v_candidato_id;

  IF v_lme_total <> 66 THEN
    RAISE EXCEPTION 'Pre-condicao felicio-ramuth: esperado 66 rows LME, encontrou %', v_lme_total;
  END IF;
  IF v_old_coverage NOT IN (0, 66) THEN
    RAISE EXCEPTION 'Pre-condicao felicio-ramuth: coverage antigo esperado 0 ou 66, encontrou %', v_old_coverage;
  END IF;
  IF v_new_coverage NOT IN (0, 66) THEN
    RAISE EXCEPTION 'Pre-condicao felicio-ramuth: coverage novo esperado 0 ou 66, encontrou %', v_new_coverage;
  END IF;
  IF v_old_coverage = 0 AND v_new_coverage <> 66 THEN
    RAISE EXCEPTION 'Pre-condicao felicio-ramuth: estado idempotente invalido; coverage antigo 0 e novo %', v_new_coverage;
  END IF;
  IF v_projetos <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao felicio-ramuth: projetos_lei deve permanecer 0, encontrou %', v_projetos;
  END IF;

  WITH accepted(identificador_fonte, tipo_norma, numero, ano, data_norma) AS (
    VALUES
    ('ALESP-SP-FELICIO:212088', 'lei complementar', '1.438', 2026, '2026-01-06'),
    ('ALESP-SP-FELICIO:212096', 'lei', '18.387', 2026, '2026-01-06'),
    ('ALESP-SP-FELICIO:210563', 'lei', '18.079', 2025, '2025-01-29'),
    ('ALESP-SP-FELICIO:210429', 'lei', '18.078', 2025, '2025-01-03'),
    ('ALESP-SP-FELICIO:210421', 'lei complementar', '1.419', 2024, '2024-12-27'),
    ('ALESP-SP-FELICIO:210424', 'lei', '18.073', 2024, '2024-12-27'),
    ('ALESP-SP-FELICIO:210425', 'lei', '18.074', 2024, '2024-12-27'),
    ('ALESP-SP-FELICIO:210426', 'lei', '18.075', 2024, '2024-12-27'),
    ('ALESP-SP-FELICIO:210427', 'lei', '18.076', 2024, '2024-12-27'),
    ('ALESP-SP-FELICIO:210428', 'lei', '18.077', 2024, '2024-12-27'),
    ('ALESP-SP-FELICIO:209669', 'lei', '17.970', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209670', 'lei', '17.963', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209671', 'lei', '17.969', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209672', 'lei', '17.961', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209673', 'lei', '17.968', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209674', 'lei', '17.962', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209675', 'lei', '17.967', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209676', 'lei', '17.966', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209677', 'lei', '17.965', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209678', 'lei', '17.964', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209654', 'lei', '17.950', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209655', 'lei', '17.951', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209656', 'lei', '17.952', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209657', 'lei', '17.953', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209658', 'lei', '17.954', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209659', 'lei', '17.955', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209660', 'lei', '17.956', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209661', 'lei', '17.957', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209662', 'lei', '17.958', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209663', 'lei', '17.959', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209664', 'lei', '17.960', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209424', 'lei', '17.939', 2024, '2024-05-13'),
    ('ALESP-SP-FELICIO:209425', 'lei', '17.940', 2024, '2024-05-13'),
    ('ALESP-SP-FELICIO:209426', 'lei', '17.941', 2024, '2024-05-13'),
    ('ALESP-SP-FELICIO:209427', 'lei', '17.942', 2024, '2024-05-13'),
    ('ALESP-SP-FELICIO:209428', 'lei', '17.943', 2024, '2024-05-13'),
    ('ALESP-SP-FELICIO:209241', 'lei', '17.891', 2024, '2024-03-22'),
    ('ALESP-SP-FELICIO:209227', 'lei', '17.877', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209228', 'lei', '17.878', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209229', 'lei', '17.879', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209230', 'lei', '17.880', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209231', 'lei', '17.881', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209232', 'lei', '17.882', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209233', 'lei', '17.883', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209234', 'lei', '17.884', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209235', 'lei', '17.885', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209236', 'lei', '17.886', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209237', 'lei', '17.887', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209238', 'lei', '17.888', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209239', 'lei', '17.889', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209240', 'lei', '17.890', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209195', 'lei', '17.867', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209196', 'lei', '17.871', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209197', 'lei', '17.868', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209198', 'lei', '17.869', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209199', 'lei', '17.870', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209200', 'lei', '17.872', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209201', 'lei', '17.873', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209202', 'lei', '17.874', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209203', 'lei', '17.875', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209204', 'lei', '17.876', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:208224', 'lei', '17.700', 2023, '2023-06-27'),
    ('ALESP-SP-FELICIO:208225', 'lei', '17.701', 2023, '2023-06-27'),
    ('ALESP-SP-FELICIO:208226', 'lei', '17.702', 2023, '2023-06-27'),
    ('ALESP-SP-FELICIO:207500', 'lei', '17.667', 2023, '2023-03-29'),
    ('ALESP-SP-FELICIO:207501', 'lei', '17.668', 2023, '2023-03-29')
  )
  SELECT count(*) INTO v_outside_scope
  FROM legislacao_mandato_executivo lme
  WHERE lme.candidato_id = v_candidato_id
    AND NOT EXISTS (
      SELECT 1
      FROM accepted a
      WHERE a.identificador_fonte = lme.identificador_fonte
        AND a.tipo_norma = lme.tipo_norma
        AND a.numero = lme.numero
        AND a.ano = lme.ano
        AND a.data_norma::date = lme.data_norma
    );

  IF v_outside_scope <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao felicio-ramuth: rows LME fora do recorte aceito ALESP/Felicio = %', v_outside_scope;
  END IF;
END $$;

WITH accepted(identificador_fonte, tipo_norma, numero, ano, data_norma) AS (
  VALUES
    ('ALESP-SP-FELICIO:212088', 'lei complementar', '1.438', 2026, '2026-01-06'),
    ('ALESP-SP-FELICIO:212096', 'lei', '18.387', 2026, '2026-01-06'),
    ('ALESP-SP-FELICIO:210563', 'lei', '18.079', 2025, '2025-01-29'),
    ('ALESP-SP-FELICIO:210429', 'lei', '18.078', 2025, '2025-01-03'),
    ('ALESP-SP-FELICIO:210421', 'lei complementar', '1.419', 2024, '2024-12-27'),
    ('ALESP-SP-FELICIO:210424', 'lei', '18.073', 2024, '2024-12-27'),
    ('ALESP-SP-FELICIO:210425', 'lei', '18.074', 2024, '2024-12-27'),
    ('ALESP-SP-FELICIO:210426', 'lei', '18.075', 2024, '2024-12-27'),
    ('ALESP-SP-FELICIO:210427', 'lei', '18.076', 2024, '2024-12-27'),
    ('ALESP-SP-FELICIO:210428', 'lei', '18.077', 2024, '2024-12-27'),
    ('ALESP-SP-FELICIO:209669', 'lei', '17.970', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209670', 'lei', '17.963', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209671', 'lei', '17.969', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209672', 'lei', '17.961', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209673', 'lei', '17.968', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209674', 'lei', '17.962', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209675', 'lei', '17.967', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209676', 'lei', '17.966', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209677', 'lei', '17.965', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209678', 'lei', '17.964', 2024, '2024-07-02'),
    ('ALESP-SP-FELICIO:209654', 'lei', '17.950', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209655', 'lei', '17.951', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209656', 'lei', '17.952', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209657', 'lei', '17.953', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209658', 'lei', '17.954', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209659', 'lei', '17.955', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209660', 'lei', '17.956', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209661', 'lei', '17.957', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209662', 'lei', '17.958', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209663', 'lei', '17.959', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209664', 'lei', '17.960', 2024, '2024-07-01'),
    ('ALESP-SP-FELICIO:209424', 'lei', '17.939', 2024, '2024-05-13'),
    ('ALESP-SP-FELICIO:209425', 'lei', '17.940', 2024, '2024-05-13'),
    ('ALESP-SP-FELICIO:209426', 'lei', '17.941', 2024, '2024-05-13'),
    ('ALESP-SP-FELICIO:209427', 'lei', '17.942', 2024, '2024-05-13'),
    ('ALESP-SP-FELICIO:209428', 'lei', '17.943', 2024, '2024-05-13'),
    ('ALESP-SP-FELICIO:209241', 'lei', '17.891', 2024, '2024-03-22'),
    ('ALESP-SP-FELICIO:209227', 'lei', '17.877', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209228', 'lei', '17.878', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209229', 'lei', '17.879', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209230', 'lei', '17.880', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209231', 'lei', '17.881', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209232', 'lei', '17.882', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209233', 'lei', '17.883', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209234', 'lei', '17.884', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209235', 'lei', '17.885', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209236', 'lei', '17.886', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209237', 'lei', '17.887', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209238', 'lei', '17.888', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209239', 'lei', '17.889', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209240', 'lei', '17.890', 2024, '2024-03-21'),
    ('ALESP-SP-FELICIO:209195', 'lei', '17.867', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209196', 'lei', '17.871', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209197', 'lei', '17.868', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209198', 'lei', '17.869', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209199', 'lei', '17.870', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209200', 'lei', '17.872', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209201', 'lei', '17.873', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209202', 'lei', '17.874', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209203', 'lei', '17.875', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:209204', 'lei', '17.876', 2024, '2024-03-18'),
    ('ALESP-SP-FELICIO:208224', 'lei', '17.700', 2023, '2023-06-27'),
    ('ALESP-SP-FELICIO:208225', 'lei', '17.701', 2023, '2023-06-27'),
    ('ALESP-SP-FELICIO:208226', 'lei', '17.702', 2023, '2023-06-27'),
    ('ALESP-SP-FELICIO:207500', 'lei', '17.667', 2023, '2023-03-29'),
    ('ALESP-SP-FELICIO:207501', 'lei', '17.668', 2023, '2023-03-29')
), target AS (
  SELECT c.id AS candidato_id
  FROM candidatos c
  WHERE c.slug = 'felicio-ramuth'
), updated AS (
  UPDATE legislacao_mandato_executivo lme
  SET
    signatario = 'FELÍCIO RAMUTH',
    autoridade_papel = 'vice_interino',
    metadata = COALESCE(lme.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'previous_coverage_id', COALESCE(lme.metadata->>'previous_coverage_id', lme.metadata->>'coverage_id'),
        'previous_coverage_scope', COALESCE(lme.metadata->>'previous_coverage_scope', lme.metadata->>'coverage_scope'),
        'coverage_id', 'felicio-ramuth-sp-alesp-vice-completo-leis-ordinarias-complementares-2023-2026-cutoff-20260509',
        'coverage_scope', 'inventario_completo_sp_alesp_vice_em_exercicio_2023_2026_cutoff_20260509',
        'coverage_status', 'completo_escopado',
        'coverage_cutoff', '2026-05-09',
        'coverage_claim', 'inventario completo escopado de leis ordinarias e complementares SP com texto integral ALESP que traz Felicio Ramuth como Vice-Governador em exercicio no cargo de Governador',
        'curation_batch_id', 'felicio-ramuth-sp-alesp-vice-completo-20260509',
        'promotion_artifact', 'fonte interna de curadoria',
        'source_enumeration_rows', 66,
        'formal_exclusions_missing_primary_text', 3,
        'projetos_lei_mixed', false,
        'historico_politico_id_inferido_por_data', false
      )
  FROM accepted a, target
  WHERE lme.candidato_id = target.candidato_id
    AND lme.identificador_fonte = a.identificador_fonte
    AND lme.tipo_norma = a.tipo_norma
    AND lme.numero = a.numero
    AND lme.ano = a.ano
    AND lme.data_norma = a.data_norma::date
  RETURNING lme.id
)
SELECT count(*) AS updated_rows FROM updated;

DO $$
DECLARE
  v_candidato_id uuid;
  v_lme_total int;
  v_new_coverage int;
  v_projetos int;
BEGIN
  SELECT id INTO v_candidato_id FROM candidatos WHERE slug = 'felicio-ramuth';

  IF v_candidato_id IS NULL THEN
    RAISE NOTICE 'felicio-ramuth: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO v_lme_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = v_candidato_id;

  SELECT count(*) INTO v_new_coverage
  FROM legislacao_mandato_executivo
  WHERE candidato_id = v_candidato_id
    AND metadata->>'coverage_id' = 'felicio-ramuth-sp-alesp-vice-completo-leis-ordinarias-complementares-2023-2026-cutoff-20260509'
    AND metadata->>'coverage_scope' = 'inventario_completo_sp_alesp_vice_em_exercicio_2023_2026_cutoff_20260509'
    AND signatario = 'FELÍCIO RAMUTH'
    AND autoridade_papel = 'vice_interino';

  SELECT count(*) INTO v_projetos
  FROM projetos_lei
  WHERE candidato_id = v_candidato_id;

  IF v_lme_total <> 66 THEN
    RAISE EXCEPTION 'Pos-condicao felicio-ramuth: esperado 66 rows LME, encontrou %', v_lme_total;
  END IF;
  IF v_new_coverage <> 66 THEN
    RAISE EXCEPTION 'Pos-condicao felicio-ramuth: esperado 66 rows com coverage completo, encontrou %', v_new_coverage;
  END IF;
  IF v_projetos <> 0 THEN
    RAISE EXCEPTION 'Pos-condicao felicio-ramuth: projetos_lei deveria permanecer 0, encontrou %', v_projetos;
  END IF;

  RAISE NOTICE 'Pos-apply felicio-ramuth ALESP vice completo scoped cutoff 2026-05-09: lme=% coverage=% projetos_lei=%', v_lme_total, v_new_coverage, v_projetos;
END $$;
