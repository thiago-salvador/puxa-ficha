-- ============================================
-- Legislacao completo scoped: Bloco 1 Camara metadata correction
-- Generated after post-apply readback of
-- 20260509130000_promote_projetos_lei_bloco1_camara_completo_scoped.sql.
-- ============================================
-- Scope: canonizar metadata de autoria principal para rows aceitas nos
-- artifacts oficiais do Bloco 1 Camara.
--
-- Esta migration escreve apenas em public.projetos_lei.
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO deleta, trunca ou move rows fora do recorte.
-- ============================================

CREATE TEMP TABLE _legislacao_bloco1_camara_metadata_expected ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('paulo-martins-gov-pr', 'paulo-martins-gov-pr-camara-completo-autoria-principal-tipos-legislativos-2016-2022-cutoff-20260509', 55),
    ('thiago-de-joaldo', 'thiago-de-joaldo-camara-completo-autoria-principal-tipos-legislativos-2023-2026-cutoff-20260509', 33),
    ('adriana-accorsi', 'adriana-accorsi-camara-completo-autoria-principal-tipos-legislativos-2023-2025-cutoff-20260509', 62),
    ('guilherme-derrite', 'guilherme-derrite-camara-completo-autoria-principal-tipos-legislativos-2019-2024-cutoff-20260509', 76),
    ('nikolas-ferreira', 'nikolas-ferreira-camara-completo-autoria-principal-tipos-legislativos-2023-2026-cutoff-20260509', 41),
    ('joao-roma', 'joao-roma-camara-completo-autoria-principal-tipos-legislativos-1951-2020-cutoff-20260509', 29),
    ('fabio-trad', 'fabio-trad-camara-completo-autoria-principal-tipos-legislativos-2011-2022-cutoff-20260509', 94),
    ('capitao-wagner', 'capitao-wagner-camara-completo-autoria-principal-tipos-legislativos-2019-2022-cutoff-20260509', 45),
    ('margarete-coelho', 'margarete-coelho-camara-completo-autoria-principal-tipos-legislativos-2019-2021-cutoff-20260509', 19),
    ('expedito-netto', 'expedito-netto-camara-completo-autoria-principal-tipos-legislativos-2015-2021-cutoff-20260509', 45),
    ('delegado-eder-mauro', 'delegado-eder-mauro-camara-completo-autoria-principal-tipos-legislativos-2015-2026-cutoff-20260509', 46),
    ('dr-fernando-maximo', 'dr-fernando-maximo-camara-completo-autoria-principal-tipos-legislativos-2023-2025-cutoff-20260509', 91),
    ('erika-hilton', 'erika-hilton-camara-completo-autoria-principal-tipos-legislativos-2023-2026-cutoff-20260509', 65),
    ('jose-carlos-aleluia', 'jose-carlos-aleluia-camara-completo-autoria-principal-tipos-legislativos-1992-2018-cutoff-20260509', 48),
    ('luciano-zucco', 'luciano-zucco-camara-completo-autoria-principal-tipos-legislativos-2023-2026-cutoff-20260509', 48),
    ('paula-belmonte', 'paula-belmonte-camara-completo-autoria-principal-tipos-legislativos-2019-2022-cutoff-20260509', 119),
    ('vicentinho-junior', 'vicentinho-junior-camara-completo-autoria-principal-tipos-legislativos-2015-2026-cutoff-20260509', 89)
) AS v(slug, coverage_id, expected_rows);

UPDATE projetos_lei pl
SET metadata =
  COALESCE(pl.metadata, '{}'::jsonb) ||
  jsonb_build_object(
    'autoria_principal_verificada', true,
    'ordem_assinatura', 1,
    'proponente', 1,
    'metadata_correction_20260509', 'bloco1_camara_readback_autoria_principal'
  )
FROM candidatos c
JOIN _legislacao_bloco1_camara_metadata_expected e ON e.slug = c.slug
WHERE pl.candidato_id = c.id
  AND pl.coverage_id = e.coverage_id
  AND COALESCE(pl.metadata->>'coverage_policy', '') = 'camara_autoria_principal_tipo_legislativo_canonico_v1'
  AND COALESCE(pl.metadata->>'coverage_status', '') = 'completo_scoped'
  AND COALESCE(pl.metadata->>'tabela_alvo', '') = 'projetos_lei'
  AND COALESCE(pl.metadata->>'legislacao_mandato_executivo_mixed', '') = 'false';

DO $$
DECLARE
  rec record;
  cand_id uuid;
  coverage_count int;
  metadata_ok_count int;
  lme_count int;
BEGIN
  FOR rec IN SELECT * FROM _legislacao_bloco1_camara_metadata_expected LOOP
    SELECT id INTO cand_id FROM candidatos WHERE slug = rec.slug;

    IF cand_id IS NULL THEN
      RAISE NOTICE '%: candidato ausente neste banco local/CI minimo; pos-condicao pulada', rec.slug;
      CONTINUE;
    END IF;

    SELECT count(*) INTO coverage_count
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND coverage_id = rec.coverage_id;

    SELECT count(*) INTO metadata_ok_count
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND coverage_id = rec.coverage_id
      AND metadata->>'coverage_status' = 'completo_scoped'
      AND metadata->>'coverage_policy' = 'camara_autoria_principal_tipo_legislativo_canonico_v1'
      AND metadata->>'tabela_alvo' = 'projetos_lei'
      AND metadata->>'legislacao_mandato_executivo_mixed' = 'false'
      AND metadata->>'tipo_legislativo_canonico' = 'true'
      AND metadata->>'autoria_principal_verificada' = 'true'
      AND metadata->>'ordem_assinatura' = '1'
      AND metadata->>'proponente' = '1';

    SELECT count(*) INTO lme_count
    FROM legislacao_mandato_executivo
    WHERE candidato_id = cand_id;

    IF coverage_count <> rec.expected_rows THEN
      RAISE EXCEPTION 'Pos-fix %: esperadas % rows com coverage_id completo scoped, encontradas %', rec.slug, rec.expected_rows, coverage_count;
    END IF;

    IF metadata_ok_count <> rec.expected_rows THEN
      RAISE EXCEPTION 'Pos-fix %: esperadas % rows com metadata de autoria principal, encontradas %', rec.slug, rec.expected_rows, metadata_ok_count;
    END IF;

    IF lme_count <> 0 THEN
      RAISE EXCEPTION 'Pos-fix %: legislacao_mandato_executivo deve permanecer 0, encontrado %', rec.slug, lme_count;
    END IF;
  END LOOP;
END $$;
