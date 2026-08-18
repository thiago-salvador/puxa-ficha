-- ============================================
-- Legislacao full-site: tarcisio-gov-sp / ALESP / inventario completo com cutoff
-- ============================================
-- NAO aplicar sem autorizacao explicita do usuario.
-- Fonte oficial: Assembleia Legislativa do Estado de Sao Paulo (https://www.al.sp.gov.br)
-- Artefato dry-run: fonte interna de curadoria
-- Source-unblock: LEG-FULLSITE-DUP-TARCISIO-GOV-SP-ALESP-READONLY-20260507
-- Coverage novo: tarcisio-gov-sp-alesp-completo-leis-ordinarias-complementares-2023-2026-04-28
-- Cutoff inclusivo: 2026-04-28
-- Esta migration escreve apenas em legislacao_mandato_executivo.
-- Esta migration nao escreve em projetos_lei nem historico_politico.
-- ============================================

DO $$
DECLARE
  ref_id uuid;
  target_id uuid;
  ref_count int;
  target_lme_count int;
  target_new_coverage_count int;
  target_projetos_count int;
BEGIN
  SELECT id INTO ref_id FROM candidatos WHERE slug = 'tarcisio';
  SELECT id INTO target_id FROM candidatos WHERE slug = 'tarcisio-gov-sp';

  IF ref_id IS NULL OR target_id IS NULL THEN
    RAISE NOTICE 'tarcisio-gov-sp: candidato referencia/alvo ausente neste banco local/CI minimo; seed ALESP completo pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO ref_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = ref_id
    AND metadata->>'coverage_id' = 'tarcisio-sp-atual-completo-leis-ordinarias-complementares-2023-2026-04-14';

  SELECT count(*) INTO target_lme_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = target_id;

  SELECT count(*) INTO target_new_coverage_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = target_id
    AND metadata->>'coverage_id' = 'tarcisio-gov-sp-alesp-completo-leis-ordinarias-complementares-2023-2026-04-28';

  SELECT count(*) INTO target_projetos_count
  FROM projetos_lei
  WHERE candidato_id = target_id;

  IF ref_count <> 885 THEN
    RAISE EXCEPTION 'Pre-condicao tarcisio-gov-sp: referencia tarcisio esperada com 885 rows completas, encontrou %', ref_count;
  END IF;
  IF target_lme_count NOT IN (62, 886) THEN
    RAISE EXCEPTION 'Pre-condicao tarcisio-gov-sp: esperado alvo com 62 rows atuais ou 886 rows idempotentes, encontrou %', target_lme_count;
  END IF;
  IF target_lme_count = 886 AND target_new_coverage_count <> 886 THEN
    RAISE EXCEPTION 'Pre-condicao tarcisio-gov-sp: alvo idempotente tem 886 rows, mas coverage novo aparece em %', target_new_coverage_count;
  END IF;
  IF target_projetos_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao tarcisio-gov-sp: projetos_lei deve permanecer 0, encontrou %', target_projetos_count;
  END IF;
END $$;

WITH ref_candidate AS (
  SELECT id FROM candidatos WHERE slug = 'tarcisio'
), target_candidate AS (
  SELECT id FROM candidatos WHERE slug = 'tarcisio-gov-sp'
), source_rows AS (
  SELECT src.*
  FROM legislacao_mandato_executivo src
  JOIN ref_candidate ref ON ref.id = src.candidato_id
  WHERE src.metadata->>'coverage_id' = 'tarcisio-sp-atual-completo-leis-ordinarias-complementares-2023-2026-04-14'
), prepared AS (
  SELECT
    target.id AS candidato_id,
    (
      SELECT hp.id
      FROM historico_politico hp
      WHERE hp.candidato_id = target.id
        AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
        AND hp.cargo_canonico = 'Governador'
        AND upper(coalesce(hp.estado, '')) = 'SP'
        AND coalesce(hp.periodo_inicio, 9999) <= source_rows.ano
        AND coalesce(hp.periodo_fim, 9999) >= source_rows.ano
      ORDER BY hp.periodo_inicio DESC NULLS LAST, hp.id
      LIMIT 1
    ) AS historico_politico_id,
    source_rows.tipo_relacao,
    source_rows.esfera,
    source_rows.uf_norma,
    source_rows.municipio_norma,
    source_rows.tipo_norma,
    source_rows.numero,
    source_rows.ano,
    source_rows.data_norma,
    source_rows.ementa,
    source_rows.signatario,
    source_rows.autoridade_papel,
    source_rows.fonte_primaria_url,
    source_rows.fonte_primaria_titulo,
    source_rows.fonte_tramitacao_url,
    source_rows.identificador_fonte,
    jsonb_set(jsonb_set(jsonb_set(jsonb_set(COALESCE(source_rows.metadata, '{}'::jsonb), '{coverage_id}', to_jsonb('tarcisio-gov-sp-alesp-completo-leis-ordinarias-complementares-2023-2026-04-28'::text), true), '{coverage_scope}', to_jsonb('inventario_completo_sp_alesp_governador_2023_2026_cutoff_20260428'::text), true), '{curation_batch_id}', to_jsonb('tarcisio-gov-sp-alesp-completo-cutoff-20260428-20260507'::text), true), '{coverage_cutoff}', to_jsonb('2026-04-28'::text), true) || jsonb_build_object('source_unblock_id', 'LEG-FULLSITE-DUP-TARCISIO-GOV-SP-ALESP-READONLY-20260507', 'dry_run_id', 'LEG-FULLSITE-TARCISIO-GOV-SP-ALESP-COMPLETE-CUTOFF-2026-04-28-DRYRUN', 'target_slug', 'tarcisio-gov-sp', 'reference_slug', 'tarcisio', 'reference_coverage_id', 'tarcisio-sp-atual-completo-leis-ordinarias-complementares-2023-2026-04-14', 'projetos_lei_mixed', false, 'historico_politico_id_inferido_por_data', false) AS metadata
  FROM source_rows
  CROSS JOIN target_candidate target
), updated_from_reference AS (
  UPDATE legislacao_mandato_executivo lme
  SET
    historico_politico_id = prepared.historico_politico_id,
    tipo_relacao = prepared.tipo_relacao,
    esfera = prepared.esfera,
    uf_norma = prepared.uf_norma,
    municipio_norma = prepared.municipio_norma,
    tipo_norma = prepared.tipo_norma,
    numero = prepared.numero,
    ano = prepared.ano,
    data_norma = prepared.data_norma,
    ementa = prepared.ementa,
    signatario = prepared.signatario,
    autoridade_papel = prepared.autoridade_papel,
    fonte_primaria_url = prepared.fonte_primaria_url,
    fonte_primaria_titulo = prepared.fonte_primaria_titulo,
    fonte_tramitacao_url = prepared.fonte_tramitacao_url,
    identificador_fonte = prepared.identificador_fonte,
    metadata = prepared.metadata
  FROM prepared
  WHERE lme.candidato_id = prepared.candidato_id
    AND lme.tipo_norma = prepared.tipo_norma
    AND lme.numero = prepared.numero
    AND lme.ano = prepared.ano
    AND lme.data_norma = prepared.data_norma
  RETURNING lme.id
), inserted_from_reference AS (
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
    prepared.candidato_id,
    prepared.historico_politico_id,
    prepared.tipo_relacao,
    prepared.esfera,
    prepared.uf_norma,
    prepared.municipio_norma,
    prepared.tipo_norma,
    prepared.numero,
    prepared.ano,
    prepared.data_norma,
    prepared.ementa,
    prepared.signatario,
    prepared.autoridade_papel,
    prepared.fonte_primaria_url,
    prepared.fonte_primaria_titulo,
    prepared.fonte_tramitacao_url,
    prepared.identificador_fonte,
    prepared.metadata
  FROM prepared
  WHERE prepared.historico_politico_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM legislacao_mandato_executivo existing
      WHERE existing.candidato_id = prepared.candidato_id
        AND existing.tipo_norma = prepared.tipo_norma
        AND existing.numero = prepared.numero
        AND existing.ano = prepared.ano
        AND existing.data_norma = prepared.data_norma
    )
  RETURNING id
), updated_post_cutoff AS (
  UPDATE legislacao_mandato_executivo lme
  SET metadata = jsonb_set(jsonb_set(jsonb_set(jsonb_set(COALESCE(lme.metadata, '{}'::jsonb), '{coverage_id}', to_jsonb('tarcisio-gov-sp-alesp-completo-leis-ordinarias-complementares-2023-2026-04-28'::text), true), '{coverage_scope}', to_jsonb('inventario_completo_sp_alesp_governador_2023_2026_cutoff_20260428'::text), true), '{curation_batch_id}', to_jsonb('tarcisio-gov-sp-alesp-completo-cutoff-20260428-20260507'::text), true), '{coverage_cutoff}', to_jsonb('2026-04-28'::text), true) || jsonb_build_object('source_unblock_id', 'LEG-FULLSITE-DUP-TARCISIO-GOV-SP-ALESP-READONLY-20260507', 'dry_run_id', 'LEG-FULLSITE-TARCISIO-GOV-SP-ALESP-COMPLETE-CUTOFF-2026-04-28-DRYRUN', 'target_slug', 'tarcisio-gov-sp', 'reference_slug', 'tarcisio', 'reference_coverage_id', 'tarcisio-sp-atual-completo-leis-ordinarias-complementares-2023-2026-04-14', 'projetos_lei_mixed', false, 'historico_politico_id_inferido_por_data', false)
  FROM target_candidate target
  WHERE lme.candidato_id = target.id
    AND EXISTS (SELECT 1 FROM ref_candidate)
    AND lme.tipo_norma = 'lei'
    AND lme.numero = '18.447'
    AND lme.ano = 2026
    AND lme.data_norma = '2026-04-28'
    AND lme.identificador_fonte = 'ALESP-SP-TARCISIO:212505'
  RETURNING lme.id
)
SELECT
  (SELECT count(*) FROM updated_from_reference) AS updated_from_reference,
  (SELECT count(*) FROM inserted_from_reference) AS inserted_from_reference,
  (SELECT count(*) FROM updated_post_cutoff) AS updated_post_cutoff;

DO $$
DECLARE
  ref_id uuid;
  target_id uuid;
  v_total int;
  v_coverage int;
  v_projetos int;
BEGIN
  SELECT id INTO ref_id FROM candidatos WHERE slug = 'tarcisio';
  SELECT id INTO target_id FROM candidatos WHERE slug = 'tarcisio-gov-sp';

  IF ref_id IS NULL OR target_id IS NULL THEN
    RAISE NOTICE 'tarcisio-gov-sp: pos-condicao pulada porque candidato referencia/alvo nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO v_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = target_id;

  SELECT count(*) INTO v_coverage
  FROM legislacao_mandato_executivo
  WHERE candidato_id = target_id
    AND metadata->>'coverage_id' = 'tarcisio-gov-sp-alesp-completo-leis-ordinarias-complementares-2023-2026-04-28'
    AND metadata->>'coverage_scope' = 'inventario_completo_sp_alesp_governador_2023_2026_cutoff_20260428';

  SELECT count(*) INTO v_projetos
  FROM projetos_lei
  WHERE candidato_id = target_id;

  IF v_total <> 886 THEN
    RAISE EXCEPTION 'Pos-condicao tarcisio-gov-sp: esperado 886 rows LME, encontrou %', v_total;
  END IF;
  IF v_coverage <> 886 THEN
    RAISE EXCEPTION 'Pos-condicao tarcisio-gov-sp: esperado 886 rows com coverage completo, encontrou %', v_coverage;
  END IF;
  IF v_projetos <> 0 THEN
    RAISE EXCEPTION 'Pos-condicao tarcisio-gov-sp: projetos_lei deveria permanecer 0, encontrou %', v_projetos;
  END IF;
  RAISE NOTICE 'Pos-apply tarcisio-gov-sp ALESP completo cutoff 2026-04-28: lme=% coverage=% projetos_lei=%', v_total, v_coverage, v_projetos;
END $$;
