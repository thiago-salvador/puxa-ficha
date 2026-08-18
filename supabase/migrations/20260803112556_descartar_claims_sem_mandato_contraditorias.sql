-- =====================================================================
-- Descarta 33 claims "Sem historico de mandato eletivo registrado" que o
-- proprio banco contradiz, e troca a fonte morta da claim do Alvaro Dias.
-- Branch data/presidenciaveis-lacunas (2026-08-03).
--
-- Aprovado por Thiago em 2026-08-03 (payload factcheck-governadores-v1,
-- acoes limpar-33 e trocar-fonte-alvaro).
--
-- POR QUE ESTAS 33 EXISTEM, E POR QUE NAO SAO ALUCINACAO
-- As duas familias de claim geradas em lote ("Sem historico de mandato
-- eletivo registrado" e "Carreira politica: N mandato(s)") tem 121 registros
-- criados TODOS em 2026-03-31, num unico carregamento. Nao ha gerador rodando.
-- O historico politico dos mesmos candidatos chegou DEPOIS: 85 linhas de
-- mandato em 06/04, 32 em 11/04, mais lotes ate julho. Em 31/03 havia 1 linha.
-- Ou seja, a afirmacao era verdadeira quando foi escrita, porque o banco de
-- fato nao tinha o historico, e virou falsa quando o historico foi preenchido.
-- E dado que envelheceu sem revalidacao.
--
-- CRITERIO DA SELECAO (mecanico, nao editorial)
-- Entram as claims desta familia cujo candidato tem, no NOSSO proprio
-- historico_politico, ao menos um evento com tipo_evento = 'mandato' e
-- cargo_canonico ELETIVO (Presidente, Governador, Prefeito, Senador, Deputado
-- Federal, Deputado Estadual, Deputado Distrital, Vereador e os tres vices).
-- Cargo por nomeacao (Ministro, Secretario, Interventor, presidencia de
-- autarquia) NAO conta, porque a claim fala de mandato ELETIVO.
--
-- A REGRA FOI TESTADA CONTRA A REALIDADE, NOS DOIS SENTIDOS
-- O fact-check externo de 2026-08-03, feito por quatro grupos que nao
-- conheciam este criterio, bateu com ele:
--   - Exclui certo: Ricardo Cappelli e Cadu Xavier ficam de fora, porque o
--     historico deles so tem cargo de nomeacao. O grupo do DF confirmou por
--     fonte externa que a claim do Cappelli esta CORRETA e deve ficar.
--   - Inclui certo: Alan Rick (senador desde 2023), Mailza Assis (senadora em
--     2019, governadora do AC desde abril de 2026), Dr. Furlan (deputado
--     estadual 2015-2020), Eduardo Girao (senador desde 2019), Leandro Grass
--     (deputado distrital), Paula Belmonte (deputada federal 2019-2022) e
--     Arthur Henrique (prefeito de Boa Vista reeleito em 2024) foram todos
--     confirmados com mandato eletivo real, por fonte externa.
--   - Nao alcanca quem nao tem historico: Ronaldo Mansur e Marcelo Brigadeiro
--     seguem de pe, e os dois foram confirmados como VERDADEIROS.
--
-- EFEITO NO SITE: NENHUM. Todas as 33 ja estao com visivel = false. Elas
-- estavam na fila de publicacao. O que esta migration faz e marcar o motivo,
-- para que nunca sejam publicadas por engano. A coluna visivel nao e tocada.
--
-- ALEM DISSO: a claim do Alvaro Dias (RN) sobre a AIJE esta NO AR e e a unica
-- acusacao publicada cuja fonte nao respondia. O conteudo foi confirmado em
-- fonte viva, entao a claim fica, e so a URL e trocada.
-- =====================================================================
--
-- ---------------------------------------------------------------------
-- REGISTRO DE APLICACAO (cabecalho que veio junto com a versao as-applied):
-- Descarta claims "Sem historico de mandato eletivo registrado" que o proprio
-- banco contradiz, e troca a fonte morta da claim do Alvaro Dias.
-- Aprovado por Thiago em 2026-08-03 (payload consolidacao-executada, acao A=aplicar).
-- Nenhuma das 33 esta no ar: todas com visivel = false, coluna nao tocada.
--
-- PROVENIENCIA (03/08/2026). Este arquivo e a versao as-applied, recuperada
-- por `supabase migration fetch`, e e o nome que o ledger de producao conhece.
-- O raciocinio acima foi portado de 20260803110000_descartar_claims_sem_mandato_contraditorias.sql,
-- escrita a mao e deixada em branch nao mergeada. O SQL das duas e identico,
-- conferido por comparacao normalizada. So comentario mudou aqui.
-- ---------------------------------------------------------------------

UPDATE public.pontos_atencao
SET despublicacao_motivo = 'familia-sem-mandato-eletivo: claim gerada no lote de 2026-03-31, quando o historico politico do candidato ainda nao tinha sido carregado. O historico chegou entre 06/04 e julho de 2026 e registra mandato eletivo para este candidato, contradizendo o texto. Descartada em 2026-08-03 apos fact-check com fonte externa. Nunca esteve publicada.',
    despublicado_em = now()
WHERE id IN (
    '367f4442-4146-4be0-b20a-30e89bc27337',
    '6e668ed7-c226-4111-bdf9-60d4348e9d4e',
    '69ed52a2-5177-4248-946d-c04734c2af0f',
    '873ea3ae-c003-45b7-bb74-6c8e624864f9',
    'a00d919e-268b-46c4-a277-1c49cd931a0a',
    '575d2379-025a-4f77-803b-3aed7ad1ee1c',
    '436ebb81-a612-4706-9e42-09015ba5de3a',
    '0060d42d-335d-4da2-afe4-18359d3507e1',
    '280c85fc-a3a8-4f8e-b081-d3d5b7d3cc5c',
    '736ecdc1-f783-4e0e-a5d8-3ba00863ae60',
    '4f10f3ad-7f12-4877-ac2d-4e6a29bbbb86',
    'cbfe4606-16bc-4d66-a71d-206687f94674',
    '499dbadc-be03-43db-8352-43d7abd45be0',
    '3569e398-4ea7-4452-b78f-ea28c00d3de4',
    '728df245-2b23-4600-af41-bb20abc26a54',
    '1f2b7b85-dae2-4fa8-890e-f2c105d0916e',
    '3ebc4da9-95b7-4518-9dc4-96bc2ae2baa1',
    '826f8b9e-3b43-4d2f-9c7a-97db2dd481ff',
    'b8043d05-70df-481e-907d-6f8fca2af2d0',
    '4fffd306-ec78-4da2-a73c-36d0849495c1',
    '7bdd835a-3c35-4a94-9926-f293e24c0cf2',
    '86a548b7-085b-4ba9-a195-7cf4876de197',
    '9faa27f0-2e3f-4014-8327-e7caf5db6501',
    'a623e29e-dc57-49b1-b9ab-aef763fefdbd',
    '26d84fd1-442a-4a19-8dbd-f6ba37df0102',
    'f2de039e-621c-4e0d-b158-c51ceb7e3b75',
    '7680c5aa-5e11-4fc3-9a61-22b11763d96d',
    'ec9f865a-e1d2-43c9-824a-5e2f2fae8327',
    '46456de7-0984-4b7a-ab37-61cb54054f4b',
    '9f42bbdb-09c8-4a1e-b32d-f5db79a59c5f',
    '87f3be72-7e0e-441b-83b7-35b06e4babfe',
    '47a606c9-eaff-476c-912d-9ede3b371172',
    '6eea7760-b72d-45c4-ae23-914f542ca7f0'
  )
  AND visivel = false
  AND despublicacao_motivo IS NULL;

UPDATE public.pontos_atencao pa
SET fontes = '[{"url": "https://agorarn.com.br/ultimas/justic-inclui-alvaro-dias-abuso-poder/", "data": "2025-02-20", "titulo": "Justica mantem provas e inclui ex-prefeito Alvaro Dias como reu em acao por abuso de poder nas eleicoes"}, {"url": "https://www.mprn.mp.br/noticias/natal-mprn-obtem-decisao-favoravel-e-mantem-ex-prefeito-de-natal-no-polo-passivo-de-acao-eleitoral/", "data": "2025-02-20", "titulo": "MPRN mantem ex-prefeito no polo passivo de acao eleitoral (fonte primaria, fora do ar para acesso automatizado em 2026-08-03)"}]'::jsonb
FROM public.candidatos c
WHERE c.id = pa.candidato_id
  AND c.slug = 'alvaro-dias-rn'
  AND pa.id = '58db12ca-d6d0-4a01-84d6-b161d8699533';;
