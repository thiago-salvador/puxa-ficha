-- Despublica o que a ficha de ALVARO COSTA DIAS (Natal/RN) exibe hoje e
-- pertence a ALVARO FERNANDES DIAS (ex-senador do Parana): seis linhas de
-- historico politico e dois anos de financiamento de campanha.
--
-- Nao aplicar por `supabase db push` nem por automacao: producao so recebe esta
-- migration pelo workflow apply-alvaro-dias-rn-homonimo-production.yml, que
-- exige dispatch manual, `main` e um SHA fechado.
--
-- =====================================================================
-- PROVA POR EXAUSTAO DO REGISTRO OFICIAL
-- =====================================================================
--
-- Pacotes `consulta_cand` dos dados abertos do TSE, 28 arquivos de unidade da
-- federacao por ano, varridos por nome completo normalizado contendo ALVARO e
-- DIAS. Leitura de 03/09/2026 sobre a copia local em `.tse-audit-cache/`.
--
--   ano | ALVARO COSTA DIAS (RN, nasc. 04/09/1959) | ALVARO FERNANDES DIAS (PR, nasc. 07/12/1944)
--   ----|------------------------------------------|---------------------------------------------
--   2002| Deputado Federal, PMDB, RN (SQ 233)      | Governador, PDT, PR (SQ 398)
--   2006| Deputado Estadual, PDT, RN (SQ 10265)    | Senador, PSDB, PR (SQ 10778)
--   2014| Deputado Estadual, PMDB, RN (SQ 2000...168) | Senador, PSDB, PR (SQ 1600...560)
--   2018| NAO CONSTA em nenhuma UF                 | Presidente, PODE, BR (SQ 2800...462)
--   2022| NAO CONSTA em nenhuma UF                 | Senador, PODE, PR (SQ 1600...980)
--
-- Duas pessoas distintas, com datas de nascimento distintas, e o registro
-- oficial e exaustivo: em 2018 e 2022 existe UM unico "Alvaro ... Dias" no
-- pais inteiro, e ele e o do Parana. Isso e prova por exaustao, nao inferencia.
--
-- Colisao logica, a mesma assinatura de docs/homonimos-historico-2026-07-26.md:
-- a ficha afirma, para o MESMO ano, que a pessoa foi Senador pelo PSDB do
-- Parana E Deputado Estadual pelo PMDB do Rio Grande do Norte (1998 e 2014), e
-- que em 2002 foi candidata a Governador pelo PDT do Parana E eleita Deputada
-- Federal pelo PMDB do Rio Grande do Norte. Nao e possivel.
--
-- Ironia que mede o tamanho do defeito: a propria biografia publicada avisa
-- "Nao confundir com o homonimo Alvaro Fernandes Dias (PR), ex-senador
-- paranaense", e a secao de trajetoria logo abaixo exibe a carreira dele.
--
-- =====================================================================
-- POR QUE ISTO SOBREVIVEU
-- =====================================================================
--
-- Este caso e nominalmente o mesmo que `scripts/lib/tse-resolver.ts` cita no
-- comentario de `shouldSkipWeakMatch` ("o senador do PR na ficha do ex-prefeito
-- de Natal"). A migration 20260730170000 poe em quarentena patrimonio e
-- financiamento ancorados em SQ de outra pessoa, e o seed foi limpo. Duas
-- coisas ficaram de fora:
--
--   1. `historico_politico` nao foi tocada por aquela migration, embora seja a
--      tabela que JA tem despublicacao logica (usada em 20260726160000 para o
--      caso `jeronimo`). As seis linhas seguem com `despublicado_em IS NULL`,
--      ou seja, no ar.
--   2. O financiamento de 2018 e 2022 voltou a tabela viva depois da
--      quarentena, gravado pela execucao `pf-ajustes-financiamento-20260810`.
--      Os dois anos sao justamente aqueles em que Alvaro Costa Dias NAO consta
--      no registro: R$ 5.439.178,66 (2018) e R$ 5.082.816,36 (2022) sao da
--      campanha presidencial e da campanha ao Senado do candidato do Parana.
--
-- =====================================================================
-- POR QUE DESPUBLICAR E NAO DELETAR
-- =====================================================================
--
-- Mesmo argumento de 20260726160000: apagar linha e afirmar que a candidatura
-- nao e daquela pessoa, e errar nessa direcao esconde mandato verdadeiro. As
-- linhas continuam no banco com o motivo gravado e voltam com um UPDATE.
-- `src/lib/api.ts` filtra `historico_politico` por `despublicado_em IS NULL`, e
-- a view `financiamento_publico` ja carrega `despublicado_em IS NULL` no WHERE,
-- entao a despublicacao tem efeito imediato nas duas tabelas sem deploy.

BEGIN;

-- Pre-imagem das 8 linhas, capturada ANTES da escrita, nas duas tabelas. E o que
-- o rollback le para devolver `despublicado_em` e `despublicacao_motivo` ao
-- valor exato de antes. Assumir NULL seria adivinhacao: a precondicao exige
-- `despublicado_em IS NULL`, mas nada garante que `despublicacao_motivo` esteja
-- vazio, e um rollback que zera um motivo que ja existia apaga curadoria alheia.
--
-- O `EXISTS` sobre `candidatos` repete o MESMO guard da precondicao de
-- proposito. Sem ele, um replay em que a ficha nao existe mas as linhas de
-- historico sim gravaria um recibo de 8 linhas para uma correcao que foi
-- ignorada, e o recibo passaria a descrever escrita que nunca aconteceu. Este
-- caminho foi encontrado por provar-alvaro-dias-rn-homonimo-pg17.sh, nao por
-- leitura.
CREATE TEMP TABLE alvaro_dias_rn_homonimo_preimagem ON COMMIT DROP AS
SELECT 'historico_politico'::text AS tabela, h.id, h.despublicado_em, h.despublicacao_motivo
  FROM public.historico_politico h
 WHERE EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'alvaro-dias-rn')
   AND h.id IN ('82deee73-8a51-4e0f-9633-64ae7e31efc0'::uuid,
                'f0c8aebd-5fe0-453b-be4e-f630831a0c47'::uuid,
                '23967fae-e035-4c18-bbc3-e5f9a970ecdc'::uuid,
                'b238ad2b-3668-48b7-8cb9-e355da68ec41'::uuid,
                '03d24ea4-b3ce-434b-a72b-0960f95c4520'::uuid,
                'd972c203-0353-4fa0-bfab-c292e807aca3'::uuid)
UNION ALL
SELECT 'financiamento'::text, f.id, f.despublicado_em, f.despublicacao_motivo
  FROM public.financiamento f
 WHERE EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'alvaro-dias-rn')
   AND f.id IN ('0332669e-5a46-4b32-b7f8-d23ad5001f48'::uuid,
                'c14061ca-7829-4908-becd-c09af5baf5c1'::uuid);

DO $precondition$
DECLARE
  hist_count integer;
  fin_count integer;
  slug_ok boolean;
BEGIN
  -- Replay linear em banco vazio: a ficha nao existe e a correcao e no-op.
  -- Fora desse caso, todo guard abaixo e obrigatorio.
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'alvaro-dias-rn') THEN
    RAISE NOTICE 'alvaro-dias-rn homonimo: ficha ausente (replay); correcao ignorada';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.candidatos
     WHERE id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid AND slug = 'alvaro-dias-rn'
  ) INTO slug_ok;
  IF NOT slug_ok THEN
    RAISE EXCEPTION 'alvaro-dias-rn homonimo: id nao corresponde ao slug esperado';
  END IF;

  SELECT count(*) INTO hist_count
    FROM public.historico_politico
   WHERE id IN ('82deee73-8a51-4e0f-9633-64ae7e31efc0'::uuid,
                'f0c8aebd-5fe0-453b-be4e-f630831a0c47'::uuid,
                '23967fae-e035-4c18-bbc3-e5f9a970ecdc'::uuid,
                'b238ad2b-3668-48b7-8cb9-e355da68ec41'::uuid,
                '03d24ea4-b3ce-434b-a72b-0960f95c4520'::uuid,
                'd972c203-0353-4fa0-bfab-c292e807aca3'::uuid)
     AND candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid
     AND despublicado_em IS NULL;
  IF hist_count <> 6 THEN
    RAISE EXCEPTION 'alvaro-dias-rn homonimo: esperava 6 linhas de historico no ar, encontrei %', hist_count;
  END IF;

  SELECT count(*) INTO fin_count
    FROM public.financiamento
   WHERE id IN ('0332669e-5a46-4b32-b7f8-d23ad5001f48'::uuid,
                'c14061ca-7829-4908-becd-c09af5baf5c1'::uuid)
     AND candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid
     AND despublicado_em IS NULL;
  IF fin_count <> 2 THEN
    RAISE EXCEPTION 'alvaro-dias-rn homonimo: esperava 2 linhas de financiamento no ar, encontrei %', fin_count;
  END IF;
END
$precondition$;

-- @write tabela=historico_politico slug=alvaro-dias-rn chave=c89aaf3b-a9a7-4a95-856a-5b65df38cc80 campos=despublicado_em,despublicacao_motivo
UPDATE public.historico_politico
   SET despublicado_em = now(),
       despublicacao_motivo = 'homonimo: candidatura de ALVARO FERNANDES DIAS (PR, nasc. 07/12/1944), nao de ALVARO COSTA DIAS (RN, nasc. 04/09/1959). Prova por exaustao dos pacotes consulta_cand do TSE (28 UFs por ano) em 03/09/2026; ver docs/reviews/2026-09-03-revisao-informacoes-fichas.md'
 WHERE id IN ('82deee73-8a51-4e0f-9633-64ae7e31efc0'::uuid,
              'f0c8aebd-5fe0-453b-be4e-f630831a0c47'::uuid,
              '23967fae-e035-4c18-bbc3-e5f9a970ecdc'::uuid,
              'b238ad2b-3668-48b7-8cb9-e355da68ec41'::uuid,
              '03d24ea4-b3ce-434b-a72b-0960f95c4520'::uuid,
              'd972c203-0353-4fa0-bfab-c292e807aca3'::uuid)
   AND candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid
   AND despublicado_em IS NULL;

-- @write tabela=financiamento slug=alvaro-dias-rn chave=c89aaf3b-a9a7-4a95-856a-5b65df38cc80 campos=despublicado_em,despublicacao_motivo
UPDATE public.financiamento
   SET despublicado_em = now(),
       despublicacao_motivo = 'homonimo: financiamento de ALVARO FERNANDES DIAS (PR). ALVARO COSTA DIAS (RN) nao consta no consulta_cand de 2018 nem de 2022 em nenhuma UF. Reinserido pela execucao pf-ajustes-financiamento-20260810 depois da quarentena de 20260730170000; ver docs/reviews/2026-09-03-revisao-informacoes-fichas.md'
 WHERE id IN ('0332669e-5a46-4b32-b7f8-d23ad5001f48'::uuid,
              'c14061ca-7829-4908-becd-c09af5baf5c1'::uuid)
   AND candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid
   AND despublicado_em IS NULL;

-- Recibo de pre-imagem. `HAVING count(*) > 0` mantem o replay em banco vazio
-- honesto: sem linha alvo nao ha recibo, em vez de um recibo de volume zero que
-- o CHECK `coleta_log_volume_coerente` recusaria.
-- @write tabela=coleta_log ref=migration:20260903220000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
INSERT INTO public.coleta_log (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao, natureza)
SELECT 'despublicacao-homonimo',
       'candidato',
       'historico_politico+financiamento.despublicado_em',
       'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid,
       'encontrado',
       count(*)::integer,
       jsonb_object_agg(
         pre.tabela || ':' || pre.id::text,
         jsonb_build_object(
           'despublicado_em', to_jsonb(pre.despublicado_em),
           'despublicacao_motivo', to_jsonb(pre.despublicacao_motivo)
         )
       )::text,
       'https://dadosabertos.tse.jus.br/dataset/candidatos-2022',
       'migration:20260903220000',
       'escrita'
  FROM alvaro_dias_rn_homonimo_preimagem pre
HAVING count(*) > 0;

DO $posdicao$
DECLARE
  hist_fora integer;
  fin_fora integer;
  hist_restante integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'alvaro-dias-rn') THEN
    RETURN;  -- replay em banco vazio: nada a conferir
  END IF;

  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260903220000') <> 1 THEN
    RAISE EXCEPTION 'alvaro-dias-rn homonimo: recibo de pre-imagem ausente ou duplicado';
  END IF;

  SELECT count(*) INTO hist_fora FROM public.historico_politico
   WHERE candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid AND despublicado_em IS NOT NULL;
  IF hist_fora <> 6 THEN
    RAISE EXCEPTION 'alvaro-dias-rn homonimo: esperava 6 linhas despublicadas, encontrei %', hist_fora;
  END IF;

  SELECT count(*) INTO fin_fora FROM public.financiamento
   WHERE candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid AND despublicado_em IS NOT NULL;
  IF fin_fora <> 2 THEN
    RAISE EXCEPTION 'alvaro-dias-rn homonimo: esperava 2 linhas de financiamento despublicadas, encontrei %', fin_fora;
  END IF;

  -- A trajetoria do Rio Grande do Norte continua inteira no ar. Se este numero
  -- cair, a migration comeu mandato verdadeiro, que e o erro oposto.
  SELECT count(*) INTO hist_restante FROM public.historico_politico
   WHERE candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid AND despublicado_em IS NULL;
  IF hist_restante <> 12 THEN
    RAISE EXCEPTION 'alvaro-dias-rn homonimo: esperava 12 linhas no ar depois da despublicacao, encontrei %', hist_restante;
  END IF;
END
$posdicao$;

COMMIT;
