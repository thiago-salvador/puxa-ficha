-- ============================================
-- Legislacao full-site P0-A/P0-B / ALMT / projetos_lei
-- Promocao publica: completo escopado da autoria parlamentar principal SAPL ALMT
-- Slug: janaina-riva
-- ============================================
-- Fonte oficial:
--   https://sapl.al.mt.leg.br/api/
--   https://sapl.al.mt.leg.br/api/materia/autoria/?autor=10&page_size=100
--   https://sapl.al.mt.leg.br/api/materia/materialegislativa/2/
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Esta migration atualiza apenas uma row existente em projetos_lei.
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'janaina-riva' AND publicavel = true;

  IF cand_id IS NULL THEN
    RAISE NOTICE 'janaina-riva: candidato publico ausente neste banco local/CI minimo; promocao ALMT pulada';
    RETURN;
  END IF;

  SELECT count(*) INTO projetos_total
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO old_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'janaina-riva-mt-sapl-projetos-lei-ampliado-parcial-20260506';

  SELECT count(*) INTO new_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'janaina-riva-almt-completo-autoria-principal-sapl-2015-cutoff-20260510';

  SELECT count(*) INTO divergent_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id IS NOT NULL
    AND coverage_id NOT IN (
      'janaina-riva-mt-sapl-projetos-lei-ampliado-parcial-20260506',
      'janaina-riva-almt-completo-autoria-principal-sapl-2015-cutoff-20260510'
    );

  SELECT count(*) INTO lme_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO lme_target_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'janaina-riva-almt-completo-autoria-principal-sapl-2015-cutoff-20260510';

  IF projetos_total <> 1 THEN
    RAISE EXCEPTION 'Pre-condicao janaina-riva: projetos_lei esperado 1, encontrado %', projetos_total;
  END IF;
  IF old_count + new_count <> 1 THEN
    RAISE EXCEPTION 'Pre-condicao janaina-riva: esperado 1 row no coverage antigo/novo, achei antigo=% novo=%', old_count, new_count;
  END IF;
  IF divergent_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao janaina-riva: % rows com coverage_id divergente em projetos_lei', divergent_count;
  END IF;
  IF lme_total <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao janaina-riva: legislacao_mandato_executivo esperado 0, encontrado %', lme_total;
  END IF;
  IF lme_target_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao janaina-riva: coverage parlamentar novo nao pode existir em LME, encontrado %', lme_target_count;
  END IF;
END $$;

UPDATE projetos_lei
SET
  coverage_id = 'janaina-riva-almt-completo-autoria-principal-sapl-2015-cutoff-20260510',
  coverage_scope = 'inventario_completo_almt_sapl_autoria_principal_2015_cutoff_20260510',
  metadata = COALESCE(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'coverage_id', 'janaina-riva-almt-completo-autoria-principal-sapl-2015-cutoff-20260510',
      'coverage_scope', 'inventario_completo_almt_sapl_autoria_principal_2015_cutoff_20260510',
      'previous_coverage_id', 'janaina-riva-mt-sapl-projetos-lei-ampliado-parcial-20260506',
      'previous_coverage_scope', 'ampliado_parcial_janaina_riva_mt_sapl_dry_run_20260506',
      'coverage_status', 'completo_escopado',
      'coverage_public_status', 'parlamentar_complete',
      'coverage_rows', 1,
      'coverage_cutoff', '2026-05-10',
      'coverage_promoted_at', '2026-05-10T17:00:00Z',
      'coverage_source_artifact', 'fonte interna de curadoria',
      'coverage_promotion_artifact', 'fonte interna de curadoria',
      'tabela_alvo', 'projetos_lei',
      'legislacao_mandato_executivo_mixed', false,
      'adapter_kind', 'sapl_api',
      'official_author_id', '10',
      'official_materia_id', '2',
      'official_author_url', 'https://sapl.al.mt.leg.br/api/materia/autoria/?autor=10&page_size=100',
      'official_detail_url', 'https://sapl.al.mt.leg.br/api/materia/materialegislativa/2/',
      'autoria_principal_verificada', true,
      'primeiro_autor', true
    )
WHERE candidato_id = (SELECT id FROM candidatos WHERE slug = 'janaina-riva')
  AND coverage_id IN (
    'janaina-riva-mt-sapl-projetos-lei-ampliado-parcial-20260506',
    'janaina-riva-almt-completo-autoria-principal-sapl-2015-cutoff-20260510'
  );

DO $$
DECLARE
  cand_id uuid;
  projetos_total int;
  complete_count int;
  old_count int;
  metadata_ok int;
  lme_total int;
  lme_target_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'janaina-riva' AND publicavel = true;

  IF cand_id IS NULL THEN
    RAISE NOTICE 'janaina-riva: pos-condicao promocao ALMT completo pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO projetos_total
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO complete_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'janaina-riva-almt-completo-autoria-principal-sapl-2015-cutoff-20260510'
    AND coverage_scope = 'inventario_completo_almt_sapl_autoria_principal_2015_cutoff_20260510';

  SELECT count(*) INTO old_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'janaina-riva-mt-sapl-projetos-lei-ampliado-parcial-20260506';

  SELECT count(*) INTO metadata_ok
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'janaina-riva-almt-completo-autoria-principal-sapl-2015-cutoff-20260510'
    AND metadata->>'coverage_id' = 'janaina-riva-almt-completo-autoria-principal-sapl-2015-cutoff-20260510'
    AND metadata->>'coverage_scope' = 'inventario_completo_almt_sapl_autoria_principal_2015_cutoff_20260510'
    AND metadata->>'coverage_status' = 'completo_escopado'
    AND metadata->>'coverage_public_status' = 'parlamentar_complete'
    AND metadata->>'tabela_alvo' = 'projetos_lei'
    AND metadata->>'legislacao_mandato_executivo_mixed' = 'false'
    AND metadata->>'autoria_principal_verificada' = 'true';

  SELECT count(*) INTO lme_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO lme_target_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'janaina-riva-almt-completo-autoria-principal-sapl-2015-cutoff-20260510';

  IF projetos_total <> 1 THEN
    RAISE EXCEPTION 'Pos-condicao janaina-riva: projetos_lei total esperado 1, encontrado %', projetos_total;
  END IF;
  IF complete_count <> 1 THEN
    RAISE EXCEPTION 'Pos-condicao janaina-riva: coverage completo esperado 1, encontrado %', complete_count;
  END IF;
  IF old_count <> 0 THEN
    RAISE EXCEPTION 'Pos-condicao janaina-riva: coverage antigo esperado 0, encontrado %', old_count;
  END IF;
  IF metadata_ok <> 1 THEN
    RAISE EXCEPTION 'Pos-condicao janaina-riva: metadata completo esperado 1, encontrado %', metadata_ok;
  END IF;
  IF lme_total <> 0 THEN
    RAISE EXCEPTION 'Pos-condicao janaina-riva: legislacao_mandato_executivo esperado 0, encontrado %', lme_total;
  END IF;
  IF lme_target_count <> 0 THEN
    RAISE EXCEPTION 'Pos-condicao janaina-riva: coverage parlamentar novo nao pode existir em LME, encontrado %', lme_target_count;
  END IF;
END $$;
