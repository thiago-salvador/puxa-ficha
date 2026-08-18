-- =====================================================================
-- [corrigido 03/08: a linha original dizia que nao estava aplicada; foi aplicada em 03/08/2026]
-- [corrigido 03/08: a linha original dizia que nao estava aplicada; foi aplicada em 03/08/2026]
--
-- Nos tres casos a fonte oficial ja esta citada na propria claim, ou e a
-- fonte oficial do proprio Legislativo, e e ela que lista o que o texto
-- deixou de fora. O defeito e de contagem.
--
-- CRITERIO: mandato por CARGO ELETIVO DISTINTO. Reeleicao e segundo periodo
-- no mesmo cargo nao viram unidade nova. Cargo de nomeacao (Ministro,
-- Secretario) nao conta, e cargo ASSUMIDO POR SUCESSAO tambem nao: quem
-- assume por sucessao nao foi eleito para aquele cargo. Este segundo ponto
-- e o que corrige a versao anterior desta migration, descrita abaixo.
--
-- ricardo-ferraco: o texto diz 4 e lista Vereador, Deputado Estadual,
--   Vice-Governador e GOVERNADOR. Faltam Deputado Federal (1999-2003) e
--   Senador (2011-2019), confirmados na biografia oficial do governo do ES
--   e na ficha arquivistica do Senado. Mas o "Governador" da lista atual
--   NAO e mandato eletivo: nenhuma das tres fontes oficiais consultadas
--   registra Ferraco eleito Governador; ele foi eleito Vice-Governador duas
--   vezes e assumiu o governo por sucessao em 02/04/2026. Entao a contagem
--   correta e 5 cargos eletivos, nao 6.
--
--   CORRECAO DE UMA CORRECAO: a primeira versao desta migration dizia 6 e
--   mantinha "Governador" na lista de mandatos. Estava errada, e teria
--   publicado como mandato eletivo um cargo que a fonte nao sustenta. O erro
--   apareceu quando um segundo fact-check independente discordou do primeiro
--   e a revalidacao foi feita nas fontes oficiais.
--
-- laurez-moreira: o texto diz 3 e omite Deputado Federal. A unica fonte da
--   claim, a biografia da Camara, diz literalmente: "Renunciou ao mandato de
--   Deputado Federal, na Legislatura 2011-2015, para assumir o mandato de
--   Prefeito do Municipio de Gurupi".
--
-- cleitinho: o texto diz 1 e lista so Senador. A pagina oficial da ALMG
--   registra mandato de Deputado Estadual efetivo de 01/02/2019 a 31/01/2023
--   e tambem o mandato anterior de Vereador em Divinopolis (2017-2019).
--   Dois fact-checks independentes divergiram aqui, e a fonte primaria do
--   proprio Legislativo mineiro desempatou.
--
-- EFEITO NO SITE: as tres continuam no ar. Mudam titulo e descricao.
-- `visivel`, `verificado` e `fontes` nao sao tocados, e os tres UPDATEs
-- exigem `visivel = true` na clausula.
--
-- FORA DESTA MIGRATION, DE PROPOSITO: a claim do romeu-zema sobre o acordo
-- de Brumadinho. O fact-check sugeriu despublicar por atribuir protagonismo
-- a ele, mas o texto credita "a Vale e o governo de Minas Gerais" e marca o
-- superlativo como "apresentado pelo governo estadual como". Os fatos
-- conferem na fonte. Despublicar claim factualmente correta e decisao
-- editorial, nao consequencia do fact-check.
-- =====================================================================
--
-- ---------------------------------------------------------------------
-- REGISTRO DE APLICACAO (cabecalho que veio junto com a versao as-applied):
-- Tres claims NO AR que contam mandatos errado.
-- Aprovado por Thiago em 2026-08-03 (payload cruzamento-factchecks, acao B=aplicar).
-- Criterio: cargo eletivo distinto. Nomeacao nao conta, e sucessao tambem nao.

-- @write tabela=pontos_atencao slug=ricardo-ferraco campos=titulo,descricao
--
-- PROVENIENCIA (03/08/2026). Este arquivo e a versao as-applied, recuperada
-- por `supabase migration fetch`, e e o nome que o ledger de producao conhece.
-- O raciocinio acima foi portado de 20260803120000_mandatos_omitidos_ferraco_laurez.sql,
-- escrita a mao e deixada em branch nao mergeada. O SQL das duas e identico,
-- conferido por comparacao normalizada. So comentario mudou aqui.
-- ---------------------------------------------------------------------

UPDATE public.pontos_atencao pa
SET titulo = 'Carreira política: 5 cargo(s) eletivo(s) registrado(s)',
    descricao = 'Ricardo de Rezende Ferraço (MDB) possui 5 cargo(s) eletivo(s) registrado(s): Vereador (Cachoeiro de Itapemirim), Deputado Estadual (ES, dois mandatos), Deputado Federal (ES, 1999-2003), Vice-Governador (ES, dois mandatos) e Senador (ES, 2011-2019). Assumiu o governo do Espírito Santo em 2 de abril de 2026 por sucessão, sem ter sido eleito para o cargo.'
FROM public.candidatos c
WHERE c.id = pa.candidato_id
  AND c.slug = 'ricardo-ferraco'
  AND pa.id = '337bc0e5-614c-433d-8da9-584e3fee29f7'
  AND pa.visivel = true;

-- @write tabela=pontos_atencao slug=laurez-moreira campos=titulo,descricao
UPDATE public.pontos_atencao pa
SET titulo = 'Carreira política: 4 mandato(s) registrado(s)',
    descricao = 'Laurez da Rocha Moreira (PSD) possui 4 mandato(s) registrado(s): Vereador (TO), Deputado Estadual (TO), Deputado Federal (TO), Prefeito (Gurupi). Renunciou ao mandato de Deputado Federal, na legislatura 2011-2015, para assumir a Prefeitura de Gurupi.'
FROM public.candidatos c
WHERE c.id = pa.candidato_id
  AND c.slug = 'laurez-moreira'
  AND pa.id = 'a9530d43-5506-49cd-b316-ae174335aefe'
  AND pa.visivel = true;

-- @write tabela=pontos_atencao slug=cleitinho campos=titulo,descricao
UPDATE public.pontos_atencao pa
SET titulo = 'Carreira política: 3 mandato(s) registrado(s)',
    descricao = 'Cleitinho Azevedo (REPUBLICANOS) possui 3 mandato(s) registrado(s): Vereador (Divinópolis), Deputado Estadual (MG, 2019-2023) e Senador (MG). A página oficial da Assembleia Legislativa de Minas Gerais registra o mandato estadual como efetivo, encerrado para assumir o Senado.'
FROM public.candidatos c
WHERE c.id = pa.candidato_id
  AND c.slug = 'cleitinho'
  AND pa.id = '07fc71d4-ad3a-4acd-ac99-222f5d94a2f8'
  AND pa.visivel = true;;
