BEGIN;

-- Backfill de `coleta_log` a partir do que o banco já prova sozinho.
--
-- O QUE ESTE ARQUIVO SE PERMITE CONCLUIR
--
-- Uma única inferência, e ela é do tipo que não precisa de fé: se existe linha
-- em `patrimonio` cuja PRÓPRIA coluna `fonte` diz "TSE...", então o TSE foi
-- consultado para aquele candidato e respondeu com dado. A evidência está na
-- linha, não numa suposição sobre qual código poderia tê-la escrito.
--
-- É por isso que a atribuição aqui é sempre por valor de `fonte`, e nunca por
-- "esta tabela é escrita pelo ingest X". As duas coisas divergem: `projetos_lei`
-- tem 10.910 linhas com fonte 'Camara' e 2.051 com fonte 'Senado', mas também
-- 265 de 'ALEP Transparencia', 174 de 'SAPL ALEAM' e mais 20 origens de
-- assembleia estadual que vieram de curadoria, não de ingest nenhum. Atribuir a
-- tabela inteira à Câmara seria inventar 20 coletas que nunca aconteceram.
--
-- O QUE ESTE ARQUIVO SE RECUSA A CONCLUIR
--
-- Ausência. Nenhuma linha de `vazio_confirmado` é gravada aqui, para nenhum
-- candidato, em nenhuma fonte. O banco de hoje não tem como provar que alguém
-- foi ao Portal da Transparência e não achou sanção; ele só sabe que a tabela
-- está vazia. Quem não recebe linha neste backfill fica como NUNCA VERIFICADO,
-- que é a resposta verdadeira, e é a resposta que faz o trabalho aparecer.
--
-- Fontes deliberadamente fora do backfill, e o motivo de cada uma:
--
--   sancoes_administrativas   Tabela vazia, 0 linhas. Não há o que inferir, e é
--                             exatamente o caso que motivou tudo isto.
--   processos                 30 linhas, 21 candidatos, com `fonte` valendo
--                             'STF', 'MP-RJ', 'ALEMA' e nomes de veículo. É
--                             curadoria manual, não coleta automatizada. Marcar
--                             como coleta seria mentir sobre a origem.
--   noticias_candidato        Escrita pelo ingest google-news E por quatro
--                             migrations de curadoria; a coluna `fonte` guarda o
--                             nome do veículo, então não separa uma da outra.
--   votos_candidato           Escrita por camara e senado, sem coluna `fonte`.
--                             Não há como saber qual das duas.
--   historico_politico        Escrita por tse-historico, wikidata-politico,
--     mudancas_partido        senado e curadoria, sem coluna `fonte`.
--   indicadores_estaduais     Fonte territorial (SICONFI, CAPAG, IBGE, IDEB,
--                             IPEA, Atlas): o alvo é UF, e a coluna `fonte`
--                             existe, mas a coorte de UFs coletadas está no
--                             código do ingest, não no banco. Fica para o
--                             primeiro run instrumentado, que sabe a verdade.
--
-- `executado_em` recebe o max(created_at) das linhas que servem de evidência.
-- Não é o instante exato da coleta (uma migration de correção posterior não
-- mexe no created_at original), mas é a melhor âncora que o banco tem, e erra
-- para o passado, que é o lado seguro: nunca faz uma coleta velha parecer nova.
--
-- Idempotente: cada bloco apaga o próprio backfill antes de reinserir, casando
-- por `execucao`. Rodar duas vezes não duplica, e não toca linha de coleta real.

-- @write tabela=coleta_log ref=backfill:20260804170000 campos=execucao
DELETE FROM public.coleta_log WHERE execucao = 'backfill:20260804170000';

-- TSE: patrimônio e financiamento cuja própria fonte nomeia o TSE.
-- Uma linha por candidato, somando as duas tabelas, porque `fonte` no
-- coleta_log é o ingest e o ingest-tse escreve nas duas.
-- @write tabela=coleta_log ref=backfill:20260804170000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,executado_em,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, executado_em, execucao)
SELECT 'tse',
       'candidato',
       c.slug,
       c.id,
       'encontrado',
       ev.linhas,
       'backfill: ' || ev.linhas || ' linha(s) com fonte TSE em ' || ev.tabelas,
       ev.visto_em,
       'backfill:20260804170000'
  FROM public.candidatos c
  JOIN (
    SELECT candidato_id,
           sum(n)                                        AS linhas,
           max(visto_em)                                 AS visto_em,
           string_agg(DISTINCT tabela, ' e ' ORDER BY tabela) AS tabelas
      FROM (
        SELECT candidato_id, 'patrimonio' AS tabela, count(*) n, max(created_at) visto_em
          FROM public.patrimonio WHERE fonte ILIKE 'TSE%' GROUP BY candidato_id
        UNION ALL
        SELECT candidato_id, 'financiamento', count(*), max(created_at)
          FROM public.financiamento WHERE fonte ILIKE 'TSE%' GROUP BY candidato_id
      ) por_tabela
     WHERE candidato_id IS NOT NULL
     GROUP BY candidato_id
  ) ev ON ev.candidato_id = c.id;

-- Câmara: cota parlamentar e projetos de lei marcados como 'Camara'.
-- @write tabela=coleta_log ref=backfill:20260804170000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,executado_em,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, executado_em, execucao)
SELECT 'camara',
       'candidato',
       c.slug,
       c.id,
       'encontrado',
       ev.linhas,
       'backfill: ' || ev.linhas || ' linha(s) com fonte Camara em ' || ev.tabelas,
       ev.visto_em,
       'backfill:20260804170000'
  FROM public.candidatos c
  JOIN (
    SELECT candidato_id,
           sum(n)                                            AS linhas,
           max(visto_em)                                     AS visto_em,
           string_agg(DISTINCT tabela, ' e ' ORDER BY tabela) AS tabelas
      FROM (
        SELECT candidato_id, 'gastos_parlamentares' AS tabela, count(*) n, max(created_at) visto_em
          FROM public.gastos_parlamentares WHERE fonte ILIKE 'Camara%' GROUP BY candidato_id
        UNION ALL
        SELECT candidato_id, 'projetos_lei', count(*), max(created_at)
          FROM public.projetos_lei WHERE fonte ILIKE 'Camara%' GROUP BY candidato_id
      ) por_tabela
     WHERE candidato_id IS NOT NULL
     GROUP BY candidato_id
  ) ev ON ev.candidato_id = c.id;

-- Senado: projetos de lei marcados como 'Senado'.
-- @write tabela=coleta_log ref=backfill:20260804170000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,executado_em,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, executado_em, execucao)
SELECT 'senado',
       'candidato',
       c.slug,
       c.id,
       'encontrado',
       ev.n,
       'backfill: ' || ev.n || ' linha(s) com fonte Senado em projetos_lei',
       ev.visto_em,
       'backfill:20260804170000'
  FROM public.candidatos c
  JOIN (
    SELECT candidato_id, count(*) n, max(created_at) visto_em
      FROM public.projetos_lei
     WHERE fonte = 'Senado' AND candidato_id IS NOT NULL
     GROUP BY candidato_id
  ) ev ON ev.candidato_id = c.id;

-- CEAPS: cota do Senado. A fonte aparece em três formatos ('Senado CEAPS',
-- 'CEAPS/Senado' e a URL crua do CSV de despesa), todos inequívocos.
-- @write tabela=coleta_log ref=backfill:20260804170000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,executado_em,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, executado_em, execucao)
SELECT 'ceaps-senado',
       'candidato',
       c.slug,
       c.id,
       'encontrado',
       ev.n,
       'backfill: ' || ev.n || ' linha(s) de CEAPS em gastos_parlamentares',
       ev.visto_em,
       'backfill:20260804170000'
  FROM public.candidatos c
  JOIN (
    SELECT candidato_id, count(*) n, max(created_at) visto_em
      FROM public.gastos_parlamentares
     WHERE (fonte ILIKE '%ceaps%' OR fonte ILIKE '%senado.leg.br%')
       AND candidato_id IS NOT NULL
     GROUP BY candidato_id
  ) ev ON ev.candidato_id = c.id;

COMMIT;
