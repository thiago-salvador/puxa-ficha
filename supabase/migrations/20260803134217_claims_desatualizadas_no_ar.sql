-- =====================================================================
-- Duas claims NO AR cujo texto deixou de ser verdadeiro depois de publicado.
-- [corrigido 03/08: a linha original dizia que nao estava aplicada; foi aplicada em 03/08/2026]
--
-- As duas foram achadas cruzando DOIS fact-checks independentes das mesmas
-- claims, feitos por sessoes diferentes. Onde os dois discordaram, a fonte
-- oficial desempatou. Nos dois casos abaixo, quem estava certo era o
-- fact-check que eu NAO tinha usado.
--
-- ciro-gomes-gov-ce (a mais grave, e a mais urgente do lote)
--   O texto no ar termina com "O recebimento da denuncia tornou-o reu, mas
--   nao equivale a condenacao". Isso era verdade quando foi escrito e deixou
--   de ser: em 18/05/2026, decisao publicada em 19/05/2026, o juiz da 115a
--   Zona Eleitoral condenou Ciro Gomes por violencia politica de genero
--   (art. 326-B do Codigo Eleitoral) contra Janaina Farias, a 1 ano e 4 meses
--   de reclusao, convertidos em penas restritivas de direitos, mais multa. Em
--   09/07/2026 o mesmo colegiado do TRE-CE rejeitou os embargos de declaracao
--   da defesa e manteve a condenacao.
--
--   O texto novo diz o que a fonte sustenta e nada alem: ha condenacao em
--   primeira instancia, ela NAO transitou em julgado, e cabe recurso. Nao
--   afirma culpa definitiva, que seria ir alem da fonte na direcao oposta.
--
-- acm-neto (contas de 2017)
--   Aqui o defeito e interno: o TITULO diz "aprovou por unanimidade as contas
--   de 2017" e a DESCRICAO da mesma claim diz "aprovou com ressalvas, por
--   unanimidade". O titulo contradiz o proprio corpo, e a fonte oficial do
--   TCM-BA e explicita: "aprovou com ressalvas, na sessao desta quarta-feira
--   (19/12), as contas do prefeito de Salvador ... relativas ao exercicio de
--   2017". Titulo e o que a maioria le. So o titulo muda.
--
-- EFEITO NO SITE: as duas continuam no ar. `visivel`, `verificado` e as
-- `fontes` nao sao tocados. A claim do Ciro ganha fonte nova porque a
-- afirmacao nova precisa de lastro proprio; a do ACM Neto nao, porque a fonte
-- ja citada e a que sustenta o titulo corrigido.
-- =====================================================================
--
-- ---------------------------------------------------------------------
-- REGISTRO DE APLICACAO (cabecalho que veio junto com a versao as-applied):
-- Duas claims NO AR cujo texto deixou de ser verdadeiro depois de publicado.
-- Aprovado por Thiago em 2026-08-03 (payload cruzamento-factchecks, acao A=aplicar).
-- Achadas cruzando dois fact-checks independentes das mesmas claims.

-- @write tabela=pontos_atencao slug=ciro-gomes-gov-ce campos=titulo,descricao,fontes
--
-- PROVENIENCIA (03/08/2026). Este arquivo e a versao as-applied, recuperada
-- por `supabase migration fetch`, e e o nome que o ledger de producao conhece.
-- O raciocinio acima foi portado de 20260803130000_claims_desatualizadas_no_ar.sql,
-- escrita a mao e deixada em branch nao mergeada. O SQL das duas e identico,
-- conferido por comparacao normalizada. So comentario mudou aqui.
-- ---------------------------------------------------------------------

UPDATE public.pontos_atencao pa
SET titulo = 'Condenado em primeira instância por violência política de gênero, sem trânsito em julgado',
    descricao = 'Em julho de 2024, a 115ª Zona Eleitoral recebeu denúncia do Ministério Público contra Ciro Gomes por violência política de gênero, relacionada a declarações sobre a senadora Janaína Farias. Em 18 de maio de 2026, com decisão publicada no dia seguinte, ele foi condenado em primeira instância a 1 ano e 4 meses de reclusão, convertidos em penas restritivas de direitos, mais multa. Em 9 de julho de 2026 o TRE-CE rejeitou os embargos de declaração da defesa e manteve a condenação. A sentença é de primeira instância e ainda cabe recurso, portanto não há trânsito em julgado.',
    fontes = '[{"url": "https://g1.globo.com/ce/ceara/noticia/2026/05/19/ciro-gomes-e-condenado-por-violencia-politica-de-genero-por-comentarios-sobre-prefeita-de-crateus-janaina-farias.ghtml", "data": "2026-05-19", "titulo": "G1: Ciro Gomes e condenado por violencia politica de genero"}, {"url": "https://mpce.mp.br/denuncia-do-mp-contra-ciro-gomes-por-crime-de-violencia-politica-de-genero-e-aceita-pela-justica-eleitoral/", "data": "2024-07-11", "titulo": "MPCE: denuncia por violencia politica de genero aceita pela Justica Eleitoral"}]'::jsonb
FROM public.candidatos c
WHERE c.id = pa.candidato_id
  AND c.slug = 'ciro-gomes-gov-ce'
  AND pa.id = 'e01bbf63-93f7-4726-ade0-9861e693f397'
  AND pa.visivel = true;

-- @write tabela=pontos_atencao slug=acm-neto campos=titulo
UPDATE public.pontos_atencao pa
SET titulo = 'TCM-BA aprovou com ressalvas, por unanimidade, as contas de 2017, com queda no gasto com publicidade'
FROM public.candidatos c
WHERE c.id = pa.candidato_id
  AND c.slug = 'acm-neto'
  AND pa.id = '7ce00008-0725-4a00-8e01-000000000008'
  AND pa.visivel = true;;
