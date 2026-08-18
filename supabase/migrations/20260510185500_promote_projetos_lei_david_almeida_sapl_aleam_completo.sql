-- ============================================
-- Legislacao full-site P0-A / ALEAM / projetos_lei
-- Promocao publica: completo escopado da autoria parlamentar principal SAPL ALEAM
-- Slug: david-almeida
-- ============================================
-- Fonte oficial:
--   https://sapl.al.am.leg.br/materia/pesquisar-materia?format=json&autoria__autor=14&tipo=1
--   https://sapl.al.am.leg.br/materia/131768
--   http://sapl.al.am.leg.br/media/sapl/public/materialegislativa/2018/131768/20181220063651.pdf
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Esta migration atualiza somente rows existentes em projetos_lei.
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
  source_mismatch_count int;
  rejected_coauthor_count int;
  lme_total int;
  lme_target_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'david-almeida' AND publicavel = true;

  IF cand_id IS NULL THEN
    RAISE NOTICE 'david-almeida: candidato publico ausente neste banco local/CI minimo; promocao SAPL ALEAM pulada';
    RETURN;
  END IF;

  SELECT count(*) INTO projetos_total
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO old_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'legislacao-unblock-19-projetos-lei-lote-b-20260508';

  SELECT count(*) INTO new_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'david-almeida-aleam-completo-autoria-principal-pl-sapl-2007-2018-cutoff-20260510';

  SELECT count(*) INTO divergent_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id IS NOT NULL
    AND coverage_id NOT IN (
      'legislacao-unblock-19-projetos-lei-lote-b-20260508',
      'david-almeida-aleam-completo-autoria-principal-pl-sapl-2007-2018-cutoff-20260510'
    );

  SELECT count(*) INTO source_mismatch_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND (
      fonte <> 'SAPL ALEAM'
      OR tipo <> 'PL'
      OR proposicao_id_api IS NULL
      OR proposicao_id_api NOT LIKE 'SAPL-ALEAM:%'
      OR COALESCE(metadata->>'autoria_principal_verificada', 'false') <> 'true'
      OR COALESCE(metadata->>'tabela_alvo', '') <> 'projetos_lei'
      OR COALESCE(metadata->>'legislacao_mandato_executivo_mixed', 'true') <> 'false'
    );

  SELECT count(*) INTO rejected_coauthor_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api = 'SAPL-ALEAM:131331';

  SELECT count(*) INTO lme_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO lme_target_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'david-almeida-aleam-completo-autoria-principal-pl-sapl-2007-2018-cutoff-20260510';

  IF projetos_total <> 116 THEN
    RAISE EXCEPTION 'Pre-condicao david-almeida: projetos_lei esperado 116, encontrado %', projetos_total;
  END IF;
  IF old_count + new_count <> 116 THEN
    RAISE EXCEPTION 'Pre-condicao david-almeida: esperado 116 rows no coverage antigo/novo, achei antigo=% novo=%', old_count, new_count;
  END IF;
  IF divergent_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao david-almeida: % rows com coverage_id divergente em projetos_lei', divergent_count;
  END IF;
  IF source_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao david-almeida: % rows fora do recorte SAPL ALEAM/PL/autoria principal/projetos_lei', source_mismatch_count;
  END IF;
  IF rejected_coauthor_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao david-almeida: row coautoria rejeitada SAPL-ALEAM:131331 nao pode estar publicada, encontrado %', rejected_coauthor_count;
  END IF;
  IF lme_total <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao david-almeida: legislacao_mandato_executivo esperado 0, encontrado %', lme_total;
  END IF;
  IF lme_target_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao david-almeida: coverage parlamentar novo nao pode existir em LME, encontrado %', lme_target_count;
  END IF;
END $$;

UPDATE projetos_lei
SET
  coverage_id = 'david-almeida-aleam-completo-autoria-principal-pl-sapl-2007-2018-cutoff-20260510',
  coverage_scope = 'inventario_completo_aleam_sapl_autoria_principal_pl_2007_2018_cutoff_20260510',
  metadata = COALESCE(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'coverage_id', 'david-almeida-aleam-completo-autoria-principal-pl-sapl-2007-2018-cutoff-20260510',
      'coverage_scope', 'inventario_completo_aleam_sapl_autoria_principal_pl_2007_2018_cutoff_20260510',
      'previous_coverage_id', 'legislacao-unblock-19-projetos-lei-lote-b-20260508',
      'previous_coverage_scope', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_distrital_lote_b_20260508',
      'coverage_status', 'completo_escopado',
      'coverage_public_status', 'parlamentar_complete',
      'coverage_rows', 116,
      'coverage_cutoff', '2026-05-10',
      'coverage_promoted_at', '2026-05-10T21:55:00Z',
      'coverage_source_artifact', 'fonte interna de curadoria',
      'coverage_promotion_artifact', 'fonte interna de curadoria',
      'tabela_alvo', 'projetos_lei',
      'legislacao_mandato_executivo_mixed', false,
      'adapter_kind', 'sapl_search_json',
      'official_author_id', '14',
      'official_list_url', 'https://sapl.al.am.leg.br/materia/pesquisar-materia?format=json&ano=&autoria__autor=14&autoria__autor__tipo=&autoria__primeiro_autor=&data_apresentacao_0=&data_apresentacao_1=&data_publicacao_0=&data_publicacao_1=&em_tramitacao=&ementa=&indexacao=&local_origem_externa=&materiaassunto__assunto=&numeracao__numero_materia=&numero=&numero_protocolo=&o=&relatoria__parlamentar_id=&tipo=1&tramitacao__status=&tramitacao__unidade_tramitacao_destino=',
      'official_detail_url_pattern', 'https://sapl.al.am.leg.br/materia/{materia_id}',
      'accepted_rule', 'tipo=PL e autoria literal iniciando por Deputado David Almeida',
      'accepted_rows', 116,
      'rejected_rows', 1,
      'formal_exclusion_reason', 'coautoria sem autoria principal literal: Deputado Jose Ricardo, Deputado David Almeida',
      'autoria_principal_verificada', true,
      'source_verified_at', '2026-05-10T21:50:00Z'
    )
WHERE candidato_id = (SELECT id FROM candidatos WHERE slug = 'david-almeida')
  AND coverage_id IN (
    'legislacao-unblock-19-projetos-lei-lote-b-20260508',
    'david-almeida-aleam-completo-autoria-principal-pl-sapl-2007-2018-cutoff-20260510'
  );

DO $$
DECLARE
  cand_id uuid;
  projetos_total int;
  complete_count int;
  old_count int;
  metadata_ok int;
  rejected_coauthor_count int;
  lme_total int;
  lme_target_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'david-almeida' AND publicavel = true;

  IF cand_id IS NULL THEN
    RAISE NOTICE 'david-almeida: pos-condicao promocao SAPL ALEAM completo pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO projetos_total
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO complete_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'david-almeida-aleam-completo-autoria-principal-pl-sapl-2007-2018-cutoff-20260510'
    AND coverage_scope = 'inventario_completo_aleam_sapl_autoria_principal_pl_2007_2018_cutoff_20260510';

  SELECT count(*) INTO old_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'legislacao-unblock-19-projetos-lei-lote-b-20260508';

  SELECT count(*) INTO metadata_ok
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'david-almeida-aleam-completo-autoria-principal-pl-sapl-2007-2018-cutoff-20260510'
    AND metadata->>'coverage_id' = 'david-almeida-aleam-completo-autoria-principal-pl-sapl-2007-2018-cutoff-20260510'
    AND metadata->>'coverage_scope' = 'inventario_completo_aleam_sapl_autoria_principal_pl_2007_2018_cutoff_20260510'
    AND metadata->>'coverage_status' = 'completo_escopado'
    AND metadata->>'coverage_public_status' = 'parlamentar_complete'
    AND metadata->>'tabela_alvo' = 'projetos_lei'
    AND metadata->>'legislacao_mandato_executivo_mixed' = 'false'
    AND metadata->>'autoria_principal_verificada' = 'true';

  SELECT count(*) INTO rejected_coauthor_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api = 'SAPL-ALEAM:131331';

  SELECT count(*) INTO lme_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO lme_target_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id
    AND metadata->>'coverage_id' = 'david-almeida-aleam-completo-autoria-principal-pl-sapl-2007-2018-cutoff-20260510';

  IF projetos_total <> 116 THEN
    RAISE EXCEPTION 'Pos-condicao david-almeida: projetos_lei total esperado 116, encontrado %', projetos_total;
  END IF;
  IF complete_count <> 116 THEN
    RAISE EXCEPTION 'Pos-condicao david-almeida: coverage completo esperado 116, encontrado %', complete_count;
  END IF;
  IF old_count <> 0 THEN
    RAISE EXCEPTION 'Pos-condicao david-almeida: coverage antigo esperado 0, encontrado %', old_count;
  END IF;
  IF metadata_ok <> 116 THEN
    RAISE EXCEPTION 'Pos-condicao david-almeida: metadata completo esperado 116, encontrado %', metadata_ok;
  END IF;
  IF rejected_coauthor_count <> 0 THEN
    RAISE EXCEPTION 'Pos-condicao david-almeida: coautoria rejeitada SAPL-ALEAM:131331 encontrada %', rejected_coauthor_count;
  END IF;
  IF lme_total <> 0 THEN
    RAISE EXCEPTION 'Pos-condicao david-almeida: legislacao_mandato_executivo esperado 0, encontrado %', lme_total;
  END IF;
  IF lme_target_count <> 0 THEN
    RAISE EXCEPTION 'Pos-condicao david-almeida: coverage parlamentar novo nao pode existir em LME, encontrado %', lme_target_count;
  END IF;
END $$;
