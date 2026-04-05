-- proposicao_id 2337654 retorna 404 em https://dadosabertos.camara.leg.br/api/v2/proposicoes/2337654/votacoes
-- e faz a ingestao da Camara falhar naquele item antes de processar as demais chaves.
-- Curadoria: reatribuir ID correto (Câmara ou Senado) antes de depender de votos automaticos para essa linha.

UPDATE votacoes_chave
SET proposicao_id = NULL
WHERE proposicao_id = '2337654';
