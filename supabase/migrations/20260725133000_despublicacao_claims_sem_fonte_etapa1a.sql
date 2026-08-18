-- =====================================================================
-- Etapa 1A da auditoria de integridade (docs/auditoria-integridade-2026-07-24.md,
-- achados V1 e V2). Item 1 do patch-list priorizado do laudo.
--
-- O QUE ESTA MIGRATION FAZ
-- Tira do ar 14 dos 18 pontos de atencao cuja fonte unica publicada retorna
-- HTTP 404. Sao afirmacoes graves sobre pessoas reais, nomeadas, publicadas
-- sem lastro verificavel. Nenhuma linha e deletada: elas ficam no banco com
-- visivel = false e com o motivo gravado em
-- dados_relacionados -> 'despublicacao_2026_07_25'.
--
-- POR QUE 14 E NAO 18
-- Quatro claims ganharam fonte viva que sustenta o texto como publicado e
-- continuam no ar (ver 20260725130000_fontes_mortas_substituidas_etapa1a.sql,
-- Bloco 1). As outras 14 se dividem em:
--
--   GRUPO A (8): "precisa reescrever". Existe fonte viva, ja anexada pela
--     migration anterior, mas ela sustenta menos do que o texto publicado
--     afirma. Em tres casos (dda6483f, 346e2e83 e, em parte, 8f3ed1f8) a fonte
--     viva CONTRARIA a claim. Saem do ar ate a reescrita editorial, e voltam
--     com a fonte ja anexada.
--   GRUPO B (6): "sem fonte". A busca honesta nao achou fonte nenhuma. Em dois
--     casos a fonte primaria oficial DESMENTE a afirmacao publicada. Saem do ar
--     e so voltam se aparecer fonte.
--
-- verificado TAMBEM VAI PARA false NAS 14
-- Nao e detalhe cosmetico: 13 das 14 estao hoje com gerado_por = 'ia' e
-- verificado = true, ou seja, o campo que deveria ser a garantia editorial
-- afirma que alguem conferiu uma fonte que nunca existiu. Manter
-- verificado = true numa claim despublicada por falta de lastro perpetuaria a
-- mentira dentro do banco e faria a claim reaparecer no ar ao primeiro
-- visivel = true. A 14a (8b186e05) ja esta com verificado = false: e o achado
-- V2 do laudo, a claim critica que escapou do gate por ser de curadoria.
--
-- REVERSIBILIDADE
-- Reverter e inverter visivel (e verificado, quando a claim for reescrita e
-- reconferida). O registro em dados_relacionados guarda a URL morta original,
-- entao nada de contexto se perde. Toda alteracao e por id explicito.
-- Idempotente: o predicado "visivel IS DISTINCT FROM false" impede efeito
-- adicional em reexecucao.
--
-- ---------------------------------------------------------------------
-- SELECT DE VALIDACAO EXECUTADO ANTES DE ESCREVER ESTE ARQUIVO
-- (producao, somente leitura, 2026-07-25)
--
--   select p.id, c.slug, p.gravidade, p.gerado_por, p.verificado, p.visivel,
--          p.titulo, p.fontes -> 0 ->> 'url' as url,
--          (p.dados_relacionados is null) as dr_null
--   from public.pontos_atencao p
--   join public.candidatos c on c.id = p.candidato_id
--   where p.id in (<os 14 ids abaixo>);
--
-- Resultado observado: 14 linhas, TODAS com visivel = true e
-- dados_relacionados nulo; 13 com verificado = true, 1 (8b186e05) com
-- verificado = false. As URLs sao exatamente as citadas em cada bloco.
--
-- SELECT QUE PROVA O RESULTADO ESPERADO DEPOIS
--
--   select c.slug, p.gravidade, p.visivel, p.verificado,
--          p.dados_relacionados -> 'despublicacao_2026_07_25' ->> 'veredito' as veredito
--   from public.pontos_atencao p
--   join public.candidatos c on c.id = p.candidato_id
--   where p.id in (<os 14 ids abaixo>)
--   order by c.slug;
--   -- esperado: 14 linhas, visivel = false e verificado = false em todas,
--   -- veredito preenchido em todas ('precisa-reescrever' em 8,
--   -- 'sem-fonte' em 6).
--
-- E o censo que prova que nao sobrou URL morta no ar:
--
--   select count(*) from public.pontos_atencao p
--   join public.candidatos c on c.id = p.candidato_id,
--        lateral jsonb_array_elements(p.fontes) f
--   where c.publicavel and p.visivel
--     and f->>'url' in (<as 18 URLs mortas de scripts/audit/urls-mortas-2026-07-24.txt>);
--   -- esperado: 0
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- GRUPO A: precisa reescrever (8 claims)
-- Fonte viva ja anexada pela migration 20260725130000. Sai do ar ate que o
-- texto publicado caiba dentro do que a fonte sustenta.
-- ---------------------------------------------------------------------

-- flavio-bolsonaro | CRITICA | "Compra de imóveis com depósitos em especie"
-- A fonte viva (CNN Brasil, 19/06/2020) atribui o R$ 1,2 milhao de movimentacao
-- atipica a Fabricio Queiroz, ex-assessor, em 2016. A claim publica esse valor
-- como movimentacao "na conta de Flavio" em "2017-2018", e ainda afirma que
-- comprou imoveis no Rio, o que nenhuma fonte sustenta. E imputacao de fato a
-- pessoa errada.
UPDATE public.pontos_atencao
SET visivel = false,
    verificado = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1A',
        'veredito', 'precisa-reescrever',
        'motivo', 'fonte unica publicada retornava HTTP 404; a fonte viva encontrada atribui a movimentacao atipica de R$ 1,2 milhao a Fabricio Queiroz em 2016, nao a Flavio Bolsonaro em 2017-2018, e nao liga esse valor a compra de imoveis',
        'fonte_morta', 'https://www1.folha.uol.com.br/poder/2019/01/movimentacao-atipica-de-r-12-milhao-na-conta-de-flavio-bolsonaro.shtml',
        'fonte_viva_anexada', 'https://www.cnnbrasil.com.br/politica/rachadinha-relacao-com-familia-bolsonaro-e-prisao-entenda-o-caso-queiroz/',
        'reversivel', true
      )
    )
WHERE id = 'dda6483f-888f-4ac8-8301-d83ad85d527f'
  AND visivel IS DISTINCT FROM false;

-- lula | CRITICA | "Condenado na Lava Jato, preso 580 dias, anulado pelo STF"
-- O nucleo (anulacao por incompetencia do juizo de Curitiba, sem absolvicao no
-- merito) esta sustentado por duas fontes primarias do STF, ja anexadas. Ficam
-- sem lastro o numero "580 dias", a data "condenado em 2017" e as datas exatas
-- de inicio e fim da prisao. A aritmetica entre 07/04/2018 e 08/11/2019 fecha
-- em 580, mas numero derivado por conta propria nao vai ao ar como se fosse
-- citado. A fonte natural para o fim da prisao (Agencia Brasil) esta fora do ar
-- por vedacao eleitoral em 25/07/2026.
UPDATE public.pontos_atencao
SET visivel = false,
    verificado = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1A',
        'veredito', 'precisa-reescrever',
        'motivo', 'fonte unica publicada retornava HTTP 404; o STF sustenta a anulacao, mas o numero 580 dias, a data da condenacao e as datas da prisao nao tem fonte citavel',
        'fonte_morta', 'https://www.stf.jus.br/portal/cms/verNoticiaDetalhe.asp?idConteudo=462025',
        'fonte_viva_anexada', 'https://noticias.stf.jus.br/postsnoticias/stf-confirma-anulacao-de-condenacoes-do-ex-presidente-lula-na-lava-jato/',
        'reversivel', true
      )
    )
WHERE id = '09d4c7d5-0ad0-4095-aace-1de0f389366b'
  AND visivel IS DISTINCT FROM false;

-- lula | CRITICA | "Mensalao (2005): esquema de compra de votos no Congresso"
-- O objeto do processo e a data do julgamento estao no documento do proprio STF,
-- ja anexado. Ficam sem lastro citavel o numero "25 condenados" (existe so no
-- titulo de uma pagina de video da Camara, cujo corpo nao e extraivel) e a
-- afirmacao de que "Lula nao foi denunciado mas ministros e dirigentes do PT
-- foram condenados".
UPDATE public.pontos_atencao
SET visivel = false,
    verificado = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1A',
        'veredito', 'precisa-reescrever',
        'motivo', 'fonte unica publicada retornava HTTP 404; o documento do STF sustenta o objeto e a data do julgamento, mas o numero de condenados e a nao denuncia de Lula nao tem fonte com corpo de texto citavel',
        'fonte_morta', 'https://g1.globo.com/politica/mensalao/noticia/2012/12/stf-mensalao-condenacoes.ghtml',
        'fonte_viva_anexada', 'https://www.stf.jus.br/arquivo/cms/publicacaoBOInternet/anexo/link_download/casos_relevantes/pt/AP_470.pdf',
        'reversivel', true
      )
    )
WHERE id = 'de6d8db1-d13a-4ce2-bbbe-b9736aa90b17'
  AND visivel IS DISTINCT FROM false;

-- lula | alta | "Bolsa Família: tirou 20 milhões da pobreza extrema"
-- A criacao do programa (Lei 10.836/2004) e o reconhecimento da ONU (Radio
-- Senado, 16/09/2014, "reducao de 75% na extrema pobreza") estao sustentados e
-- ja anexados. Os numeros do titulo e da descricao, "20 milhoes" e "14 milhoes
-- de familias", nao aparecem em nenhuma fonte aberta.
UPDATE public.pontos_atencao
SET visivel = false,
    verificado = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1A',
        'veredito', 'precisa-reescrever',
        'motivo', 'fonte unica publicada retornava HTTP 404; o numero do titulo (20 milhoes tirados da pobreza extrema) e a cifra de 14 milhoes de familias nao aparecem em nenhuma fonte viva encontrada',
        'fonte_morta', 'https://news.un.org/pt/story/2013/03/1433701',
        'fonte_viva_anexada', 'https://www12.senado.leg.br/radio/1/noticia/2014/09/16/brasil-saiu-do-mapa-da-fome-produzido-pela-onu',
        'reversivel', true
      )
    )
WHERE id = '3e3b5349-3a95-4786-af75-9c354c18ab07'
  AND visivel IS DISTINCT FROM false;

-- lula | baixa | "Prometeu salário mínimo acima da inflação, cumpriu parcialmente"
-- A primeira metade esta na Lei 14.663/2023, ja anexada. A segunda metade,
-- "enfrentou pressao fiscal para limitar reajustes em 2025-2026", nao foi
-- verificada: a Lei Complementar 210/2024 foi aberta procurando o dispositivo e
-- ela trata de emendas parlamentares, sem ocorrencia de "salario minimo".
UPDATE public.pontos_atencao
SET visivel = false,
    verificado = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1A',
        'veredito', 'precisa-reescrever',
        'motivo', 'fonte unica publicada retornava HTTP 404; a lei sustenta o restabelecimento da regra de valorizacao em 2023, mas a limitacao de reajustes em 2025-2026 nao foi encontrada em diploma nenhum',
        'fonte_morta', 'https://www.bbc.com/portuguese/articles/c0we4l1v0d0o',
        'fonte_viva_anexada', 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/L14663.htm',
        'reversivel', true
      )
    )
WHERE id = 'f96a4efe-fdae-4ed1-8809-773582355309'
  AND visivel IS DISTINCT FROM false;

-- renan-santos | alta | "MBL financiado por Atlas Network e Koch Brothers"
-- A Agencia Publica documenta o vinculo Atlas / Students for Liberty / EPL /
-- MBL, e ja esta anexada. Duas partes da claim nao se sustentam nessa fonte:
-- os Koch, cuja unica cifra na materia e 0,5% do financiamento da Atlas dito
-- pelo proprio presidente da entidade, e a co-fundacao por Renan Santos, que a
-- materia nao nomeia. Cada uma precisa de fonte propria.
UPDATE public.pontos_atencao
SET visivel = false,
    verificado = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1A',
        'veredito', 'precisa-reescrever',
        'motivo', 'fonte unica publicada retornava HTTP 404; a fonte viva documenta o vinculo com a Atlas Network, mas a unica cifra sobre os Koch e 0,5% do financiamento da Atlas, e a fonte nao nomeia Renan Santos como cofundador',
        'fonte_morta', 'https://theintercept.com/2019/mbl-atlas-network.html',
        'fonte_viva_anexada', 'https://apublica.org/2015/06/a-nova-roupa-da-direita/',
        'reversivel', true
      )
    )
WHERE id = 'e7848052-52f1-40bb-a4a1-1b9075f7256f'
  AND visivel IS DISTINCT FROM false;

-- romeu-zema | alta | "Tragedia de Brumadinho: governo lento na cobranca da Vale"
-- Estao sustentados a data do rompimento, o numero aproximado de mortos e o
-- acordo de R$ 37,68 bilhoes de 04/02/2021 (InfoMoney, ja anexado). Nao estao
-- sustentados os tres juizos: "lento", "criticado por demora" e "relacao
-- proxima com setor minerador". Fato datado leva fonte; avaliacao leva
-- atribuicao a quem avalia.
UPDATE public.pontos_atencao
SET visivel = false,
    verificado = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1A',
        'veredito', 'precisa-reescrever',
        'motivo', 'fonte unica publicada retornava HTTP 404; a fonte viva sustenta os fatos datados (rompimento, mortos, valor e data do acordo) mas nenhum dos tres juizos publicados sobre lentidao e proximidade com o setor minerador',
        'fonte_morta', 'https://g1.globo.com/mg/minas-gerais/noticia/2021/02/04/acordo-brumadinho-vale-governo-mg.ghtml',
        'fonte_viva_anexada', 'https://www.infomoney.com.br/mercados/vale-e-governo-de-minas-gerais-chegam-a-um-acordo-de-reparacao-de-r-3768-bilhoes-por-brumadinho/',
        'nota', 'fontes de melhor hierarquia (agenciaminas.mg.gov.br, HTTP 503, e o acordo homologado no TJMG) estao indisponiveis por vedacao eleitoral em 25/07/2026',
        'reversivel', true
      )
    )
WHERE id = '8f3ed1f8-bda6-4039-a079-6b1e1eced551'
  AND visivel IS DISTINCT FROM false;

-- romeu-zema | alta | "Equilíbrio fiscal: MG saiu do déficit após décadas"
-- A fonte viva empurra a leitura para o lado oposto do que esta publicado. O
-- STF homologou em 29/08/2024 a adesao de MG ao Regime de Recuperacao Fiscal,
-- descrito na propria decisao como programa para entes "em situacao de
-- desequilibrio financeiro", com o relator falando em "grave situacao fiscal de
-- Minas Gerais". A fonte morta ainda estava datada de 2023-06-01, anterior ao
-- fato que dizia noticiar. "Superavit primario" e "reduziu divida estadual" nao
-- tem fonte nenhuma.
UPDATE public.pontos_atencao
SET visivel = false,
    verificado = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1A',
        'veredito', 'precisa-reescrever',
        'motivo', 'fonte unica publicada retornava HTTP 404 e estava datada antes do fato; a fonte primaria do STF descreve a adesao ao RRF como programa para entes em desequilibrio financeiro, o oposto do enquadramento publicado de equilibrio fiscal',
        'fonte_morta', 'https://g1.globo.com/mg/minas-gerais/noticia/2023/minas-regime-recuperacao-fiscal.ghtml',
        'fonte_viva_anexada', 'https://noticias.stf.jus.br/postsnoticias/stf-homologa-acordo-para-ingresso-de-minas-gerais-do-regime-de-recuperacao-fiscal/',
        'reversivel', true
      )
    )
WHERE id = '346e2e83-b82c-4655-87d9-a46c28f60a2a'
  AND visivel IS DISTINCT FROM false;

-- ---------------------------------------------------------------------
-- GRUPO B: sem fonte (6 claims)
-- Busca honesta feita, nenhuma fonte encontrada. Nas duas primeiras, a fonte
-- primaria oficial DESMENTE a afirmacao publicada. A URL morta fica preservada
-- no registro como evidencia do que foi publicado.
-- ---------------------------------------------------------------------

-- renan-santos | CRITICA | "Investigado por organização criminosa (STF, inq. 4923)"
-- Esta e a claim do achado V2 do laudo, a unica das 18 com gerado_por =
-- 'curadoria' e verificado = false, que por isso escapou do gate.
-- Tres perguntas foram feitas a fonte primaria e todas responderam contra a
-- claim:
--   1. O INQ 4.923 existe. Sim.
--   2. Ele nomeia Renan Santos? NAO. A autuacao do proprio STF, em decisao
--      assinada digitalmente (codigo de autenticacao 1BAE-F489-0C8B-F8B0),
--      lista como investigados IBANEIS ROCHA BARROS JUNIOR, ANDERSON GUSTAVO
--      TORRES, FERNANDO DE SOUSA OLIVEIRA e FABIO AUGUSTO VIEIRA.
--   3. O teor bate? NAO. O objeto do 4.923 e a apuracao da conduta das
--      autoridades de seguranca do Distrito Federal (STF, 13/01/2023). O
--      inquerito que apura FINANCIAMENTO dos atos antidemocraticos e o INQ 4920
--      (STF, 23/01/2023): "O INQ 4920 apurara as condutas dos financiadores e
--      dos participes por auxilio material em relacao aos atos
--      antidemocraticos."
-- Ou seja: a claim imputa a uma pessoa nomeada a condicao de investigada em um
-- inquerito cujos investigados sao quatro outras pessoas, e descreve o objeto
-- desse inquerito errado. Nao e fonte que faltou, e atribuicao incorreta de um
-- processo criminal real. Sai do ar imediatamente.
UPDATE public.pontos_atencao
SET visivel = false,
    verificado = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1A',
        'veredito', 'sem-fonte',
        'motivo', 'fonte unica publicada retornava HTTP 404 e a fonte primaria desmente a claim: o INQ 4923 do STF nomeia Ibaneis Rocha, Anderson Torres, Fernando de Sousa Oliveira e Fabio Augusto Vieira, nao Renan Santos, e seu objeto e a conduta das autoridades de seguranca do DF, nao o financiamento de atos antidemocraticos (que e o INQ 4920)',
        'fonte_morta', 'https://g1.globo.com/politica/noticia/2023/stf-inquerito-atos.ghtml',
        'fonte_que_contradiz', 'https://noticias.stf.jus.br/postsnoticias/a-pedido-da-pgr-supremo-determina-abertura-de-inquerito-contra-ibaneis-rocha-e-anderson-torres/',
        'fonte_que_contradiz_2', 'https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=500967&ori=1',
        'reversivel', true
      )
    )
WHERE id = '8b186e05-787d-4ae9-bcbb-ed92e67079f5'
  AND visivel IS DISTINCT FROM false;

-- ronaldo-caiado | media | "Goiás com maior crescimento do PIB entre estados em 2023"
-- Desmentida pela fonte oficial do proprio estado. Boletim 057/2025 do
-- Instituto Mauro Borges (Secretaria-Geral de Governo de Goias, HTTP 200 em
-- 2026-07-25), que traria essa liderança se ela existisse:
--   "Em 2023, o PIB de Goias cresceu 4,8% em volume, alcancando o valor de
--    R$ 336,7 bilhoes, mantendo o estado na 9a posicao nacional, com 3,1% de
--    participacao no PIB brasileiro."
-- O mesmo boletim atribui o desempenho a agropecuaria (15,1%), nao a "atracao
-- de investimentos industriais" (industria 3,6%), como diz a descricao.
UPDATE public.pontos_atencao
SET visivel = false,
    verificado = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1A',
        'veredito', 'sem-fonte',
        'motivo', 'fonte unica publicada retornava HTTP 404 e o boletim oficial do proprio governo de Goias contradiz a claim: crescimento de 4,8% em volume e 9a posicao nacional, sem afirmacao de liderança de crescimento, com o desempenho atribuido a agropecuaria e nao a industria',
        'fonte_morta', 'https://g1.globo.com/go/goias/noticia/2024/pib-goias-crescimento.ghtml',
        'fonte_que_contradiz', 'https://goias.gov.br/imb/wp-content/uploads/sites/29/2025/12/Boletim_057_2025_PIB_dos_municipios_goianos_2025-1.pdf',
        'reversivel', true
      )
    )
WHERE id = '31aa4a8b-683f-49ac-814e-4ad3ae22d0a4'
  AND visivel IS DISTINCT FROM false;

-- ronaldo-caiado | media | "Grilagem de terras: fazenda Alianca contestada"
-- Busca dedicada por "fazenda Alianca" + Ronaldo Caiado nao encontrou mencao a
-- essa propriedade em fonte nenhuma. Os casos de grilagem em Goias que aparecem
-- na busca envolvem PARENTES de mesmo sobrenome, nao o governador. E o mesmo
-- padrao de troca de pessoa das claims dda6483f e 8b186e05.
-- Nota para reescrita: a parte sobre a UDR sobrevive com fonte de qualidade
-- (CPDOC/FGV, verbete tematico "Uniao Democratica Ruralista", HTTP 200:
-- "A figura de Ronaldo Caiado, principal articulador e primeiro presidente da
-- entidade (...)"), e pode virar uma claim nova, de outra categoria, sem a
-- imputacao de grilagem.
UPDATE public.pontos_atencao
SET visivel = false,
    verificado = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1A',
        'veredito', 'sem-fonte',
        'motivo', 'fonte unica publicada retornava HTTP 404; nenhuma fonte menciona a fazenda Alianca, e os casos de grilagem em Goias encontrados na busca envolvem parentes de mesmo sobrenome, nao o candidato',
        'fonte_morta', 'https://www1.folha.uol.com.br/poder/caiado-udr-terra.shtml',
        'parte_com_fonte_para_reescrita', 'https://www18.fgv.br/cpdoc/acervo/dicionarios/verbete-tematico/uniao-democratica-ruralista-udr',
        'reversivel', true
      )
    )
WHERE id = '67bd98a0-5610-4bf9-9591-3feb3846cf0a'
  AND visivel IS DISTINCT FROM false;

-- lula | alta | "Patrimônio cresceu 538% entre 2006 e 2018"
-- Nenhuma fonte publica os tres numeros juntos (R$ 952 mil, R$ 7,9 milhoes,
-- 538%). Alem disso, a claim e internamente inconsistente: de R$ 952 mil para
-- R$ 7,9 milhoes a variacao e de cerca de +730%, nao +538%. Para dar +538% o
-- valor final teria que ser cerca de R$ 6,07 milhoes. Numero que nao fecha com
-- a propria descricao e assinatura de valor gerado, nao apurado.
UPDATE public.pontos_atencao
SET visivel = false,
    verificado = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1A',
        'veredito', 'sem-fonte',
        'motivo', 'fonte unica publicada retornava HTTP 404 e nenhuma fonte publica os tres numeros; a claim ainda e internamente inconsistente, porque de R$ 952 mil para R$ 7,9 milhoes a variacao e de cerca de 730%, nao os 538% do titulo',
        'fonte_morta', 'https://www1.folha.uol.com.br/poder/2018/08/patrimonio-de-lula-cresceu-538-entre-2006-e-2018.shtml',
        'reversivel', true
      )
    )
WHERE id = '8934880a-258d-451a-bb9f-8bbfa6a13eea'
  AND visivel IS DISTINCT FROM false;

-- renan-santos | media | "Fundador do MBL, movimento que pede renovação mas centraliza poder"
-- "Hierarquia centralizada" e "sem transparencia financeira" sao juizos
-- avaliativos, e nenhuma das fontes vivas abertas na busca os formula. Nao ha
-- erro de imputacao aqui, ha ausencia de lastro para juizo de valor publicado
-- como se fosse achado apurado.
UPDATE public.pontos_atencao
SET visivel = false,
    verificado = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1A',
        'veredito', 'sem-fonte',
        'motivo', 'fonte unica publicada retornava HTTP 404 e nenhuma fonte viva formula os juizos publicados de hierarquia centralizada e ausencia de transparencia financeira',
        'fonte_morta', 'https://www1.folha.uol.com.br/poder/2019/mbl-financiamento.shtml',
        'reversivel', true
      )
    )
WHERE id = '360ede81-fd37-4343-93b3-dc4c3014ed36'
  AND visivel IS DISTINCT FROM false;

-- romeu-zema | media | "Elegeu-se como anti-política mas negociou com centrao"
-- Busca dedicada por aliancas de Zema com partidos do centrao na Assembleia de
-- Minas e pela composicao da base do governo mineiro nao retornou fonte
-- utilizavel. O enquadramento e plausivel e comum, mas plausivel nao e
-- verificado.
UPDATE public.pontos_atencao
SET visivel = false,
    verificado = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1A',
        'veredito', 'sem-fonte',
        'motivo', 'fonte unica publicada retornava HTTP 404 e a busca por aliancas do governo mineiro com partidos do centrao nao retornou nenhuma fonte viva utilizavel',
        'fonte_morta', 'https://www1.folha.uol.com.br/poder/2022/06/zema-constroi-alianca-com-centrao-em-minas-gerais.shtml',
        'reversivel', true
      )
    )
WHERE id = 'bd734f7a-5aeb-477e-83ea-70a3a492b150'
  AND visivel IS DISTINCT FROM false;

-- ---------------------------------------------------------------------
-- O QUE ESTA MIGRATION NAO RESOLVE, DE PROPOSITO
--
-- 1. O gate. Enquanto public.is_public_attention_point exigir verificacao
--    apenas de gerado_por = 'ia', uma claim critica de curadoria continua
--    passando (foi assim que 8b186e05 chegou ao ar). O que deveria disparar a
--    exigencia e a GRAVIDADE da afirmacao, nao quem a escreveu. Item 2 do
--    patch-list do laudo, fora do escopo desta migration de dados.
-- 2. O link-check periodico (item 3 do patch-list). Aviso para quem for
--    implementar: em 25/07/2026, agenciaminas.mg.gov.br (503),
--    agenciabrasil.ebc.com.br e paginas de noticia de goias.gov.br estao com
--    funcionalidades desativadas por VEDACAO ELEITORAL. Um job rodando agora
--    marcaria fonte oficial legitima como quebrada e despublicaria claim
--    correta. Prever esse caso antes de ligar a automacao.
-- 3. A reescrita editorial das 8 claims do Grupo A. E trabalho de texto, com
--    a fonte viva ja anexada pela migration anterior.
-- ---------------------------------------------------------------------

COMMIT;
