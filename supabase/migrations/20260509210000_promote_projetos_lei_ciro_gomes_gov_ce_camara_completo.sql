-- ============================================
-- Legislacao full-site: ciro-gomes-gov-ce / Camara Dados Abertos / projetos_lei
-- Promocao publica: completo escopado da autoria parlamentar principal Camara
-- ============================================
-- Fonte oficial e prova:
--   fonte interna de curadoria
--   fonte interna de curadoria
--
-- Coverage anterior:
--   ciro-gomes-gov-ce-camara-autoria-principal-ampliado-parcial-lote-a-20260506
--
-- Coverage novo:
--   ciro-gomes-gov-ce-camara-completo-autoria-principal-tipos-verificados-2007-2010-cutoff-20260509
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
  null_count int;
  divergent_count int;
  lme_total int;
  lme_target_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'ciro-gomes-gov-ce';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'ciro-gomes-gov-ce: candidato ausente neste banco local/CI minimo; promocao projetos_lei Camara pulada';
    RETURN;
  END IF;

  SELECT count(*) INTO projetos_total
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  IF projetos_total = 0 THEN
    RAISE NOTICE 'ciro-gomes-gov-ce: baseline projetos_lei ausente neste banco local/CI minimo; promocao Camara completo sera no-op';
    RETURN;
  END IF;

  SELECT count(*) INTO old_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'ciro-gomes-gov-ce-camara-autoria-principal-ampliado-parcial-lote-a-20260506';

  SELECT count(*) INTO new_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'ciro-gomes-gov-ce-camara-completo-autoria-principal-tipos-verificados-2007-2010-cutoff-20260509';

  SELECT count(*) INTO null_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id IS NULL;

  SELECT count(*) INTO divergent_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id IS NOT NULL
    AND coverage_id NOT IN (
      'ciro-gomes-gov-ce-camara-autoria-principal-ampliado-parcial-lote-a-20260506',
      'ciro-gomes-gov-ce-camara-completo-autoria-principal-tipos-verificados-2007-2010-cutoff-20260509'
    );

  SELECT count(*) INTO lme_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO lme_target_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'ciro-gomes-gov-ce-camara-completo-autoria-principal-tipos-verificados-2007-2010-cutoff-20260509';

  IF projetos_total <> 95 THEN
    RAISE EXCEPTION 'Pre-condicao ciro-gomes-gov-ce: esperadas 95 rows Camara em projetos_lei, encontradas %', projetos_total;
  END IF;

  IF old_count + new_count <> 42 THEN
    RAISE EXCEPTION 'Pre-condicao ciro-gomes-gov-ce: esperadas 42 rows no coverage antigo/novo, achei antigo=% novo=%', old_count, new_count;
  END IF;

  IF null_count <> 53 THEN
    RAISE EXCEPTION 'Pre-condicao ciro-gomes-gov-ce: esperadas 53 rows fora do recorte completo, encontradas %', null_count;
  END IF;

  IF divergent_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao ciro-gomes-gov-ce: % rows com coverage_id divergente em projetos_lei', divergent_count;
  END IF;

  IF lme_total <> 103 THEN
    RAISE EXCEPTION 'Pre-condicao ciro-gomes-gov-ce: esperadas 103 rows em legislacao_mandato_executivo parcial separado, encontradas %', lme_total;
  END IF;

  IF lme_target_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao ciro-gomes-gov-ce: coverage parlamentar novo nao pode existir em LME, encontrado %', lme_target_count;
  END IF;
END $$;

UPDATE projetos_lei
SET
  coverage_id = 'ciro-gomes-gov-ce-camara-completo-autoria-principal-tipos-verificados-2007-2010-cutoff-20260509',
  coverage_scope = 'inventario_completo_camara_autoria_principal_tipos_verificados_2007_2010_cutoff_20260509',
  metadata = COALESCE(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'coverage_id', 'ciro-gomes-gov-ce-camara-completo-autoria-principal-tipos-verificados-2007-2010-cutoff-20260509',
      'coverage_scope', 'inventario_completo_camara_autoria_principal_tipos_verificados_2007_2010_cutoff_20260509',
      'previous_coverage_id', 'ciro-gomes-gov-ce-camara-autoria-principal-ampliado-parcial-lote-a-20260506',
      'previous_coverage_scope', 'inventario_ampliado_parcial_camara_autoria_principal_lote_a_20260506',
      'coverage_status', 'completo_escopado',
      'coverage_public_status', 'parlamentar_complete_mixed_with_executive_partial',
      'coverage_rows', 42,
      'source_total_rows', 95,
      'accepted_rows', 42,
      'rejected_rows', 53,
      'coverage_cutoff', '2026-05-09',
      'coverage_promoted_at', '2026-05-09T21:34:00Z',
      'coverage_source_artifact', 'fonte interna de curadoria',
      'coverage_promotion_artifact', 'fonte interna de curadoria',
      'tabela_alvo', 'projetos_lei',
      'legislacao_mandato_executivo_mixed', false
    )
WHERE candidato_id = (SELECT id FROM candidatos WHERE slug = 'ciro-gomes-gov-ce')
  AND coverage_id IN (
    'ciro-gomes-gov-ce-camara-autoria-principal-ampliado-parcial-lote-a-20260506',
    'ciro-gomes-gov-ce-camara-completo-autoria-principal-tipos-verificados-2007-2010-cutoff-20260509'
  );

DO $$
DECLARE
  cand_id uuid;
  projetos_total int;
  new_count int;
  old_count int;
  null_count int;
  metadata_ok int;
  lme_target_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'ciro-gomes-gov-ce';

  IF cand_id IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO projetos_total
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  IF projetos_total = 0 THEN
    RAISE NOTICE 'ciro-gomes-gov-ce: pos-condicao promocao Camara completo pulada porque baseline projetos_lei nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO new_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'ciro-gomes-gov-ce-camara-completo-autoria-principal-tipos-verificados-2007-2010-cutoff-20260509'
    AND coverage_scope = 'inventario_completo_camara_autoria_principal_tipos_verificados_2007_2010_cutoff_20260509';

  SELECT count(*) INTO old_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'ciro-gomes-gov-ce-camara-autoria-principal-ampliado-parcial-lote-a-20260506';

  SELECT count(*) INTO null_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id IS NULL;

  SELECT count(*) INTO metadata_ok
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'ciro-gomes-gov-ce-camara-completo-autoria-principal-tipos-verificados-2007-2010-cutoff-20260509'
    AND metadata->>'coverage_id' = 'ciro-gomes-gov-ce-camara-completo-autoria-principal-tipos-verificados-2007-2010-cutoff-20260509'
    AND metadata->>'coverage_scope' = 'inventario_completo_camara_autoria_principal_tipos_verificados_2007_2010_cutoff_20260509'
    AND metadata->>'coverage_status' = 'completo_escopado'
    AND metadata->>'tabela_alvo' = 'projetos_lei'
    AND metadata->>'legislacao_mandato_executivo_mixed' = 'false';

  SELECT count(*) INTO lme_target_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'ciro-gomes-gov-ce-camara-completo-autoria-principal-tipos-verificados-2007-2010-cutoff-20260509';

  IF new_count <> 42 THEN
    RAISE EXCEPTION 'Pos-apply ciro-gomes-gov-ce: esperadas 42 rows com coverage completo Camara, encontrado %', new_count;
  END IF;

  IF old_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply ciro-gomes-gov-ce: coverage parcial antigo deveria ser 0, encontrado %', old_count;
  END IF;

  IF null_count <> 53 THEN
    RAISE EXCEPTION 'Pos-apply ciro-gomes-gov-ce: esperadas 53 rows fora do recorte completo, encontrado %', null_count;
  END IF;

  IF metadata_ok <> 42 THEN
    RAISE EXCEPTION 'Pos-apply ciro-gomes-gov-ce: esperadas 42 rows com metadata canonico completo, encontrado %', metadata_ok;
  END IF;

  IF lme_target_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply ciro-gomes-gov-ce: coverage parlamentar novo nao pode tocar LME, encontrado %', lme_target_count;
  END IF;

  RAISE NOTICE 'Pos-apply ciro-gomes-gov-ce Camara completo scoped: projetos_lei=% coverage_completo=% lme_target=%', 95, new_count, lme_target_count;
END $$;
