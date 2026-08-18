-- Votos-chave de Mailza Gomes durante o mandato no Senado (2019-2022).
-- O recorte grava somente as três votações-chave já existentes no banco.
--
-- FONTE: dados abertos do Senado, legis.senado.leg.br/dadosabertos/materia/
-- votacoes/<codigo>, consultados em 2026-08-03. `votacoes_chave.proposicao_id`
-- guarda o CÓDIGO DE MATÉRIA do Senado, que é a chave que ingest-senado.ts usa
-- para casar voto (`Materia.Codigo`), não o número da proposição.
--
--   137999 = PEC 6/2019, Reforma da Previdência
--   135147 = PLP 19/2019, Autonomia do Banco Central
--   146740 = MPV 1031/2021, desestatização da Eletrobras
--
-- ATENÇÃO, correção de 2026-08-03: a Eletrobras estava ancorada em 150041, que
-- é RQS 2101/2021 ("Audiência da CAE sobre o PL nº 3289/2021") e não tem votação
-- nenhuma. O código correto é 146740, corrigido na migration imediatamente
-- anterior (20260802200050). Ver o comentário dela para o efeito colateral.
--
-- COMO CADA VOTO FOI APURADO, e onde o vocabulário da tabela perde informação:
--
--   137999 -> 'sim'. A matéria tem 11 votações. Mailza votou Sim nas duas do
--     TEXTO PRINCIPAL (1º e 2º turno), que é o que o título da linha
--     ("Reforma da Previdencia") afirma. Ela votou Não em 2 das 11, ambas
--     emendas que AMPLIAVAM direito (aposentadoria especial e supressão do
--     "no âmbito da União"); a linha única não expressa isso.
--
--   135147 -> 'ausente'. Nas duas votações (Emenda 12 e Emenda 18/Substitutivo)
--     ela consta com o código AP. Na mesma chamada convivem Não 50, Sim 12,
--     P-NRV 10, AP 7 e Presidente (art. 51 RISF) 1, ou seja AP é categoria
--     PRÓPRIA: ausência por atividade parlamentar autorizada, distinta de
--     P-NRV (presente e não registrou voto) e de falta simples. O vocabulário
--     de votos_candidato só admite sim/não/abstenção/ausente/obstrução, então
--     'ausente' é o balde correto, mas a qualificação se perde na exibição.
--     Se a ficha passar a distinguir ausência justificada, esta linha é uma das
--     que precisam voltar.
--
--   146740 -> 'sim'. Mailza votou Sim nas duas votações de mérito (pressupostos
--     de relevância/urgência e o texto da desestatização). Nas duas emendas
--     destacadas (610 e 618) ela consta P-NRV, que também colapsa em 'ausente';
--     o 'sim' registrado aqui é o do texto principal, coerente com o título.

-- @write tabela=votos_candidato slug=mailza-assis proposicao=137999 campos=voto
INSERT INTO public.votos_candidato (candidato_id, votacao_id, voto)
SELECT c.id, v.id, 'sim'
FROM public.candidatos c
JOIN public.votacoes_chave v ON v.proposicao_id = '137999'
WHERE c.slug = 'mailza-assis'
ON CONFLICT (candidato_id, votacao_id) DO NOTHING;

-- @write tabela=votos_candidato slug=mailza-assis proposicao=135147 campos=voto
INSERT INTO public.votos_candidato (candidato_id, votacao_id, voto)
SELECT c.id, v.id, 'ausente'
FROM public.candidatos c
JOIN public.votacoes_chave v ON v.proposicao_id = '135147'
WHERE c.slug = 'mailza-assis'
ON CONFLICT (candidato_id, votacao_id) DO NOTHING;

-- @write tabela=votos_candidato slug=mailza-assis proposicao=146740 campos=voto
INSERT INTO public.votos_candidato (candidato_id, votacao_id, voto)
SELECT c.id, v.id, 'sim'
FROM public.candidatos c
JOIN public.votacoes_chave v ON v.proposicao_id = '146740'
WHERE c.slug = 'mailza-assis'
ON CONFLICT (candidato_id, votacao_id) DO NOTHING;
