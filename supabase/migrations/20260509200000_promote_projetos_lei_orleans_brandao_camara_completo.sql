-- ============================================
-- Legislacao full-site: orleans-brandao / Camara Dados Abertos / projetos_lei
-- Promocao publica: completo escopado da autoria parlamentar principal Camara
-- ============================================
-- Fonte oficial e prova:
--   fonte interna de curadoria
--   fonte interna de curadoria
--
-- Coverage anterior:
--   orleans-brandao-camara-autoria-principal-ampliado-parcial-lote-a-20260506
--
-- Coverage novo:
--   orleans-brandao-camara-completo-autoria-principal-tipos-verificados-2007-2014-cutoff-20260509
--
-- Esta migration escreve apenas em projetos_lei.
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO escreve em historico_politico.
-- Esta migration NAO deleta nem trunca rows.
-- ============================================

DO $$
DECLARE
  cand_id uuid;
  projetos_total int;
  old_count int;
  new_count int;
  divergent_count int;
  lme_total int;
  lme_target_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'orleans-brandao';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'orleans-brandao: candidato ausente neste banco local/CI minimo; promocao projetos_lei Camara pulada';
    RETURN;
  END IF;

  SELECT count(*) INTO projetos_total
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO old_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'orleans-brandao-camara-autoria-principal-ampliado-parcial-lote-a-20260506';

  SELECT count(*) INTO new_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'orleans-brandao-camara-completo-autoria-principal-tipos-verificados-2007-2014-cutoff-20260509';

  SELECT count(*) INTO divergent_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id IS NOT NULL
    AND coverage_id NOT IN (
      'orleans-brandao-camara-autoria-principal-ampliado-parcial-lote-a-20260506',
      'orleans-brandao-camara-completo-autoria-principal-tipos-verificados-2007-2014-cutoff-20260509'
    );

  SELECT count(*) INTO lme_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO lme_target_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'orleans-brandao-camara-completo-autoria-principal-tipos-verificados-2007-2014-cutoff-20260509';

  IF projetos_total <> 137 THEN
    RAISE EXCEPTION 'Pre-condicao orleans-brandao: esperadas 137 rows Camara em projetos_lei, encontradas %', projetos_total;
  END IF;

  IF old_count + new_count <> 137 THEN
    RAISE EXCEPTION 'Pre-condicao orleans-brandao: esperadas 137 rows no coverage antigo/novo, achei antigo=% novo=%', old_count, new_count;
  END IF;

  IF divergent_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao orleans-brandao: % rows com coverage_id divergente em projetos_lei', divergent_count;
  END IF;

  IF lme_total <> 3 THEN
    RAISE EXCEPTION 'Pre-condicao orleans-brandao: esperadas 3 rows em legislacao_mandato_executivo parcial separado, encontradas %', lme_total;
  END IF;

  IF lme_target_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao orleans-brandao: coverage parlamentar novo nao pode existir em LME, encontrado %', lme_target_count;
  END IF;
END $$;

UPDATE projetos_lei
SET
  coverage_id = 'orleans-brandao-camara-completo-autoria-principal-tipos-verificados-2007-2014-cutoff-20260509',
  coverage_scope = 'inventario_completo_camara_autoria_principal_tipos_verificados_2007_2014_cutoff_20260509',
  metadata = COALESCE(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'coverage_id', 'orleans-brandao-camara-completo-autoria-principal-tipos-verificados-2007-2014-cutoff-20260509',
      'coverage_scope', 'inventario_completo_camara_autoria_principal_tipos_verificados_2007_2014_cutoff_20260509',
      'previous_coverage_id', 'orleans-brandao-camara-autoria-principal-ampliado-parcial-lote-a-20260506',
      'previous_coverage_scope', 'inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506',
      'coverage_status', 'completo_escopado',
      'coverage_public_status', 'parlamentar_complete_mixed_with_executive_partial',
      'coverage_rows', 137,
      'source_total_rows', 298,
      'accepted_rows', 137,
      'rejected_rows', 161,
      'coverage_cutoff', '2026-05-09',
      'coverage_promoted_at', '2026-05-09T17:40:00Z',
      'coverage_source_artifact', 'fonte interna de curadoria',
      'coverage_promotion_artifact', 'fonte interna de curadoria',
      'tabela_alvo', 'projetos_lei',
      'legislacao_mandato_executivo_mixed', false
    )
WHERE candidato_id = (SELECT id FROM candidatos WHERE slug = 'orleans-brandao')
  AND coverage_id IN (
    'orleans-brandao-camara-autoria-principal-ampliado-parcial-lote-a-20260506',
    'orleans-brandao-camara-completo-autoria-principal-tipos-verificados-2007-2014-cutoff-20260509'
  );

DO $$
DECLARE
  cand_id uuid;
  new_count int;
  old_count int;
  metadata_ok int;
  lme_target_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'orleans-brandao';

  IF cand_id IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO new_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'orleans-brandao-camara-completo-autoria-principal-tipos-verificados-2007-2014-cutoff-20260509'
    AND coverage_scope = 'inventario_completo_camara_autoria_principal_tipos_verificados_2007_2014_cutoff_20260509';

  SELECT count(*) INTO old_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'orleans-brandao-camara-autoria-principal-ampliado-parcial-lote-a-20260506';

  SELECT count(*) INTO metadata_ok
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'orleans-brandao-camara-completo-autoria-principal-tipos-verificados-2007-2014-cutoff-20260509'
    AND metadata->>'coverage_id' = 'orleans-brandao-camara-completo-autoria-principal-tipos-verificados-2007-2014-cutoff-20260509'
    AND metadata->>'coverage_scope' = 'inventario_completo_camara_autoria_principal_tipos_verificados_2007_2014_cutoff_20260509'
    AND metadata->>'coverage_status' = 'completo_escopado'
    AND metadata->>'tabela_alvo' = 'projetos_lei'
    AND metadata->>'legislacao_mandato_executivo_mixed' = 'false';

  SELECT count(*) INTO lme_target_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'orleans-brandao-camara-completo-autoria-principal-tipos-verificados-2007-2014-cutoff-20260509';

  IF new_count <> 137 THEN
    RAISE EXCEPTION 'Pos-apply orleans-brandao: esperadas 137 rows com coverage completo Camara, encontrado %', new_count;
  END IF;

  IF old_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply orleans-brandao: coverage parcial antigo deveria ser 0, encontrado %', old_count;
  END IF;

  IF metadata_ok <> 137 THEN
    RAISE EXCEPTION 'Pos-apply orleans-brandao: esperadas 137 rows com metadata canonico completo, encontrado %', metadata_ok;
  END IF;

  IF lme_target_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply orleans-brandao: coverage parlamentar novo nao pode tocar LME, encontrado %', lme_target_count;
  END IF;

  RAISE NOTICE 'Pos-apply orleans-brandao Camara completo scoped: projetos_lei=% coverage_completo=% lme_target=%', 137, new_count, lme_target_count;
END $$;
