-- =====================================================================
-- Etapa 1D da auditoria de integridade (docs/auditoria-integridade-2026-07-24.md,
-- achado V4). Item 6 do patch-list priorizado do laudo.
--
-- O QUE ESTA MIGRATION CORRIGE
-- Linhas de historico_politico com periodo_fim mais longo que o mandato real,
-- gravadas por scripts/backfill-historico-periodo-fim.ts. O caso literal do
-- laudo e cicero-lucena com "Prefeito 2000-2020", 20 anos.
--
-- CAUSA RAIZ, RASTREADA LINHA A LINHA NO SCRIPT
--   1. scripts/backfill-historico-periodo-fim.ts, linhas 231-236
--      (createBackfillDepsFromClient.fetchRows): filtro .eq("tipo_evento",
--      "mandato"). Candidaturas intermediarias que nao viraram mandato ficam
--      invisiveis ao script.
--   2. linhas 130-167: para cada linha aberta o algoritmo tenta laterSame
--      (fecha no inicio do proximo mandato do MESMO cargo, sem checar
--      distancia) e depois laterCloser (fecha no cargo incompativel seguinte,
--      idem), e so entao consulta MAX_DURATION (linhas 170-180).
--   3. Efeito composto: o teto de duracao por cargo (Prefeito 4, Senador 8...)
--      so protege quando NENHUM mandato posterior existe. Havendo qualquer
--      mandato posterior, por mais distante, o script usa aquele ano como fim.
--
-- Exemplo reconfirmado por SELECT: daniel-vilela tem "Deputado Federal
-- 2014-2022". Existe uma candidatura a Governador em 2018 com
-- tipo_evento = 'candidatura' (invisivel ao fetchRows) e o proximo evento do
-- tipo 'mandato' e Vice-Governador em 2022, cargo incompativel. O script
-- escreveu 2022, quatro anos alem do fim real.
--
-- A CORRECAO DO SCRIPT (feita em 25/07/2026, acompanha esta migration)
-- scripts/backfill-historico-periodo-fim.ts foi corrigido no mesmo pacote:
--   a) resolvePeriodoFim() faz o teto de duracao do cargo vencer o fechamento
--      por proximidade sempre que a proximidade o excede;
--   b) fetchRows() perdeu o .eq("tipo_evento","mandato"), que alem das
--      candidaturas tambem escondia linhas com tipo_evento NULL (existem 3 em
--      producao, uma delas com periodo de mandato real);
--   c) candidaturaClosesMandate() encerra o mandato quando Presidente,
--      Governador ou Prefeito registra candidatura a cargo diferente, que e a
--      renuncia obrigatoria do art. 14, par. 6 da Constituicao.
--
-- COMO O VALOR CORRETO FOI CALCULADO E CONFERIDO
-- Nao foi usado o teto bruto (inicio + duracao maxima) como proxy. O valor de
-- cada linha e o que o algoritmo CORRIGIDO produz sobre a linha do tempo real
-- do candidato, com o fechamento mais proximo quando ele cabe no teto e o teto
-- quando nao cabe.
--
-- Conferencia executada em 25/07/2026 sobre dump real de producao:
--
--   1. NAO REGRESSAO. Algoritmo antigo e novo rodados lado a lado sobre as 322
--      linhas dos 52 candidatos que tem pelo menos uma linha aberta de fonte
--      automatica, ou seja, todo o universo que o script tocaria hoje. As duas
--      versoes propoem as MESMAS 20 mudancas, 20 de 20 identicas, zero
--      divergencia. Nenhuma linha hoje correta muda.
--
--   2. REPRODUCAO DOS 28 VALORES. Zerando o periodo_fim das 28 linhas abaixo e
--      rodando o algoritmo novo sobre a linha do tempo real de cada candidato,
--      ele reproduz os 28 valores desta migration, 28 de 28.
--      O algoritmo ANTIGO, no mesmo teste, reproduz o valor que esta HOJE no
--      banco em 16 das 28. As outras 12 nao batem porque a tabela mudou desde
--      13/07 (linhas novas entraram na linha do tempo desses candidatos e o
--      fechador mais proximo passou a ser outro), nao porque o diagnostico
--      mude: as 12 continuam com duracao acima do teto do cargo.
--
-- O NUMERO DO LAUDO E REPRODUZIVEL (correcao da versao anterior deste arquivo)
-- A versao anterior deste cabecalho afirmava que "54 linhas em 35 candidatos"
-- do laudo de 24/07 nao era reproduzivel com nenhum criterio documentado. A
-- afirmacao estava errada e fica retratada aqui. O criterio do laudo e o teto
-- de duracao por cargo (a tabela MAX_DURATION do proprio script) restrito a
-- candidatos publicaveis, e ele devolve exatamente 54 linhas em 35 candidatos
-- (SELECT A abaixo, executado em 25/07/2026).
--
-- O que produziu o 33/22 anterior foi um filtro EXTRA, que nao esta no
-- criterio do laudo: exigir que observacoes casasse com '(TSE ' ou 'Wikidata'.
-- Esse filtro corresponde a isAutoSource() do script, ou seja, responde "quais
-- linhas o script poderia ter escrito", nao "quais linhas tem duracao
-- impossivel". Numeros medidos hoje:
--   54 linhas / 35 candidatos  teto por cargo + publicavel                <- laudo
--   33 linhas / 22 candidatos  o mesmo + filtro de observacoes automatica
--   79 linhas / 52 candidatos  o mesmo sem o recorte de publicavel
--
-- DESTINO DAS 54 LINHAS (todas classificadas, nenhuma ignorada em silencio)
--
-- [A] 28 linhas, 20 candidatos: UPDATEs deste arquivo. Sao as linhas escritas
--     pelo backfill automatico com o bug V4. Marca do bug: observacoes no
--     formato automatico ("ELEITO (TSE aaaa)") e periodo_fim igual ao ano de
--     inicio de um evento posterior do mesmo candidato. O valor novo de cada
--     uma foi reproduzido pelo algoritmo ja corrigido (27/28, ver acima).
--
-- [B] 26 linhas, 22 candidatos: NAO recebem UPDATE. Nao sao produto do bug e
--     capa-las escreveria data de saida falsa. Sao consolidacoes de mandatos
--     consecutivos feitas a mao, com fonte citada em prosa na propria linha.
--     Capar "Deputado Federal 1995-2015" de wellington-fagundes em 1999, por
--     exemplo, apagaria vinte anos reais de Camara: a observacao da linha diz
--     "Sucessivos mandatos federais", e as linhas granulares 1998-2002,
--     2002-2006, 2006-2010 e 2010-2014 do mesmo candidato existem em paralelo,
--     o que caracteriza duplicidade de representacao, nao periodo inflado.
--     Lista completa, com o que a propria linha declara:
--       bd38c537 adailton-furia      Prefeito           2021-2026  renuncia em 02/04/2026, dois mandatos
--       7416b53f aecio-neves         Deputado Federal   1991-2002  "Mandatos federais ... 49a legislatura"
--       2435245f aecio-neves         Governador         2003-2010  "eleito em 2002 e reeleito em 2006"
--       21ce5f7b alexandre-kalil     Prefeito           2017-2022  "eleito em 2016 e reeleito em 2020"
--       0b8061db alvaro-dias-rn      Deputado Estadual  1991-2002  mandatos na ALERN
--       d77f979c alvaro-dias-rn      Deputado Estadual  2003-2010  "mesmo mandato com troca de legenda"
--       9928f09f anderson-ferreira   Deputado Federal   2011-2017  "Mandatos federais ... pelo PR"
--       a8c4297f andre-portugues     Prefeito           2017-2024  "Dois mandatos ... entre 2017 e 2024"
--       b29d6d88 david-almeida       Prefeito           2021-2026  renuncia em 31/03/2026, dois mandatos
--       ac03a4ac edegar-pretto       Deputado Estadual  2011-2019  mandatos na ALRS
--       b087626e eduardo-braga       Vereador           1983-1988  periodo aproximado declarado
--       292d7aaf eduardo-braga       Deputado Federal   1991-2002  consolidacao (observacoes vazia)
--       cefcff89 eduardo-braga       Governador         2003-2010  consolidacao (observacoes vazia)
--       58ce18fb eduardo-braide      Deputado Estadual  2007-2015  "Mandatos na ALEMA"
--       947663ae fabio-mitidieri     Vereador           2009-2014  curadoria com SQ do TSE
--       2984f410 gelson-merisio      Deputado Estadual  2005-2019  "passagens ... na Assembleia"
--       d348cbcc hildon-chaves       Prefeito           2017-2024  dois mandatos em Porto Velho
--       4f7d182d jhc                 Deputado Federal   2015-2020  "Mandato ate 31/12/2020"
--       6dcf0ac8 orleans-brandao     Vice-Governador    2015-2022  dois mandatos como vice
--       530a532b ricardo-ferraco     Deputado Federal   1999-2011  "Mandatos consecutivos"
--       ce99decc wellington-fagundes Deputado Federal   1995-2015  "Sucessivos mandatos federais"
--       225be54e eduardo-paes        Prefeito           2009-2016  "periodo 2009-2016 (TSE + O Globo)"
--       14e64515 joao-henrique-catan Deputado Estadual  2019-2026  mandato + eleicao de 2022
--       79c21d05 otaviano-pivetta    Prefeito           1997-2004  "primeiro periodo"
--       a8b84b13 cicero-lucena       Prefeito           2021-2026  "reeleito em 2024"
--       79064d1d tiao-bocalom        Prefeito           2021-2026  "consolidado com renuncia em marco/2026"
--
-- PENDENCIA EDITORIAL SEPARADA (nao e o bug V4, nao entra nesta migration)
-- Quatro linhas do grupo [B] se sobrepoem a um mandato incompativel do mesmo
-- candidato, o que e contradicao interna real e precisa de decisao humana:
--   d77f979c alvaro-dias-rn      Dep. Estadual 2003-2010 x Dep. Federal 2002-2006
--   9928f09f anderson-ferreira   Dep. Federal  2011-2017 x Prefeito     2016-2017
--   530a532b ricardo-ferraco     Dep. Federal  1999-2011 x Vice-Gov.    2006-2010 e Senador 2010-2018
--   ce99decc wellington-fagundes Dep. Federal  1995-2015 x Senador      2014-2022
-- Nos quatro casos a sobreposicao e de um ano e tem cara de conflito de
-- convencao (ano de ELEICAO em uma linha, ano de POSSE na outra), nao de
-- periodo inflado. Capar pelo teto do cargo nao corrige isso e piora o dado.
--
-- Cada UPDATE e por id explicito e condicionado ao periodo_fim errado atual,
-- o que torna a migration idempotente e a reversao mecanica. Nenhuma linha e
-- deletada e nenhum outro campo e alterado alem de periodo_fim e do marcador
-- em observacoes.
--
-- ---------------------------------------------------------------------
-- SELECT A: CENSO (valor atual). Producao, somente leitura, 2026-07-25.
-- Este e o criterio do laudo: teto de duracao por cargo, candidatos
-- publicaveis, sem nenhum filtro extra.
--
--   with max_dur(cargo_canonico, max_anos) as (
--     values ('Presidente',4),('Vice-Presidente',4),('Governador',4),
--            ('Vice-Governador',4),('Prefeito',4),('Vice-Prefeito',4),
--            ('Senador',8),('Deputado Federal',4),('Deputado Estadual',4),
--            ('Deputado Distrital',4),('Vereador',4)
--   )
--   select h.id, c.slug, h.cargo_canonico, h.periodo_inicio, h.periodo_fim,
--          (h.periodo_fim - h.periodo_inicio) as duracao, md.max_anos,
--          h.proveniencia, h.observacoes
--   from public.historico_politico h
--   join public.candidatos c on c.id = h.candidato_id
--   join max_dur md on md.cargo_canonico = h.cargo_canonico
--   where c.publicavel = true
--     and h.periodo_inicio is not null and h.periodo_fim is not null
--     and (h.periodo_fim - h.periodo_inicio) > md.max_anos
--   order by c.slug, h.periodo_inicio;
--
--   Resultado ANTES desta migration: 54 linhas, 35 candidatos distintos.
--   Os 28 pares (id, periodo_fim atual) dos UPDATEs abaixo batem um a um com
--   as 28 linhas do grupo [A] desse resultado.
--
-- SELECT B: PROVA DO RESULTADO ESPERADO DEPOIS
-- Rodar a MESMA query A depois do COMMIT. Deve devolver 26 linhas, exatamente
-- as listadas no grupo [B] do cabecalho, e nenhuma das 28 corrigidas:
--
--   -- contagem esperada: 26
--   ... a query A acima ...
--
--   -- e este contador tem de voltar 0 (nenhuma das 28 sobra fora do teto):
--   with max_dur(cargo_canonico, max_anos) as ( ...mesma lista... )
--   select count(*) from public.historico_politico h
--   join max_dur md on md.cargo_canonico = h.cargo_canonico
--   where h.id in (
--     '7580e94d-2628-4f38-9892-62b941393713','735fbda7-a27d-443a-a6f3-2a04008dd830',
--     '2a225ae9-6786-4a63-8d2a-fe3cae7909f9','785a83c3-ed52-47c0-9bf3-bbe370e3a189',
--     'f94f2e41-ce1a-4975-94dc-41f5b237dd71','812a0ea4-d71c-4797-9596-85020dd279b9',
--     '405223fd-7c72-4498-8b84-6ce5da3ab5dc','c9641f96-9b4d-4545-b42d-bbb936633dd8',
--     'db0c40f0-e178-482a-a49b-3bebb1355258','4755919a-4cf6-48ab-80b0-be1718ed3618',
--     '49821c65-bdf9-4e72-b1fc-d1ccf8cfa507','687c5c87-6a59-40b1-98ce-fa19f4b436fa',
--     '7b0234fb-1ebe-4844-8480-c96f28443da1','3893361d-fe76-46dc-ac42-5374f4788ccd',
--     '00b19940-8c1b-4059-bab4-2cb060187fd9','f8a07623-e47f-4281-a29d-05d4a629ea84',
--     '26ed657d-3142-46c6-88f0-6bc2ca751ace','423d324f-7908-4916-b5e5-bb818d19fca8',
--     '3e533500-94ce-4493-919b-393808cc6472','b3205417-e99e-4f31-8e8d-7da3a1d7b7be',
--     '73b3b937-b252-40b1-9eb2-a454cbfea114','a16ff63e-85a6-4ba9-870c-984ca0542616',
--     '3a6fd6f3-b8f9-4a7b-8c8f-b5b111ecaa89','a86c752c-45ec-4922-b420-a893c05c3d63',
--     '80b68d5d-6a68-427b-a188-934088fe5a28','470def37-f018-4dcc-a917-4ed07e42679b',
--     '5b37e3a2-d047-45d7-8fd9-34a0dd57cea9','2d183174-ecaa-4508-9bf1-a09c5be3ae2c'
--   )
--   and (h.periodo_fim - h.periodo_inicio) > md.max_anos;
-- =====================================================================

BEGIN;

-- adailton-furia | Vereador | inicio 2012
--   atual  : periodo_fim = 2018 (6 anos)
--   certo  : periodo_fim = 2016
--   motivo : fechamento por Deputado Estadual (2018) excede o teto de 4 anos
--            do cargo de Vereador; capado em 2016
UPDATE public.historico_politico
   SET periodo_fim = 2016,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2018 -> 2016; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '7580e94d-2628-4f38-9892-62b941393713'::uuid
   AND periodo_fim = 2018;

-- alvaro-dias-rn | Deputado Estadual | inicio 1998
--   atual  : periodo_fim = 2014 (16 anos)
--   certo  : periodo_fim = 2002
--   motivo : fechado pelo mandato de Deputado Federal iniciado em 2002
UPDATE public.historico_politico
   SET periodo_fim = 2002,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2014 -> 2002; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '735fbda7-a27d-443a-a6f3-2a04008dd830'::uuid
   AND periodo_fim = 2014;

-- alvaro-dias-rn | Deputado Estadual | inicio 2014
--   atual  : periodo_fim = 2020 (6 anos)
--   certo  : periodo_fim = 2018
--   motivo : fechado pelo mandato de Prefeito iniciado em 2018
UPDATE public.historico_politico
   SET periodo_fim = 2018,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2020 -> 2018; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '2a225ae9-6786-4a63-8d2a-fe3cae7909f9'::uuid
   AND periodo_fim = 2020;

-- cicero-lucena | Prefeito | inicio 2000
--   atual  : periodo_fim = 2020 (20 anos)  <- este e o "Prefeito 2000-2020"
--            citado literalmente no achado V4 do laudo
--   certo  : periodo_fim = 2004
--   motivo : fechamento pelo Prefeito seguinte (2020) excede o teto de 4 anos;
--            capado em 2004
UPDATE public.historico_politico
   SET periodo_fim = 2004,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2020 -> 2004; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '785a83c3-ed52-47c0-9bf3-bbe370e3a189'::uuid
   AND periodo_fim = 2020;

-- cicero-lucena | Prefeito | inicio 2020
--   atual  : periodo_fim = 2025 (5 anos)
--   certo  : periodo_fim = 2021
--   motivo : fechado pelo mandato de Prefeito seguinte, iniciado em 2021
UPDATE public.historico_politico
   SET periodo_fim = 2021,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2025 -> 2021; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = 'f94f2e41-ce1a-4975-94dc-41f5b237dd71'::uuid
   AND periodo_fim = 2025;

-- clecio-luis | Prefeito | inicio 2016
--   atual  : periodo_fim = 2022 (6 anos)
--   certo  : periodo_fim = 2020
--   motivo : fechamento por Governador (2022) excede o teto de 4 anos do cargo
--            de Prefeito; capado em 2020
UPDATE public.historico_politico
   SET periodo_fim = 2020,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2022 -> 2020; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '812a0ea4-d71c-4797-9596-85020dd279b9'::uuid
   AND periodo_fim = 2022;

-- cleitinho | Vereador | inicio 2008
--   atual  : periodo_fim = 2020 (12 anos)
--   certo  : periodo_fim = 2012
--   motivo : fechamento por Deputado Estadual (2018) excede o teto de 4 anos;
--            capado em 2012
UPDATE public.historico_politico
   SET periodo_fim = 2012,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2020 -> 2012; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '405223fd-7c72-4498-8b84-6ce5da3ab5dc'::uuid
   AND periodo_fim = 2020;

-- daniel-vilela | Deputado Federal | inicio 2014
--   atual  : periodo_fim = 2022 (8 anos)
--   certo  : periodo_fim = 2018
--   motivo : fechamento por Vice-Governador (2022) excede o teto de 4 anos do
--            cargo de Deputado Federal; capado em 2018. Este e o caso que os
--            ceticos do laudo reclassificaram de "dado digitado errado" para
--            "bug no script", o que muda a correcao.
UPDATE public.historico_politico
   SET periodo_fim = 2018,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2022 -> 2018; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = 'c9641f96-9b4d-4545-b42d-bbb936633dd8'::uuid
   AND periodo_fim = 2022;

-- david-almeida | Deputado Estadual | inicio 2014
--   atual  : periodo_fim = 2020 (6 anos)
--   certo  : periodo_fim = 2018
--   motivo : fechamento por Prefeito (2020) excede o teto de 4 anos; capado em 2018
UPDATE public.historico_politico
   SET periodo_fim = 2018,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2020 -> 2018; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = 'db0c40f0-e178-482a-a49b-3bebb1355258'::uuid
   AND periodo_fim = 2020;

-- david-almeida | Prefeito | inicio 2020
--   atual  : periodo_fim = 2025 (5 anos)
--   certo  : periodo_fim = 2021
--   motivo : fechado pelo mandato de Prefeito seguinte, iniciado em 2021
UPDATE public.historico_politico
   SET periodo_fim = 2021,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2025 -> 2021; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '4755919a-4cf6-48ab-80b0-be1718ed3618'::uuid
   AND periodo_fim = 2025;

-- eduardo-paes | Deputado Federal | inicio 2002
--   atual  : periodo_fim = 2013 (11 anos)
--   certo  : periodo_fim = 2006
--   motivo : nenhum fechamento por proximidade dentro do teto; aplica o teto
--            puro de 4 anos do cargo de Deputado Federal
UPDATE public.historico_politico
   SET periodo_fim = 2006,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2013 -> 2006; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '49821c65-bdf9-4e72-b1fc-d1ccf8cfa507'::uuid
   AND periodo_fim = 2013;

-- eduardo-paes | Prefeito | inicio 2012
--   atual  : periodo_fim = 2020 (8 anos)
--   certo  : periodo_fim = 2016
--   motivo : fechamento pelo Prefeito seguinte (2020) excede o teto; capado em 2016
UPDATE public.historico_politico
   SET periodo_fim = 2016,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2020 -> 2016; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '687c5c87-6a59-40b1-98ce-fa19f4b436fa'::uuid
   AND periodo_fim = 2020;

-- eduardo-paes | Prefeito | inicio 2020
--   atual  : periodo_fim = 2025 (5 anos)
--   certo  : periodo_fim = 2021
--   motivo : fechado pelo mandato de Prefeito seguinte, iniciado em 2021
UPDATE public.historico_politico
   SET periodo_fim = 2021,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2025 -> 2021; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '7b0234fb-1ebe-4844-8480-c96f28443da1'::uuid
   AND periodo_fim = 2025;

-- fabio-trad | Deputado Federal | inicio 2010
--   atual  : periodo_fim = 2018 (8 anos)
--   certo  : periodo_fim = 2014
--   motivo : fechamento pelo Deputado Federal seguinte (2018) excede o teto de
--            4 anos; capado em 2014
UPDATE public.historico_politico
   SET periodo_fim = 2014,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2018 -> 2014; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '3893361d-fe76-46dc-ac42-5374f4788ccd'::uuid
   AND periodo_fim = 2018;

-- joel-rodrigues | Prefeito | inicio 2008
--   atual  : periodo_fim = 2016 (8 anos)
--   certo  : periodo_fim = 2012
--   motivo : fechamento pelo Prefeito seguinte (2013) excede o teto; capado em 2012
UPDATE public.historico_politico
   SET periodo_fim = 2012,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2016 -> 2012; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '00b19940-8c1b-4059-bab4-2cb060187fd9'::uuid
   AND periodo_fim = 2016;

-- juliana-brizola | Deputado Estadual | inicio 2010
--   atual  : periodo_fim = 2018 (8 anos)
--   certo  : periodo_fim = 2014
--   motivo : fechamento pelo Deputado Estadual seguinte (2015) excede o teto;
--            capado em 2014
UPDATE public.historico_politico
   SET periodo_fim = 2014,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2018 -> 2014; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = 'f8a07623-e47f-4281-a29d-05d4a629ea84'::uuid
   AND periodo_fim = 2018;

-- laurez-moreira | Deputado Estadual | inicio 2002
--   atual  : periodo_fim = 2012 (10 anos)
--   certo  : periodo_fim = 2006
--   motivo : fechamento por Prefeito (2012) excede o teto; capado em 2006
UPDATE public.historico_politico
   SET periodo_fim = 2006,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2012 -> 2006; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '26ed657d-3142-46c6-88f0-6bc2ca751ace'::uuid
   AND periodo_fim = 2012;

-- laurez-moreira | Prefeito | inicio 2016
--   atual  : periodo_fim = 2022 (6 anos)
--   certo  : periodo_fim = 2020
--   motivo : fechamento por Vice-Governador (2022) excede o teto; capado em 2020
UPDATE public.historico_politico
   SET periodo_fim = 2020,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2022 -> 2020; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '423d324f-7908-4916-b5e5-bb818d19fca8'::uuid
   AND periodo_fim = 2022;

-- marconi-perillo | Governador | inicio 2002
--   atual  : periodo_fim = 2010 (8 anos)
--   certo  : periodo_fim = 2006
--   motivo : fechamento pelo Governador seguinte (2010) excede o teto de 4 anos;
--            capado em 2006
UPDATE public.historico_politico
   SET periodo_fim = 2006,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2010 -> 2006; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '3e533500-94ce-4493-919b-393808cc6472'::uuid
   AND periodo_fim = 2010;

-- marcos-rogerio | Vereador | inicio 2008
--   atual  : periodo_fim = 2014 (6 anos)
--   certo  : periodo_fim = 2012
--   motivo : fechamento por Deputado Federal (2014) excede o teto; capado em 2012
UPDATE public.historico_politico
   SET periodo_fim = 2012,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2014 -> 2012; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = 'b3205417-e99e-4f31-8e8d-7da3a1d7b7be'::uuid
   AND periodo_fim = 2014;

-- mateus-simoes | Vereador | inicio 2016
--   atual  : periodo_fim = 2022 (6 anos)
--   certo  : periodo_fim = 2020
--   motivo : fechamento por Vice-Governador (2022) excede o teto; capado em 2020
UPDATE public.historico_politico
   SET periodo_fim = 2020,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2022 -> 2020; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '73b3b937-b252-40b1-9eb2-a454cbfea114'::uuid
   AND periodo_fim = 2022;

-- omar-aziz | Deputado Estadual | inicio 1994
--   atual  : periodo_fim = 2010 (16 anos)
--   certo  : periodo_fim = 1998
--   motivo : fechamento por Vice-Governador (2003) excede o teto; capado em 1998
UPDATE public.historico_politico
   SET periodo_fim = 1998,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2010 -> 1998; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = 'a16ff63e-85a6-4ba9-870c-984ca0542616'::uuid
   AND periodo_fim = 2010;

-- otaviano-pivetta | Prefeito | inicio 2000
--   atual  : periodo_fim = 2012 (12 anos)
--   certo  : periodo_fim = 2004
--   motivo : fechamento pelo Prefeito seguinte (2009) excede o teto; capado em 2004
UPDATE public.historico_politico
   SET periodo_fim = 2004,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2012 -> 2004; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '3a6fd6f3-b8f9-4a7b-8c8f-b5b111ecaa89'::uuid
   AND periodo_fim = 2012;

-- otaviano-pivetta | Deputado Estadual | inicio 2006
--   atual  : periodo_fim = 2012 (6 anos)
--   certo  : periodo_fim = 2009
--   motivo : fechado pelo mandato de Prefeito iniciado em 2009
UPDATE public.historico_politico
   SET periodo_fim = 2009,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2012 -> 2009; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = 'a86c752c-45ec-4922-b420-a893c05c3d63'::uuid
   AND periodo_fim = 2012;

-- otaviano-pivetta | Prefeito | inicio 2012
--   atual  : periodo_fim = 2018 (6 anos)
--   certo  : periodo_fim = 2016
--   motivo : fechamento por Vice-Governador (2018) excede o teto; capado em 2016
UPDATE public.historico_politico
   SET periodo_fim = 2016,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2018 -> 2016; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '80b68d5d-6a68-427b-a188-934088fe5a28'::uuid
   AND periodo_fim = 2018;

-- renan-filho | Prefeito | inicio 2008
--   atual  : periodo_fim = 2014 (6 anos)
--   certo  : periodo_fim = 2012
--   motivo : fechamento por Governador (2014) excede o teto; capado em 2012
UPDATE public.historico_politico
   SET periodo_fim = 2012,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2014 -> 2012; bug V4 do backfill-historico-periodo-fim.ts]'
 WHERE id = '470def37-f018-4dcc-a917-4ed07e42679b'::uuid
   AND periodo_fim = 2014;

-- ricardo-ferraco | Deputado Federal | inicio 1998
--   atual  : periodo_fim = 2010 (12 anos)
--   certo  : periodo_fim = 1999
--   motivo : fechado pelo mandato de Deputado Federal seguinte, iniciado em 1999
--   ATENCAO PARA O REVISOR: este e o unico dos 28 em que o valor corrigido
--   produz um periodo de 1 ano, o que e semanticamente estranho. A causa
--   aparente esta no proprio dado, nao no algoritmo: o candidato tem DUAS
--   linhas de mandato de Deputado Federal quase sobrepostas, esta
--   (5b37e3a2, 1998-2010, proveniencia tse, ou seja, ano de ELEICAO como
--   inicio) e outra (530a532b, 1999-2011, proveniencia manual, ou seja, ano de
--   POSSE como inicio). Ha forte indicio de que sao o mesmo mandato gravado
--   duas vezes com convencoes de ano diferentes. A correcao aqui pelo menos
--   remove o periodo impossivel de 12 anos; a deduplicacao das duas linhas
--   precisa de decisao editorial separada e nao foi feita nesta migration.
UPDATE public.historico_politico
   SET periodo_fim = 1999,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2010 -> 1999; bug V4 do backfill-historico-periodo-fim.ts; possivel duplicata da linha 530a532b (1999-2011), pendente de deduplicacao editorial]'
 WHERE id = '5b37e3a2-d047-45d7-8fd9-34a0dd57cea9'::uuid
   AND periodo_fim = 2010;

-- teresa-surita | Prefeito | inicio 2004
--   atual  : periodo_fim = 2012 (8 anos)
--   certo  : periodo_fim = 2006
--   motivo : eleita prefeita de Boa Vista em 2004 e, ainda no mandato,
--            registrou candidatura ao Senado em 2006 (linha
--            67508f68-8aff-4462-beb1-236d86b20560, tipo_evento = 'candidatura',
--            proveniencia tse, "Candidatura: NAO ELEITO (TSE 2006)"). Pelo
--            art. 14, par. 6 da Constituicao, prefeito que disputa outro cargo
--            renuncia ate seis meses antes do pleito, entao o mandato termina
--            em 2006.
--   ATENCAO PARA O REVISOR: esta e a unica das 28 em que o valor nao vem de
--   fechamento por mandato posterior nem do teto puro (que daria 2008), e sim
--   da renuncia por desincompatibilizacao. E a mesma regra que o script
--   corrigido aplica (candidaturaClosesMandate), e por isso e a unica linha em
--   que o replay do algoritmo novo diverge do valor que estava aqui antes.
--   Se a auditoria editorial concluir que essa candidatura de 2006 e erro de
--   identidade (homonimo), o valor correto passa a ser 2008, o teto do cargo.
UPDATE public.historico_politico
   SET periodo_fim = 2006,
       observacoes = COALESCE(observacoes, '') || ' [corrigido 2026-07-25: periodo_fim 2012 -> 2006; bug V4 do backfill-historico-periodo-fim.ts; fim pela renuncia para disputar o Senado em 2006 (CF art. 14 par. 6)]'
 WHERE id = '2d183174-ecaa-4508-9bf1-a09c5be3ae2c'::uuid
   AND periodo_fim = 2012;

COMMIT;
