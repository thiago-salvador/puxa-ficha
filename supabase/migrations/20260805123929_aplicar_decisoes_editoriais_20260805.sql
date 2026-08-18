-- Aplica as 61 decisões editoriais registradas em
-- ~/.disposable-html/decisoes-revisao.jsonl em 2026-08-05.
--
-- Contrato conferido antes de gerar este arquivo:
--   61 IDs únicos na fila; 52 aprovações; 9 rejeições; 0 adiamentos.
-- A decisão editorial e a aplicação são etapas separadas. Esta migration
-- materializa somente textos que Thiago aprovou, com fonte rastreável.
--
-- O item original de Haddad sobre caixa 2 é rejeitado. A versão substituta,
-- também definida por Thiago, entra como nova linha e mantém a absolvição no
-- próprio título. Nenhuma acusação é publicada sem atribuição e URL.
--
-- ANOTAÇÃO: toda escrita deste arquivo é endereçada pela PK da fila editorial,
-- e não pelo slug do candidato. Por isso cada `-- @write` declara `chave=<uuid>`,
-- que aparece literal no statement logo abaixo e é o que o gate confere; o
-- `slug`/`ref` continua declarado, vale para a allowlist, mas é metadado de
-- curadoria que o SQL não menciona. Ver o cabeçalho de
-- `scripts/audit/lib/pending-writes.ts` para o que essa forma não garante.

BEGIN;

CREATE TEMP TABLE editorial_decisions_20260805 (
  id uuid PRIMARY KEY,
  classe text NOT NULL,
  decisao text NOT NULL CHECK (decisao IN ('aprovar', 'rejeitar')),
  item integer NOT NULL UNIQUE
) ON COMMIT DROP;

-- @write tabela=editorial_decisions_20260805 ref=fila-61 campos=id,classe,decisao,item
INSERT INTO editorial_decisions_20260805 (id, classe, decisao, item) VALUES
  ('db8e94dc-f5a5-404d-bfc7-af259c34c4b0', 'posicao', 'aprovar', 0),
  ('ecb064e3-176e-404b-8182-430a62964df9', 'posicao', 'rejeitar', 1),
  ('faea612f-c093-402c-ab13-53a78f38f098', 'ponto', 'aprovar', 2),
  ('c4782a62-bce0-4a5a-b804-e2f9b2e70d52', 'ponto', 'rejeitar', 3),
  ('9dc0144f-fd71-41d5-9fcf-286577fbf370', 'ponto', 'aprovar', 4),
  ('409c1b11-9efa-49bb-8b6b-4434d1c77cf9', 'ponto', 'aprovar', 5),
  ('9fa4db8b-2b96-4595-b982-37042586e0dc', 'ponto', 'aprovar', 6),
  ('33e36ea1-1822-432f-bb14-445592fb085b', 'posicao', 'aprovar', 7),
  ('61a06eae-4815-41fc-acd9-d28d279c41f7', 'ponto', 'aprovar', 8),
  ('ac6bc30e-4562-4830-9d80-ee7b0ff26a10', 'posicao', 'aprovar', 9),
  ('9185eb2c-8d14-47f9-b20a-79e5225effbe', 'posicao', 'aprovar', 10),
  ('4839f21d-8820-4974-96e0-9a94641dfffa', 'posicao', 'aprovar', 11),
  ('2bed957b-49b9-4ce5-afbd-5f66c2fedbec', 'ponto', 'aprovar', 12),
  ('bfb1c41e-2691-4e0b-82be-a6bebe4d3a71', 'ponto', 'aprovar', 13),
  ('15d6bab6-d2f9-4b54-971e-e185f81fb67b', 'ponto', 'aprovar', 14),
  ('94dc3127-214c-4702-88fa-30b9bc1d75ad', 'ponto', 'aprovar', 15),
  ('cfaa9988-30e6-4d30-9839-dfa95000b25c', 'ponto', 'rejeitar', 16),
  ('ec378763-10a3-4d4d-b5d2-5c188d2164a9', 'ponto', 'aprovar', 17),
  ('0be8b601-b952-4fca-be41-b92eb39b96a1', 'ponto', 'aprovar', 18),
  ('6f18b013-7d3a-4d90-803f-3485c27ee9da', 'ponto', 'aprovar', 19),
  ('88373c8d-43c9-400d-a896-5f11e3fd3ed7', 'ponto', 'aprovar', 20),
  ('8e0bd54c-f160-4c9c-bb91-d8757c4c4fde', 'ponto', 'aprovar', 21),
  ('72419fa9-891b-471b-8ce3-3ffc5ee8ad82', 'ponto', 'aprovar', 22),
  ('c1d107df-59e5-4a57-9249-578c18213cac', 'ponto', 'aprovar', 23),
  ('3715ece3-3124-4940-acf5-6e2d30666d9b', 'ponto', 'aprovar', 24),
  ('df1ea0bc-afc2-407f-8db0-c031841d438e', 'ponto', 'aprovar', 25),
  ('07fc71d4-ad3a-4acd-ac99-222f5d94a2f8', 'ponto', 'aprovar', 26),
  ('40f52fd9-5ae4-4df4-9e45-bf751b259731', 'ponto', 'rejeitar', 27),
  ('eca3c1a8-9afc-479c-958d-34f1cb6b5c64', 'ponto', 'aprovar', 28),
  ('12ab6be5-12c2-4366-b59a-e40d89a56ab2', 'ponto', 'aprovar', 29),
  ('8e8db2cc-7163-45ed-af6a-0909812f22ac', 'ponto', 'aprovar', 30),
  ('93997216-4abb-4afc-8821-ea82fce774c0', 'ponto', 'aprovar', 31),
  ('e5d8f985-936d-43b6-81f2-c76b91c07ad5', 'ponto', 'aprovar', 32),
  ('29afdb13-b172-480c-ba91-1253ce47605f', 'ponto', 'rejeitar', 33),
  ('67287ca2-ed67-402a-b653-b36c8a7b9d9f', 'ponto', 'aprovar', 34),
  ('d302ab8f-010d-4070-b777-4fa901afbeda', 'ponto', 'aprovar', 35),
  ('36ef65c8-d5ce-4ef1-afc4-dd4c654dd6a0', 'ponto', 'aprovar', 36),
  ('dc8a49f5-f87c-404a-a4cf-132e703e9370', 'ponto', 'aprovar', 37),
  ('7913a909-e03f-4a7e-a34f-c8e0c17329aa', 'ponto', 'rejeitar', 38),
  ('094ea4c9-aa96-4f3a-9fa6-51e21ef24761', 'ponto', 'aprovar', 39),
  ('8885902e-c940-44ef-ba04-515e24aaa9fe', 'ponto', 'aprovar', 40),
  ('8e5cf809-6dfe-449f-abce-a95337c69db2', 'ponto', 'aprovar', 41),
  ('fce5536a-67a3-43d3-86a2-eae745c3698e', 'ponto', 'rejeitar', 42),
  ('842e9895-3f67-4c7f-9c84-2718dfaba876', 'ponto', 'aprovar', 43),
  ('97803699-4262-412c-bd41-4dcd8fe2c9f2', 'ponto', 'rejeitar', 44),
  ('27d73464-eea3-41b1-b43d-6df28c3fd28d', 'ponto', 'aprovar', 45),
  ('720fc213-f18e-4960-bd22-36bed6a6d2bb', 'ponto', 'aprovar', 46),
  ('7bb39817-5971-407a-b4ca-188acea308f5', 'ponto', 'aprovar', 47),
  ('cdf01a59-4bc8-4247-b107-f13377d9099a', 'ponto', 'aprovar', 48),
  ('d61cf801-53ae-4e1c-9cb5-c1df2154e84a', 'ponto', 'aprovar', 49),
  ('35ddad11-b726-4962-85ec-abbeee6225a5', 'ponto', 'aprovar', 50),
  ('6681d58a-c958-4164-af45-60b20b10b6cc', 'ponto', 'aprovar', 51),
  ('a5a31164-ef40-42e5-a2f2-4f68fce227bd', 'ponto', 'aprovar', 52),
  ('15847cc8-6cee-432a-b60a-40aab971b94d', 'posicao', 'aprovar', 53),
  ('880184e6-b37e-4e11-ab83-b6e04bb017c3', 'posicao', 'aprovar', 54),
  ('2110f078-0cb8-4bd2-846a-39d0a44c2338', 'posicao', 'aprovar', 55),
  ('a9530d43-5506-49cd-b316-ae174335aefe', 'ponto', 'aprovar', 56),
  ('7bb91fc3-a07b-4ac4-a106-2b571754fc96', 'ponto', 'aprovar', 57),
  ('d58a6910-d6aa-46ac-abfa-827568cd628f', 'ponto', 'rejeitar', 58),
  ('01ad9f78-5867-432f-a7b0-8eaad1ba0ae8', 'ponto', 'aprovar', 59),
  ('c95f5dcc-ea90-40e6-b581-c9a31f3faac1', 'ponto', 'aprovar', 60);

DO $$
DECLARE
  total integer;
  aprovadas integer;
  rejeitadas integer;
  encontradas integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE decisao = 'aprovar'),
         count(*) FILTER (WHERE decisao = 'rejeitar')
    INTO total, aprovadas, rejeitadas
    FROM editorial_decisions_20260805;
  IF total <> 61 OR aprovadas <> 52 OR rejeitadas <> 9 THEN
    RAISE EXCEPTION 'Fila editorial divergente: total=%, aprovar=%, rejeitar=%',
      total, aprovadas, rejeitadas;
  END IF;

  SELECT count(*) INTO encontradas
  FROM editorial_decisions_20260805 d
  WHERE (d.classe = 'ponto' AND EXISTS (SELECT 1 FROM public.pontos_atencao p WHERE p.id = d.id))
     OR (d.classe = 'posicao' AND EXISTS (SELECT 1 FROM public.posicoes_declaradas p WHERE p.id = d.id));
  IF encontradas <> 61 THEN
    RAISE EXCEPTION 'Pre-condição editorial: esperados 61 IDs, encontrados %', encontradas;
  END IF;
END $$;

-- O único registro de posição rejeitado contém um voto nominal invertido.
-- Endereçada pela PK: o slug abaixo é metadado de curadoria, não aparece no SQL.
-- @write tabela=posicoes_declaradas chave=ecb064e3-176e-404b-8182-430a62964df9 slug=flavio-bolsonaro tema=teto_gastos campos=id
DELETE FROM public.posicoes_declaradas
WHERE id = 'ecb064e3-176e-404b-8182-430a62964df9';

-- Rejeições de pontos ficam preservadas e saem da fila e da ficha.
-- Lote endereçado pela decisao literal na fila declarada acima; o `ref` e rotulo de curadoria.
-- @write tabela=pontos_atencao chave=rejeitar ref=rejeicoes-editoriais-20260805 campos=visivel,verificado,gerado_por,despublicacao_motivo,despublicado_em
UPDATE public.pontos_atencao p
SET visivel = false,
    verificado = true,
    gerado_por = 'curadoria',
    despublicacao_motivo = 'Rejeitado por Thiago Salvador na revisão editorial item a item de 2026-08-05; texto atual não deve ser publicado.',
    despublicado_em = COALESCE(p.despublicado_em, now())
FROM editorial_decisions_20260805 d
WHERE d.id = p.id AND d.classe = 'ponto' AND d.decisao = 'rejeitar';

-- Posições de quiz aprovadas. Posição declarada não é apresentada como voto.
-- @write tabela=posicoes_declaradas chave=db8e94dc-f5a5-404d-bfc7-af259c34c4b0 slug=flavio-bolsonaro tema=reforma_trabalhista campos=descricao,fonte,url_fonte,verificado,gerado_por
UPDATE public.posicoes_declaradas
SET descricao = 'Defende uma legislação trabalhista mais flexível, com pagamento por hora e maior liberdade de negociação, mantendo apenas direitos proporcionais; não participou da votação da reforma de 2017 por não ocupar mandato na Câmara à época.',
    fonte = 'Agência Brasil — proposta de pagamento por hora e flexibilização da legislação trabalhista',
    url_fonte = 'https://agenciabrasil.ebc.com.br/politica/noticia/2026-05/flavio-bolsonaro-sugere-pagamento-por-hora-em-alternativa-escala-6x1',
    verificado = true,
    gerado_por = 'curadoria'
WHERE id = 'db8e94dc-f5a5-404d-bfc7-af259c34c4b0';

-- @write tabela=posicoes_declaradas chave=33e36ea1-1822-432f-bb14-445592fb085b slug=jhc tema=reforma_trabalhista campos=verificado,gerado_por
UPDATE public.posicoes_declaradas
SET verificado = true, gerado_por = 'curadoria'
WHERE id = '33e36ea1-1822-432f-bb14-445592fb085b';

-- @write tabela=posicoes_declaradas chave=ac6bc30e-4562-4830-9d80-ee7b0ff26a10 slug=renan-filho tema=reforma_trabalhista campos=verificado,gerado_por
UPDATE public.posicoes_declaradas
SET verificado = true, gerado_por = 'curadoria'
WHERE id = 'ac6bc30e-4562-4830-9d80-ee7b0ff26a10';

-- @write tabela=posicoes_declaradas chave=9185eb2c-8d14-47f9-b20a-79e5225effbe slug=renan-filho tema=teto_gastos campos=verificado,gerado_por
UPDATE public.posicoes_declaradas
SET verificado = true, gerado_por = 'curadoria'
WHERE id = '9185eb2c-8d14-47f9-b20a-79e5225effbe';

-- @write tabela=posicoes_declaradas chave=4839f21d-8820-4974-96e0-9a94641dfffa slug=renan-filho tema=transferencia_renda campos=descricao,verificado,gerado_por
UPDATE public.posicoes_declaradas
SET descricao = 'Programa estadual de transferência de renda voltado à primeira infância em Alagoas, com benefício mensal para gestantes e crianças pequenas, lançado no governo Renan Filho.',
    verificado = true,
    gerado_por = 'curadoria'
WHERE id = '4839f21d-8820-4974-96e0-9a94641dfffa';

-- @write tabela=posicoes_declaradas chave=15847cc8-6cee-432a-b60a-40aab971b94d slug=tarcisio-gov-sp tema=reforma_trabalhista campos=descricao,fonte,url_fonte,verificado,gerado_por
UPDATE public.posicoes_declaradas
SET descricao = 'Não teve mandato no Congresso durante a votação da reforma trabalhista de 2017, mas em entrevistas defende essa reforma como parte de uma “era pró-business” e critica propostas que revertam flexibilizações, mantendo linha econômica liberal e favorável a reformas pró-empresariado.',
    fonte = 'Poder360 — entrevista sobre a reforma trabalhista e a “era pró-business”',
    url_fonte = 'https://www.poder360.com.br/brasil/brasil-deixou-a-era-anti-business-em-2016-diz-tarcisio/',
    verificado = true,
    gerado_por = 'curadoria'
WHERE id = '15847cc8-6cee-432a-b60a-40aab971b94d';

-- @write tabela=posicoes_declaradas chave=880184e6-b37e-4e11-ab83-b6e04bb017c3 slug=tarcisio-gov-sp tema=teto_gastos campos=descricao,fonte,url_fonte,verificado,gerado_por
UPDATE public.posicoes_declaradas
SET descricao = 'Defende ajuste fiscal rígido e regras de contenção de gasto público, alinhadas à centro-direita. Sobre o arcabouço fiscal, afirma apoiar sua aprovação, embora critique o foco em aumento de receita e peça mecanismos mais severos de controle da despesa.',
    fonte = 'UOL/Estadão — entrevista sobre o arcabouço fiscal',
    url_fonte = 'https://economia.uol.com.br/noticias/estadao-conteudo/2023/05/01/tarcisio-de-freitas-diz-acreditar-que-o-arcabouco-fiscal-vai-passar-pelo-congresso.htm',
    verificado = true,
    gerado_por = 'curadoria'
WHERE id = '880184e6-b37e-4e11-ab83-b6e04bb017c3';

-- @write tabela=posicoes_declaradas chave=2110f078-0cb8-4bd2-846a-39d0a44c2338 slug=tarcisio-gov-sp tema=transferencia_renda campos=descricao,fonte,url_fonte,verificado,gerado_por
UPDATE public.posicoes_declaradas
SET descricao = 'Defende programas de transferência de renda focalizados em famílias pobres, com ênfase em condicionalidades e eficiência do gasto social, seguindo a linha liberal de concentrar benefícios em quem está abaixo da linha de pobreza e integrar proteção social à inserção produtiva. Esta é uma síntese editorial, não uma citação literal.',
    fonte = 'Governo de São Paulo — SuperAção SP, proteção social e inclusão produtiva',
    url_fonte = 'https://www.superacaosp.sp.gov.br/',
    verificado = true,
    gerado_por = 'curadoria'
WHERE id = '2110f078-0cb8-4bd2-846a-39d0a44c2338';

-- Pontos de carreira: o título deixa de chamar cargos distintos de mandatos.
-- @write tabela=pontos_atencao chave=faea612f-c093-402c-ab13-53a78f38f098 slug=hertz-dias campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Trajetória eleitoral sem mandato eletivo',
    descricao = 'Militante do PSTU e professor de História, já concorreu a vice-presidente em 2018, a prefeito de São Luís em 2020 e a governador do Maranhão em 2022, sem ter exercido mandato eletivo.',
    fontes = jsonb_build_array(
      jsonb_build_object('titulo', 'TSE DivulgaCandContas — candidatura de 2022', 'url', 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/MA/2040602022/candidato/100001600008'),
      jsonb_build_object('titulo', 'G1 — perfil eleitoral de Hertz Dias', 'url', 'https://g1.globo.com/politica/eleicoes/2026/noticia/2026/02/24/pstu-lanca-pre-candidatura-de-hertz-dias-para-presidente.ghtml')
    )
WHERE id = 'faea612f-c093-402c-ab13-53a78f38f098';

-- @write tabela=pontos_atencao chave=9dc0144f-fd71-41d5-9fcf-286577fbf370 slug=samara-martins campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Trajetória eleitoral sem mandato eletivo',
    descricao = 'Dentista do SUS, militante da Unidade Popular e de movimentos negros, foi candidata a vice-presidente em 2022 e, em 2026, oficializada como candidata à Presidência, sem ter exercido mandato eletivo.',
    fontes = jsonb_build_array(
      jsonb_build_object('titulo', 'TSE DivulgaCandContas — candidatura de 2022', 'url', 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/BR/2040602022/candidato/280001602703'),
      jsonb_build_object('titulo', 'G1 — candidatura presidencial em 2026', 'url', 'https://g1.globo.com/sp/sao-paulo/eleicoes/2026/noticia/2026/07/26/samara-martins-up-presidencia-da-republica.ghtml')
    )
WHERE id = '9dc0144f-fd71-41d5-9fcf-286577fbf370';

-- @write tabela=pontos_atencao chave=409c1b11-9efa-49bb-8b6b-4434d1c77cf9 slug=tiao-bocalom campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Matemático com carreira política longa, foi vereador em Nova Olímpia (PR), prefeito de Acrelândia em dois mandatos, secretário estadual de Agricultura e prefeito de Rio Branco, onde foi reeleito em 2024.',
    fontes = jsonb_build_array(
      jsonb_build_object('titulo', 'Prefeitura de Rio Branco — perfil oficial do prefeito', 'url', 'https://cgm.riobranco.ac.gov.br/lai/institucional/prefeito'),
      jsonb_build_object('titulo', 'Rádio Senado — reeleição em Rio Branco', 'url', 'https://www12.senado.leg.br/radio/1/noticia/2024/10/06/tiao-bocalom-e-reeleito-em-rio-branco')
    )
WHERE id = '409c1b11-9efa-49bb-8b6b-4434d1c77cf9';

-- @write tabela=pontos_atencao chave=9fa4db8b-2b96-4595-b982-37042586e0dc slug=jhc campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi deputado estadual por Alagoas, deputado federal e prefeito de Maceió.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Câmara dos Deputados — biografia de JHC', 'url', 'https://www.camara.leg.br/deputados/178842/biografia'))
WHERE id = '9fa4db8b-2b96-4595-b982-37042586e0dc';

-- @write tabela=pontos_atencao chave=61a06eae-4815-41fc-acd9-d28d279c41f7 slug=renan-filho campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi prefeito de Murici, deputado federal por Alagoas, governador do estado por dois mandatos e senador da República.',
    fontes = jsonb_build_array(
      jsonb_build_object('titulo', 'TSE DivulgaCandContas — candidatura ao Senado em 2022', 'url', 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/AL/2040602022/candidato/20001698127'),
      jsonb_build_object('titulo', 'Senado Federal — perfil do senador', 'url', 'https://www25.senado.leg.br/web/senadores/senador/-/perfil/5982')
    )
WHERE id = '61a06eae-4815-41fc-acd9-d28d279c41f7';

-- @write tabela=pontos_atencao chave=2bed957b-49b9-4ce5-afbd-5f66c2fedbec slug=david-almeida campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi governador em exercício do Amazonas em 2017, além de três mandatos como deputado estadual e dois como prefeito de Manaus.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'TSE — perfil de David Almeida e reeleição para a Prefeitura de Manaus', 'url', 'https://www.tse.jus.br/comunicacao/noticias/2024/Outubro/david-almeida-e-eleito-prefeito-de-manaus-am'))
WHERE id = '2bed957b-49b9-4ce5-afbd-5f66c2fedbec';

-- @write tabela=pontos_atencao chave=bfb1c41e-2691-4e0b-82be-a6bebe4d3a71 slug=maria-do-carmo campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Sem mandato eletivo federal ou estadual registrado',
    descricao = 'Maria do Carmo Seffair não possui mandato eletivo federal ou estadual registrado nas bases consultadas do TSE, da Câmara ou do Senado.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'TSE — conjunto de dados de candidaturas de 2022', 'url', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip'))
WHERE id = 'bfb1c41e-2691-4e0b-82be-a6bebe4d3a71';

-- @write tabela=pontos_atencao chave=15d6bab6-d2f9-4b54-971e-e185f81fb67b slug=omar-aziz campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi vereador de Manaus, deputado estadual, vice-prefeito, vice-governador por dois mandatos, governador do Amazonas e exerce atualmente o segundo mandato de senador.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Senado Federal — perfil histórico de Omar Aziz', 'url', 'https://adsf.senado.leg.br/index.php/omar-aziz'))
WHERE id = '15d6bab6-d2f9-4b54-971e-e185f81fb67b';

-- @write tabela=pontos_atencao chave=94dc3127-214c-4702-88fa-30b9bc1d75ad slug=clecio-luis campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi secretário estadual, vereador de Macapá, prefeito da capital por dois mandatos e governador do Amapá. O cargo de secretário não é mandato eletivo.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'TSE DivulgaCandContas — candidatura ao governo em 2022', 'url', 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/AP/2040602022/candidato/30001619676'))
WHERE id = '94dc3127-214c-4702-88fa-30b9bc1d75ad';

-- @write tabela=pontos_atencao chave=ec378763-10a3-4d4d-b5d2-5c188d2164a9 slug=jeronimo campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi secretário estadual de Desenvolvimento Rural e de Educação antes de exercer seu primeiro mandato eletivo como governador da Bahia.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Governo da Bahia — biografia oficial', 'url', 'https://www.ba.gov.br/comunicacao/2023/01/noticias/biografia-do-governador-jeronimo-rodrigues'))
WHERE id = 'ec378763-10a3-4d4d-b5d2-5c188d2164a9';

-- @write tabela=pontos_atencao chave=0be8b601-b952-4fca-be41-b92eb39b96a1 slug=ronaldo-mansur campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Sem mandato eletivo federal ou estadual registrado',
    descricao = 'Ronaldo Mansur não exerceu mandato eletivo federal ou estadual, apesar de já ter sido candidato a vice-governador em eleições anteriores.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'TSE DivulgaCandContas — candidatura de 2022', 'url', 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/MG/2040602022/candidato/50001600528'))
WHERE id = '0be8b601-b952-4fca-be41-b92eb39b96a1';

-- @write tabela=pontos_atencao chave=6f18b013-7d3a-4d90-803f-3485c27ee9da slug=ciro-gomes-gov-ce campos=titulo,descricao
UPDATE public.pontos_atencao
SET titulo = 'Filiações partidárias ao longo da carreira',
    descricao = 'Ao longo da carreira, foi filiado a diversas siglas, entre elas PDS, PMDB, PSDB, PPS, PROS, PDT e PSB, e deixou o PDT em 2022 após conflito com a direção.'
WHERE id = '6f18b013-7d3a-4d90-803f-3485c27ee9da';

-- @write tabela=pontos_atencao chave=88373c8d-43c9-400d-a896-5f11e3fd3ed7 slug=ciro-gomes-gov-ce campos=titulo,descricao
UPDATE public.pontos_atencao
SET titulo = 'Acusado de agressão a jornalista durante campanha',
    descricao = 'Durante a campanha de 2022, um jornalista acusou Ciro Gomes de empurrá-lo e tentar retirar seu microfone. A fonte registra a acusação e a apresentação de queixa formal; o texto não trata a agressão como fato incontroverso.'
WHERE id = '88373c8d-43c9-400d-a896-5f11e3fd3ed7';

-- @write tabela=pontos_atencao chave=8e0bd54c-f160-4c9c-bb91-d8757c4c4fde slug=ciro-gomes-gov-ce campos=titulo,descricao
UPDATE public.pontos_atencao
SET titulo = 'Governou o Ceará entre 1991 e 1994',
    descricao = 'Ciro Gomes foi governador do Ceará entre 1991 e 1994. O estado se tornou referência nacional em alfabetização e aprendizagem por uma política educacional de longo prazo, consolidada também por governos posteriores; o resultado não é atribuído exclusivamente à gestão Ciro.'
WHERE id = '8e0bd54c-f160-4c9c-bb91-d8757c4c4fde';

-- @write tabela=pontos_atencao chave=72419fa9-891b-471b-8ce3-3ffc5ee8ad82 slug=ciro-gomes-gov-ce campos=titulo,descricao
UPDATE public.pontos_atencao
SET titulo = 'Posição nos segundos turnos presidenciais de 2018 e 2022',
    descricao = 'Em 2018, viajou para Paris e não declarou apoio público a Fernando Haddad. Em 2022, evitou endossar Lula diretamente, sendo criticado por setores da esquerda.'
WHERE id = '72419fa9-891b-471b-8ce3-3ffc5ee8ad82';

-- @write tabela=pontos_atencao chave=c1d107df-59e5-4a57-9249-578c18213cac slug=daniel-vilela campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi vereador de Goiânia, deputado estadual, deputado federal e vice-governador de Goiás.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Governo de Goiás — perfil biográfico do vice-governador', 'url', 'https://goias.gov.br/vicegovernadoria/perfil-biografico-do-vice-governador/'))
WHERE id = 'c1d107df-59e5-4a57-9249-578c18213cac';

-- @write tabela=pontos_atencao chave=3715ece3-3124-4940-acf5-6e2d30666d9b slug=marconi-perillo campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi deputado estadual, deputado federal, governador de Goiás por quatro mandatos e senador. A trajetória não é reduzida a quatro mandatos totais.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Senado Federal — perfil biográfico de Marconi Perillo', 'url', 'https://www25.senado.leg.br/web/senadores/senador/-/perfil/4535'))
WHERE id = '3715ece3-3124-4940-acf5-6e2d30666d9b';

-- @write tabela=pontos_atencao chave=df1ea0bc-afc2-407f-8db0-c031841d438e slug=orleans-brandao campos=titulo,descricao,fontes,dados_relacionados
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Exerceu dois mandatos como deputado federal, dois como vice-governador e é governador do Maranhão desde 2022.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Governo do Maranhão — galeria de governadores', 'url', 'https://www.ma.gov.br/galeria-de-governadores')),
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) - 'despublicacao_2026_07_25'
WHERE id = 'df1ea0bc-afc2-407f-8db0-c031841d438e';

-- @write tabela=pontos_atencao chave=07fc71d4-ad3a-4acd-ac99-222f5d94a2f8 slug=cleitinho campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi vereador em Divinópolis, deputado estadual em Minas Gerais e é senador da República no mandato 2023–2031.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Assembleia Legislativa de Minas Gerais — perfil de Cleitinho', 'url', 'https://www.almg.gov.br/deputados/cleitinho-azevedo/26101'))
WHERE id = '07fc71d4-ad3a-4acd-ac99-222f5d94a2f8';

-- @write tabela=pontos_atencao chave=eca3c1a8-9afc-479c-958d-34f1cb6b5c64 slug=wellington-fagundes campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Médico veterinário, exerceu seis mandatos consecutivos como deputado federal e está no segundo mandato de senador por Mato Grosso.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Senado Federal — perfil e mandatos de Wellington Fagundes', 'url', 'https://www25.senado.leg.br/pt_BR/web/senadores/senador/-/perfil/1173'))
WHERE id = 'eca3c1a8-9afc-479c-958d-34f1cb6b5c64';

-- @write tabela=pontos_atencao chave=12ab6be5-12c2-4366-b59a-e40d89a56ab2 slug=cicero-lucena campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi vice-governador e governador da Paraíba, secretário e ministro, prefeito de João Pessoa por múltiplos mandatos e senador da República.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Senado Federal — perfil biográfico de Cícero Lucena', 'url', 'https://www25.senado.leg.br/pt_BR/web/senadores/senador/-/perfil/4529'))
WHERE id = '12ab6be5-12c2-4366-b59a-e40d89a56ab2';

-- @write tabela=pontos_atencao chave=8e8db2cc-7163-45ed-af6a-0909812f22ac slug=raquel-lyra campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi secretária estadual, deputada estadual por dois mandatos, prefeita de Caruaru por dois mandatos e é governadora de Pernambuco.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Governo de Pernambuco — perfil da governadora', 'url', 'https://farmacia.saude.pe.gov.br/?page_id=171'))
WHERE id = '8e8db2cc-7163-45ed-af6a-0909812f22ac';

-- @write tabela=pontos_atencao chave=93997216-4abb-4afc-8821-ea82fce774c0 slug=rafael-fonteles campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi secretário da Fazenda do Piauí de 2015 a 2022 e foi eleito governador do estado em 2022. Secretaria estadual é cargo de governo, não mandato eletivo.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Governo do Piauí — currículo de Rafael Fonteles', 'url', 'https://www.segov.pi.gov.br/governador-rafael-fonteles-sera-homenageado-com-a-medalha-do-merito-legislativo'))
WHERE id = '93997216-4abb-4afc-8821-ea82fce774c0';

-- @write tabela=pontos_atencao chave=e5d8f985-936d-43b6-81f2-c76b91c07ad5 slug=rafael-greca campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi vereador, deputado estadual, deputado federal, ministro do Esporte e Turismo, secretário estadual e prefeito de Curitiba por três mandatos.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Prefeitura de Curitiba — perfil de Rafael Greca', 'url', 'https://www.curitiba.pr.gov.br/noticias/prefeito-rafael-greca-toma-posse-no-dia-1-de-janeiro/57536'))
WHERE id = 'e5d8f985-936d-43b6-81f2-c76b91c07ad5';

-- @write tabela=pontos_atencao chave=67287ca2-ed67-402a-b653-b36c8a7b9d9f slug=douglas-ruas campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi eleito deputado estadual do Rio de Janeiro em 2022. Também exerceu cargos de secretário municipal e estadual e assumiu a presidência da Alerj em 2026.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Alerj — perfil oficial de Douglas Ruas', 'url', 'https://www.alerj.rj.gov.br/Deputados/PerfilDeputado/478?Legislatura=20'))
WHERE id = '67287ca2-ed67-402a-b653-b36c8a7b9d9f';

-- @write tabela=pontos_atencao chave=d302ab8f-010d-4070-b777-4fa901afbeda slug=eduardo-paes campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi vereador e deputado federal, secretário estadual de Turismo, Esporte e Lazer e prefeito do Rio de Janeiro por quatro mandatos.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Prefeitura do Rio — biografia de Eduardo Paes', 'url', 'https://www.rio.rj.gov.br/web/arquivogeral/ccnlep/eduardo-paes'))
WHERE id = 'd302ab8f-010d-4070-b777-4fa901afbeda';

-- @write tabela=pontos_atencao chave=36ef65c8-d5ce-4ef1-afc4-dd4c654dd6a0 slug=garotinho campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi deputado estadual, prefeito de Campos dos Goytacazes por dois mandatos, governador do Rio de Janeiro e secretário estadual.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Alerj — histórico de mandatos no Executivo e no Legislativo', 'url', 'https://www2.alerj.rj.gov.br/jornalalerj/Jornal271_site.pdf'))
WHERE id = '36ef65c8-d5ce-4ef1-afc4-dd4c654dd6a0';

-- @write tabela=pontos_atencao chave=dc8a49f5-f87c-404a-a4cf-132e703e9370 slug=cadu-xavier campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Trajetória em cargos de governo, sem mandato eletivo',
    descricao = 'Não possui mandato eletivo federal ou estadual registrado; sua trajetória pública vem da burocracia fiscal e do secretariado do governo do Rio Grande do Norte.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'TSE — conjunto de dados de candidaturas de 2022', 'url', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip'))
WHERE id = 'dc8a49f5-f87c-404a-a4cf-132e703e9370';

-- @write tabela=pontos_atencao chave=094ea4c9-aa96-4f3a-9fa6-51e21ef24761 slug=marcos-rogerio campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi vereador em Ji-Paraná, exerceu dois mandatos como deputado federal e é senador por Rondônia.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Senado Federal — trajetória de Marcos Rogério', 'url', 'https://www12.senado.leg.br/noticias/materias/2018/10/18/marcos-rogerio-defendera-a-familia-e-o-direito-a-propriedade'))
WHERE id = '094ea4c9-aa96-4f3a-9fa6-51e21ef24761';

-- @write tabela=pontos_atencao chave=8885902e-c940-44ef-ba04-515e24aaa9fe slug=juliana-brizola campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi vereadora de Porto Alegre, exerceu três mandatos como deputada estadual no Rio Grande do Sul e foi secretária municipal da Juventude.',
    fontes = jsonb_build_array(
      jsonb_build_object('titulo', 'TSE DivulgaCandContas — candidatura de 2022', 'url', 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/RS/2040602022/candidato/210001621265'),
      jsonb_build_object('titulo', 'Assembleia Legislativa do Rio Grande do Sul', 'url', 'https://ww4.al.rs.gov.br')
    )
WHERE id = '8885902e-c940-44ef-ba04-515e24aaa9fe';

-- @write tabela=pontos_atencao chave=8e5cf809-6dfe-449f-abce-a95337c69db2 slug=fabio-mitidieri campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Formado em Administração, iniciou a carreira como vereador de Aracaju, foi secretário municipal de Esportes e secretário estadual do Trabalho. Exerceu dois mandatos como deputado federal por Sergipe e, em 2022, foi eleito governador do estado pelo PSD.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Câmara dos Deputados — biografia de Fábio Mitidieri', 'url', 'https://www.camara.leg.br/deputados/178969/biografia'))
WHERE id = '8e5cf809-6dfe-449f-abce-a95337c69db2';

-- @write tabela=pontos_atencao chave=842e9895-3f67-4c7f-9c84-2718dfaba876 slug=haddad-gov-sp campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Valor histórico de imóvel declarado ao TSE',
    descricao = 'Haddad declarou ao TSE o apartamento pelo valor histórico de compra, R$ 90 mil, abaixo dos R$ 120 mil pagos em 1998 e do valor venal posterior, próximo de R$ 1 milhão. A manutenção do valor histórico na declaração patrimonial era permitida.',
    fontes = jsonb_build_array(
      jsonb_build_object('titulo', 'InfoMoney — valor declarado, valor de compra e valor venal', 'url', 'https://www.infomoney.com.br/politica/haddad-declara-ao-tse-valor-de-apartamento-menor-que-o-registrado/'),
      jsonb_build_object('titulo', 'UOL — declaração patrimonial eleitoral de 2022', 'url', 'https://noticias.uol.com.br/politica/ultimas-noticias/2022/08/09/haddad-registra-candidatura-e-declara-patrimonio-de-r-595-mil.htm')
    )
WHERE id = '842e9895-3f67-4c7f-9c84-2718dfaba876';

-- @write tabela=pontos_atencao chave=27d73464-eea3-41b1-b43d-6df28c3fd28d slug=tarcisio-gov-sp campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Avaliação do governo varia conforme pesquisa e indicador',
    descricao = 'Levantamentos estaduais registraram aprovação em torno de 60%, enquanto o Datafolha de abril de 2025 mediu 41% de ótimo ou bom. Os indicadores não são equivalentes e oscilaram ao longo do mandato.',
    fontes = jsonb_build_array(
      jsonb_build_object('titulo', 'Datafolha/Folha — avaliação ótima ou boa em abril de 2025', 'url', 'https://www1.folha.uol.com.br/poder/2025/04/datafolha-governo-tarcisio-mantem-patamar-de-aprovacao-mas-reprovacao-dobra-em-2-anos.shtml'),
      jsonb_build_object('titulo', 'Pesquisa estadual — aprovação da administração', 'url', 'https://static.poder360.com.br/2025/08/Sao-Paulo_Ago25-Midia-1.pdf')
    )
WHERE id = '27d73464-eea3-41b1-b43d-6df28c3fd28d';

-- @write tabela=pontos_atencao chave=720fc213-f18e-4960-bd22-36bed6a6d2bb slug=tarcisio-gov-sp campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Resposta a críticas sobre a letalidade policial',
    descricao = 'Ao responder a críticas e denúncias sobre ações policiais na Baixada Santista, declarou: “ONU, Liga da Justiça, raio que o parta, que eu não estou nem aí”. A frase é apresentada com atribuição e contexto.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'CNN Brasil — declaração de Tarcísio sobre denúncias contra ações no litoral', 'url', 'https://www.cnnbrasil.com.br/nacional/pode-ir-na-onu-pode-ir-na-liga-da-justica-no-raio-que-o-parta-que-eu-nao-to-nem-ai-diz-tarcisio-sobre-denuncias-contra-acoes-no-litoral/'))
WHERE id = '720fc213-f18e-4960-bd22-36bed6a6d2bb';

-- @write tabela=pontos_atencao chave=7bb39817-5971-407a-b4ca-188acea308f5 slug=tarcisio-gov-sp campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Agenda de privatizações e desestatização da Sabesp',
    descricao = 'Defende privatizações e conduziu a desestatização da Sabesp, concluída em 2024 como uma das maiores operações estaduais desse tipo. O texto não afirma ranking absoluto sem fonte formal.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Governo de São Paulo — prospecto definitivo da desestatização da Sabesp', 'url', 'https://semil.sp.gov.br/desestatizacaosabesp/wp-content/uploads/sites/24/2024/07/Prospecto-Definitivo.pdf'))
WHERE id = '7bb39817-5971-407a-b4ca-188acea308f5';

-- @write tabela=pontos_atencao chave=cdf01a59-4bc8-4247-b107-f13377d9099a slug=tarcisio-gov-sp campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Operação Ícaro apura corrupção na Sefaz-SP',
    descricao = 'O Ministério Público apura, na Operação Ícaro, um suposto esquema bilionário de propinas ligado à liberação de créditos tributários dentro da Sefaz-SP durante o governo Tarcísio. O ponto não imputa participação pessoal ao governador.',
    fontes = jsonb_build_array(
      jsonb_build_object('titulo', 'UOL/Estadão — investigação de esquema de R$ 1 bilhão em propinas', 'url', 'https://noticias.uol.com.br/ultimas-noticias/agencia-estado/2026/05/25/fiscal-do-esquema-de-r-1-bi-em-propinas-diz-que-nao-e-dedo-duro-e-que-sobrevive-dopado.htm'),
      jsonb_build_object('titulo', 'Agência Brasil — denúncia do MP em desdobramento da Operação Ícaro', 'url', 'https://agenciabrasil.ebc.com.br/justica/noticia/2026-02/mp-denuncia-7-empresarios-e-ex-auditores-fiscais-por-corrupcao-em-sp')
    )
WHERE id = 'cdf01a59-4bc8-4247-b107-f13377d9099a';

-- @write tabela=pontos_atencao chave=d61cf801-53ae-4e1c-9cb5-c1df2154e84a slug=tarcisio-gov-sp campos=titulo,descricao
UPDATE public.pontos_atencao
SET titulo = 'Transferência do domicílio eleitoral para São Paulo',
    descricao = 'Nascido no Rio de Janeiro e sem mandato anterior em São Paulo, transferiu o domicílio eleitoral para o estado antes da disputa de 2022, o que gerou críticas de “paraquedismo” político. O texto não afirma ausência de qualquer vínculo prévio com São Paulo.'
WHERE id = 'd61cf801-53ae-4e1c-9cb5-c1df2154e84a';

-- @write tabela=pontos_atencao chave=35ddad11-b726-4962-85ec-abbeee6225a5 slug=tarcisio-gov-sp campos=titulo,descricao
UPDATE public.pontos_atencao
SET titulo = 'Programa de concessões no Ministério da Infraestrutura',
    descricao = 'Sua gestão no Ministério da Infraestrutura foi marcada por um programa amplo de concessões e desestatizações, com dezenas de ativos leiloados. O ponto não mantém a contagem exata de 73 sem fonte oficial específica.'
WHERE id = '35ddad11-b726-4962-85ec-abbeee6225a5';

-- @write tabela=pontos_atencao chave=6681d58a-c958-4164-af45-60b20b10b6cc slug=tarcisio-gov-sp campos=titulo,descricao
UPDATE public.pontos_atencao
SET titulo = 'Tiroteio durante visita de campanha em Paraisópolis',
    descricao = 'Houve tiroteio durante uma visita de campanha em Paraisópolis, em 2022, e um homem morreu. As circunstâncias foram contestadas por veículos de imprensa e organizações; o ponto não conclui que houve atentado nem operação policial encenada.'
WHERE id = '6681d58a-c958-4164-af45-60b20b10b6cc';

-- @write tabela=pontos_atencao chave=a5a31164-ef40-42e5-a2f2-4f68fce227bd slug=tarcisio-gov-sp campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Operações Escudo e Verão deixaram 84 mortos',
    descricao = 'As operações Escudo e Verão, realizadas entre julho de 2023 e abril de 2024, deixaram 84 mortos: 28 na primeira fase e 56 na segunda. Organizações levaram denúncias de abusos à ONU e à Comissão Interamericana de Direitos Humanos.',
    fontes = jsonb_build_array(
      jsonb_build_object('titulo', 'Conectas — balanço das operações Escudo e Verão', 'url', 'https://conectas.org/noticias/operacao-escudo-verao-um-ano-de-violencia-e-letalidade/'),
      jsonb_build_object('titulo', 'CIDH — Resolução 83/2024, medida cautelar 934-24', 'url', 'https://www.oas.org/pt/cidh/decisiones/mc/2024/res_83-24_mc_934-24_br_pt.pdf')
    )
WHERE id = 'a5a31164-ef40-42e5-a2f2-4f68fce227bd';

-- @write tabela=pontos_atencao chave=a9530d43-5506-49cd-b316-ae174335aefe slug=laurez-moreira campos=titulo,descricao
UPDATE public.pontos_atencao
SET titulo = 'Carreira política',
    descricao = 'Foi deputado estadual, deputado federal, prefeito de Gurupi e secretário estadual. Renunciou ao mandato federal para assumir a prefeitura e atualmente é vice-governador do Tocantins, tendo exercido interinamente o governo.'
WHERE id = 'a9530d43-5506-49cd-b316-ae174335aefe';

-- @write tabela=pontos_atencao chave=7bb91fc3-a07b-4ac4-a106-2b571754fc96 slug=roberto-claudio campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Carreira política: deputado estadual e prefeito de Fortaleza',
    descricao = 'Roberto Cláudio exerceu dois mandatos de deputado estadual do Ceará, eleito em 2006 e reeleito em 2010, e dois mandatos de prefeito de Fortaleza, eleito em 2012 e reeleito em 2016.',
    fontes = jsonb_build_array(
      jsonb_build_object('titulo', 'TSE — eleição para a Prefeitura de Fortaleza em 2012', 'url', 'https://www.tse.jus.br/comunicacao/noticias/2012/Outubro/roberto-claudio-e-o-novo-prefeito-de-fortaleza-ce'),
      jsonb_build_object('titulo', 'TSE — reeleição para a Prefeitura de Fortaleza em 2016', 'url', 'https://www.tse.jus.br/comunicacao/noticias/2016/Outubro/eleitores-de-fortaleza-ce-reelegem-roberto-claudio-para-a-prefeitura')
    )
WHERE id = '7bb91fc3-a07b-4ac4-a106-2b571754fc96';

-- @write tabela=pontos_atencao chave=01ad9f78-5867-432f-a7b0-8eaad1ba0ae8 slug=felicio-ramuth campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Investigação apurou movimentação em Andorra',
    descricao = 'Reportagem sobre a investigação registra movimentação superior a US$ 1,6 milhão em Andorra no período em que Felício Ramuth era secretário municipal e bloqueio judicial aproximado de US$ 1,4 milhão. Trata-se de suspeita investigada, sem afirmação de condenação.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Metrópoles — investigação sobre movimentação financeira de Felício Ramuth', 'url', 'https://www.metropoles.com/sao-paulo/ramuth-dinheiro-justica-eleitoral/'))
WHERE id = '01ad9f78-5867-432f-a7b0-8eaad1ba0ae8';

-- @write tabela=pontos_atencao chave=c95f5dcc-ea90-40e6-b581-c9a31f3faac1 slug=felicio-ramuth campos=titulo,descricao,fontes
UPDATE public.pontos_atencao
SET titulo = 'Investigação sobre offshore e conta em Andorra',
    descricao = 'A investigação citada pela reportagem relacionou Felício Ramuth à offshore Visio Corporation e a uma conta em Andorra, com bloqueio aproximado de US$ 1,4 milhão. Ramuth afirmou que os valores tinham origem lícita e que a conta foi declarada às autoridades competentes; o ponto não afirma condenação.',
    fontes = jsonb_build_array(jsonb_build_object('titulo', 'Metrópoles — investigação, offshore e explicação de Felício Ramuth', 'url', 'https://www.metropoles.com/sao-paulo/ramuth-dinheiro-justica-eleitoral/'))
WHERE id = 'c95f5dcc-ea90-40e6-b581-c9a31f3faac1';

-- A versão tecnicamente precisa de Haddad entra em outra linha, preservando a
-- rejeição do item 42 e exibindo a absolvição no próprio título.
-- @write tabela=pontos_atencao slug=haddad-gov-sp campos=id,candidato_id,categoria,titulo,descricao,fontes,dados_relacionados,gravidade,verificado,gerado_por,visivel,data_referencia
INSERT INTO public.pontos_atencao
  (id, candidato_id, categoria, titulo, descricao, fontes, dados_relacionados,
   gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  'b0c7e9ac-0e8a-4a4f-a91b-f43eaad66c42'::uuid,
  c.id,
  'processos',
  'Condenação em 1ª instância foi revertida pelo TRE-SP',
  'Em 2019, Haddad foi condenado em 1ª instância por falsidade ideológica eleitoral ligada à campanha de 2012, por suposto caixa 2 de R$ 2,6 milhões da UTC Engenharia. Em 2021, o TRE-SP o absolveu por unanimidade por falta de provas, derrubando a condenação.',
  jsonb_build_array(
    jsonb_build_object('titulo', 'Euronews — condenação em primeira instância em 2019', 'url', 'https://pt.euronews.com/2019/08/21/haddad-condenado-por-financiamento-ilegal-de-campanha'),
    jsonb_build_object('titulo', 'TRE-SP — arquivo de notícias de julho de 2021, absolvição por ausência de provas', 'url', 'https://www.tre-sp.jus.br/comunicacao/noticias/2021/Julho')
  ),
  jsonb_build_object('revisao_editorial', 'Thiago Salvador, 2026-08-05', 'substitui_id', 'fce5536a-67a3-43d3-86a2-eae745c3698e'),
  'alta', true, 'curadoria', true, '2021-07-01'::date
FROM public.candidatos c
WHERE c.slug = 'haddad-gov-sp'
ON CONFLICT (id) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  descricao = EXCLUDED.descricao,
  fontes = EXCLUDED.fontes,
  dados_relacionados = EXCLUDED.dados_relacionados,
  gravidade = EXCLUDED.gravidade,
  verificado = EXCLUDED.verificado,
  gerado_por = EXCLUDED.gerado_por,
  visivel = EXCLUDED.visivel,
  data_referencia = EXCLUDED.data_referencia,
  despublicacao_motivo = null,
  despublicado_em = null;

-- Agora que textos e fontes estão conformes, publica as 44 aprovações de ponto.
-- Lote endereçado pela decisao literal na fila declarada acima; o `ref` e rotulo de curadoria.
-- @write tabela=pontos_atencao chave=aprovar ref=aprovacoes-editoriais-20260805 campos=visivel,verificado,gerado_por,despublicacao_motivo,despublicado_em
UPDATE public.pontos_atencao p
SET visivel = true,
    verificado = true,
    gerado_por = 'curadoria',
    despublicacao_motivo = null,
    despublicado_em = null
FROM editorial_decisions_20260805 d
WHERE d.id = p.id AND d.classe = 'ponto' AND d.decisao = 'aprovar';

-- Bloqueio de recorrência: nenhum gerador externo pode voltar a contar cargos
-- distintos enquanto promete quantidade de mandatos.
CREATE OR REPLACE FUNCTION public.bloquear_contagem_ia_cargos_como_mandatos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.gerado_por = 'ia'
     AND NEW.titulo ~* '^Carreira política:[[:space:]]*[0-9]+[[:space:]]+mandato' THEN
    RAISE EXCEPTION 'ponto de carreira de IA recusado: o título conta cargos distintos como mandatos'
      USING ERRCODE = 'check_violation',
            HINT = 'Descreva os cargos exercidos e conte mandatos eletivos individualmente, com fonte primária.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_contagem_ia_cargos_como_mandatos
ON public.pontos_atencao;

CREATE TRIGGER trg_bloquear_contagem_ia_cargos_como_mandatos
BEFORE INSERT OR UPDATE OF titulo, gerado_por ON public.pontos_atencao
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_contagem_ia_cargos_como_mandatos();

DO $$
DECLARE
  pontos_aprovados integer;
  pontos_rejeitados integer;
  posicoes_aprovadas integer;
  posicoes_rejeitadas integer;
  substituta integer;
BEGIN
  SELECT count(*) INTO pontos_aprovados
  FROM public.pontos_atencao p JOIN editorial_decisions_20260805 d ON d.id = p.id
  WHERE d.classe = 'ponto' AND d.decisao = 'aprovar'
    AND p.visivel AND p.verificado AND p.gerado_por = 'curadoria';

  SELECT count(*) INTO pontos_rejeitados
  FROM public.pontos_atencao p JOIN editorial_decisions_20260805 d ON d.id = p.id
  WHERE d.classe = 'ponto' AND d.decisao = 'rejeitar'
    AND NOT p.visivel AND p.despublicacao_motivo IS NOT NULL;

  SELECT count(*) INTO posicoes_aprovadas
  FROM public.posicoes_declaradas p JOIN editorial_decisions_20260805 d ON d.id = p.id
  WHERE d.classe = 'posicao' AND d.decisao = 'aprovar' AND p.verificado;

  SELECT count(*) INTO posicoes_rejeitadas
  FROM public.posicoes_declaradas p JOIN editorial_decisions_20260805 d ON d.id = p.id
  WHERE d.classe = 'posicao' AND d.decisao = 'rejeitar';

  SELECT count(*) INTO substituta FROM public.pontos_atencao
  WHERE id = 'b0c7e9ac-0e8a-4a4f-a91b-f43eaad66c42' AND visivel AND verificado;

  IF pontos_aprovados <> 44 OR pontos_rejeitados <> 8
     OR posicoes_aprovadas <> 8 OR posicoes_rejeitadas <> 0 OR substituta <> 1 THEN
    RAISE EXCEPTION 'Pós-condição editorial falhou: pontos aprovar=%, pontos rejeitar=%, posições aprovar=%, posições rejeitar ainda presentes=%, substituta=%',
      pontos_aprovados, pontos_rejeitados, posicoes_aprovadas, posicoes_rejeitadas, substituta;
  END IF;
END $$;

COMMIT;
