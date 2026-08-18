-- =====================================================================
-- Correções de texto em 5 claims publicadas dos pré-candidatos à Presidência.
-- Branch data/presidenciaveis-lacunas (2026-08-03).
--
-- ORIGEM
-- Verificação claim a claim das 17 que estavam no ar, feita abrindo cada fonte
-- citada. Aprovadas por Thiago em 2026-08-03 na página de correções
-- (payload versao=correcoes-claims-v1, ações corrigir-4, 15, 17, 24, 25).
-- Allowlist fechada por id de claim em
-- scripts/audit/allowlist-correcoes-claims.json
--
-- O QUE ESTA MIGRATION NÃO FAZ
-- Não despublica nada, não mexe em `visivel` nem em `verificado`, não toca em
-- nenhuma claim fora das 5 listadas. Todas continuam no ar, com texto corrigido.
--
-- OS CINCO CASOS, E O QUE A FONTE DIZ
--
-- 1) flavio-bolsonaro, mansão (claim 4). A CNN Brasil, fonte já citada na
--    própria claim, escreve "compra mansão de 1.000 m² por R$ 5,9 milhões".
--    O texto publicado dizia R$ 6 milhões, arredondando para cima em claim de
--    patrimônio de gravidade alta, e afirmava que a compra "gerou
--    questionamentos" sem que a fonte atribua isso a ninguém. Sai o
--    arredondamento, sai o questionamento sem dono, entra a metragem que a
--    fonte traz.
--
-- 2) lula, PIB do primeiro mandato (claim 15). ERRO FACTUAL. O link citado é a
--    página inicial do Sistema de Contas Nacionais Trimestrais do IBGE, e o
--    número 4,1 não aparece nela. A série anual oficial do IBGE para o período
--    é 1,1% (2003), 5,7% (2004), 3,2% (2005) e 4,0% (2006), média de 3,5%.
--    Releases oficiais usados como fonte nova:
--      https://agenciadenoticias.ibge.gov.br/.../13389-asi-pib-cresceu-32-e-foi-de-r-21-trilhoes-em-2005
--      https://agenciadenoticias.ibge.gov.br/.../13565-asi-pib-cresceu-40-e-foi-de-r-237-trilhoes-em-2006
--    Os "9 milhões de empregos formais" e o "aumento real do salário mínimo de
--    46%" saem do texto: nenhuma fonte localizada os sustenta no recorte
--    2003-2006. Esta é a única das cinco que troca `fontes`.
--
-- 3) renan-santos, condenações (claim 17). Das cinco decisões empilhadas, duas
--    foram confirmadas nas fontes citadas (R$ 60 mil a Caetano Veloso e Paula
--    Lavigne, junto com Kim Kataguiri, Diário Carioca 17/08/2024; R$ 100 mil
--    penhorados, Revista Fórum 22/01/2024) e três não foram localizadas em
--    fonte nenhuma (R$ 20 mil a André Fernandes, R$ 4 mil a Gil Diniz, e a
--    queixa-crime de Elmano de Freitas com pena de até 9 anos). Ficam as duas
--    confirmadas; as três saem até que cada processo seja aberto.
--
-- 4) ronaldo-caiado, partidos (claim 24). ERRO FACTUAL. O texto listava
--    "PSD, PFL, DEM, PRB, DEM e Uniao Brasil". O PRB não aparece na biografia
--    da Câmara (que a própria claim cita), não aparece no perfil do Senado e
--    não aparece no histórico político do nosso banco, que registra PSD 1991,
--    PFL até 2010, DEM de 2010 a 2022, União Brasil em 2022 e PSD em 2026.
--    Além disso o DEM era contado duas vezes, e o título falava em 6 partidos
--    para uma lista de 5. A reescrita usa a cronologia das fontes oficiais e
--    explicita que PFL, DEM e União Brasil são a mesma legenda renomeada e
--    fundida, que é justamente o que a contagem antiga escondia.
--
-- 5) ronaldo-caiado, relação com Bolsonaro (claim 25). A matéria do Terra
--    confirma o apoio em 2018 e traz fala do próprio Bolsonaro, "Em quatro
--    momentos, ele rompeu comigo enquanto na Presidência da República". Mas a
--    palavra lockdown não aparece na matéria, nem as datas de 2021 e 2023 que o
--    texto publicava. Fica o que a fonte data, sai a atribuição de intenção
--    ("conveniência política"), que é juízo e não fato.
--
-- PADRÃO ATRÁS DE 4 DOS 5 CASOS
-- Não é coincidência: os textos misturavam fato datado com caracterização do
-- candidato. O fato sobrevive à checagem, a caracterização não. As correções
-- mantêm o primeiro e removem a segunda.
-- =====================================================================
--
-- ---------------------------------------------------------------------
-- REGISTRO DE APLICACAO (cabecalho que veio junto com a versao as-applied):
-- Correções de texto em 5 claims publicadas dos pré-candidatos à Presidência.
-- Verificação claim a claim das 17 no ar, abrindo cada fonte citada.
-- Aprovada por Thiago em 2026-08-03 (payload correcoes-claims-v1).
-- Detalhe completo, caso a caso, em
-- supabase/migrations/20260803100000_correcoes_claims_presidenciaveis_pos_factcheck.sql
-- Não despublica nada e não toca em visivel nem verificado.
--
-- PROVENIENCIA (03/08/2026). Este arquivo e a versao as-applied, recuperada
-- por `supabase migration fetch`, e e o nome que o ledger de producao conhece.
-- O raciocinio acima foi portado de 20260803100000_correcoes_claims_presidenciaveis_pos_factcheck.sql,
-- escrita a mao e deixada em branch nao mergeada. O SQL das duas e identico,
-- conferido por comparacao normalizada. So comentario mudou aqui.
-- ---------------------------------------------------------------------

UPDATE public.pontos_atencao pa
SET titulo = 'Mansão de R$ 5,9 milhões comprada durante mandato',
    descricao = 'Comprou mansão de 1.000 m² por R$ 5,9 milhões em Brasília em 2021, durante o mandato de senador.'
FROM public.candidatos c
WHERE c.id = pa.candidato_id
  AND c.slug = 'flavio-bolsonaro'
  AND pa.id = '9c933004-b41a-408a-82f5-2bbaa29dd74c';

UPDATE public.pontos_atencao pa
SET titulo = 'PIB cresceu 3,5% ao ano no primeiro mandato (2003-2006)',
    descricao = 'A economia brasileira cresceu em média 3,5% ao ano no primeiro mandato: 1,1% em 2003, 5,7% em 2004, 3,2% em 2005 e 4,0% em 2006, segundo o IBGE.',
    fontes = '[{"titulo": "IBGE: PIB cresceu 3,2% e foi de R$ 2,1 trilhões em 2005", "url": "https://agenciadenoticias.ibge.gov.br/agencia-sala-de-imprensa/2013-agencia-de-noticias/releases/13389-asi-pib-cresceu-32-e-foi-de-r-21-trilhoes-em-2005"}, {"titulo": "IBGE: PIB cresceu 4,0% e foi de R$ 2,37 trilhões em 2006", "url": "https://agenciadenoticias.ibge.gov.br/agencia-sala-de-imprensa/2013-agencia-de-noticias/releases/13565-asi-pib-cresceu-40-e-foi-de-r-237-trilhoes-em-2006"}]'::jsonb
FROM public.candidatos c
WHERE c.id = pa.candidato_id
  AND c.slug = 'lula'
  AND pa.id = '612f6a0a-9fc9-47d2-9023-1cf9cab3ca9f';

UPDATE public.pontos_atencao pa
SET titulo = 'Condenação a indenizar Caetano Veloso e penhora de R$ 100 mil',
    descricao = 'Condenado em 2024, junto com Kim Kataguiri, a indenizar Caetano Veloso e Paula Lavigne em R$ 60 mil por associação indevida com pedofilia. Em janeiro de 2024 teve R$ 100 mil penhorados pela Justiça.'
FROM public.candidatos c
WHERE c.id = pa.candidato_id
  AND c.slug = 'renan-santos'
  AND pa.id = '4229b371-7908-4d31-b593-6c8257ca2ea3';

UPDATE public.pontos_atencao pa
SET titulo = 'Do PSD ao PSD: as legendas em mais de 30 anos',
    descricao = 'Começou no PSD, pelo qual se elegeu deputado federal em 1991, e passou ao PFL, legenda que virou DEM em 2007 e se fundiu no União Brasil em 2022. Voltou ao PSD, partido pelo qual governa Goiás desde 2026.'
FROM public.candidatos c
WHERE c.id = pa.candidato_id
  AND c.slug = 'ronaldo-caiado'
  AND pa.id = '7b123f00-93a6-44b2-9fb0-4723f3c23513';

UPDATE public.pontos_atencao pa
SET titulo = 'Rompimentos e reaproximações com Bolsonaro',
    descricao = 'Apoiou Bolsonaro na eleição de 2018. O próprio Bolsonaro afirmou depois que Caiado, nas palavras dele, rompeu com o governo em quatro momentos ao longo do mandato presidencial.'
FROM public.candidatos c
WHERE c.id = pa.candidato_id
  AND c.slug = 'ronaldo-caiado'
  AND pa.id = '8ef45b5e-93e6-4ba9-9bdd-a2985e7d2f16';;
