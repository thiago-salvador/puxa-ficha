-- ============================================
-- Fluxo 5C Fase 2 - Aldo Rebelo / projetos_lei
-- Apply coverage_id 'aldo-rebelo-camara-completo-autoria-1991-2014-20260430'
-- nos 38 rows ja inseridos por 20260430050000.
-- ============================================
-- DRAFT: nao aplicar ao Supabase remoto sem dry-run estreito e autorizacao
-- explicita do usuario.
--
-- Pre-requisito: schema uplift 20260430070000 (coverage_id, coverage_scope,
--   metadata) ja aplicado.
-- Pre-requisito: seed 20260430050000 ja aplicado (38 rows projetos_lei do
--   aldo-rebelo presentes).
--
-- Auditoria de referencia:
--   fonte interna de curadoria
--   fonte interna de curadoria
--
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO contem DELETE.
-- Esta migration NAO toca em outros slugs.
-- Esta migration NAO toca em campos editoriais (tema, destaque,
--   destaque_motivo, situacao). So coverage_id, coverage_scope, metadata.
-- Idempotente: rodar de novo == no-op (UPDATE sobre o mesmo conjunto de IDs).
-- ============================================

-- Pre-condicao A: candidato e mandato federal SP existem.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM candidatos c
    WHERE c.slug = 'aldo-rebelo'
  ) THEN
    RAISE EXCEPTION 'aldo-rebelo nao encontrado em candidatos';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM candidatos c
    JOIN historico_politico hp ON hp.candidato_id = c.id
    WHERE c.slug = 'aldo-rebelo'
      AND hp.tipo_evento = 'mandato'
      AND (hp.cargo ILIKE '%Deputado Federal%' OR hp.cargo_canonico = 'Deputado Federal')
      AND hp.estado = 'SP'
  ) THEN
    RAISE EXCEPTION 'mandato Deputado Federal/SP de aldo-rebelo nao encontrado em historico_politico';
  END IF;
END $$;

-- Pre-condicao B: as 3 colunas existem (depende de 20260430070000).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projetos_lei' AND column_name = 'coverage_id'
  ) THEN
    RAISE EXCEPTION 'Pre-apply: projetos_lei.coverage_id ausente; aplique 20260430070000 primeiro';
  END IF;
END $$;

-- Pre-condicao C: 38 rows projetos_lei ja presentes para aldo-rebelo,
-- com os 38 proposicao_id_api esperados.
DO $$
DECLARE
  cand_id uuid;
  total_pre int;
  inventario_pre int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'aldo-rebelo';

  SELECT count(*) INTO total_pre
  FROM projetos_lei
  WHERE candidato_id = cand_id;
  IF total_pre <> 38 THEN
    RAISE EXCEPTION 'Pre-apply: esperadas 38 rows projetos_lei para aldo-rebelo, encontradas %', total_pre;
  END IF;

  SELECT count(*) INTO inventario_pre
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Camara'
    AND proposicao_id_api IN ('16058', '236104', '215514', '25630', '20924', '222064', '222607', '21090', '170071', '15254', '175199', '179195', '188956', '236105', '18731', '20075', '20641', '38127', '20916', '21627', '21698', '14509', '15958', '16260', '25187', '17069', '17804', '18744', '18904', '18905', '28526', '28528', '28530', '28547', '28548', '148717', '425192', '464348');
  IF inventario_pre <> 38 THEN
    RAISE EXCEPTION 'Pre-apply: esperados 38 proposicao_id_api do inventario presentes, encontrados %', inventario_pre;
  END IF;

  RAISE NOTICE 'Pre-apply aldo-rebelo coverage_id: total=% inventario_present=%', total_pre, inventario_pre;
END $$;

-- Apply: idempotente. Sobrescreve coverage_id e coverage_scope nos 38 rows
-- alvo. Nao toca em rows de outros slugs.
WITH target AS (
  SELECT c.id AS candidato_id
  FROM candidatos c
  WHERE c.slug = 'aldo-rebelo'
)
UPDATE projetos_lei pl
SET
  coverage_id = 'aldo-rebelo-camara-completo-autoria-1991-2014-20260430',
  coverage_scope = 'inventario_completo_camara_autoria_1991_2014_20260430'
FROM target
WHERE pl.candidato_id = target.candidato_id
  AND pl.fonte = 'Camara'
  AND pl.proposicao_id_api IN (
    '16058','236104','215514','25630','20924','222064','222607','21090',
    '170071','15254','175199','179195','188956','236105','18731','20075',
    '20641','38127','20916','21627','21698','14509','15958','16260',
    '25187','17069','17804','18744','18904','18905','28526','28528',
    '28530','28547','28548','148717','425192','464348'
  );

-- Pos-condicao: 38 rows do aldo-rebelo com coverage_id alvo; zero rows do
-- aldo-rebelo com coverage_id NULL ou divergente; nenhum outro slug afetado.
DO $$
DECLARE
  cand_id uuid;
  with_target_coverage int;
  null_coverage_aldo int;
  divergent_coverage_aldo int;
  total_other_slugs_with_target int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'aldo-rebelo';

  SELECT count(*) INTO with_target_coverage
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'aldo-rebelo-camara-completo-autoria-1991-2014-20260430'
    AND coverage_scope = 'inventario_completo_camara_autoria_1991_2014_20260430';
  IF with_target_coverage <> 38 THEN
    RAISE EXCEPTION 'Pos-apply: esperadas 38 rows com coverage_id alvo, encontradas %', with_target_coverage;
  END IF;

  SELECT count(*) INTO null_coverage_aldo
  FROM projetos_lei
  WHERE candidato_id = cand_id AND coverage_id IS NULL;
  IF null_coverage_aldo <> 0 THEN
    RAISE EXCEPTION 'Pos-apply: % rows do aldo-rebelo permanecem com coverage_id NULL (esperado 0)', null_coverage_aldo;
  END IF;

  SELECT count(*) INTO divergent_coverage_aldo
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id IS NOT NULL
    AND coverage_id <> 'aldo-rebelo-camara-completo-autoria-1991-2014-20260430';
  IF divergent_coverage_aldo <> 0 THEN
    RAISE EXCEPTION 'Pos-apply: % rows do aldo-rebelo com coverage_id divergente do alvo (esperado 0)', divergent_coverage_aldo;
  END IF;

  SELECT count(*) INTO total_other_slugs_with_target
  FROM projetos_lei
  WHERE candidato_id <> cand_id
    AND coverage_id = 'aldo-rebelo-camara-completo-autoria-1991-2014-20260430';
  IF total_other_slugs_with_target <> 0 THEN
    RAISE EXCEPTION 'Pos-apply: % rows de outros slugs marcadas com coverage_id do aldo (esperado 0)', total_other_slugs_with_target;
  END IF;

  RAISE NOTICE 'Pos-apply aldo-rebelo coverage_id: with_target=% null_aldo=% divergent_aldo=% other_slugs=%',
    with_target_coverage, null_coverage_aldo, divergent_coverage_aldo, total_other_slugs_with_target;
END $$;
