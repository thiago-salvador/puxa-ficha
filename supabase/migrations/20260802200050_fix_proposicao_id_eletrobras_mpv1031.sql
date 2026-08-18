-- Correção de dado de REFERÊNCIA: a linha "Privatização da Eletrobras (Senado)"
-- de votacoes_chave carrega o código de matéria errado.
--
-- O QUE ESTÁ ERRADO
-- `proposicao_id` = '150041'. Consultado em legis.senado.leg.br/dadosabertos
-- em 2026-08-03, o código 150041 é **RQS 2101/2021**, subtipo Requerimento,
-- ementa "Audiência da CAE sobre o PL nº 3289/2021", e `materia/votacoes/150041`
-- devolve o bloco Votacoes VAZIO. Não tem relação com a desestatização.
--
-- O CÓDIGO CERTO
-- '146740' = **MPV 1031/2021**, "Dispõe sobre a desestatização da empresa
-- Centrais Elétricas Brasileiras S.A. - Eletrobras...", com 4 votações no
-- Senado, entre elas a do texto em 2021-06-17, que é a data já gravada na linha.
--
-- POR QUE ISSO IMPORTA ALÉM DA PROVENIÊNCIA
-- `scripts/lib/ingest-senado.ts` casa voto de senador por `proposicao_id`
-- (`proposicaoMap.get(materiaId)`). Com o código errado, nenhum voto de MPV
-- 1031 jamais casou: a linha está com 0 votos em produção desde que existe, e
-- continuaria assim para sempre. Não é só rótulo errado, é uma rota de ingestão
-- permanentemente morta.
--
-- EFEITO COLATERAL A CONHECER ANTES DE RODAR O INGEST
-- A matéria 146740 tem 4 votações e votacoes_chave guarda UMA linha por matéria.
-- O laço de ingest-senado.ts faz upsert por (candidato_id, votacao_id) para cada
-- votação da mesma matéria, então o ÚLTIMO voto lido sobrescreve os anteriores.
-- Para Mailza a ordem da API é Sim, Sim, P-NRV, P-NRV, ou seja um ingest futuro
-- pode trocar o 'sim' de mérito por 'ausente'. Isso NÃO é introduzido aqui (a
-- matéria 137999, com 11 votações, já tem exatamente a mesma característica),
-- mas passa a alcançar a Eletrobras assim que a rota destrava. Decidir qual
-- votação é a canônica por matéria é mudança de produto, fora do escopo desta
-- correção, e está registrada como pendência.
--
-- Guardas: condicionado ao valor errado atual e ao título, então é idempotente
-- e a reversão é mecânica (trocar 146740 por 150041). Não toca nenhuma outra
-- linha: `proposicao_id` 150041 aparece uma única vez na tabela.

-- @write tabela=votacoes_chave ref=146740 campos=proposicao_id
UPDATE public.votacoes_chave
   SET proposicao_id = '146740'
 WHERE proposicao_id = '150041'
   AND casa = 'Senado'
   AND titulo = 'Privatização da Eletrobras (Senado)';
