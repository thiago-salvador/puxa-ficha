-- ============================================
-- Legislacao full-site P0-A / ALEP / projetos_lei
-- Promocao publica: completo escopado da autoria parlamentar principal ALEP
-- Slugs: alexandre-curi, requiao-filho
-- ============================================
-- Fontes oficiais e provas:
--   fonte interna de curadoria
--   fonte interna de curadoria
--   fonte interna de curadoria
--
-- Esta migration escreve apenas em projetos_lei.
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO escreve em historico_politico.
-- Esta migration NAO deleta nem trunca rows.
-- ============================================

DO $$
DECLARE
  item record;
  cand_id uuid;
  projetos_total int;
  old_count int;
  new_count int;
  outside_count int;
  divergent_count int;
  lme_total int;
  lme_target_count int;
BEGIN
  FOR item IN
    SELECT *
    FROM (VALUES
      (
        'alexandre-curi',
        'alexandre-curi-alep-autoria-principal-ampliado-parcial-20260507',
        'alexandre-curi-alep-completo-autoria-principal-tipos-legislativos-2019-2026-04-30-cutoff-20260510',
        'inventario_completo_alep_autoria_principal_tipos_legislativos_2019_2026_04_30_cutoff_20260510',
        'inventario_ampliado_parcial_alep_autoria_principal_2019_2026_20260507',
        181,
        181,
        1088,
        907
      ),
      (
        'requiao-filho',
        'requiao-filho-alep-autoria-principal-ampliado-parcial-20260507',
        'requiao-filho-alep-completo-autoria-principal-tipos-legislativos-2019-2026-04-30-cutoff-20260510',
        'inventario_completo_alep_autoria_principal_tipos_legislativos_2019_2026_04_30_cutoff_20260510',
        'inventario_ampliado_parcial_alep_requiao_filho_autoria_principal_2019_2026_20260507',
        84,
        84,
        802,
        718
      )
    ) AS t(
      slug,
      old_coverage_id,
      new_coverage_id,
      new_coverage_scope,
      old_coverage_scope,
      expected_total,
      expected_complete_rows,
      source_total_rows,
      formal_exclusions
    )
  LOOP
    SELECT id INTO cand_id FROM candidatos WHERE slug = item.slug;

    IF cand_id IS NULL THEN
      RAISE NOTICE '%: candidato ausente neste banco local/CI minimo; promocao ALEP pulada', item.slug;
      CONTINUE;
    END IF;

    SELECT count(*) INTO projetos_total
    FROM projetos_lei
    WHERE candidato_id = cand_id;

    IF projetos_total = 0 THEN
      RAISE NOTICE '%: baseline projetos_lei ausente neste banco local/CI minimo; promocao ALEP completo sera no-op', item.slug;
      CONTINUE;
    END IF;

    SELECT count(*) INTO old_count
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND coverage_id = item.old_coverage_id;

    SELECT count(*) INTO new_count
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND coverage_id = item.new_coverage_id;

    SELECT count(*) INTO outside_count
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND coverage_id IS NULL;

    SELECT count(*) INTO divergent_count
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND coverage_id IS NOT NULL
      AND coverage_id NOT IN (item.old_coverage_id, item.new_coverage_id);

    SELECT count(*) INTO lme_total
    FROM legislacao_mandato_executivo
    WHERE candidato_id = cand_id;

    SELECT count(*) INTO lme_target_count
    FROM legislacao_mandato_executivo
    WHERE candidato_id = cand_id
      AND metadata->>'coverage_id' = item.new_coverage_id;

    IF projetos_total <> item.expected_total THEN
      RAISE EXCEPTION 'Pre-condicao %: esperadas % rows ALEP em projetos_lei, encontradas %', item.slug, item.expected_total, projetos_total;
    END IF;

    IF old_count + new_count <> item.expected_complete_rows THEN
      RAISE EXCEPTION 'Pre-condicao %: esperadas % rows no coverage antigo/novo, achei antigo=% novo=%', item.slug, item.expected_complete_rows, old_count, new_count;
    END IF;

    IF outside_count <> 0 THEN
      RAISE EXCEPTION 'Pre-condicao %: esperadas 0 rows fora do recorte ALEP completo, encontradas %', item.slug, outside_count;
    END IF;

    IF divergent_count <> 0 THEN
      RAISE EXCEPTION 'Pre-condicao %: % rows com coverage_id divergente em projetos_lei', item.slug, divergent_count;
    END IF;

    IF lme_total <> 0 THEN
      RAISE EXCEPTION 'Pre-condicao %: esperadas 0 rows em legislacao_mandato_executivo, encontradas %', item.slug, lme_total;
    END IF;

    IF lme_target_count <> 0 THEN
      RAISE EXCEPTION 'Pre-condicao %: coverage parlamentar novo nao pode existir em LME, encontrado %', item.slug, lme_target_count;
    END IF;
  END LOOP;
END $$;

UPDATE projetos_lei target
SET
  coverage_id = source.new_coverage_id,
  coverage_scope = source.new_coverage_scope,
  metadata = COALESCE(target.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'coverage_id', source.new_coverage_id,
      'coverage_scope', source.new_coverage_scope,
      'previous_coverage_id', source.old_coverage_id,
      'previous_coverage_scope', source.old_coverage_scope,
      'coverage_status', 'completo_escopado',
      'coverage_public_status', 'parlamentar_complete',
      'coverage_rows', source.expected_complete_rows,
      'source_total_rows', source.source_total_rows,
      'accepted_rows', source.expected_complete_rows,
      'formal_exclusions', source.formal_exclusions,
      'coverage_cutoff', '2026-04-30',
      'coverage_promoted_at', '2026-05-10T12:00:00Z',
      'coverage_source_artifact', source.source_artifact,
      'coverage_promotion_artifact', 'fonte interna de curadoria',
      'tabela_alvo', 'projetos_lei',
      'legislacao_mandato_executivo_mixed', false
    )
FROM (
  VALUES
    (
      'alexandre-curi',
      'alexandre-curi-alep-autoria-principal-ampliado-parcial-20260507',
      'alexandre-curi-alep-completo-autoria-principal-tipos-legislativos-2019-2026-04-30-cutoff-20260510',
      'inventario_completo_alep_autoria_principal_tipos_legislativos_2019_2026_04_30_cutoff_20260510',
      'inventario_ampliado_parcial_alep_autoria_principal_2019_2026_20260507',
      181,
      1088,
      907,
      'fonte interna de curadoria'
    ),
    (
      'requiao-filho',
      'requiao-filho-alep-autoria-principal-ampliado-parcial-20260507',
      'requiao-filho-alep-completo-autoria-principal-tipos-legislativos-2019-2026-04-30-cutoff-20260510',
      'inventario_completo_alep_autoria_principal_tipos_legislativos_2019_2026_04_30_cutoff_20260510',
      'inventario_ampliado_parcial_alep_requiao_filho_autoria_principal_2019_2026_20260507',
      84,
      802,
      718,
      'fonte interna de curadoria'
    )
) AS source(
  slug,
  old_coverage_id,
  new_coverage_id,
  new_coverage_scope,
  old_coverage_scope,
  expected_complete_rows,
  source_total_rows,
  formal_exclusions,
  source_artifact
)
WHERE target.candidato_id = (SELECT id FROM candidatos WHERE slug = source.slug)
  AND target.coverage_id IN (source.old_coverage_id, source.new_coverage_id);

DO $$
DECLARE
  item record;
  cand_id uuid;
  projetos_total int;
  new_count int;
  old_count int;
  outside_count int;
  metadata_ok int;
  lme_total int;
  lme_target_count int;
BEGIN
  FOR item IN
    SELECT *
    FROM (VALUES
      (
        'alexandre-curi',
        'alexandre-curi-alep-autoria-principal-ampliado-parcial-20260507',
        'alexandre-curi-alep-completo-autoria-principal-tipos-legislativos-2019-2026-04-30-cutoff-20260510',
        'inventario_completo_alep_autoria_principal_tipos_legislativos_2019_2026_04_30_cutoff_20260510',
        181
      ),
      (
        'requiao-filho',
        'requiao-filho-alep-autoria-principal-ampliado-parcial-20260507',
        'requiao-filho-alep-completo-autoria-principal-tipos-legislativos-2019-2026-04-30-cutoff-20260510',
        'inventario_completo_alep_autoria_principal_tipos_legislativos_2019_2026_04_30_cutoff_20260510',
        84
      )
    ) AS t(slug, old_coverage_id, new_coverage_id, new_coverage_scope, expected_complete_rows)
  LOOP
    SELECT id INTO cand_id FROM candidatos WHERE slug = item.slug;

    IF cand_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT count(*) INTO projetos_total
    FROM projetos_lei
    WHERE candidato_id = cand_id;

    IF projetos_total = 0 THEN
      RAISE NOTICE '%: pos-condicao promocao ALEP completo pulada porque baseline projetos_lei nao existe neste banco local/CI minimo', item.slug;
      CONTINUE;
    END IF;

    SELECT count(*) INTO new_count
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND coverage_id = item.new_coverage_id
      AND coverage_scope = item.new_coverage_scope;

    SELECT count(*) INTO old_count
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND coverage_id = item.old_coverage_id;

    SELECT count(*) INTO outside_count
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND coverage_id IS DISTINCT FROM item.new_coverage_id;

    SELECT count(*) INTO metadata_ok
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND coverage_id = item.new_coverage_id
      AND metadata->>'coverage_id' = item.new_coverage_id
      AND metadata->>'coverage_scope' = item.new_coverage_scope
      AND metadata->>'coverage_status' = 'completo_escopado'
      AND metadata->>'coverage_public_status' = 'parlamentar_complete'
      AND metadata->>'tabela_alvo' = 'projetos_lei'
      AND metadata->>'legislacao_mandato_executivo_mixed' = 'false';

    SELECT count(*) INTO lme_total
    FROM legislacao_mandato_executivo
    WHERE candidato_id = cand_id;

    SELECT count(*) INTO lme_target_count
    FROM legislacao_mandato_executivo
    WHERE candidato_id = cand_id
      AND metadata->>'coverage_id' = item.new_coverage_id;

    IF new_count <> item.expected_complete_rows THEN
      RAISE EXCEPTION 'Pos-apply %: esperadas % rows com coverage completo ALEP, encontrado %', item.slug, item.expected_complete_rows, new_count;
    END IF;

    IF old_count <> 0 THEN
      RAISE EXCEPTION 'Pos-apply %: coverage parcial antigo deveria ser 0, encontrado %', item.slug, old_count;
    END IF;

    IF outside_count <> 0 THEN
      RAISE EXCEPTION 'Pos-apply %: nenhuma row projetos_lei deve ficar fora do coverage ALEP completo, encontrado %', item.slug, outside_count;
    END IF;

    IF metadata_ok <> item.expected_complete_rows THEN
      RAISE EXCEPTION 'Pos-apply %: esperadas % rows com metadata canonico completo, encontrado %', item.slug, item.expected_complete_rows, metadata_ok;
    END IF;

    IF lme_total <> 0 THEN
      RAISE EXCEPTION 'Pos-apply %: LME deveria permanecer 0, encontrado %', item.slug, lme_total;
    END IF;

    IF lme_target_count <> 0 THEN
      RAISE EXCEPTION 'Pos-apply %: coverage parlamentar novo nao pode tocar LME, encontrado %', item.slug, lme_target_count;
    END IF;

    RAISE NOTICE 'Pos-apply % ALEP completo scoped: projetos_lei=% coverage_completo=% lme_target=%', item.slug, projetos_total, new_count, lme_target_count;
  END LOOP;
END $$;
