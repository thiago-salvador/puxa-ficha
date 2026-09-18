-- Issue #378: duas violacoes globais da auditoria de superficie, ambas em
-- fichas que entraram no recorte publicado entre 12/09 e 17/09/2026 (208 ->
-- 514 fichas). O dado e antigo; so a publicacao e nova.
--
-- Evidencia: run 35232081515 do workflow "Qualidade de dados", passo
-- "Julgar superficie (script puro)":
--   [R6_marcador_tse] dr-fernando-maximo: maiores_doadores.nome contem marcador tecnico do TSE
--   [R8_reversao_mesmo_ano] andre-do-prado: reversao no mesmo ano 2004: PL->PSTU, PSTU->PL
--
-- =====================================================================
-- BLOCO A. dr-fernando-maximo: doador "#NULO" no financiamento de 2020
-- =====================================================================
--
-- A linha de 2020 (id 7e5a0eb4-86e2-4ffb-af34-f5136ec16fc7) tem
-- total_arrecadado = 0 e um unico "doador":
--   [{"nome":"#NULO","tipo":"PJ","valor":0}]
-- "#NULO" e o marcador de campo sem valor dos pacotes do TSE, nao um doador.
-- A leitura fiel da fonte e "o TSE nao registra doador para este ano", que em
-- jsonb e a lista vazia. Nao ha nome a corrigir nem doador a inventar: os
-- outros dois anos do mesmo candidato (2022 e 2026) tem doadores reais e nao
-- sao tocados.
--
-- =====================================================================
-- BLOCO B. andre-do-prado: trajetoria partidaria derivada, legado
-- =====================================================================
--
-- As sete linhas de `mudancas_partido` do candidato tem contexto "Mudanca
-- observada entre eleicoes TSE (<ano>)" e foram gravadas em 06/04/2026 por uma
-- versao anterior do ingest. Nenhuma delas e reproduzivel pela derivacao de
-- hoje (`deriveTseObservedPartyChanges`, scripts/lib/party-timeline-
-- consistency.ts), por dois motivos independentes e verificaveis no proprio
-- repositorio:
--
--   1. A derivacao atual colapsa cada ano a UM partido e aborta o ano inteiro
--      quando ha mais de um (`conflitos`), emitindo no maximo uma mudanca por
--      ano. As linhas gravadas trazem DUAS mudancas em 2004, em direcoes
--      opostas (PSTU->PL e PL->PSTU). A logica de hoje nao produz esse par.
--   2. HISTORICAL_SAME_PARTY_GROUPS trata PL e PR como a mesma legenda (fonte:
--      TSE, aba de fusoes e mudancas de nomenclatura). A linha de 2022
--      (PR->PL) e, sob essa tabela, uma troca de partido onde houve apenas
--      renomeacao de legenda -- a derivacao atual a descarta explicitamente
--      (`!partyTimelineValuesEquivalent(anterior, novo)`).
--
-- O restante da sequencia alterna PSTU com PL/PR a cada passo (2000 PL->PSTU,
-- 2010 PSTU->PR, 2012 PR->PSTU, 2014 PSTU->PR), assinatura de observacoes de
-- pessoas distintas fundidas por match fraco de nome: o ingest atual so aceita
-- observacao casada por CPF ou SQ.
--
-- Esta migration NAO afirma qual era a filiacao real em cada ano: afirmar isso
-- exigiria o pacote historico do TSE, que nao foi consultado aqui. Ela apenas
-- retira do ar uma cadeia derivada que a regra de derivacao vigente nao
-- sustenta, preservando as linhas e o motivo (`despublicado_em` /
-- `despublicacao_motivo`, reversivel). E o mesmo remedio ja aplicado a
-- cadu-xavier, jeronimo, joao-rodrigues e outros, que a auditoria reporta como
-- aviso R10_partido_so_despublicado.
--
-- NAO aplicar por `supabase db push` nem por automacao: producao so recebe
-- esta migration pelo workflow de aplicacao autorizado.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.financiamento IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.mudancas_partido IN SHARE ROW EXCLUSIVE MODE;

-- Pre-imagem integral das oito linhas tocadas, capturada ANTES de qualquer
-- UPDATE. E a unica fonte de verdade do rollback: nem `financiamento` nem
-- `mudancas_partido` tem tabela de quarentena, entao o recibo em coleta_log
-- carrega `before` e `after` inteiros, no mesmo padrao de 20260917000100.
CREATE TEMP TABLE issue_378_preimagem ON COMMIT DROP AS
SELECT
  (SELECT to_jsonb(f) FROM public.financiamento f
    WHERE f.id = '7e5a0eb4-86e2-4ffb-af34-f5136ec16fc7') AS financiamento,
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.ano, m.id)
     FROM public.mudancas_partido m
     JOIN public.candidatos c ON c.id = m.candidato_id
    WHERE c.slug = 'andre-do-prado') AS trajetoria;

DO $apply$
DECLARE
  quantidade integer;
  verificado_em timestamptz := timestamptz '2026-09-18T00:00:00Z';
  motivo_trajetoria text := 'Cadeia derivada de "Mudanca observada entre eleicoes TSE" gravada em 06/04/2026 por ingest anterior, nao reproduzivel pela derivacao vigente: duas mudancas opostas no mesmo ano de 2004 (a derivacao atual emite no maximo uma por ano e aborta o ano em conflito) e uma troca PR->PL em 2022 que HISTORICAL_SAME_PARTY_GROUPS trata como a mesma legenda. Issue #378, violacao R8_reversao_mesmo_ano. Reversivel: linhas preservadas.';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'issue-378: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'issue-378: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  -- -----------------------------------------------------------------
  -- BLOCO A: pre-imagem exata da linha de financiamento de 2020.
  IF (SELECT count(*) FROM public.financiamento f
       JOIN public.candidatos c ON c.id = f.candidato_id
       WHERE c.slug = 'dr-fernando-maximo'
         AND f.id = '7e5a0eb4-86e2-4ffb-af34-f5136ec16fc7'
         AND f.ano_eleicao = 2020
         AND f.total_arrecadado = 0
         AND f.maiores_doadores = '[{"nome":"#NULO","tipo":"PJ","valor":0}]'::jsonb) <> 1
  THEN
    RAISE EXCEPTION 'issue-378: preimagem de financiamento de dr-fernando-maximo divergiu';
  END IF;

  -- @write tabela=financiamento slug=dr-fernando-maximo campos=maiores_doadores
  UPDATE public.financiamento f
  SET maiores_doadores = '[]'::jsonb
  FROM public.candidatos c
  WHERE c.id = f.candidato_id
    AND c.slug = 'dr-fernando-maximo'
    AND f.id = '7e5a0eb4-86e2-4ffb-af34-f5136ec16fc7'
    AND f.maiores_doadores = '[{"nome":"#NULO","tipo":"PJ","valor":0}]'::jsonb;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'issue-378: escrita de financiamento esperada=1 atual=%', quantidade;
  END IF;

  -- -----------------------------------------------------------------
  -- BLOCO B: pre-imagem exata das sete linhas derivadas de trajetoria.
  IF (
    SELECT count(*) FROM (VALUES
      ('e0c26051-9de3-4135-86fb-f9ba72028a30'::uuid, 2000, 'PL',   'PSTU'),
      ('4d71e1ab-10fb-4d57-8bb3-b118cdd404e7'::uuid, 2004, 'PSTU', 'PL'),
      ('3df17e2a-4fb3-4701-9e74-69c8e9f8ce4c'::uuid, 2004, 'PL',   'PSTU'),
      ('db46d0a9-a822-4029-9007-62b7da0155a1'::uuid, 2010, 'PSTU', 'PR'),
      ('9120d6d7-5010-4709-99de-a76422250fbf'::uuid, 2012, 'PR',   'PSTU'),
      ('fd2ff3cd-9323-4022-9692-138e98f7788f'::uuid, 2014, 'PSTU', 'PR'),
      ('8d36bb5a-1e41-4788-b17c-cbd9dd854fa9'::uuid, 2022, 'PR',   'PL')
    ) AS esperado(id, ano, anterior, novo)
    JOIN public.mudancas_partido m ON m.id = esperado.id
    JOIN public.candidatos c ON c.id = m.candidato_id
    WHERE c.slug = 'andre-do-prado'
      AND m.ano = esperado.ano
      AND m.partido_anterior = esperado.anterior
      AND m.partido_novo = esperado.novo
      AND m.contexto = 'Mudança observada entre eleições TSE (' || esperado.ano || ')'
      AND m.despublicado_em IS NULL
  ) <> 7 THEN
    RAISE EXCEPTION 'issue-378: preimagem da trajetoria de andre-do-prado divergiu';
  END IF;

  -- Nenhuma outra linha de trajetoria do candidato pode existir: se existir,
  -- alguem curou algo por outro caminho e a despublicacao em bloco mentiria.
  IF (SELECT count(*) FROM public.mudancas_partido m
       JOIN public.candidatos c ON c.id = m.candidato_id
       WHERE c.slug = 'andre-do-prado') <> 7
  THEN
    RAISE EXCEPTION 'issue-378: andre-do-prado tem linha de trajetoria fora das sete derivadas';
  END IF;

  -- @write tabela=mudancas_partido slug=andre-do-prado campos=despublicado_em,despublicacao_motivo
  UPDATE public.mudancas_partido m
  SET despublicado_em = verificado_em,
      despublicacao_motivo = motivo_trajetoria
  FROM public.candidatos c
  WHERE c.id = m.candidato_id
    AND c.slug = 'andre-do-prado'
    AND m.despublicado_em IS NULL;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 7 THEN
    RAISE EXCEPTION 'issue-378: despublicacoes de trajetoria esperadas=7 atuais=%', quantidade;
  END IF;

  -- -----------------------------------------------------------------
  -- @write tabela=coleta_log ref=migration:20260918120000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'auditoria-superficie','global',
         'financiamento.maiores_doadores,mudancas_partido.despublicado_em',
         'encontrado', 8,
         jsonb_build_object(
           'resumo','Issue #378: doador "#NULO" removido do financiamento de 2020 de dr-fernando-maximo (R6_marcador_tse) e sete linhas derivadas de trajetoria de andre-do-prado despublicadas por nao serem reproduziveis pela derivacao vigente (R8_reversao_mesmo_ano).',
           'before', jsonb_build_object(
             'financiamento', p.financiamento,
             'trajetoria', p.trajetoria
           ),
           'after', jsonb_build_object(
             'financiamento', (SELECT to_jsonb(f) FROM public.financiamento f
                                WHERE f.id = '7e5a0eb4-86e2-4ffb-af34-f5136ec16fc7'),
             'trajetoria', (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.ano, m.id)
                              FROM public.mudancas_partido m
                              JOIN public.candidatos c ON c.id = m.candidato_id
                             WHERE c.slug = 'andre-do-prado')
           )
         )::text,
         'https://github.com/thiago-salvador/puxa-ficha/actions/runs/35232081515',
         'migration:20260918120000','escrita'
  FROM issue_378_preimagem p
  WHERE NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260918120000');

  -- -----------------------------------------------------------------
  -- Pos-condicoes.
  IF EXISTS (
    SELECT 1 FROM public.financiamento f
    WHERE f.id = '7e5a0eb4-86e2-4ffb-af34-f5136ec16fc7'
      AND f.maiores_doadores::text ~* '#(NULO|NE)#?'
  ) THEN
    RAISE EXCEPTION 'issue-378: pos-condicao de financiamento falhou';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.mudancas_partido m
    JOIN public.candidatos c ON c.id = m.candidato_id
    WHERE c.slug = 'andre-do-prado' AND m.despublicado_em IS NULL
  ) THEN
    RAISE EXCEPTION 'issue-378: pos-condicao de trajetoria falhou';
  END IF;
END
$apply$;

COMMIT;
