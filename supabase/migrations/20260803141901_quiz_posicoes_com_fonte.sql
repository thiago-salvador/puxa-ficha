-- =====================================================================
-- O quiz passa a pontuar tambem pelas posicoes que TEM fonte.
-- Aprovado por Thiago em 2026-08-03 (payload quiz-e-execucao, C1 e C2).
--
-- O PROBLEMA QUE ISTO RESOLVE
-- O quiz so considera posicao com `verificado = true`. Hoje sao 14, e as 14
-- tem `url_fonte` nula e fonte generica "Curadoria Puxa Ficha". As 13 posicoes
-- com fonte real e URL conferida estao com `verificado = false` e nao entram.
--
-- O efeito visivel nao era "mistura de fontes boas e ruins", era EXCLUSAO:
-- das 11 pre-candidaturas publicas a Presidencia, so 4 apareciam no quiz
-- (lula, flavio-bolsonaro, romeu-zema, ronaldo-caiado). Os outros 7 nao
-- entravam no resultado de jeito nenhum, e sao justamente PSTU, PCB, PCO e os
-- nomes menores. Num site de transparencia eleitoral, o quiz devolvia so os
-- quatro grandes.
--
-- O QUE ESTE PASSO FAZ, E O QUE ELE NAO FAZ
-- Faz: liga as 13 com fonte, levando o quiz de 4 para 11 candidatos.
-- Nao faz: nao desliga as 11 sem fonte de lula, zema, caiado e flavio.
-- Desligar agora tiraria o favorito do quiz e deixaria o leitor sem poder se
-- comparar com quem lidera a corrida. Elas ficam ligadas enquanto a fonte e
-- buscada, e saem se nao se sustentarem. Passo intermediario declarado, nao o
-- estado final desejado.
--
-- POR QUE UM UPDATE POR CANDIDATO, E NAO UM SO EM LOTE
-- A primeira versao desta migration fazia um UPDATE unico com o criterio
-- `url_fonte IS NOT NULL`, anotado como escrita de referencia. Para satisfazer
-- a checagem de identidade do gate eu tinha acrescentado uma condicao inutil
-- ao WHERE, so para o identificador aparecer no SQL. Isso e poluir o dado para
-- agradar a ferramenta. Cada candidato ganha o proprio statement, declarado
-- com o proprio slug, que e o desenho que o gate espera e deixa a escrita
-- auditavel candidato a candidato.
--
-- A guarda `url_fonte IS NOT NULL AND verificado = false` fica em todos os
-- statements: e exatamente a diferenca entre os dois grupos, e impede ligar
-- por engano qualquer posicao sem lastro. Sao 13 linhas no total.
--
-- tarcisio: 3 posicoes contavam como curadoria valida para um candidato com
-- `status = removido` e `publicavel = false`. Nao afetavam o resultado, porque
-- o quiz so busca a coorte publica, mas sujavam a contagem e apareciam como se
-- fossem curadoria viva. Vao para `verificado = false`.
--
-- augusto-cury: o Thiago observou que o candidato falou "revisar" e o texto
-- dizia "reverter". A materia do Metropoles de fato usa "reverter", e
-- "revisar" nao aparece nela. Mas "reverter" e palavra da reportagem, nao
-- citacao do candidato, e o texto publicado atribuia o verbo a ele. A
-- reescrita devolve o verbo a quem o escreveu.
-- =====================================================================
--
-- ---------------------------------------------------------------------
-- REGISTRO DE APLICACAO (cabecalho que veio junto com a versao as-applied):
-- O quiz passa a pontuar tambem pelas posicoes que TEM fonte.
-- Aprovado por Thiago em 2026-08-03 (payload quiz-e-execucao, C1 e C2).
-- Um UPDATE por candidato, cada um declarado com o proprio slug.

-- @write tabela=posicoes_declaradas slug=augusto-cury campos=verificado
--
-- PROVENIENCIA (03/08/2026). Este arquivo e a versao as-applied, recuperada
-- por `supabase migration fetch`, e e o nome que o ledger de producao conhece.
-- O raciocinio acima foi portado de 20260803140000_quiz_posicoes_com_fonte.sql,
-- escrita a mao e deixada em branch nao mergeada. O SQL das duas e identico,
-- conferido por comparacao normalizada. So comentario mudou aqui.
-- ---------------------------------------------------------------------

UPDATE public.posicoes_declaradas p SET verificado = true
FROM public.candidatos c
WHERE c.id = p.candidato_id AND c.slug = 'augusto-cury'
  AND p.url_fonte IS NOT NULL AND p.verificado = false;

-- @write tabela=posicoes_declaradas slug=cabo-daciolo campos=verificado
UPDATE public.posicoes_declaradas p SET verificado = true
FROM public.candidatos c
WHERE c.id = p.candidato_id AND c.slug = 'cabo-daciolo'
  AND p.url_fonte IS NOT NULL AND p.verificado = false;

-- @write tabela=posicoes_declaradas slug=edmilson-costa campos=verificado
UPDATE public.posicoes_declaradas p SET verificado = true
FROM public.candidatos c
WHERE c.id = p.candidato_id AND c.slug = 'edmilson-costa'
  AND p.url_fonte IS NOT NULL AND p.verificado = false;

-- @write tabela=posicoes_declaradas slug=flavio-bolsonaro campos=verificado
UPDATE public.posicoes_declaradas p SET verificado = true
FROM public.candidatos c
WHERE c.id = p.candidato_id AND c.slug = 'flavio-bolsonaro'
  AND p.url_fonte IS NOT NULL AND p.verificado = false;

-- @write tabela=posicoes_declaradas slug=hertz-dias campos=verificado
UPDATE public.posicoes_declaradas p SET verificado = true
FROM public.candidatos c
WHERE c.id = p.candidato_id AND c.slug = 'hertz-dias'
  AND p.url_fonte IS NOT NULL AND p.verificado = false;

-- @write tabela=posicoes_declaradas slug=renan-santos campos=verificado
UPDATE public.posicoes_declaradas p SET verificado = true
FROM public.candidatos c
WHERE c.id = p.candidato_id AND c.slug = 'renan-santos'
  AND p.url_fonte IS NOT NULL AND p.verificado = false;

-- @write tabela=posicoes_declaradas slug=rui-costa-pimenta campos=verificado
UPDATE public.posicoes_declaradas p SET verificado = true
FROM public.candidatos c
WHERE c.id = p.candidato_id AND c.slug = 'rui-costa-pimenta'
  AND p.url_fonte IS NOT NULL AND p.verificado = false;

-- @write tabela=posicoes_declaradas slug=samara-martins campos=verificado
UPDATE public.posicoes_declaradas p SET verificado = true
FROM public.candidatos c
WHERE c.id = p.candidato_id AND c.slug = 'samara-martins'
  AND p.url_fonte IS NOT NULL AND p.verificado = false;

-- @write tabela=posicoes_declaradas slug=tarcisio campos=verificado
UPDATE public.posicoes_declaradas p SET verificado = false
FROM public.candidatos c
WHERE c.id = p.candidato_id AND c.slug = 'tarcisio'
  AND c.publicavel = false AND p.verificado = true;

-- @write tabela=posicoes_declaradas slug=augusto-cury campos=descricao
UPDATE public.posicoes_declaradas p
SET descricao = 'A cobertura do Metrópoles sobre a Marcha dos Prefeitos registra que ele defendeu mudar a regra do Bolsa Família que corta o benefício quando a pessoa consegue emprego ou abre um pequeno negócio. O verbo "reverter" é da reportagem; a matéria não traz citação literal do candidato sobre esse ponto.'
FROM public.candidatos c
WHERE c.id = p.candidato_id AND c.slug = 'augusto-cury'
  AND p.tema = 'transferencia_renda';;
