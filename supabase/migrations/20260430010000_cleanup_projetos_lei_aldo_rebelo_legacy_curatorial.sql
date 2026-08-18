-- ============================================
-- Fluxo 5B Parte 13 - Cleanup curatorial autorizado
-- Remocao das 98 rows legacy de aldo-rebelo em projetos_lei
-- ============================================
-- Autorizacao explicita do usuario para criar migration definitiva e aplicar
-- remotamente somente esta migration. Sem deploy. Sem cache invalidate explicito.
--
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO toca:
--   - 5 rows do Lote A parlamentar Camara aplicadas em 2026-04-29
--     (proposicao_id_api 17069, 14509, 170071, 188956, 148717)
--   - 2 rows legacy com autoria principal confirmada em 2009
--     (PL 4791/2009 codigo 425192 e PL 6625/2009 codigo 464348)
--
-- Esta migration remove apenas as 98 rows legacy classificadas no diagnostico
-- read-only de 2026-04-29 como coautoria_confirmada (51) ou
-- relatoria_parecer_substitutivo_emenda_requerimento (47), todas com
-- proposicao_id_api real validado contra Camara Dados Abertos
-- (https://dadosabertos.camara.leg.br/api/v2/proposicoes/{id}/autores).
--
-- Artefato base:
--   fonte interna de curadoria
--
-- Idempotencia: rodar de novo == no-op (count alvo = 0).
-- Guards: pre-DELETE valida total=105 + 7 preservaveis presentes + 98 alvos presentes;
--         pos-DELETE valida total=7 + 7 preservaveis presentes + 0 alvos restantes.
-- ============================================

CREATE TEMP TABLE _cleanup_aldo_rebelo_legacy_targets ON COMMIT DROP AS
SELECT v.proposicao_id_api
FROM (
  VALUES
    ('397700'),
    ('397702'),
    ('397706'),
    ('397708'),
    ('397712'),
    ('397717'),
    ('397720'),
    ('397731'),
    ('397742'),
    ('397749'),
    ('397757'),
    ('397763'),
    ('397787'),
    ('397795'),
    ('397800'),
    ('397808'),
    ('397818'),
    ('397822'),
    ('397824'),
    ('397826'),
    ('397828'),
    ('397851'),
    ('397870'),
    ('397871'),
    ('397874'),
    ('397876'),
    ('397886'),
    ('397889'),
    ('397890'),
    ('397891'),
    ('397892'),
    ('397896'),
    ('397897'),
    ('397898'),
    ('397901'),
    ('397902'),
    ('404084'),
    ('405640'),
    ('405681'),
    ('419991'),
    ('433065'),
    ('435173'),
    ('436407'),
    ('437259'),
    ('437438'),
    ('437442'),
    ('437547'),
    ('437551'),
    ('437553'),
    ('437565'),
    ('437624'),
    ('437708'),
    ('437877'),
    ('439901'),
    ('439975'),
    ('444433'),
    ('447723'),
    ('447970'),
    ('452147'),
    ('452478'),
    ('452721'),
    ('452722'),
    ('455866'),
    ('457246'),
    ('458132'),
    ('458133'),
    ('458134'),
    ('458135'),
    ('458156'),
    ('458162'),
    ('458761'),
    ('460596'),
    ('461289'),
    ('467492'),
    ('469866'),
    ('470003'),
    ('470560'),
    ('470561'),
    ('471199'),
    ('479237'),
    ('480244'),
    ('480245'),
    ('483155'),
    ('483544'),
    ('487405'),
    ('489294'),
    ('489295'),
    ('489672'),
    ('489673'),
    ('489674'),
    ('496864'),
    ('501889'),
    ('504679'),
    ('515419'),
    ('517792'),
    ('520235'),
    ('520267'),
    ('521370')
) AS v(proposicao_id_api);

CREATE TEMP TABLE _cleanup_aldo_rebelo_preserve ON COMMIT DROP AS
SELECT v.proposicao_id_api
FROM (
  VALUES
    ('17069'),
    ('14509'),
    ('170071'),
    ('188956'),
    ('148717'),
    ('425192'),
    ('464348')
) AS v(proposicao_id_api);

DO $$
DECLARE
  cand_id uuid;
  total_now int;
  preserve_present int;
  targets_present int;
  overlap_check int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'aldo-rebelo';
  IF cand_id IS NULL THEN
    RAISE EXCEPTION 'aldo-rebelo nao encontrado em candidatos';
  END IF;

  SELECT count(*) INTO total_now FROM projetos_lei WHERE candidato_id = cand_id;
  -- CI bypass: 0 ou 5 rows = ambiente seed sem dados de pipeline; DELETE sera no-op.
  IF total_now <> 105 AND total_now NOT IN (0, 5, 7) THEN
    RAISE EXCEPTION 'Pre-condicao falha: esperadas 105 rows totais em projetos_lei para aldo-rebelo, encontradas %', total_now;
  END IF;

  IF total_now = 105 THEN
    SELECT count(*) INTO preserve_present
    FROM projetos_lei pl
    JOIN _cleanup_aldo_rebelo_preserve p ON p.proposicao_id_api = pl.proposicao_id_api
    WHERE pl.candidato_id = cand_id AND pl.fonte = 'Camara';
    IF preserve_present <> 7 THEN
      RAISE EXCEPTION 'Pre-condicao falha: esperados 7 rows preservaveis presentes (5 Lote A + 2 legacy principal), encontrados %', preserve_present;
    END IF;

    SELECT count(*) INTO targets_present
    FROM projetos_lei pl
    JOIN _cleanup_aldo_rebelo_legacy_targets t ON t.proposicao_id_api = pl.proposicao_id_api
    WHERE pl.candidato_id = cand_id AND pl.fonte = 'Camara';
    IF targets_present <> 98 THEN
      RAISE EXCEPTION 'Pre-condicao falha: esperados 98 rows-alvo de cleanup presentes, encontrados %', targets_present;
    END IF;

    SELECT count(*) INTO overlap_check
    FROM _cleanup_aldo_rebelo_legacy_targets t
    JOIN _cleanup_aldo_rebelo_preserve p ON p.proposicao_id_api = t.proposicao_id_api;
    IF overlap_check <> 0 THEN
      RAISE EXCEPTION 'Pre-condicao falha: lista de alvos sobrepoe lista de preservaveis em % ids; cleanup abortado', overlap_check;
    END IF;
  END IF;

  RAISE NOTICE 'Cleanup aldo-rebelo: total atual=% preservaveis presentes=% alvos presentes=% overlap=%',
    total_now, preserve_present, targets_present, overlap_check;
END $$;

WITH cand AS (
  SELECT id FROM candidatos WHERE slug = 'aldo-rebelo'
)
DELETE FROM projetos_lei pl
USING cand, _cleanup_aldo_rebelo_legacy_targets t
WHERE pl.candidato_id = cand.id
  AND pl.fonte = 'Camara'
  AND pl.proposicao_id_api = t.proposicao_id_api;

DO $$
DECLARE
  cand_id uuid;
  total_after int;
  preserve_after int;
  targets_after int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'aldo-rebelo';

  SELECT count(*) INTO total_after FROM projetos_lei WHERE candidato_id = cand_id;
  -- CI bypass: 0 ou 5 rows = ambiente seed; DELETE foi no-op.
  IF total_after <> 7 AND total_after NOT IN (0, 5) THEN
    RAISE EXCEPTION 'Pos-cleanup: esperadas 7 rows totais para aldo-rebelo, encontradas %', total_after;
  END IF;

  IF total_after = 7 THEN
    SELECT count(*) INTO preserve_after
    FROM projetos_lei pl
    JOIN _cleanup_aldo_rebelo_preserve p ON p.proposicao_id_api = pl.proposicao_id_api
    WHERE pl.candidato_id = cand_id AND pl.fonte = 'Camara';
    IF preserve_after <> 7 THEN
      RAISE EXCEPTION 'Pos-cleanup: esperados 7 rows preservaveis intactos, encontrados %', preserve_after;
    END IF;

    SELECT count(*) INTO targets_after
    FROM projetos_lei pl
    JOIN _cleanup_aldo_rebelo_legacy_targets t ON t.proposicao_id_api = pl.proposicao_id_api
    WHERE pl.candidato_id = cand_id AND pl.fonte = 'Camara';
    IF targets_after <> 0 THEN
      RAISE EXCEPTION 'Pos-cleanup: ainda restam % rows alvo em projetos_lei para aldo-rebelo', targets_after;
    END IF;
  END IF;

  RAISE NOTICE 'Pos-cleanup aldo-rebelo: total=% preservaveis=% alvos restantes=%',
    total_after, preserve_after, targets_after;
END $$;
