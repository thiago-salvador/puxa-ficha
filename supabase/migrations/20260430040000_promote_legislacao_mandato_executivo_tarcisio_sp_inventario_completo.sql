-- ============================================
-- Fluxo 5B promocao a inventario completo
-- Tarcisio Gomes de Freitas / Governador / SP
-- ============================================
-- Nao aplicar ao Supabase remoto sem autorizacao explicita.
-- Fonte oficial: Assembleia Legislativa do Estado de Sao Paulo (https://www.al.sp.gov.br)
-- Artefato de auditoria:
--   fonte interna de curadoria
-- Universo: 889 atos ALESP (lei ordinaria + lei complementar) sancionados ou promulgados entre
--   2023-01-11 e 2026-04-14, derivados de
--   https://www.al.sp.gov.br/norma/resultados?tipoPesquisa=E&page=0&size=1000&idsTipoNorma=9&idsTipoNorma=2&ano={2023,2024,2025,2026}
-- Verificados: 885 ja em legislacao_mandato_executivo (curation_batch tarcisio-sp-inventario-ampliado-parcial-leis-ordinarias-complementares-2023-2026-04-28)
-- Excluidos: 4 com motivo formal (registrados no artefato; nao serao reinseridos por esta migration)
--   - Lei 17.725/2023-07-19 (sem_fonte_primaria)
--   - Lei 17.863/2023-12-22 (sem_fonte_primaria)
--   - Lei 17.990/2024-07-23 (sem_fonte_primaria)
--   - Lei 18.152/2025-06-02 (sem_signatario_ou_autoridade)
-- Cutoff explicito: 2026-04-14 (ultima data_norma do batch). Lei 18.447/2026-04-28 e atos posteriores
--   ficam fora deste coverage_id e exigem novo lote factual com novo cutoff.
--
-- Esta migration apenas PROMOVE as 885 rows existentes adicionando metadata.coverage_id;
-- nao cria, edita ou remove rows; nao toca projetos_lei.

DO $$
DECLARE
  v_candidato_id UUID;
  v_pre_total INT;
  v_pre_with_scope INT;
  v_pre_with_target_id INT;
BEGIN
  SELECT id INTO v_candidato_id FROM candidatos WHERE slug = 'tarcisio';
  IF v_candidato_id IS NULL THEN
    RAISE EXCEPTION 'tarcisio nao encontrado em candidatos';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM historico_politico hp
    WHERE hp.candidato_id = v_candidato_id
      AND hp.tipo_evento = 'mandato'
      AND hp.estado = 'SP'
      AND (hp.cargo ILIKE '%Governador%' OR hp.cargo_canonico = 'Governador')
      AND hp.periodo_inicio <= 2023
      AND (hp.periodo_fim IS NULL OR hp.periodo_fim >= 2023)
  ) THEN
    RAISE EXCEPTION 'mandato Governador/SP de tarcisio nao encontrado';
  END IF;

  SELECT COUNT(*) INTO v_pre_total
  FROM legislacao_mandato_executivo lme
  WHERE lme.candidato_id = v_candidato_id;

  SELECT COUNT(*) INTO v_pre_with_scope
  FROM legislacao_mandato_executivo lme
  WHERE lme.candidato_id = v_candidato_id
    AND lme.metadata ->> 'coverage_scope' = 'inventario_ampliado_parcial_sp_2023_2026';

  SELECT COUNT(*) INTO v_pre_with_target_id
  FROM legislacao_mandato_executivo lme
  WHERE lme.candidato_id = v_candidato_id
    AND lme.metadata ->> 'coverage_id' = 'tarcisio-sp-atual-completo-leis-ordinarias-complementares-2023-2026-04-14';

  -- CI bypass: 0 rows significa ambiente seed sem dados de pipeline; skip assert.
  IF v_pre_total <> 885 AND v_pre_total <> 0 THEN
    RAISE EXCEPTION 'pre-promocao tarcisio: total esperado=885 atual=%', v_pre_total;
  END IF;
  IF v_pre_total > 0 AND v_pre_with_scope <> 885 THEN
    RAISE EXCEPTION 'pre-promocao tarcisio: rows com coverage_scope inventario_ampliado_parcial_sp_2023_2026 esperado=885 atual=%', v_pre_with_scope;
  END IF;
  RAISE NOTICE 'pre-promocao tarcisio: total=% no scope ampliado_parcial=% ja promovidas=%', v_pre_total, v_pre_with_scope, v_pre_with_target_id;
END $$;

UPDATE legislacao_mandato_executivo lme
SET metadata = jsonb_set(
  COALESCE(lme.metadata, '{}'::jsonb),
  '{coverage_id}',
  to_jsonb('tarcisio-sp-atual-completo-leis-ordinarias-complementares-2023-2026-04-14'::text),
  true
)
FROM candidatos c
WHERE lme.candidato_id = c.id
  AND c.slug = 'tarcisio'
  AND lme.metadata ->> 'coverage_scope' = 'inventario_ampliado_parcial_sp_2023_2026'
  AND (lme.metadata ->> 'coverage_id' IS DISTINCT FROM 'tarcisio-sp-atual-completo-leis-ordinarias-complementares-2023-2026-04-14');

DO $$
DECLARE
  v_candidato_id UUID;
  v_post_total INT;
  v_post_with_target_id INT;
BEGIN
  SELECT id INTO v_candidato_id FROM candidatos WHERE slug = 'tarcisio';
  SELECT COUNT(*) INTO v_post_total
  FROM legislacao_mandato_executivo lme
  WHERE lme.candidato_id = v_candidato_id;
  SELECT COUNT(*) INTO v_post_with_target_id
  FROM legislacao_mandato_executivo lme
  WHERE lme.candidato_id = v_candidato_id
    AND lme.metadata ->> 'coverage_id' = 'tarcisio-sp-atual-completo-leis-ordinarias-complementares-2023-2026-04-14';
  -- CI bypass: 0 rows significa ambiente seed; UPDATE foi no-op; skip assert.
  IF v_post_total <> 885 AND v_post_total <> 0 THEN
    RAISE EXCEPTION 'pos-promocao tarcisio: total deveria continuar 885, encontrou %', v_post_total;
  END IF;
  IF v_post_total > 0 AND v_post_with_target_id <> 885 THEN
    RAISE EXCEPTION 'pos-promocao tarcisio: rows com novo coverage_id esperado=885 atual=%', v_post_with_target_id;
  END IF;
  RAISE NOTICE 'pos-promocao tarcisio: total=% rows com coverage_id completo=%', v_post_total, v_post_with_target_id;
END $$;
