-- Run local v3 governadores AL.
-- Fontes foram verificadas contra o conteúdo das páginas; verificado permanece false
-- para revisão editorial posterior.
--
-- HISTÓRICO DE APLICAÇÃO. Nasceu com "NÃO APLICAR neste run", que era adiamento
-- daquele run e não proibição permanente. Aplicada em 03/08/2026 por decisão
-- explícita do Thiago, junto com as três migrations pendentes de AC e Eletrobras.
--
-- POR QUE É SEGURA MESMO ANTES DO LANÇAMENTO. As quatro linhas de
-- posicoes_declaradas entram com `verificado = false`, e a consulta do quiz em
-- src/lib/api.ts filtra por `.eq("verificado", true)`. Ou seja, elas ficam
-- fora do quiz e da superfície pública até alguém revisar e virar a chave.
-- O único efeito visível ao leitor é o `profissao_declarada` do renan-filho,
-- que vem de fonte oficial do Governo Federal citada abaixo. E ele corrige um
-- defeito real: o campo estava com 'Q82955', id do Wikidata no lugar da
-- profissão, um dos ~40 casos desse tipo que o banco ainda tem.
--
-- CORREÇÃO DE 03/08/2026, POR QUE A PRIMEIRA TENTATIVA FALHOU. A versão original
-- escrevia prosa em `posicao` ('contra a reforma trabalhista de 2017'), e a
-- coluna tem CHECK que só admite 'a_favor', 'contra' ou 'ambiguo'. A migration
-- abortava inteira no primeiro INSERT, então nunca teria rodado como estava.
-- A prosa não se perdeu: `descricao` já a carrega por completo, que é a
-- convenção das linhas existentes na tabela.
--
-- UMA DAS QUATRO PEDE OLHO EDITORIAL. renan-filho / reforma_trabalhista ficou
-- 'contra', mas a fonte é declaração sobre o FIM DA ESCALA 6x1, não sobre o
-- texto da reforma de 2017. É leitura defensável (posição pró-trabalhador no
-- tema trabalhista, mesmo padrão da linha que mapeia "agenda economica liberal"
-- para a_favor sem voto nominal), e não é dedução automática. Como entra com
-- `verificado = false`, ninguém vê até revisão. Se discordar, o balde honesto
-- é 'ambiguo'.
BEGIN;

-- @write tabela=posicoes_declaradas slug=jhc tema=reforma_trabalhista campos=posicao,descricao,fonte,url_fonte,verificado,gerado_por
-- Fonte primária: página oficial de votações nominais da Câmara para o deputado JHC,
-- 26/04/2017, com Não na subemenda substantiva do PL 6787/2016.
INSERT INTO public.posicoes_declaradas
  (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'reforma_trabalhista', 'contra',
  'A página oficial de votações nominais registra voto Não de JHC na subemenda substitutiva global do PL 6787/2016 em 26/04/2017.',
  'Câmara dos Deputados — Votações nominais de JHC em 2017',
  'https://www.camara.leg.br/deputados/178842/votacoes-nominais-plenario/2017', false, 'curadoria'
FROM public.candidatos c WHERE c.slug = 'jhc'
ON CONFLICT (candidato_id, tema) DO UPDATE SET
  posicao = EXCLUDED.posicao, descricao = EXCLUDED.descricao, fonte = EXCLUDED.fonte,
  url_fonte = EXCLUDED.url_fonte, verificado = false, gerado_por = 'curadoria';

-- @write tabela=posicoes_declaradas slug=renan-filho tema=reforma_trabalhista campos=posicao,descricao,fonte,url_fonte,verificado,gerado_por
-- Fonte de imprensa com transcrição de fala do candidato, 29/05/2026.
INSERT INTO public.posicoes_declaradas
  (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'reforma_trabalhista', 'contra',
  'Em entrevista à Rádio Correio Delmiro, Renan Filho declarou apoio integral ao fim da escala 6x1 e chamou a medida de avanço social e trabalhista.',
  'Cada Minuto — declaração de Renan Filho sobre fim da escala 6x1',
  'https://www.cadaminuto.com.br/noticia/2026/05/29/trabalhador-tem-direito-de-viver-com-a-familia-diz-renan-filho-sobre-fim-da-escala-6x1', false, 'curadoria'
FROM public.candidatos c WHERE c.slug = 'renan-filho'
ON CONFLICT (candidato_id, tema) DO UPDATE SET
  posicao = EXCLUDED.posicao, descricao = EXCLUDED.descricao, fonte = EXCLUDED.fonte,
  url_fonte = EXCLUDED.url_fonte, verificado = false, gerado_por = 'curadoria';

-- @write tabela=posicoes_declaradas slug=renan-filho tema=teto_gastos campos=posicao,descricao,fonte,url_fonte,verificado,gerado_por
-- Fonte primária: notas taquigráficas do Senado, 21/03/2023.
INSERT INTO public.posicoes_declaradas
  (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'teto_gastos', 'contra',
  'Nas notas taquigráficas de audiência no Senado, Renan Filho atribuiu ao regime fiscal balizado pelo teto de gastos a baixa capacidade de investimento dos anos anteriores.',
  'Senado Federal — Notas taquigráficas da audiência de infraestrutura',
  'https://www25.senado.leg.br/web/atividade/notas-taquigraficas/-/notas/r/11153', false, 'curadoria'
FROM public.candidatos c WHERE c.slug = 'renan-filho'
ON CONFLICT (candidato_id, tema) DO UPDATE SET
  posicao = EXCLUDED.posicao, descricao = EXCLUDED.descricao, fonte = EXCLUDED.fonte,
  url_fonte = EXCLUDED.url_fonte, verificado = false, gerado_por = 'curadoria';

-- @write tabela=posicoes_declaradas slug=renan-filho tema=transferencia_renda campos=posicao,descricao,fonte,url_fonte,verificado,gerado_por
-- Fonte institucional municipal de Alagoas, 03/02/2021.
INSERT INTO public.posicoes_declaradas
  (candidato_id, tema, posicao, descricao, fonte, url_fonte, verificado, gerado_por)
SELECT c.id, 'transferencia_renda', 'a_favor',
  'O programa CRIA, lançado pelo governador Renan Filho, foi descrito como benefício de transferência de renda para famílias com crianças pequenas.',
  'Prefeitura de Palmeira dos Índios — Programa social CRIA',
  'https://palmeiradosindios.al.gov.br/noticia/programa-social-beneficia-familias-em-palmeira-dos-indios/', false, 'curadoria'
FROM public.candidatos c WHERE c.slug = 'renan-filho'
ON CONFLICT (candidato_id, tema) DO UPDATE SET
  posicao = EXCLUDED.posicao, descricao = EXCLUDED.descricao, fonte = EXCLUDED.fonte,
  url_fonte = EXCLUDED.url_fonte, verificado = false, gerado_por = 'curadoria';

-- @write tabela=candidatos slug=renan-filho campos=profissao_declarada
-- Fonte oficial do Governo Federal, 02/01/2023: economista formado pela UnB.
-- URL: https://www.gov.br/portos-e-aeroportos/pt-br/assuntos/noticias/2023/01/presidente-lula-da-posse-aos-novos-ministros-da-infraestrutura-brasileira-de-transportes
UPDATE public.candidatos
SET profissao_declarada = 'ECONOMISTA'
WHERE slug = 'renan-filho';

COMMIT;
