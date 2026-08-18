-- =====================================================================
-- Posicoes declaradas dos pre-candidatos a Presidencia, com fonte primaria.
-- Branch data/presidenciaveis-lacunas (2026-08-02).
--
-- POR QUE ESTA MIGRATION EXISTE
-- O quiz presidencial tem 3 temas (reforma_trabalhista, teto_gastos,
-- transferencia_renda). Ate aqui, so 4 dos 11 pre-candidatos tinham posicao
-- registrada, e as linhas existentes foram gravadas com fonte generica
-- ("Curadoria Puxa Ficha") e url_fonte NULA. Esta migration adiciona somente
-- linhas NOVAS, todas com fonte nomeada e URL viva, e nao toca nas antigas.
--
-- REGRA APLICADA (a mesma do projeto): so entra posicao sustentada por
-- declaracao publica explicita do PROPRIO candidato, ou por voto nominal
-- documentado. Alinhamento ideologico presumido NAO e fonte. Onde nao houve
-- declaracao localizavel, NENHUMA linha foi gravada: o par (candidato, tema)
-- fica vazio de proposito e esta listado no bloco "SEM DECLARACAO" abaixo.
--
-- VERIFICACAO DE SUBSTANCIA (2026-08-02)
-- Cada URL foi baixada e lida nesta sessao, e o trecho que sustenta a
-- classificacao foi localizado no texto da propria pagina. Duas observacoes de
-- acesso, registradas para quem for revalidar:
--   - causaoperaria.org.br devolve HTTP 403 para cliente de linha de comando;
--     a pagina abre normalmente em navegador, e foi assim que o conteudo foi
--     lido e conferido. Nao e link morto, e bloqueio de user-agent.
--   - diariodocentrodomundo.com.br e gazetadopovo.com.br entregam o corpo por
--     JavaScript; a leitura automatica so recuperou titulo e subtitulo. Nos dois
--     casos o titulo e o subtitulo ja trazem a declaracao atribuida ao
--     candidato, e a classificacao se apoia so nisso, nao no corpo nao lido.
--
-- verificado = false em todas as linhas: fonte checada, mas ainda sem revisao
-- editorial humana. O quiz so pontua posicao com verificado = true, entao estas
-- linhas aparecem na ficha sem entrar no score ate a revisao.
--
-- SEM DECLARACAO LOCALIZADA (9 pares, nenhuma linha gravada)
--   augusto-cury      : reforma_trabalhista, teto_gastos
--   hertz-dias        : transferencia_renda
--   renan-santos      : reforma_trabalhista, teto_gastos
--   rui-costa-pimenta : reforma_trabalhista, teto_gastos
--   samara-martins    : teto_gastos, transferencia_renda
-- Em todos, o candidato fala de temas vizinhos (ajuste fiscal, austeridade,
-- CLT em geral) sem se pronunciar sobre a Lei 13.467/2017, sobre a EC 95/2016
-- ou sobre transferencia de renda nominalmente. Inferir a posicao a partir do
-- partido seria fabricar dado.
--
-- ESCOPO: so INSERT em public.posicoes_declaradas. Nenhuma outra tabela.
-- =====================================================================
--
-- ---------------------------------------------------------------------
-- REGISTRO DE APLICACAO (cabecalho que veio junto com a versao as-applied):
-- Posicoes declaradas dos pre-candidatos a Presidencia, com fonte primaria.
-- Detalhe completo, incluindo os 9 pares deixados vazios de proposito por falta
-- de declaracao localizavel, em
-- supabase/migrations/20260802130000_posicoes_declaradas_presidenciaveis_com_fonte.sql
-- verificado = false: fonte checada, sem revisao editorial humana ainda.
--
-- PROVENIENCIA (03/08/2026). Este arquivo e a versao as-applied, recuperada
-- por `supabase migration fetch`, e e o nome que o ledger de producao conhece.
-- O raciocinio acima foi portado de 20260802130000_posicoes_declaradas_presidenciaveis_com_fonte.sql,
-- escrita a mao e deixada em branch nao mergeada. O SQL das duas e identico,
-- conferido por comparacao normalizada. So comentario mudou aqui.
-- ---------------------------------------------------------------------

INSERT INTO public.posicoes_declaradas (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'transferencia_renda', 'a_favor',
       'Disse que, se eleito, vai reverter a regra do Bolsa Familia que corta o beneficio quando a pessoa consegue emprego ou abre um pequeno negocio.',
       'Metropoles, cobertura da Marcha dos Prefeitos (21/05/2026)',
       'https://www.metropoles.com/brasil/marcha-dos-prefeitos-presidenciavel-augusto-cury-critica-polarizacao',
       false, 'curadoria'
FROM public.candidatos c
WHERE c.slug = 'augusto-cury'
  AND NOT EXISTS (SELECT 1 FROM public.posicoes_declaradas p WHERE p.candidato_id = c.id AND p.tema = 'transferencia_renda');

-- Voto nominal conferido na API oficial: votacao 2122076-348, "Cabo Daciolo,
-- PTdoB/RJ, Nao", carimbo 2017-04-26T21:57:12.
INSERT INTO public.posicoes_declaradas (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'reforma_trabalhista', 'contra',
       'Votou Nao na votacao nominal que aprovou o texto-base da reforma trabalhista na Camara, em 26/04/2017, quando era deputado federal pelo RJ.',
       'Camara dos Deputados, votacao nominal 2122076-348 (Dados Abertos)',
       'https://dadosabertos.camara.leg.br/api/v2/votacoes/2122076-348/votos?formato=json',
       false, 'curadoria'
FROM public.candidatos c
WHERE c.slug = 'cabo-daciolo'
  AND NOT EXISTS (SELECT 1 FROM public.posicoes_declaradas p WHERE p.candidato_id = c.id AND p.tema = 'reforma_trabalhista');

-- Voto nominal conferido na API oficial: votacao 2088351-324, "Cabo Daciolo,
-- PTdoB/RJ, Nao", carimbo 2016-10-25T20:24:03.
INSERT INTO public.posicoes_declaradas (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'teto_gastos', 'contra',
       'Votou Nao na votacao nominal em segundo turno da PEC 241/2016, o teto de gastos, na Camara, em 25/10/2016.',
       'Camara dos Deputados, votacao nominal 2088351-324 (Dados Abertos)',
       'https://dadosabertos.camara.leg.br/api/v2/votacoes/2088351-324/votos?formato=json',
       false, 'curadoria'
FROM public.candidatos c
WHERE c.slug = 'cabo-daciolo'
  AND NOT EXISTS (SELECT 1 FROM public.posicoes_declaradas p WHERE p.candidato_id = c.id AND p.tema = 'teto_gastos');

INSERT INTO public.posicoes_declaradas (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'transferencia_renda', 'a_favor',
       'Em debate presidencial no SBT, disse que quem fala em acabar com Prouni, Fies e Bolsa Familia nunca passou necessidade.',
       'Diario do Centro do Mundo, cobertura de debate presidencial no SBT (26/09/2018)',
       'https://www.diariodocentrodomundo.com.br/essencial/cabo-daciolo-quem-fala-que-vai-acabar-com-o-prouni-fies-e-bolsa-familia-nunca-passou-necessidade/',
       false, 'curadoria'
FROM public.candidatos c
WHERE c.slug = 'cabo-daciolo'
  AND NOT EXISTS (SELECT 1 FROM public.posicoes_declaradas p WHERE p.candidato_id = c.id AND p.tema = 'transferencia_renda');

INSERT INTO public.posicoes_declaradas (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'reforma_trabalhista', 'contra',
       'Em entrevista, cobrou do governo revogar a reforma trabalhista e rever a reforma da Previdencia, promessas que segundo ele nao foram cumpridas.',
       'PCB, entrevista a Opera Mundi republicada no portal do partido (17/03/2026)',
       'https://pcb.org.br/portal2/33754',
       false, 'curadoria'
FROM public.candidatos c
WHERE c.slug = 'edmilson-costa'
  AND NOT EXISTS (SELECT 1 FROM public.posicoes_declaradas p WHERE p.candidato_id = c.id AND p.tema = 'reforma_trabalhista');

INSERT INTO public.posicoes_declaradas (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'teto_gastos', 'contra',
       'Declarou ser favoravel a revogacao da emenda constitucional do teto de gastos, ao lado das reformas da Previdencia e trabalhista.',
       'Uniao da Juventude Comunista, entrevista com Edmilson Costa (04/05/2020)',
       'https://ujc.org.br/entrevista-com-o-camarada-edmilson-costa-a-vida-acima-do-lucro-quem-paga-pela-crise/',
       false, 'curadoria'
FROM public.candidatos c
WHERE c.slug = 'edmilson-costa'
  AND NOT EXISTS (SELECT 1 FROM public.posicoes_declaradas p WHERE p.candidato_id = c.id AND p.tema = 'teto_gastos');

-- Limite explicito desta linha: na fonte ele reivindica renda minima para
-- informais, sem citar Bolsa Familia ou Auxilio Brasil pelo nome.
INSERT INTO public.posicoes_declaradas (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'transferencia_renda', 'a_favor',
       'Reivindicou renda minima de um salario minimo para todos os trabalhadores informais e, na fonte, nao cita Bolsa Familia ou Auxilio Brasil pelo nome.',
       'Uniao da Juventude Comunista, entrevista com Edmilson Costa (04/05/2020)',
       'https://ujc.org.br/entrevista-com-o-camarada-edmilson-costa-a-vida-acima-do-lucro-quem-paga-pela-crise/',
       false, 'curadoria'
FROM public.candidatos c
WHERE c.slug = 'edmilson-costa'
  AND NOT EXISTS (SELECT 1 FROM public.posicoes_declaradas p WHERE p.candidato_id = c.id AND p.tema = 'transferencia_renda');

INSERT INTO public.posicoes_declaradas (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'transferencia_renda', 'a_favor',
       'Prometeu manter o Bolsa Familia e propos um cashback no programa para estimular qualificacao profissional.',
       'Gazeta do Povo, cobertura de entrevista ao podcast Flow (16/07/2026)',
       'https://www.gazetadopovo.com.br/eleicoes/2026/flavio-bolsonaro-promete-manter-bolsa-familia-e-criar-cashback-para-incentivar-qualificacao/',
       false, 'curadoria'
FROM public.candidatos c
WHERE c.slug = 'flavio-bolsonaro'
  AND NOT EXISTS (SELECT 1 FROM public.posicoes_declaradas p WHERE p.candidato_id = c.id AND p.tema = 'transferencia_renda');

INSERT INTO public.posicoes_declaradas (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'reforma_trabalhista', 'contra',
       'Em sabatina, defendeu revogar a reforma trabalhista, que segundo ele ampliou a precarizacao das relacoes de trabalho.',
       'Correio Braziliense, sabatina de pre-candidatos a Presidencia (28/07/2026)',
       'https://www.correiobraziliense.com.br/politica/2026/07/7469218-presidenciavel-hertz-dias-defende-revogacao-do-arcabouco-fiscal-e-reformas.html',
       false, 'curadoria'
FROM public.candidatos c
WHERE c.slug = 'hertz-dias'
  AND NOT EXISTS (SELECT 1 FROM public.posicoes_declaradas p WHERE p.candidato_id = c.id AND p.tema = 'reforma_trabalhista');

INSERT INTO public.posicoes_declaradas (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'teto_gastos', 'contra',
       'Na mesma sabatina, disse que vai revogar o arcabouco fiscal, que classificou como maquiagem do antigo teto de gastos.',
       'Correio Braziliense, sabatina de pre-candidatos a Presidencia (28/07/2026)',
       'https://www.correiobraziliense.com.br/politica/2026/07/7469218-presidenciavel-hertz-dias-defende-revogacao-do-arcabouco-fiscal-e-reformas.html',
       false, 'curadoria'
FROM public.candidatos c
WHERE c.slug = 'hertz-dias'
  AND NOT EXISTS (SELECT 1 FROM public.posicoes_declaradas p WHERE p.candidato_id = c.id AND p.tema = 'teto_gastos');

-- Ambiguo por contradicao documentada na propria materia: o plano de governo do
-- partido, enviado ao TSE em 21/07/2026, propoe substituir o Bolsa Familia, e
-- dois dias depois ele disse que manteria o programa.
INSERT INTO public.posicoes_declaradas (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'transferencia_renda', 'ambiguo',
       'Disse que o Bolsa Familia sera mantido para quem precisa e que criara portas de saida, embora o plano de governo do partido proponha substituir o programa.',
       'g1 MS, cobertura de agenda em Campo Grande (23/07/2026)',
       'https://g1.globo.com/ms/mato-grosso-do-sul/noticia/2026/07/23/apos-plano-de-governo-propor-fim-do-bolsa-familia-renan-santos-promete-manter-programa-e-criar-portas-de-saida.ghtml',
       false, 'curadoria'
FROM public.candidatos c
WHERE c.slug = 'renan-santos'
  AND NOT EXISTS (SELECT 1 FROM public.posicoes_declaradas p WHERE p.candidato_id = c.id AND p.tema = 'transferencia_renda');

INSERT INTO public.posicoes_declaradas (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'transferencia_renda', 'ambiguo',
       'Em sabatina, chamou o Bolsa Familia de programa estagnado e defendeu foco em emprego e industrializacao em vez de auxilios permanentes, sem pedir o fim do programa.',
       'Diario Causa Operaria, cobertura de sabatina no canal Redcast (11/05/2026)',
       'https://causaoperaria.org.br/2026/rui-pimenta-e-sabatinado-pelos-redpills/',
       false, 'curadoria'
FROM public.candidatos c
WHERE c.slug = 'rui-costa-pimenta'
  AND NOT EXISTS (SELECT 1 FROM public.posicoes_declaradas p WHERE p.candidato_id = c.id AND p.tema = 'transferencia_renda');

INSERT INTO public.posicoes_declaradas (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'reforma_trabalhista', 'contra',
       'Em entrevista, disse que e preciso revogar as reformas trabalhista e da Previdencia, que desconsideram o trabalho domestico e as especificidades das trabalhadoras.',
       'Mulher em Pauta, entrevista com a pre-candidata (11/02/2026)',
       'https://mulherempauta.com/2026/02/11/entrevista-exclusiva-com-pre-candidata-a-presidencia-da-republica-samara-martins-da-silva/',
       false, 'curadoria'
FROM public.candidatos c
WHERE c.slug = 'samara-martins'
  AND NOT EXISTS (SELECT 1 FROM public.posicoes_declaradas p WHERE p.candidato_id = c.id AND p.tema = 'reforma_trabalhista');;
