-- =====================================================================
-- Etapa 1A da auditoria de integridade (docs/auditoria-integridade-2026-07-24.md, achado V1).
--
-- O QUE ESTA MIGRATION CORRIGE
-- 18 pontos de atencao publicados (publicavel = true, visivel = true) tinham
-- como fonte UNICA uma URL que retorna HTTP 404. 17 dos 18 estao marcados
-- gerado_por = 'ia' E verificado = true, ou seja, o campo que deveria ser a
-- garantia editorial afirma que alguem conferiu uma fonte que nao existe.
-- O padrao das URLs indica citacao fabricada, nao link que expirou.
--
-- Esta migration trata SO a substituicao de fonte: das 18 claims, 12 ganharam
-- uma fonte viva, testada e citada literalmente. As outras 6 nao tem fonte
-- nenhuma e saem do ar na migration seguinte
-- (20260725133000_despublicacao_claims_sem_fonte_etapa1a.sql), que tambem
-- despublica 8 destas 12, porque a fonte viva encontrada sustenta apenas
-- parte do que o texto publicado afirma.
--
-- Divisao das 12 desta migration:
--   BLOCO 1 (4 claims): a fonte viva sustenta a afirmacao como publicada.
--                       Troca a URL, a claim continua no ar.
--   BLOCO 2 (8 claims): a fonte viva sustenta o nucleo, mas o texto publicado
--                       afirma mais do que ela (ou, em 3 casos, o contrario
--                       dela). A fonte real e anexada aqui para que a reescrita
--                       editorial ja tenha lastro, e a claim sai do ar na
--                       migration seguinte ate que essa reescrita aconteca.
--
-- Nada e deletado. Toda troca e por id explicito e condicionada a URL morta
-- ainda estar la, o que torna a migration idempotente e a reversao mecanica
-- (o valor antigo esta no comentario acima de cada UPDATE).
--
-- HIERARQUIA DE FONTE APLICADA
-- Fonte primaria oficial vence imprensa. Das 12, sete passaram a citar STF,
-- Planalto, Senado ou Camara. As URLs inventadas apontavam todas para
-- imprensa (g1, Folha, BBC, Intercept, ONU, gov.br).
--
-- TESTE DE URL REEXECUTADO NESTA ETAPA, NAO HERDADO
-- Comando: curl -s -o /dev/null -w "%{http_code}" -A "<UA de Chrome 126 no
-- macOS>" -L --max-time 45 <url>. As 15 URLs novas responderam 200 em
-- 2026-07-25. Cinco trechos literais (STF/Lula, LC 200, Lei 10.836, CNN/mansao,
-- STF/RRF-MG) foram reextraidos do HTML nesta mesma etapa, nao copiados do
-- dossie anterior.
--
-- ---------------------------------------------------------------------
-- SELECT DE VALIDACAO EXECUTADO ANTES DE ESCREVER ESTE ARQUIVO
-- (producao, somente leitura, 2026-07-25)
--
--   select p.id, c.slug, p.gravidade, p.gerado_por, p.verificado, p.visivel,
--          p.titulo, p.fontes::text
--   from public.pontos_atencao p
--   join public.candidatos c on c.id = p.candidato_id
--   where p.id in (<os 18 ids>)
--   order by c.slug, p.gravidade;
--
-- Resultado observado: 18 linhas, TODAS com visivel = true, TODAS com fontes
-- sendo um array de um unico objeto cuja url e a URL morta citada no
-- comentario de cada UPDATE abaixo. 17 com gerado_por = 'ia' e
-- verificado = true; a excecao e 8b186e05 (renan-santos), gerado_por =
-- 'curadoria' e verificado = false, que e o caso do achado V2 do laudo.
--
-- SELECT QUE PROVA O RESULTADO ESPERADO DEPOIS
--
--   select c.slug, p.titulo, f->>'url' as url
--   from public.pontos_atencao p
--   join public.candidatos c on c.id = p.candidato_id,
--        lateral jsonb_array_elements(p.fontes) f
--   where p.id in (<os 12 ids desta migration>)
--   order by c.slug;
--   -- esperado: 15 linhas de fonte (3 claims recebem 2 fontes cada),
--   -- nenhuma delas em g1.globo.com, www1.folha.uol.com.br, bbc.com,
--   -- theintercept.com ou news.un.org.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- BLOCO 1: a fonte viva sustenta a afirmacao como publicada (4 claims)
-- Estas continuam visiveis.
-- ---------------------------------------------------------------------

-- flavio-bolsonaro | alta | "Mansão de R$ 6 milhões comprada durante mandato"
-- Antes: https://www1.folha.uol.com.br/poder/2021/flavio-bolsonaro-mansao-brasilia.shtml (404)
-- Prova (CNN Brasil, 01/03/2021, HTTP 200 em 2026-07-25, trecho reextraido
-- do articleBody da propria pagina nesta etapa):
--   "O senador Flavio Bolsonaro (Republicanos-RJ) comprou uma casa em Brasilia
--    avaliada em quase R$ 6 milhoes. O imovel tem mais de mil metros quadrados
--    e fica localizada no Lago Sul, um bairro nobre da capital federal. (...)
--    Flavio e a esposa, Fernanda, assinaram juntos a escritura. Parte do imovel
--    foi financiado pelo Banco de Brasilia."
-- ATENCAO PARA O REVISOR: a fonte diz "quase R$ 6 milhoes" (R$ 5,9 milhoes).
-- O titulo publicado afirma "R$ 6 milhoes". A URL fica correta com este
-- update, mas o numero do titulo deveria virar "quase R$ 6 milhoes" para
-- bater com a fonte. Isso e edicao de texto, fora do escopo desta migration.
UPDATE public.pontos_atencao
SET fontes = '[{"url": "https://www.cnnbrasil.com.br/politica/2021/03/01/flavio-bolsonaro-compra-mansao-avaliada-em-r-6-milhoes-em-brasilia", "data": "2021-03-01", "titulo": "CNN Brasil: Flávio Bolsonaro compra mansão avaliada em R$ 6 milhões em Brasília"}]'::jsonb
WHERE id = '9c933004-b41a-408a-82f5-2bbaa29dd74c'
  AND fontes -> 0 ->> 'url' = 'https://www1.folha.uol.com.br/poder/2021/flavio-bolsonaro-mansao-brasilia.shtml';

-- flavio-bolsonaro | alta | "Discurso anticorrupção vs investigações proprias"
-- Antes: https://www.bbc.com/portuguese/brasil-57283sjr (404)
-- Prova (Consultor Juridico, 04/11/2020, HTTP 200 em 2026-07-25):
--   "O Ministerio Publico do Rio de Janeiro denunciou ao Orgao Especial do
--    Tribunal de Justica fluminense o senador Flavio Bolsonaro (Republicanos-RJ)
--    e seu ex-assessor (...) por peculato, lavagem de dinheiro, apropriacao
--    indebita e organizacao criminosa por um esquema de 'rachadinha', ocorrido
--    entre 2007 e 2018, no gabinete do politico quando ele era deputado
--    estadual do Rio."
-- A claim afirma que ele foi investigado por rachadinha e lavagem de dinheiro.
-- A fonte sustenta mais que isso (denuncia formal, estagio processual
-- posterior a investigacao), entao a afirmacao publicada esta coberta.
-- Fonte de hierarquia melhor seria a peca do MPRJ; a ConJur foi o registro
-- publico mais proximo que respondeu 200.
UPDATE public.pontos_atencao
SET fontes = '[{"url": "https://www.conjur.com.br/2020-nov-04/mp-denuncia-flavio-bolsonaro-esquema-rachadinha-alerj/", "data": "2020-11-04", "titulo": "Consultor Jurídico: MP denuncia Flávio Bolsonaro por esquema de rachadinha na Alerj"}]'::jsonb
WHERE id = 'c27b6be2-3526-4304-b506-c76a9eb0f1a9'
  AND fontes -> 0 ->> 'url' = 'https://www.bbc.com/portuguese/brasil-57283sjr';

-- lula | media | "Critica teto de gastos mas governo mantém limites fiscais"
-- Antes: https://www.gov.br/fazenda/pt-br/assuntos/noticias/2023/agosto/novo-arcabouco-fiscal-e-sancionado (404)
-- Prova (Presidencia da Republica, Lei Complementar 200/2023, HTTP 200 em
-- 2026-07-25, trecho reextraido do texto da lei nesta etapa):
--   "O crescimento real dos limites da despesa primaria, nos casos previstos
--    nos incisos I e II do caput deste artigo, nao sera inferior a 0,6% a.a.
--    (seis decimos por cento ao ano) nem superior a 2,5% a.a. (dois inteiros
--    e cinco decimos por cento ao ano)."
-- O teto de 2,5% ao ano citado na descricao esta no texto da lei, palavra por
-- palavra. Esta e a unica das 18 que ganha uma fonte MELHOR que a original:
-- sai de uma noticia de ministerio para o diploma legal.
UPDATE public.pontos_atencao
SET fontes = '[{"url": "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp200.htm", "data": "2023-08-30", "titulo": "Lei Complementar nº 200, de 30 de agosto de 2023 (regime fiscal sustentável), Presidência da República"}]'::jsonb
WHERE id = '82948730-583c-4e63-abb4-13b4f9df6f95'
  AND fontes -> 0 ->> 'url' = 'https://www.gov.br/fazenda/pt-br/assuntos/noticias/2023/agosto/novo-arcabouco-fiscal-e-sancionado';

-- ronaldo-caiado | media | "De opositor de Bolsonaro a aliado e de volta a opositor"
-- Antes: https://g1.globo.com/go/goias/noticia/2020/03/20/caiado-critica-bolsonaro-apos-pronunciamento.ghtml (404)
-- Prova (Terra, HTTP 200 em 2026-07-25):
--   "Caiado apoiou a candidatura de Bolsonaro a Presidencia da Republica no
--    segundo turno das eleicoes de 2018. No inicio do mandato do ex-presidente,
--    o goiano se consolidou como um dos aliados mais proximos (...). O primeiro
--    rompimento ocorreu em marco de 2020, quando os primeiros casos de
--    coronavirus foram confirmados no Pais."
-- Inclui fala do proprio candidato: "Fui aliado de primeira hora, durante todo
-- tempo, mas nao posso admitir que venha agora um presidente da Republica
-- lavar as maos (...)".
-- O campo "data" traz a DATA DE ACESSO: a pagina nao publica data de
-- publicacao legivel e eu nao invento data que nao li.
-- ATENCAO PARA O REVISOR: (i) Terra e portal de imprensa, hierarquia inferior
-- a fonte primaria; trocar quando houver registro oficial equivalente.
-- (ii) as reaproximacoes e rupturas de 2021 e 2023 mencionadas na descricao
-- NAO estao cobertas por este trecho, e a frase final "Oscilacao de posicao
-- conforme conveniencia politica" e juizo editorial, nao achado apurado.
UPDATE public.pontos_atencao
SET fontes = '[{"url": "https://www.terra.com.br/noticias/brasil/politica/caiado-e-bolsonaro-entre-tapas-e-beijos-entenda-as-idas-e-vindas-da-relacao-entre-os-politicos,27fcb4261c734a7c227652f89d6ff165uq8ln4jg.html", "data": "2026-07-25", "titulo": "Terra: Caiado e Bolsonaro entre tapas e beijos, as idas e vindas da relação entre os políticos (data de acesso)"}]'::jsonb
WHERE id = '8ef45b5e-93e6-4ba9-9bdd-a2985e7d2f16'
  AND fontes -> 0 ->> 'url' = 'https://g1.globo.com/go/goias/noticia/2020/03/20/caiado-critica-bolsonaro-apos-pronunciamento.ghtml';

-- ---------------------------------------------------------------------
-- BLOCO 2: fonte viva anexada, mas o texto publicado excede ou contraria
-- o que ela sustenta (8 claims)
--
-- Aqui a fonte entra para que a reescrita editorial ja tenha lastro. A claim
-- sai do ar na migration seguinte e so volta quando o texto for reescrito
-- para caber dentro do que a fonte diz.
-- ---------------------------------------------------------------------

-- flavio-bolsonaro | CRITICA | "Compra de imóveis com depósitos em especie"
-- Antes: https://www1.folha.uol.com.br/poder/2019/01/movimentacao-atipica-de-r-12-milhao-na-conta-de-flavio-bolsonaro.shtml (404)
-- Prova (CNN Brasil, 19/06/2020, HTTP 200 em 2026-07-25):
--   "De acordo com um relatorio do Conselho de Controle de Atividades
--    Financeiras (Coaf), em 2016, quando estava lotado no gabinete do entao
--    deputado estadual Flavio Bolsonaro, Queiroz movimentou cerca de R$ 1,2
--    milhao em saques e depositos fracionados, considerados atipicos pelo orgao."
-- A FONTE CONTRADIZ A CLAIM EM DOIS PONTOS: o R$ 1,2 milhao estava na conta de
-- Fabricio Queiroz, ex-assessor, nao na conta de Flavio Bolsonaro; e o periodo
-- e 2016, nao 2017-2018. Alem disso, "os valores foram usados para compra de
-- imoveis no Rio de Janeiro" nao tem lastro em nenhuma fonte encontrada.
-- Publicar movimentacao atipica "na conta de Flavio" e imputacao de fato a
-- pessoa errada. Despublicada na migration seguinte.
UPDATE public.pontos_atencao
SET fontes = '[{"url": "https://www.cnnbrasil.com.br/politica/rachadinha-relacao-com-familia-bolsonaro-e-prisao-entenda-o-caso-queiroz/", "data": "2020-06-19", "titulo": "CNN Brasil: rachadinha, relação com a família Bolsonaro e prisão, entenda o caso Queiroz"}]'::jsonb
WHERE id = 'dda6483f-888f-4ac8-8301-d83ad85d527f'
  AND fontes -> 0 ->> 'url' = 'https://www1.folha.uol.com.br/poder/2019/01/movimentacao-atipica-de-r-12-milhao-na-conta-de-flavio-bolsonaro.shtml';

-- lula | CRITICA | "Condenado na Lava Jato, preso 580 dias, anulado pelo STF"
-- Antes: https://www.stf.jus.br/portal/cms/verNoticiaDetalhe.asp?idConteudo=462025 (404)
-- Prova 1 (STF, portal oficial de noticias, 15/04/2021, HTTP 200 em
-- 2026-07-25, trecho reextraido do HTML nesta etapa):
--   "O Plenario do Supremo Tribunal Federal (STF) confirmou, nesta
--    quinta-feira (14), a decisao do ministro Edson Fachin que, ao declarar a
--    incompetencia da 13a Vara da Justica Federal de Curitiba (PR), anulou as
--    acoes penais contra o ex-presidente Luiz Inacio Lula da Silva por nao se
--    enquadrarem no contexto da operacao Lava Jato. Por 8 votos a 3, o
--    colegiado rejeitou recurso (agravo regimental) da Procuradoria-Geral da
--    Republica (PGR) no Habeas Corpus (HC) 193726."
-- Prova 2 (STF, julgamento das ADC 43, 44 e 54 em 07/11/2019, HTTP 200):
--   pagina "STF decide que cumprimento da pena deve comecar apos esgotamento
--   de recursos", que e o fato juridico que encerrou a prisao.
-- O NUCLEO ESTA SUSTENTADO por fonte primaria, inclusive a ressalva correta de
-- que a anulacao foi por incompetencia do juizo, nao absolvicao no merito.
-- NAO ESTAO LASTREADOS: o numero "580 dias", a data "condenado em 2017" e as
-- datas exatas de inicio e fim da prisao. A fonte natural para o fim da prisao
-- (Agencia Brasil) esta fora do ar por vedacao eleitoral nesta data.
-- Numero derivado por aritmetica propria nao pode ir ao ar como se fosse
-- citado. Despublicada na migration seguinte ate a reescrita.
UPDATE public.pontos_atencao
SET fontes = '[{"url": "https://noticias.stf.jus.br/postsnoticias/stf-confirma-anulacao-de-condenacoes-do-ex-presidente-lula-na-lava-jato/", "data": "2021-04-15", "titulo": "STF: Supremo confirma anulação de condenações do ex-presidente Lula na Lava Jato (HC 193726)"}, {"url": "https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=429359&ori=1", "data": "2019-11-07", "titulo": "STF: cumprimento da pena deve começar após esgotamento de recursos (ADC 43, 44 e 54)"}]'::jsonb
WHERE id = '09d4c7d5-0ad0-4095-aace-1de0f389366b'
  AND fontes -> 0 ->> 'url' = 'https://www.stf.jus.br/portal/cms/verNoticiaDetalhe.asp?idConteudo=462025';

-- lula | CRITICA | "Mensalao (2005): esquema de compra de votos no Congresso"
-- Antes: https://g1.globo.com/politica/mensalao/noticia/2012/12/stf-mensalao-condenacoes.ghtml (404)
-- Prova 1 (STF, publicacao institucional "AP 470, Julgamento do mensalao,
-- RESUMO DO CASO", PDF, HTTP 200 em 2026-07-25):
--   "Acao penal (AP) originaria que tem por objeto sofisticado esquema de
--    pagamento de valores mensais a parlamentares de diversos partidos
--    politicos, em troca de votos favoraveis aos projetos do governo na Camara
--    dos Deputados."
--   e "O Supremo Tribunal Federal condenou diversos reus pelos crimes de
--    formacao de quadrilha, corrupcao ativa, corrupcao passiva, peculato e
--    lavagem de dinheiro."
--   Data do julgamento no proprio documento: 17.12.2012. Relator: Min. Joaquim
--   Barbosa.
-- Prova 2 (Camara dos Deputados, HTTP 200), titulo literal da pagina:
--   "STF fixa pena dos 25 reus no processo do mensalao".
-- SUSTENTADOS: o esquema, o objeto e a data do julgamento.
-- NAO SUSTENTADOS: o numero "25 condenados" tem lastro apenas no TITULO de uma
-- pagina de video, cujo corpo de texto nao pode ser citado, e a frase "Lula nao
-- foi denunciado mas ministros e dirigentes do PT foram condenados" nao foi
-- verificada em nenhuma fonte aberta. Despublicada na migration seguinte.
UPDATE public.pontos_atencao
SET fontes = '[{"url": "https://www.stf.jus.br/arquivo/cms/publicacaoBOInternet/anexo/link_download/casos_relevantes/pt/AP_470.pdf", "data": "2012-12-17", "titulo": "STF: AP 470, julgamento do mensalão, resumo do caso (publicação institucional)"}, {"url": "https://www.camara.leg.br/tv/camara-hoje/390591-stf-fixa-pena-dos-25-reus-no-processo-do-mensalao/", "data": "2026-07-25", "titulo": "Câmara dos Deputados: STF fixa pena dos 25 réus no processo do mensalão (data de acesso)"}]'::jsonb
WHERE id = 'de6d8db1-d13a-4ce2-bbbe-b9736aa90b17'
  AND fontes -> 0 ->> 'url' = 'https://g1.globo.com/politica/mensalao/noticia/2012/12/stf-mensalao-condenacoes.ghtml';

-- lula | alta | "Bolsa Família: tirou 20 milhões da pobreza extrema"
-- Antes: https://news.un.org/pt/story/2013/03/1433701 (404)
-- Prova 1 (Presidencia da Republica, Lei 10.836/2004, conversao da MPv 132 de
-- 2003, HTTP 200 em 2026-07-25, trecho reextraido nesta etapa):
--   "Art. 1o Fica criado, no ambito da Presidencia da Republica, o Programa
--    Bolsa Familia, destinado as acoes de transferencia de renda com
--    condicionalidades."
-- Prova 2 (Radio Senado, 16/09/2014, HTTP 200):
--   "O BRASIL SAIU DO MAPA DA FOME PRODUZIDO PELA ONU. (...) O DOCUMENTO
--    TAMBEM APONTA REDUCAO DE 75% NA EXTREMA POBREZA"
-- SUSTENTADOS: a criacao do programa e o reconhecimento da ONU.
-- NAO SUSTENTADOS: "tirou 20 milhoes da pobreza extrema" (numero do titulo,
-- ausente de toda fonte aberta) e "14 milhoes de familias".
-- Despublicada na migration seguinte ate a reescrita usar o numero que a fonte
-- sustenta (reducao de 75% na extrema pobreza, segundo relatorio da ONU).
UPDATE public.pontos_atencao
SET fontes = '[{"url": "https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l10.836.htm", "data": "2004-01-09", "titulo": "Lei nº 10.836, de 9 de janeiro de 2004: cria o Programa Bolsa Família (conversão da MPv 132/2003)"}, {"url": "https://www12.senado.leg.br/radio/1/noticia/2014/09/16/brasil-saiu-do-mapa-da-fome-produzido-pela-onu", "data": "2014-09-16", "titulo": "Rádio Senado: Brasil saiu do Mapa da Fome produzido pela ONU"}]'::jsonb
WHERE id = '3e3b5349-3a95-4786-af75-9c354c18ab07'
  AND fontes -> 0 ->> 'url' = 'https://news.un.org/pt/story/2013/03/1433701';

-- lula | baixa | "Prometeu salário mínimo acima da inflação, cumpriu parcialmente"
-- Antes: https://www.bbc.com/portuguese/articles/c0we4l1v0d0o (404)
-- Prova (Presidencia da Republica, Lei 14.663/2023, HTTP 200 em 2026-07-25):
--   "Art. 1o Esta Lei define o valor do salario minimo a partir de 1o de maio
--    de 2023, estabelece a politica de valorizacao permanente do salario minimo
--    a vigorar a partir de 1o de janeiro de 2024"
-- SUSTENTADO: "restabeleceu a regra em 2023".
-- NAO SUSTENTADO: "enfrentou pressao fiscal para limitar reajustes em
-- 2025-2026". A Lei Complementar 210/2024 foi aberta procurando o dispositivo
-- que teria limitado o reajuste e ela trata de emendas parlamentares; a busca
-- por "salario minimo" no texto dela nao retorna ocorrencia.
-- Despublicada na migration seguinte ate achar o diploma correto ou cortar a
-- segunda metade da descricao.
UPDATE public.pontos_atencao
SET fontes = '[{"url": "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/L14663.htm", "data": "2023-08-28", "titulo": "Lei nº 14.663, de 28 de agosto de 2023: política de valorização permanente do salário mínimo"}]'::jsonb
WHERE id = 'f96a4efe-fdae-4ed1-8809-773582355309'
  AND fontes -> 0 ->> 'url' = 'https://www.bbc.com/portuguese/articles/c0we4l1v0d0o';

-- renan-santos | alta | "MBL financiado por Atlas Network e Koch Brothers"
-- Antes: https://theintercept.com/2019/mbl-atlas-network.html (404)
-- Prova (Agencia Publica, jornalismo investigativo, HTTP 200 em 2026-07-25):
--   "O gaucho Ostermann, o mineiro Juliano Torres e o gaucho Anthony Ling sao
--    fundadores do EPL, a versao local do Students for Liberty, uma
--    organizacao-chave na articulacao entre os think tanks conservadores
--    americanos (...) e a juventude 'antipopulista' da America Latina."
--   e, dito pelo proprio presidente da Atlas Network a reporter:
--   "A Atlas recebe 0,5% de financiamento dos Koch, a Students for Liberty,
--    nao sei."
-- O campo "data" traz a DATA DE ACESSO. A materia e de junho de 2015 e o dia
-- exato nao foi lido, entao nao e inventado aqui.
-- SUSTENTADO: o vinculo entre Atlas Network, Students for Liberty, EPL e MBL.
-- NAO SUSTENTADOS: (i) "Koch Brothers" no titulo, que superdimensiona em uma
-- ordem de grandeza a unica cifra da materia (0,5% do financiamento da Atlas);
-- (ii) "cofundado por Renan", porque a materia nomeia outros fundadores e nao
-- nomeia Renan Santos. Despublicada na migration seguinte.
UPDATE public.pontos_atencao
SET fontes = '[{"url": "https://apublica.org/2015/06/a-nova-roupa-da-direita/", "data": "2026-07-25", "titulo": "Agência Pública: A nova roupa da direita (publicada em junho de 2015; campo data traz a data de acesso)"}]'::jsonb
WHERE id = 'e7848052-52f1-40bb-a4a1-1b9075f7256f'
  AND fontes -> 0 ->> 'url' = 'https://theintercept.com/2019/mbl-atlas-network.html';

-- romeu-zema | alta | "Tragedia de Brumadinho: governo lento na cobranca da Vale"
-- Antes: https://g1.globo.com/mg/minas-gerais/noticia/2021/02/04/acordo-brumadinho-vale-governo-mg.ghtml (404)
-- Prova (InfoMoney, 04/02/2021, HTTP 200 em 2026-07-25):
--   "Vale e governo de Minas Gerais chegam a um acordo de reparacao de
--    R$ 37,68 bilhoes por Brumadinho. O rompimento de barragem em Brumadinho
--    (MG) ocorreu em 25 de janeiro de 2019 e deixou cerca de 270 mortos"
-- SUSTENTADOS: a data do rompimento, o numero aproximado de mortos, o valor do
-- acordo e a data do acordo.
-- NAO SUSTENTADOS: "governo LENTO na cobranca", "criticado por DEMORA" e
-- "manter relacao proxima com setor minerador". Sao tres juizos; o intervalo de
-- dois anos ate o acordo e um dado, nao a comprovacao do juizo.
-- NOTA DE BLOQUEIO: as duas fontes de melhor hierarquia estao indisponiveis por
-- vedacao eleitoral nesta data. agenciaminas.mg.gov.br retorna HTTP 503 com o
-- aviso "Em cumprimento a legislacao eleitoral, este site encontra-se com as
-- funcionalidades desativadas". Quando a vedacao encerrar, o acordo homologado
-- no TJMG e a fonte primaria a usar. Despublicada na migration seguinte.
UPDATE public.pontos_atencao
SET fontes = '[{"url": "https://www.infomoney.com.br/mercados/vale-e-governo-de-minas-gerais-chegam-a-um-acordo-de-reparacao-de-r-3768-bilhoes-por-brumadinho/", "data": "2021-02-04", "titulo": "InfoMoney: Vale e governo de Minas Gerais chegam a acordo de reparação de R$ 37,68 bilhões por Brumadinho"}]'::jsonb
WHERE id = '8f3ed1f8-bda6-4039-a079-6b1e1eced551'
  AND fontes -> 0 ->> 'url' = 'https://g1.globo.com/mg/minas-gerais/noticia/2021/02/04/acordo-brumadinho-vale-governo-mg.ghtml';

-- romeu-zema | alta | "Equilíbrio fiscal: MG saiu do déficit após décadas"
-- Antes: https://g1.globo.com/mg/minas-gerais/noticia/2023/minas-regime-recuperacao-fiscal.ghtml (404),
--        com data registrada no banco como 2023-06-01.
-- Prova (STF, 29/08/2024, HTTP 200 em 2026-07-25, trecho reextraido nesta etapa):
--   "O ministro Nunes Marques, do Supremo Tribunal Federal (STF), homologou
--    acordo entre a Uniao e Minas Gerais para permitir a adesao do estado ao
--    Regime de Recuperacao Fiscal (RFF), programa que visa auxiliar entes da
--    federacao em situacao de desequilibrio financeiro."
-- A FONTE VIVA EMPURRA A LEITURA PARA O LADO OPOSTO DO QUE ESTA PUBLICADO:
--   1. Data errada: a homologacao e de agosto de 2024, e a fonte publicada
--      estava datada de junho de 2023, anterior ao fato que noticiava.
--   2. Sentido invertido: o RRF e um programa para entes "em situacao de
--      desequilibrio financeiro", e o proprio relator fala em "grave situacao
--      fiscal de Minas Gerais". Publicar a adesao ao RRF como prova de
--      "equilibrio fiscal" inverte o que o documento diz.
--   3. "Superavit primario" e "reduziu divida estadual" nao tem fonte.
-- Esta e a claim classificada como feito_positivo que mais precisa de
-- reescrita. Despublicada na migration seguinte.
UPDATE public.pontos_atencao
SET fontes = '[{"url": "https://noticias.stf.jus.br/postsnoticias/stf-homologa-acordo-para-ingresso-de-minas-gerais-do-regime-de-recuperacao-fiscal/", "data": "2024-08-29", "titulo": "STF homologa acordo para ingresso de Minas Gerais no Regime de Recuperação Fiscal (PET 12074)"}]'::jsonb
WHERE id = '346e2e83-b82c-4655-87d9-a46c28f60a2a'
  AND fontes -> 0 ->> 'url' = 'https://g1.globo.com/mg/minas-gerais/noticia/2023/minas-regime-recuperacao-fiscal.ghtml';

-- ---------------------------------------------------------------------
-- AS 6 QUE NAO RECEBEM FONTE NENHUMA
--
-- Nao ha UPDATE de fontes para elas de proposito: a busca honesta nao achou
-- fonte, e em dois casos a fonte primaria CONTRARIA a afirmacao publicada.
-- Elas saem do ar inteiras na migration seguinte, com o motivo registrado:
--   8934880a  lula          alta    "Patrimonio cresceu 538% entre 2006 e 2018"
--   8b186e05  renan-santos  CRITICA "Investigado por organizacao criminosa (STF, inq. 4923)"
--   360ede81  renan-santos  media   "Fundador do MBL, movimento que (...) centraliza poder"
--   bd734f7a  romeu-zema    media   "Elegeu-se como anti-politica mas negociou com centrao"
--   31aa4a8b  ronaldo-caiado media  "Goias com maior crescimento do PIB entre estados em 2023"
--   67bd98a0  ronaldo-caiado media  "Grilagem de terras: fazenda Alianca contestada"
--
-- A URL morta delas fica preservada no registro como evidencia do que foi
-- publicado, porque a linha nao e deletada e deixa de ser visivel.
-- ---------------------------------------------------------------------

COMMIT;
