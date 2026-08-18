-- Reescrita editorial das claims despublicadas em 25/07 como `precisa-reescrever`
-- (migration 20260725133000). Aprovada pelo mantenedor em 26/07/2026.
--
-- Regra de trabalho: cada texto foi reescrito para afirmar SOMENTE o que a
-- fonte viva anexada sustenta. Toda fonte foi lida por requisicao direta em
-- 26/07/2026 e respondeu HTTP 200. O trecho literal que sustenta cada texto
-- esta transcrito no comentario acima do UPDATE correspondente, como prova
-- conferivel sem sair deste arquivo.
--
-- 6 das 8 voltam ao ar. As outras 2 seguem despublicadas, por decisao
-- registrada no fim deste arquivo.
--
-- O gate de leitura `is_public_attention_point` exige, para gravidade alta ou
-- critica, `verificado = true` E fonte com caminho na URL. Todas as seis
-- cumprem as duas condicoes. O trigger de escrita
-- `trg_pontos_atencao_exige_fonte` recusaria qualquer UPDATE que publicasse
-- linha nao conforme, entao ele tambem funciona como conferencia desta
-- migration.
--
-- Nenhuma linha e deletada. O estado anterior de cada uma fica gravado em
-- `dados_relacionados -> 'reescrita_2026_07_26'`, ao lado do registro de
-- despublicacao de 25/07, entao todo o caminho e auditavel e reversivel.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. lula, Lava Jato (critica, processo_grave)
--
-- Saiu do texto: "580 dias", a data da condenacao e as datas da prisao.
-- Nenhum dos tres esta na fonte, e eram justamente os numeros que o laudo
-- apontou como sem lastro.
--
-- A fonte diz, literal:
--   "o Plenario do Supremo Tribunal Federal (STF) confirmou, nesta
--    quinta-feira (14), a decisao do ministro Edson Fachin que, ao declarar a
--    incompetencia da 13a Vara da Justica Federal de Curitiba (PR), anulou as
--    acoes penais contra o ex-presidente Luiz Inacio Lula da Silva por nao se
--    enquadrarem no contexto da operacao Lava Jato. Por 8 votos a 3, o
--    colegiado rejeitou recurso (agravo regimental) da Procuradoria-Geral da
--    Republica (PGR) no Habeas Corpus (HC) 193726."
--   "as denuncias (...) relativas aos casos do triplex do Guaruja, do sitio de
--    Atibaia e do Instituto Lula (sede e doacoes) nao tinham correlacao com os
--    desvios de recursos da Petrobras"
-- Fonte: https://noticias.stf.jus.br/postsnoticias/stf-confirma-anulacao-de-condenacoes-do-ex-presidente-lula-na-lava-jato/
UPDATE public.pontos_atencao
SET titulo = 'STF anulou as ações penais da Lava Jato por incompetência do juízo de Curitiba',
    descricao = 'Em 14 de abril de 2021, por 8 votos a 3, o Plenário do STF confirmou a decisão do ministro Edson Fachin que declarou a incompetência da 13ª Vara Federal de Curitiba e anulou as ações penais contra Lula nos casos do triplex do Guarujá, do sítio de Atibaia e do Instituto Lula. O fundamento foi processual: as denúncias não tinham correlação com os desvios da Petrobras e, por isso, deveriam ser julgadas em outro foro. Não houve julgamento de mérito.',
    data_referencia = DATE '2021-04-15',
    visivel = true,
    verificado = true,
    despublicacao_motivo = NULL,
    despublicado_em = NULL,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'reescrita_2026_07_26', jsonb_build_object(
        'motivo', 'texto reescrito para caber na fonte viva; removidos os 580 dias de prisao, a data da condenacao e as datas de prisao, nenhum deles presente na fonte',
        'fonte_conferida', 'https://noticias.stf.jus.br/postsnoticias/stf-confirma-anulacao-de-condenacoes-do-ex-presidente-lula-na-lava-jato/',
        'http_status_conferido', '200 em 2026-07-26',
        'titulo_anterior', 'Condenado na Lava Jato, preso 580 dias, anulado pelo STF',
        'reversivel', true
      )
    )
WHERE id = '09d4c7d5-0ad0-4095-aace-1de0f389366b';

-- ---------------------------------------------------------------------------
-- 2. lula, Bolsa Familia (alta, feito_positivo)
--
-- Saiu do texto: "20 milhoes tirados da pobreza extrema" e "14 milhoes de
-- familias". Nenhum dos dois numeros existe na fonte. Entraram os numeros que
-- a fonte de fato traz, mais a ressalva de que a serie medida atravessa dois
-- governos, que a propria fonte deixa explicito nas datas.
--
-- A fonte diz, literal:
--   "No Brasil, o numero de cidadaos em tais condicoes foi reduzido em 75%
--    entre 2001 e 2012, segundo mostra o Mapa Mundial da Fome, divulgado pela
--    Organizacao das Nacoes Unidas para a Agricultura e Alimentacao, a FAO.
--    Segundo o documento, o numero de brasileiros subalimentados caiu 82%
--    entre 2002 e 2013. O relatorio aponta que o pais investiu cerca de 35
--    bilhoes de reais no combate a fome e atribui o sucesso aos Programas Fome
--    Zero e Bolsa Familia."
-- Fonte: https://www12.senado.leg.br/radio/1/noticia/2014/09/16/brasil-saiu-do-mapa-da-fome-produzido-pela-onu
UPDATE public.pontos_atencao
SET titulo = 'FAO creditou a saída do Brasil do Mapa da Fome ao Fome Zero e ao Bolsa Família',
    descricao = 'Em 2014, o Mapa Mundial da Fome da FAO registrou a saída do Brasil da lista e apontou queda de 75% na extrema pobreza entre 2001 e 2012, além de redução de 82% no número de brasileiros subalimentados entre 2002 e 2013. O relatório atribui o resultado aos programas Fome Zero e Bolsa Família, criados no primeiro governo Lula, e registra investimento de cerca de R$ 35 bilhões no combate à fome. O período medido atravessa os governos Lula e Dilma.',
    data_referencia = DATE '2014-09-16',
    visivel = true,
    verificado = true,
    despublicacao_motivo = NULL,
    despublicado_em = NULL,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'reescrita_2026_07_26', jsonb_build_object(
        'motivo', 'texto reescrito para caber na fonte viva; removidos os numeros de 20 milhoes de pessoas e 14 milhoes de familias, ausentes na fonte, e adicionada a ressalva de que a serie cobre dois governos',
        'fonte_conferida', 'https://www12.senado.leg.br/radio/1/noticia/2014/09/16/brasil-saiu-do-mapa-da-fome-produzido-pela-onu',
        'http_status_conferido', '200 em 2026-07-26',
        'titulo_anterior', 'Bolsa Família: tirou 20 milhões da pobreza extrema',
        'reversivel', true
      )
    )
WHERE id = '3e3b5349-3a95-4786-af75-9c354c18ab07';

-- ---------------------------------------------------------------------------
-- 3. lula, salario minimo (baixa)
--
-- Saiu do texto: a limitacao de reajustes em 2025-2026, que nao foi encontrada
-- em diploma nenhum. Sem ela, o juizo "cumpriu parcialmente" perde o lastro, e
-- o ponto passa a descrever apenas o que a lei fez.
--
-- Por isso a categoria muda de `contradição` para `feito_positivo`: manter a
-- linha catalogada como contradicao afirmaria um descumprimento que nenhuma
-- fonte sustenta.
--
-- A fonte diz, literal (ementa da propria lei):
--   "Define o valor do salario minimo a partir de 1o de maio de 2023;
--    estabelece a politica de valorizacao permanente do salario minimo a
--    vigorar a partir de 1o de janeiro de 2024"
--   Art. 2o: "O valor do salario minimo sera de R$ 1.320,00 (mil trezentos e
--    vinte reais) a partir de 1o de maio de 2023."
--   Art. 3o: "o valor decorrera da soma do indice de medida da inflacao do ano
--    anterior, para a preservacao do poder aquisitivo, com o indice
--    correspondente ao crescimento real do Produto Interno Bruto (PIB)"
-- Fonte: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/L14663.htm
UPDATE public.pontos_atencao
SET titulo = 'Política permanente de valorização do salário mínimo restabelecida em lei',
    descricao = 'A Lei 14.663, de 28 de agosto de 2023, fixou o salário mínimo em R$ 1.320 a partir de maio de 2023 e restabeleceu a política de valorização permanente a partir de janeiro de 2024, com reajuste anual pela soma da inflação do ano anterior e do crescimento real do Produto Interno Bruto.',
    categoria = 'feito_positivo',
    data_referencia = DATE '2023-08-28',
    visivel = true,
    verificado = true,
    despublicacao_motivo = NULL,
    despublicado_em = NULL,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'reescrita_2026_07_26', jsonb_build_object(
        'motivo', 'texto reescrito para caber na lei citada; removida a limitacao de reajustes em 2025-2026, sem diploma que a sustente, e por isso a categoria deixou de ser contradicao',
        'fonte_conferida', 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/L14663.htm',
        'http_status_conferido', '200 em 2026-07-26',
        'titulo_anterior', 'Prometeu salário mínimo acima da inflação, cumpriu parcialmente',
        'categoria_anterior', 'contradição',
        'reversivel', true
      )
    )
WHERE id = 'f96a4efe-fdae-4ed1-8809-773582355309';

-- ---------------------------------------------------------------------------
-- 4. flavio-bolsonaro, caso Queiroz (critica)
--
-- Esta e a correcao mais importante do lote, porque o texto publicado errava o
-- SUJEITO. Ele punha os R$ 1,2 milhao "na conta de Flavio", em "2017-2018", e
-- afirmava que os valores foram usados na compra de imoveis. A fonte atribui a
-- movimentacao a Fabricio Queiroz, em 2016, e nao menciona imovel nenhum. A
-- compra de imoveis saiu inteira do texto.
--
-- A categoria muda de `patrimonio_incompativel` para `escandalo` pelo mesmo
-- motivo: o texto nao fala mais de patrimonio do candidato.
--
-- A fonte diz, literal:
--   "De acordo com um relatorio do Conselho de Controle de Atividades
--    Financeiras (Coaf), em 2016, quando estava lotado no gabinete do entao
--    deputado estadual Flavio Bolsonaro, Queiroz movimentou cerca de R$ 1,2
--    milhao em saques e depositos fracionados, considerados atipicos pelo
--    orgao."
--   "Queiroz trabalhou como assessor, motorista e seguranca do filho mais
--    velho do presidente, Flavio Bolsonaro, por mais de 10 anos, entre 2007 e
--    2018. De acordo com as investigacoes, alem de Fabricio, suas filhas
--    Nathalia e Evelyn e a mulher do ex-assessor, Marcia Oliveira de Aguiar,
--    tambem trabalharam no gabinete de Flavio na Alerj."
-- Fonte: https://www.cnnbrasil.com.br/politica/rachadinha-relacao-com-familia-bolsonaro-e-prisao-entenda-o-caso-queiroz/
UPDATE public.pontos_atencao
SET titulo = 'Coaf apontou movimentação atípica de assessor lotado no gabinete',
    descricao = 'Segundo relatório do Coaf, em 2016 Fabrício Queiroz, então lotado no gabinete do deputado estadual Flávio Bolsonaro na Alerj, movimentou cerca de R$ 1,2 milhão em saques e depósitos fracionados considerados atípicos. Queiroz foi assessor, motorista e segurança de Flávio por mais de dez anos, entre 2007 e 2018, e a mulher e as duas filhas dele também trabalharam no mesmo gabinete.',
    categoria = 'escandalo',
    data_referencia = DATE '2020-06-19',
    visivel = true,
    verificado = true,
    despublicacao_motivo = NULL,
    despublicado_em = NULL,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'reescrita_2026_07_26', jsonb_build_object(
        'motivo', 'o texto publicado errava o sujeito: atribuia a Flavio Bolsonaro, em 2017-2018, movimentacao que a fonte atribui a Fabricio Queiroz em 2016, e afirmava compra de imoveis que a fonte nao menciona. A compra de imoveis foi removida por inteiro e a categoria deixou de ser patrimonio_incompativel',
        'fonte_conferida', 'https://www.cnnbrasil.com.br/politica/rachadinha-relacao-com-familia-bolsonaro-e-prisao-entenda-o-caso-queiroz/',
        'http_status_conferido', '200 em 2026-07-26',
        'titulo_anterior', 'Compra de imóveis com depósitos em especie',
        'categoria_anterior', 'patrimonio_incompativel',
        'reversivel', true
      )
    )
WHERE id = 'dda6483f-888f-4ac8-8301-d83ad85d527f';

-- ---------------------------------------------------------------------------
-- 5. romeu-zema, Regime de Recuperacao Fiscal (alta)
--
-- Esta linha estava publicada como `feito_positivo`, com o titulo "MG saiu do
-- deficit apos decadas", tendo como fonte primaria uma decisao do STF que diz
-- o oposto: o Regime de Recuperacao Fiscal e programa destinado a entes em
-- DESEQUILIBRIO financeiro, e o relator descreve a necessidade de regularizar
-- a grave situacao fiscal do estado.
--
-- Nao e exagero de redacao, e erro factual de sinal trocado. Por isso a
-- categoria sai de `feito_positivo` e vira `perfil`: o fato entra como contexto
-- verificavel, sem ser reclassificado como acusacao, que a fonte tambem nao
-- sustenta. A gravidade cai de `alta` para `media` pela mesma razao, ja que
-- deixou de ser afirmacao superlativa em qualquer direcao.
--
-- A fonte diz, literal:
--   "O ministro Nunes Marques, do Supremo Tribunal Federal (STF), homologou
--    acordo entre a Uniao e Minas Gerais para permitir a adesao do estado ao
--    Regime de Recuperacao Fiscal (RFF), programa que visa auxiliar entes da
--    federacao em situacao de desequilibrio financeiro."
--   "O acordo preve a retomada dos pagamentos das parcelas da divida fiscal a
--    partir de 1o de outubro. O estado tera prazo de seis meses (...) para
--    adotar medidas estruturantes"
--   "o relator observou que o papel do Judiciario, nesse caso, foi o de
--    promover o dialogo institucional e incentivar uma resolucao consensual
--    para regularizar a grave situacao fiscal"
-- Fonte: https://noticias.stf.jus.br/postsnoticias/stf-homologa-acordo-para-ingresso-de-minas-gerais-do-regime-de-recuperacao-fiscal/
UPDATE public.pontos_atencao
SET titulo = 'Minas aderiu ao Regime de Recuperação Fiscal, destinado a estados em desequilíbrio',
    descricao = 'Em 29 de agosto de 2024, o STF homologou o acordo entre a União e Minas Gerais para o ingresso do estado no Regime de Recuperação Fiscal, programa voltado a entes da federação em situação de desequilíbrio financeiro. O acordo previu a retomada do pagamento das parcelas da dívida a partir de outubro de 2024 e deu ao estado prazo de seis meses para adotar medidas estruturantes. Na decisão, o relator descreveu a necessidade de regularizar a grave situação fiscal do estado.',
    categoria = 'perfil',
    gravidade = 'media',
    data_referencia = DATE '2024-08-29',
    visivel = true,
    verificado = true,
    despublicacao_motivo = NULL,
    despublicado_em = NULL,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'reescrita_2026_07_26', jsonb_build_object(
        'motivo', 'a claim estava publicada como feito positivo ("MG saiu do deficit apos decadas") tendo como fonte uma decisao do STF que descreve o oposto: adesao a programa destinado a entes em desequilibrio financeiro, com mencao do relator a grave situacao fiscal. Erro de sinal trocado, nao exagero de redacao',
        'fonte_conferida', 'https://noticias.stf.jus.br/postsnoticias/stf-homologa-acordo-para-ingresso-de-minas-gerais-do-regime-de-recuperacao-fiscal/',
        'http_status_conferido', '200 em 2026-07-26',
        'titulo_anterior', 'Equilíbrio fiscal: MG saiu do déficit após décadas',
        'categoria_anterior', 'feito_positivo',
        'gravidade_anterior', 'alta',
        'reversivel', true
      )
    )
WHERE id = '346e2e83-b82c-4655-87d9-a46c28f60a2a';

-- ---------------------------------------------------------------------------
-- 6. romeu-zema, Brumadinho (alta, processo_grave)
--
-- Sairam os dois juizos publicados, "governo lento na cobranca" e "relacao
-- proxima com o setor minerador". A fonte sustenta os fatos datados e, se
-- aponta para alguma direcao, e a contraria ao juizo de lentidao, ja que
-- registra o acordo como o maior do genero com participacao do poder publico
-- na America Latina. Ficaram apenas os fatos.
--
-- A fonte diz, literal:
--   "A Vale (VALE3) e o governo de Minas Gerais chegaram a um acordo no valor
--    total de R$ 37,68 bilhoes em reparacoes pelo rompimento de barragem da
--    mineradora em Brumadinho, tragedia que ocorreu em 25 de janeiro de 2019 e
--    deixou 270 mortos."
--   "trata-se do maior acordo de medidas de reparacao em termos financeiros e
--    com participacao do Poder Publico ja firmado na America Latina"
--   "Cerca de 30% dos recursos vao beneficiar o municipio e a populacao de
--    Brumadinho"
--   "O termo nao retira nenhuma responsabilidade da empresa"
-- Fonte: https://www.infomoney.com.br/mercados/vale-e-governo-de-minas-gerais-chegam-a-um-acordo-de-reparacao-de-r-3768-bilhoes-por-brumadinho/
UPDATE public.pontos_atencao
SET titulo = 'Acordo de R$ 37,68 bilhões com a Vale pela tragédia de Brumadinho',
    descricao = 'O rompimento da barragem da Vale em Brumadinho, em 25 de janeiro de 2019, deixou cerca de 270 mortos. Em 4 de fevereiro de 2021, a Vale e o governo de Minas Gerais fecharam acordo de reparação de R$ 37,68 bilhões, apresentado pelo governo estadual como o maior acordo de reparação com participação do poder público já firmado na América Latina. Cerca de 30% dos recursos foram destinados ao município e à população de Brumadinho, e o termo não retira responsabilidades da mineradora.',
    data_referencia = DATE '2021-02-04',
    visivel = true,
    verificado = true,
    despublicacao_motivo = NULL,
    despublicado_em = NULL,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'reescrita_2026_07_26', jsonb_build_object(
        'motivo', 'removidos os dois juizos sem lastro na fonte (lentidao do governo na cobranca e proximidade com o setor minerador); mantidos apenas os fatos datados que a fonte sustenta',
        'fonte_conferida', 'https://www.infomoney.com.br/mercados/vale-e-governo-de-minas-gerais-chegam-a-um-acordo-de-reparacao-de-r-3768-bilhoes-por-brumadinho/',
        'http_status_conferido', '200 em 2026-07-26',
        'titulo_anterior', 'Tragedia de Brumadinho: governo lento na cobranca da Vale',
        'reversivel', true
      )
    )
WHERE id = '8f3ed1f8-bda6-4039-a079-6b1e1eced551';

-- ---------------------------------------------------------------------------
-- As duas que NAO voltam, com o motivo atualizado.
--
-- 7. renan-santos, MBL e Atlas Network. A reportagem da Agencia Publica
--    documenta o vinculo institucional entre o MBL, o Estudantes pela
--    Liberdade e a Atlas Network, mas NAO nomeia Renan Santos em lugar nenhum.
--    As pessoas que ela nomeia na criacao da marca MBL sao Juliano Torres,
--    Fabio Ostermann, Felipe Franca, Kim Kataguiri e um "Renan Haas".
--    Republicar na ficha de Renan Santos com esta fonte seria atribuir a ele o
--    que a fonte atribui a outras pessoas.
--    Alem disso, a unica cifra sobre os Koch na materia e a fala do proprio
--    presidente da Atlas ("A Atlas recebe 0,5% de financiamento dos Koch"),
--    que nao equivale ao titulo publicado "MBL financiado por Atlas Network e
--    Koch Brothers".
--
-- 8. lula, mensalao. A fonte anexada e o PDF da AP 470 no site do STF, que
--    respondeu HTTP 403 em 26/07/2026. Sem conseguir ler o documento, escrever
--    uma reescrita seria inventar o que a fonte sustenta. Fica fora do ar ate
--    haver fonte com corpo de texto legivel.
UPDATE public.pontos_atencao
SET despublicacao_motivo = 'Mantida fora do ar em 2026-07-26: a fonte viva (Agencia Publica, 23/06/2015) documenta o vinculo MBL/EPL/Atlas Network mas nao nomeia Renan Santos, e nomeia outras cinco pessoas na criacao da marca. Volta quando houver fonte que o nomeie.',
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'reescrita_2026_07_26', jsonb_build_object(
        'veredito', 'nao-republicar',
        'motivo', 'fonte viva nao nomeia o candidato; nomeia Juliano Torres, Fabio Ostermann, Felipe Franca, Kim Kataguiri e Renan Haas',
        'fonte_conferida', 'https://apublica.org/2015/06/a-nova-roupa-da-direita/',
        'http_status_conferido', '200 em 2026-07-26',
        'o_que_falta', 'fonte que nomeie Renan Santos'
      )
    )
WHERE id = 'e7848052-52f1-40bb-a4a1-1b9075f7256f';

UPDATE public.pontos_atencao
SET despublicacao_motivo = 'Mantida fora do ar em 2026-07-26: a fonte anexada (PDF da AP 470 no site do STF) respondeu HTTP 403 e nao pode ser lida. Reescrever sem ler a fonte seria inventar o que ela sustenta.',
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'reescrita_2026_07_26', jsonb_build_object(
        'veredito', 'nao-verificado',
        'motivo', 'fonte inacessivel na data da reescrita',
        'fonte_tentada', 'https://www.stf.jus.br/arquivo/cms/publicacaoBOInternet/anexo/link_download/casos_relevantes/pt/AP_470.pdf',
        'http_status_conferido', '403 em 2026-07-26',
        'o_que_falta', 'pagina do STF sobre a AP 470 com corpo de texto legivel'
      )
    )
WHERE id = 'de6d8db1-d13a-4ce2-bbbe-b9736aa90b17';

-- ---------------------------------------------------------------------------
-- Conferencia.
DO $$
DECLARE
  publicadas integer;
  fora_do_ar integer;
BEGIN
  SELECT COUNT(*) INTO publicadas
  FROM public.pontos_atencao
  WHERE id IN (
    '09d4c7d5-0ad0-4095-aace-1de0f389366b',
    '3e3b5349-3a95-4786-af75-9c354c18ab07',
    'f96a4efe-fdae-4ed1-8809-773582355309',
    'dda6483f-888f-4ac8-8301-d83ad85d527f',
    '346e2e83-b82c-4655-87d9-a46c28f60a2a',
    '8f3ed1f8-bda6-4039-a079-6b1e1eced551'
  ) AND visivel AND verificado;

  IF publicadas <> 6 THEN
    RAISE EXCEPTION 'reescrita_claims: esperado 6 claims publicadas e verificadas, encontrado %', publicadas;
  END IF;

  SELECT COUNT(*) INTO fora_do_ar
  FROM public.pontos_atencao
  WHERE id IN (
    'e7848052-52f1-40bb-a4a1-1b9075f7256f',
    'de6d8db1-d13a-4ce2-bbbe-b9736aa90b17'
  ) AND visivel IS NOT TRUE;

  IF fora_do_ar <> 2 THEN
    RAISE EXCEPTION 'reescrita_claims: as 2 nao republicadas deveriam seguir fora do ar, encontrado % fora', fora_do_ar;
  END IF;
END $$;

COMMIT;

-- Verificacao pos-aplicacao (rodar manualmente):
--
--   select c.slug, pa.gravidade, pa.categoria, pa.titulo
--     from public.pontos_atencao pa
--     join public.candidatos c on c.id = pa.candidato_id
--    where pa.dados_relacionados ? 'reescrita_2026_07_26'
--    order by c.slug;
--
-- Reversao de uma claim especifica:
--
--   update public.pontos_atencao
--      set visivel = false, verificado = false
--    where id = '<uuid>';
--   -- o titulo e a categoria anteriores estao em
--   -- dados_relacionados -> 'reescrita_2026_07_26'
