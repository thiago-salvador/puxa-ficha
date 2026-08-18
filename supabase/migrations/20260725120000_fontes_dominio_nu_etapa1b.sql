-- =====================================================================
-- Etapa 1B da auditoria de integridade (docs/auditoria-integridade-2026-07-24.md, achado A2).
--
-- O QUE ESTA MIGRATION CORRIGE
-- 52 fontes publicadas apontavam para o dominio nu (https://g1.globo.com,
-- https://www.tse.jus.br, https://www.camara.leg.br...), sem caminho para a
-- materia. Sao 38 pontos de atencao em 37 candidatos publicaveis. Uma fonte
-- que aponta para a home nao prova a afirmacao que ela sustenta.
--
-- Distribuicao por gravidade (censo, nao amostra):
--   critica: 0 | alta: 1 | media: 1 | baixa: 50 fontes (36 pontos)
--
-- TRES DESFECHOS, UM BLOCO PARA CADA
--   Bloco 1 (9 pontos):  fonte especifica encontrada, URL testada em HTTP 200
--                        e trecho literal que sustenta a afirmacao. Troca a URL.
--   Bloco 2 (19 pontos): a afirmacao e FALSA, nao apenas mal fontada. Despublica.
--   Bloco 3 (10 pontos): busca honesta nao achou fonte que sustente a afirmacao
--                        especifica. Despublica ate revisao editorial.
--
-- Nada e deletado. Tudo e reversivel invertendo o valor de visivel.
-- Toda alteracao usa WHERE por id explicito. Nenhum update em massa.
-- Idempotente: reexecutar nao produz efeito adicional (predicados IS DISTINCT FROM).
--
-- Data de acesso de todas as fontes novas: 2026-07-25.
-- Metodo de teste: curl -L com User-Agent de navegador, status coletado por
-- %{http_code}. As 13 URLs novas responderam 200 em 2026-07-25 11:32 -03.
--
-- ---------------------------------------------------------------------
-- SELECT DE VALIDACAO EXECUTADO ANTES DE ESCREVER ESTE ARQUIVO
-- (rodado em producao, somente leitura, em 2026-07-25)
--
--   select p.id, c.slug, p.gravidade, p.verificado, p.titulo,
--          f->>'url' as url, f->>'titulo' as fonte_titulo
--   from pontos_atencao p join candidatos c on c.id = p.candidato_id,
--        lateral jsonb_array_elements(p.fontes) f
--   where c.publicavel and p.visivel and f->>'url' !~ '://[^/]+/.+'
--   order by p.gravidade, c.slug;
--   -- 52 linhas, 38 pontos distintos, 37 candidatos distintos.
--
-- E o cruzamento que motiva o Bloco 2:
--
--   select c.slug, c.cargo_atual,
--          (select count(*) from historico_politico h
--            where h.candidato_id = c.id) as n_historico
--   from pontos_atencao p join candidatos c on c.id = p.candidato_id
--   where c.publicavel and p.visivel
--     and p.titulo = 'Sem histórico de mandato eletivo registrado';
--   -- 19 linhas. TODAS com n_historico entre 2 e 11. Oito delas com
--   -- cargo_atual que e um mandato eletivo em exercicio. A afirmacao
--   -- publicada contradiz o proprio banco na mesma ficha.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- BLOCO 1: fonte especifica encontrada e verificada (9 pontos)
-- ---------------------------------------------------------------------

-- flavio-bolsonaro | gravidade alta | "Caso das rachadinhas"
-- Antes: https://g1.globo.com (home do g1)
-- Prova (Agencia Brasil / EBC, agencia publica federal, HTTP 200 em 2026-07-25):
--   "A investigacao trata do suposto esquema de rachadinha na Assembleia
--    Legislativa do Rio de Janeiro (Alerj), quando Queiroz era assessor do
--    entao deputado estadual Flavio Bolsonaro."
UPDATE public.pontos_atencao
SET fontes = '[{"url":"https://agenciabrasil.ebc.com.br/justica/noticia/2020-11/mp-do-rio-denuncia-17-investigados-por-lavagem-de-dinheiro-e-peculato","data":"2020-11-04","titulo":"Agência Brasil (EBC): MP do Rio denuncia 17 investigados por lavagem de dinheiro e peculato"}]'::jsonb
WHERE id = '2ca642a4-9344-4dab-a105-b5029e968aaf'
  AND fontes IS DISTINCT FROM '[{"url":"https://agenciabrasil.ebc.com.br/justica/noticia/2020-11/mp-do-rio-denuncia-17-investigados-por-lavagem-de-dinheiro-e-peculato","data":"2020-11-04","titulo":"Agência Brasil (EBC): MP do Rio denuncia 17 investigados por lavagem de dinheiro e peculato"}]'::jsonb;

-- ronaldo-caiado | gravidade media | "6 partidos em 30 anos"
-- Antes: https://dadosabertos.tse.jus.br (home)
-- Prova (Camara dos Deputados, biografia oficial, HTTP 200 em 2026-07-25):
--   "Mandatos (na Camara dos Deputados): Deputado(a) Federal - (Congresso
--    Revisor), 1991-1995, GO, PSD; ... 1999-2003, GO, PFL; ... 2003-2007, GO,
--    PFL; ... 2007-2011, GO, PFL; ... 2011-2015, GO, DEM."
-- ATENCAO PARA O REVISOR: a fonte oficial sustenta PSD, PFL e DEM. Ela NAO
-- sustenta o "PRB" que a descricao atual afirma, e a descricao omite o PDC.
-- A URL fica correta com este update, mas a redacao da claim precisa de
-- revisao editorial separada.
UPDATE public.pontos_atencao
SET fontes = '[{"url":"https://www.camara.leg.br/deputados/74813/biografia","data":"2026-07-25","titulo":"Câmara dos Deputados: biografia e mandatos de Ronaldo Caiado"},{"url":"https://www25.senado.leg.br/web/senadores/senador/-/perfil/456","data":"2026-07-25","titulo":"Senado Federal: perfil e mandatos de Ronaldo Caiado"}]'::jsonb
WHERE id = '7b123f00-93a6-44b2-9fb0-4723f3c23513'
  AND fontes IS DISTINCT FROM '[{"url":"https://www.camara.leg.br/deputados/74813/biografia","data":"2026-07-25","titulo":"Câmara dos Deputados: biografia e mandatos de Ronaldo Caiado"},{"url":"https://www25.senado.leg.br/web/senadores/senador/-/perfil/456","data":"2026-07-25","titulo":"Senado Federal: perfil e mandatos de Ronaldo Caiado"}]'::jsonb;

-- cleitinho | baixa | "Carreira política: 1 mandato(s): Senador (MG)"
-- Prova (Senado Federal, perfil 6337, HTTP 200 em 2026-07-25):
--   "Mandatos e Exercicios no Senado Federal 57a e 58a Legislaturas ...
--    Ano 2023 2024 2025 2026"
UPDATE public.pontos_atencao
SET fontes = '[{"url":"https://www25.senado.leg.br/web/senadores/senador/-/perfil/6337","data":"2026-07-25","titulo":"Senado Federal: perfil e mandatos do senador Cleitinho"}]'::jsonb
WHERE id = '07fc71d4-ad3a-4acd-ac99-222f5d94a2f8'
  AND fontes IS DISTINCT FROM '[{"url":"https://www25.senado.leg.br/web/senadores/senador/-/perfil/6337","data":"2026-07-25","titulo":"Senado Federal: perfil e mandatos do senador Cleitinho"}]'::jsonb;

-- wellington-fagundes | baixa | "2 mandato(s): Deputado Federal (MT), Senador (MT)"
-- Prova Camara (HTTP 200 em 2026-07-25): "Mandatos (na Camara dos Deputados):
--   Deputado(a) Federal - (Congresso Revisor), 1991-1995, MT, PL; ... 1995-1999;
--   ... 1999-2003; ... 2003-2007; ... 2007-2011; ... 2011-2015, MT, PR."
-- Prova Senado (perfil 1173, HTTP 200): "Mandatos e Exercicios no Senado
--   Federal 57a e 58a Legislaturas ... 55a e 56a Legislaturas ... 2015 ... 2023"
UPDATE public.pontos_atencao
SET fontes = '[{"url":"https://www.camara.leg.br/deputados/73653/biografia","data":"2026-07-25","titulo":"Câmara dos Deputados: mandatos de Wellington Fagundes"},{"url":"https://www25.senado.leg.br/web/senadores/senador/-/perfil/1173","data":"2026-07-25","titulo":"Senado Federal: perfil e mandatos de Wellington Fagundes"}]'::jsonb
WHERE id = 'eca3c1a8-9afc-479c-958d-34f1cb6b5c64'
  AND fontes IS DISTINCT FROM '[{"url":"https://www.camara.leg.br/deputados/73653/biografia","data":"2026-07-25","titulo":"Câmara dos Deputados: mandatos de Wellington Fagundes"},{"url":"https://www25.senado.leg.br/web/senadores/senador/-/perfil/1173","data":"2026-07-25","titulo":"Senado Federal: perfil e mandatos de Wellington Fagundes"}]'::jsonb;

-- janaina-riva | baixa | "1 mandato(s): Deputado Estadual (MT)"
-- Prova (Assembleia Legislativa de MT, perfil oficial, HTTP 200 em 2026-07-25):
--   "Nome civil: Janaina Greyce Riva Fagundes ... Unica mulher eleita para a
--    18a legislatura (2014, com 48.171 votos) e reeleita para a 19a (2018) e
--    20a (2022)"
-- Observacao: a fonte mostra tres mandatos, nao um. A contagem da claim
-- subestima. Corrigir a redacao em revisao editorial separada.
UPDATE public.pontos_atencao
SET fontes = '[{"url":"https://www.al.mt.gov.br/parlamento/deputados/28/perfil","data":"2026-07-25","titulo":"Assembleia Legislativa de Mato Grosso: perfil da deputada Janaina Riva"}]'::jsonb
WHERE id = 'ddf1d924-7480-41ba-b212-7ebfef785cd0'
  AND fontes IS DISTINCT FROM '[{"url":"https://www.al.mt.gov.br/parlamento/deputados/28/perfil","data":"2026-07-25","titulo":"Assembleia Legislativa de Mato Grosso: perfil da deputada Janaina Riva"}]'::jsonb;

-- eduardo-riedel | baixa | "1 mandato(s): Governador (MS)"
-- Prova (Ministerio Publico de MS, HTTP 200 em 2026-07-25), titulo literal:
--   "Procurador-Geral de Justica participa da posse do novo Governador de MS,
--    Eduardo Riedel"
UPDATE public.pontos_atencao
SET fontes = '[{"url":"https://www.mpms.mp.br/noticias/2023/01/procurador-geral-de-justica-participa-da-posse-do-novo-governador-de-ms-eduardo-riedel","data":"2023-01","titulo":"MPMS: posse do governador de MS Eduardo Riedel"}]'::jsonb
WHERE id = 'deb688ca-08e9-498f-bad7-8588060d008e'
  AND fontes IS DISTINCT FROM '[{"url":"https://www.mpms.mp.br/noticias/2023/01/procurador-geral-de-justica-participa-da-posse-do-novo-governador-de-ms-eduardo-riedel","data":"2023-01","titulo":"MPMS: posse do governador de MS Eduardo Riedel"}]'::jsonb;

-- jorginho-mello | baixa | "5 mandato(s): Senador (DF) 2019-2027, Deputado Federal (SC)..."
-- Prova Senado (perfil 5350, HTTP 200 em 2026-07-25), tabela de mandatos:
--   "Mandato Inicio Fim  Senador - SC 2019 2027"
-- Prova Camara (HTTP 200): "Deputado(a) Federal - 2011-2015, SC, PSDB;
--   Deputado(a) Federal - 2015-2019, SC, PR."
-- ATENCAO PARA O REVISOR: a fonte oficial diz "Senador - SC". A descricao
-- atual publica "Senador (DF)", o que esta errado. Corrigir a UF na redacao.
UPDATE public.pontos_atencao
SET fontes = '[{"url":"https://www25.senado.leg.br/web/senadores/senador/-/perfil/5350","data":"2026-07-25","titulo":"Senado Federal: mandato de Jorginho Mello (Senador - SC, 2019-2027)"},{"url":"https://www.camara.leg.br/deputados/160509/biografia","data":"2026-07-25","titulo":"Câmara dos Deputados: mandatos de Jorginho Mello"}]'::jsonb
WHERE id = '2e174de9-b67e-4b52-87af-4eec5637ac4b'
  AND fontes IS DISTINCT FROM '[{"url":"https://www25.senado.leg.br/web/senadores/senador/-/perfil/5350","data":"2026-07-25","titulo":"Senado Federal: mandato de Jorginho Mello (Senador - SC, 2019-2027)"},{"url":"https://www.camara.leg.br/deputados/160509/biografia","data":"2026-07-25","titulo":"Câmara dos Deputados: mandatos de Jorginho Mello"}]'::jsonb;

-- fabio-trad | baixa | "1 mandato(s): Deputado Federal (MS)"
-- Prova (Camara dos Deputados, HTTP 200 em 2026-07-25):
--   "Mandatos (na Camara dos Deputados): Deputado(a) Federal - 2011-2015, MS,
--    PMDB; ... 2015-2019, MS, PMDB; ... 2019-2023, MS, PSD."
-- Observacao: sao tres mandatos, nao um. Redacao a revisar.
UPDATE public.pontos_atencao
SET fontes = '[{"url":"https://www.camara.leg.br/deputados/160587/biografia","data":"2026-07-25","titulo":"Câmara dos Deputados: mandatos de Fábio Trad"}]'::jsonb
WHERE id = '40f52fd9-5ae4-4df4-9e45-bf751b259731'
  AND fontes IS DISTINCT FROM '[{"url":"https://www.camara.leg.br/deputados/160587/biografia","data":"2026-07-25","titulo":"Câmara dos Deputados: mandatos de Fábio Trad"}]'::jsonb;

-- laurez-moreira | baixa | "3 mandato(s): Deputado Estadual (TO), Prefeito (Gurupi), Vereador (TO)"
-- Prova (Camara dos Deputados, HTTP 200 em 2026-07-25):
--   "Renunciou ao mandato de Deputado Federal, na Legislatura 2011-2015, para
--    assumir o mandato de Prefeito do Municipio de Gurupi, TO, em 1o de janeiro
--    de 2013."
-- A fonte sustenta o mandato de Prefeito de Gurupi e revela que a claim OMITE
-- dois mandatos de Deputado Federal (2007-2011 e 2011-2015). Redacao a revisar.
UPDATE public.pontos_atencao
SET fontes = '[{"url":"https://www.camara.leg.br/deputados/141479/biografia","data":"2026-07-25","titulo":"Câmara dos Deputados: mandatos de Laurez Moreira e renúncia para assumir a Prefeitura de Gurupi"}]'::jsonb
WHERE id = 'a9530d43-5506-49cd-b316-ae174335aefe'
  AND fontes IS DISTINCT FROM '[{"url":"https://www.camara.leg.br/deputados/141479/biografia","data":"2026-07-25","titulo":"Câmara dos Deputados: mandatos de Laurez Moreira e renúncia para assumir a Prefeitura de Gurupi"}]'::jsonb;

-- ---------------------------------------------------------------------
-- BLOCO 2: afirmacao FALSA, despublicada (19 pontos)
--
-- Todos os 19 publicam o mesmo texto: "nao possui mandato eletivo federal ou
-- estadual registrado nas bases do TSE, Camara ou Senado", citando como unica
-- fonte a home https://www.tse.jus.br. Uma home nao prova ausencia de nada.
--
-- Mais grave: os 19 candidatos tem historico_politico preenchido no proprio
-- banco (2 a 11 linhas cada), e oito deles tem cargo_atual que e um mandato
-- eletivo em exercicio. A ficha se contradiz sozinha.
--
-- Confirmacao em fonte primaria oficial (HTTP 200 em 2026-07-25) para 8 dos 19:
--   delegado-eder-mauro  camara.leg.br/deputados/178908/biografia
--                        "Deputado(a) Federal - 2015-2019, PA, PSD; 2019-2023,
--                         PA, PSD; 2023-2027, PA, PL."
--   vicentinho-junior    camara.leg.br/deputados/137070/biografia
--                        "Deputado(a) Federal - 2015-2019, TO, PSB; 2019-2023,
--                         TO, PR; 2023-2027, TO, PP."
--   professora-dorinha   camara.leg.br/deputados/160639/biografia (3 mandatos)
--                        + senado perfil 5386 (57a e 58a legislaturas)
--   eduardo-girao        senado perfil 5976 (56a e 57a legislaturas)
--   ataides-oliveira     senado perfil 5164 "Mandato Inicio Fim Senador - TO 2011 2019"
--   anderson-ferreira    camara.leg.br/deputados/160551/biografia
--                        "Deputado(a) Federal - 2011-2015, PE, PR; 2015-2019, PE, PR."
--   joao-rodrigues       camara.leg.br/deputados/160571/biografia
--                        "Deputado(a) Federal - 2011-2015, SC, DEM; 2015-2019, SC, PSD."
--   paula-belmonte       camara.leg.br/deputados/204377/biografia
--                        "Deputado(a) Federal - 2019-2023, DF, PPS."
--
-- Os 11 restantes sao mandatos estaduais ou municipais, cuja falsidade esta
-- provada contra o proprio historico_politico do banco. Unica excecao parcial:
-- ricardo-cappelli, cujo historico so registra cargos nao eletivos (Ministro,
-- Interventor, Presidente da ABDI), o que torna a afirmacao provavelmente
-- verdadeira. Ele sai junto porque a fonte citada continua nao provando nada.
-- ---------------------------------------------------------------------

UPDATE public.pontos_atencao
SET visivel = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1B',
        'motivo', 'afirmacao contradita pelo historico_politico do proprio candidato e sustentada apenas pela home do TSE, que nao prova ausencia de mandato',
        'fonte_anterior', 'https://www.tse.jus.br',
        'reversivel', true
      )
    )
WHERE id IN (
  '9f42bbdb-09c8-4a1e-b32d-f5db79a59c5f', -- amelio-cayres
  'aa8ef217-c1d2-45d7-a13f-710ff7254d36', -- anderson-ferreira
  'a5c542b8-065f-4e11-907b-dad2e5665cd4', -- andre-kamai
  '87f3be72-7e0e-441b-83b7-35b06e4babfe', -- ataides-oliveira
  'd556b8e5-8a4c-4b82-86a3-5b930d8ca45f', -- delegado-eder-mauro
  '873ea3ae-c003-45b7-bb74-6c8e624864f9', -- eduardo-girao
  '736ecdc1-f783-4e0e-a5d8-3ba00863ae60', -- gabriel-azevedo
  '4f10f3ad-7f12-4877-ac2d-4e6a29bbbb86', -- joao-henrique-catan
  'ec9f865a-e1d2-43c9-824a-5e2f2fae8327', -- joao-rodrigues
  'a00d919e-268b-46c4-a277-1c49cd931a0a', -- leandro-grass
  'e60dd46b-f933-435a-a6d6-6f21b25e9d7d', -- lucien-rezende
  '81f24d98-84c8-4ea8-921d-1be4f1976212', -- marcos-vieira
  'f1dfbd44-57f7-49a7-8575-30f50d116c1a', -- maria-da-consolacao
  'd52ca41e-99d4-4fce-84c4-b869e4e1bbe8', -- natasha-slhessarenko
  '575d2379-025a-4f77-803b-3aed7ad1ee1c', -- paula-belmonte
  '47a606c9-eaff-476c-912d-9ede3b371172', -- professora-dorinha
  'b1543668-2fae-4e58-a4c6-95c57317d29a', -- ricardo-cappelli
  'ac612964-c420-411c-811d-d55ee2ceb5b0', -- tadeu-de-souza
  '6eea7760-b72d-45c4-ae23-914f542ca7f0'  -- vicentinho-junior
)
AND visivel IS DISTINCT FROM false;

-- ---------------------------------------------------------------------
-- BLOCO 3: sem fonte que sustente a afirmacao especifica (10 pontos)
--
-- Para estes, a busca por fonte foi feita e falhou em um dos dois sentidos:
--   (a) nenhuma pagina especifica encontrada respondeu com conteudo que
--       sustentasse a afirmacao (o servidor devolveu 200 servindo a home,
--       ou a pagina renderiza so por JavaScript), ou
--   (b) a fonte oficial encontrada sustenta apenas parte da lista de mandatos
--       que a claim agrega, e nao a afirmacao como publicada.
--
-- O caso (b) e o achado estrutural desta etapa: as claims "Carreira politica:
-- N mandato(s) registrado(s)" agregam mandatos federais, estaduais e
-- municipais numa frase so. Nao existe fonte unica que prove a frase inteira.
-- Trocar a home da Camara por uma pagina da Camara nao resolve, porque a
-- Camara nao registra mandato de governador nem de vereador.
--
-- Por candidato, o que foi tentado e o que faltou:
--   celina-leao       claim afirma Governador e Vice-Governador do DF; a unica
--                     fonte oficial achada (Camara 204380) prova Deputada
--                     Federal 2019-2023, que nao esta na claim
--   ciro-gomes-gov-ce claim lista Dep. Estadual, Governador, Ministro e
--                     Prefeito; Camara 141406 prova Dep. Federal 2007-2011,
--                     que nao esta na claim
--   eduardo-braga     Senado 4994 prova os mandatos de senador; nao prova
--                     Vereador, Vice-Prefeito, Prefeito nem Dep. Estadual
--   eduardo-braide    fonte atual contem placeholder de template nao resolvido:
--                     ".../consulta_cand_{ano}.zip" (bug de ingestao, ver relatorio)
--   elmano-de-freitas nenhuma URL especifica achada respondeu com conteudo:
--                     vicegov.ce.gov.br e esp.ce.gov.br devolvem 200 servindo
--                     a home; al.ce.gov.br/noticias/48434 devolve 404
--   guto-silva        assembleia.pr.leg.br/deputados/perfil/guto-silva responde
--                     200 mas o perfil so renderiza por JavaScript, sem trecho
--                     citavel no HTML
--   jorginho-mello    claim "Governador(a) em exercicio de SC"; nenhuma pagina
--   (gov. exercicio)  especifica de sc.gov.br foi localizada
--   mateus-simoes     ALMG prova apenas a posse como governador; nao prova
--                     Vereador de BH nem Vice-Governador
--   otaviano-pivetta  secom.mt.gov.br prova Vice-Governador; nao prova Dep.
--                     Estadual nem Prefeito de Lucas do Rio Verde. Alem disso
--                     o cargo esta desatualizado: o mesmo portal ja o trata
--                     como Governador em 03/07/2026
--   pazolini          TSE prova a reeleicao como prefeito de Vitoria; nao ha
--                     fonte para o mandato de deputado estadual (al.es.gov.br
--                     responde 200 servindo pagina sem o conteudo)
--
-- Todos sao gravidade baixa e nao imputam crime a ninguem. Saem do ar por
-- falta de lastro, nao por suspeita de falsidade, e voltam assim que a fonte
-- especifica for anexada.
-- ---------------------------------------------------------------------

UPDATE public.pontos_atencao
SET visivel = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 1B',
        'motivo', 'fonte publicada apontava para o dominio nu e a busca por fonte especifica nao encontrou pagina que sustentasse a afirmacao como publicada',
        'reversivel', true
      )
    )
WHERE id IN (
  '1286c10e-90b1-4a66-9002-691f39cc52f7', -- celina-leao
  '4aa56e73-f09b-4c91-bd04-f03bf01d3ba5', -- ciro-gomes-gov-ce
  'fea18e9b-5064-4e24-b055-9b9e827ad90c', -- eduardo-braga
  'feb712e3-bc11-45c4-b1e1-ac637e1594d6', -- eduardo-braide
  'cc44fb61-bc64-45e6-8d44-a4dc6d2cd8a7', -- elmano-de-freitas
  '76bdffb8-80ad-4c8e-b6c8-f86e69df46f5', -- guto-silva
  'e17084e8-08cd-4cc4-88a9-84dc4bd237b5', -- jorginho-mello (governador em exercicio)
  '05b838ac-558b-4f82-8726-b41766a155c5', -- mateus-simoes
  '01e651ba-8ac2-429f-bcc1-2773cf4a6421', -- otaviano-pivetta
  '9c885daa-3da5-489c-80c2-6dab87585ec1'  -- pazolini
)
AND visivel IS DISTINCT FROM false;

COMMIT;

-- =====================================================================
-- VERIFICACAO POS-APLICACAO (rodar manualmente depois do deploy)
--
--   -- deve retornar zero linhas
--   select p.id, c.slug, f->>'url'
--   from pontos_atencao p join candidatos c on c.id = p.candidato_id,
--        lateral jsonb_array_elements(p.fontes) f
--   where c.publicavel and p.visivel and f->>'url' !~ '://[^/]+/.+';
--
--   -- deve retornar 29
--   select count(*) from pontos_atencao
--   where dados_relacionados ? 'despublicacao_2026_07_25';
-- =====================================================================
