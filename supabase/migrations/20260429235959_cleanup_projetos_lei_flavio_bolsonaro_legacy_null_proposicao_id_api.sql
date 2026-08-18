-- ============================================
-- Fluxo 5B Parte 7 - Cleanup residuos elimina­veis
-- Remocao das 3 rows legacy invalidas em projetos_lei de flavio-bolsonaro
-- ============================================
-- Nao aplicar ao Supabase remoto sem autorizacao explicita.
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO insere novos dados factuais (sem novo lote).
-- Esta migration NAO toca as 5 rows aplicadas no Lote A
--   (PEC 32/2019, PL 2393/2019, PL 4475/2021, PL 5593/2025, PL 1019/2026
--    com proposicao_id_api 135977, 136390, 151329, 171423, 172949).
--
-- Auditoria contra a API oficial do Senado:
--   - PEC 32/2023 (DB ementa: "Propoe reducao do numero de ministerios..."): a materia
--     real (Codigo 158574) e da autoria principal de Jaime Bagattoli; Flavio aparece como
--     co-autor NumOrdem=11. Ementa real diverge da DB. Row legacy = ementa fabricada.
--   - PL 879/2022 (DB ementa: "Institui o programa de incentivo a adocao..."): a materia
--     real (Codigo 152669) e da autoria de Carlos Viana; Flavio nao consta como autor.
--     Ementa real diverge da DB. Row legacy = atribuicao incorreta + ementa fabricada.
--   - PL 1291/2021 (DB ementa: "Altera o Codigo Penal para aumentar pena..."): nao foi
--     localizada no portfolio de autorias de Flavio na API oficial do Senado.
--     Row legacy = atribuicao incorreta + ementa fabricada.
--
-- Os 3 ids alvo tem proposicao_id_api NULL, fonte='Senado', e ementa que nao bate com
-- nenhuma materia oficial atribuida a Flavio Bolsonaro. A condicao de DELETE e estreita
-- para impedir colisao com qualquer row valida atual ou futura.
--
-- Idempotencia: rodar de novo e no-op (count = 0).
-- ============================================

DO $$
DECLARE
  cand_id uuid;
  legacy_count int;
  matched_pec_32_2023 int;
  matched_pl_879_2022 int;
  matched_pl_1291_2021 int;
  protected_lote_a_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'flavio-bolsonaro';
  IF cand_id IS NULL THEN
    RAISE EXCEPTION 'flavio-bolsonaro nao encontrado em candidatos';
  END IF;

  -- Verifica que as 5 rows do Lote A existem antes de tocar legacy
  SELECT count(*) INTO protected_lote_a_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Senado'
    AND proposicao_id_api IN ('135977', '136390', '151329', '171423', '172949');
  IF protected_lote_a_count <> 5 THEN
    RAISE EXCEPTION
      'Pre-condicao falha: esperadas 5 rows do Lote A em projetos_lei (Senado, proposicao_id_api 135977/136390/151329/171423/172949), encontradas %',
      protected_lote_a_count;
  END IF;

  -- Conta matches estreitos para cada legacy (nao tocar nada fora do alvo)
  SELECT count(*) INTO matched_pec_32_2023
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Senado'
    AND proposicao_id_api IS NULL
    AND tipo = 'PEC'
    AND numero = '32'
    AND ano = 2023;

  SELECT count(*) INTO matched_pl_879_2022
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Senado'
    AND proposicao_id_api IS NULL
    AND tipo = 'PL'
    AND numero = '879'
    AND ano = 2022;

  SELECT count(*) INTO matched_pl_1291_2021
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Senado'
    AND proposicao_id_api IS NULL
    AND tipo = 'PL'
    AND numero = '1291'
    AND ano = 2021;

  -- Aborta se alguma legacy aparecer em mais de 1 row (estado inesperado)
  IF matched_pec_32_2023 > 1 THEN
    RAISE EXCEPTION 'Match inesperado para legacy PEC 32/2023: % rows', matched_pec_32_2023;
  END IF;
  IF matched_pl_879_2022 > 1 THEN
    RAISE EXCEPTION 'Match inesperado para legacy PL 879/2022: % rows', matched_pl_879_2022;
  END IF;
  IF matched_pl_1291_2021 > 1 THEN
    RAISE EXCEPTION 'Match inesperado para legacy PL 1291/2021: % rows', matched_pl_1291_2021;
  END IF;

  legacy_count := matched_pec_32_2023 + matched_pl_879_2022 + matched_pl_1291_2021;
  RAISE NOTICE 'Cleanup legacy flavio-bolsonaro: encontradas % rows (PEC 32/2023=%, PL 879/2022=%, PL 1291/2021=%)',
    legacy_count, matched_pec_32_2023, matched_pl_879_2022, matched_pl_1291_2021;
END $$;

-- DELETE estreito por (candidato, fonte, proposicao_id_api NULL, tipo, numero, ano)
-- Cada predicado seleciona no maximo 1 row pre-existente; UNIQUE (candidato_id, proposicao_id_api)
-- nao se aplica porque proposicao_id_api e NULL nessas legacy (NULL distinct por padrao).
WITH cand AS (
  SELECT id FROM candidatos WHERE slug = 'flavio-bolsonaro'
)
DELETE FROM projetos_lei pl
USING cand
WHERE pl.candidato_id = cand.id
  AND pl.fonte = 'Senado'
  AND pl.proposicao_id_api IS NULL
  AND (
    (pl.tipo = 'PEC' AND pl.numero = '32'   AND pl.ano = 2023) OR
    (pl.tipo = 'PL'  AND pl.numero = '879'  AND pl.ano = 2022) OR
    (pl.tipo = 'PL'  AND pl.numero = '1291' AND pl.ano = 2021)
  );

-- Asserto pos-DELETE: 5 rows do Lote A intactas e 0 rows legacy alvo restantes
DO $$
DECLARE
  cand_id uuid;
  lote_a_count int;
  remaining_legacy int;
  total_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'flavio-bolsonaro';

  SELECT count(*) INTO lote_a_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Senado'
    AND proposicao_id_api IN ('135977', '136390', '151329', '171423', '172949');
  IF lote_a_count <> 5 THEN
    RAISE EXCEPTION 'Pos-cleanup: Lote A perdeu rows; esperado 5, encontrado %', lote_a_count;
  END IF;

  SELECT count(*) INTO remaining_legacy
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Senado'
    AND proposicao_id_api IS NULL
    AND (
      (tipo = 'PEC' AND numero = '32'   AND ano = 2023) OR
      (tipo = 'PL'  AND numero = '879'  AND ano = 2022) OR
      (tipo = 'PL'  AND numero = '1291' AND ano = 2021)
    );
  IF remaining_legacy <> 0 THEN
    RAISE EXCEPTION 'Pos-cleanup: ainda ha % row(s) legacy alvo em projetos_lei', remaining_legacy;
  END IF;

  SELECT count(*) INTO total_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;
  RAISE NOTICE 'Pos-cleanup flavio-bolsonaro: projetos_lei total=%, Lote A=%, legacy alvo=%',
    total_count, lote_a_count, remaining_legacy;
END $$;
