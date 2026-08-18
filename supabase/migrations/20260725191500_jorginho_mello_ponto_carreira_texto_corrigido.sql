-- =====================================================================
-- jorginho-mello: corrige o TEXTO do ponto de atencao 2e174de9, nao so a fonte.
--
-- POR QUE ESTA MIGRATION EXISTE
--
-- A migration 20260725120000_fontes_dominio_nu_etapa1b.sql troca as duas
-- homepages nuas (camara.leg.br, senado.leg.br) por URLs com caminho no ponto
-- 2e174de9-b67e-4b52-87af-4eec5637ac4b, mas NAO toca titulo nem descricao.
-- Nenhuma das 11 migrations desta serie faz SET titulo ou SET descricao nesse
-- ponto. Resultado: fonte oficial viva colada em texto errado, que e
-- exatamente o modo de falha que a auditoria de 24/07 existe para evitar.
--
-- QUATRO ERROS NO TEXTO PUBLICADO, TODOS CONTRA FONTE OFICIAL:
--   1. nome    : publica "Jorge Jose de Mello". O Senado registra "Jorginho Mello"
--                (nome civil "Jorginho dos Santos Mello").
--   2. partido : publica "(PP)". O Senado registra filiacao ao PL desde 08/11/2012,
--                unica filiacao do mandato. O TSE 2022 tambem registra PL.
--   3. UF      : publica "Senador (DF)". O Senado registra UfParlamentar = SC.
--   4. exercicio: publica "Senador (DF) 2019-2027" como mandato corrente. O
--                exercicio foi encerrado por RENUNCIA em 29/12/2022. O periodo
--                2019-2027 e o intervalo das 56a e 57a legislaturas, nao tempo
--                de cadeira ocupada. A propria pagina do Senado marca
--                "(Fora de Exercicio)".
--
-- Erro adicional de forma: a lista publicada repete "Senador" duas vezes,
-- uma com UF errada e outra com UF certa.
--
-- DESFECHO ESCOLHIDO: reescrever, nao despublicar.
-- O conteudo e salvavel porque a carreira e integralmente verificavel em duas
-- casas legislativas. Despublicar deixaria a ficha do governador de SC sem
-- nenhum ponto visivel, o que nao e mais honesto, e apenas mais silencioso.
--
-- O TITULO DA FONTE TAMBEM SAI DAQUI CORRIGIDO. A migration 20260725120000
-- grava o titulo "Senado Federal: mandato de Jorginho Mello (Senador - SC,
-- 2019-2027)", que carimba 2019-2027 como mandato cumprido. Substituido por
-- titulo que diz o que a pagina diz: fora de exercicio por renuncia.
--
-- ORDEM IMPORTA: este arquivo tem timestamp posterior a 20260725120000. Os
-- predicados abaixo esperam o estado DEPOIS daquela migration.
--
-- ---------------------------------------------------------------------
-- FONTES, TESTADAS POR MIM COM curl -L --compressed E USER-AGENT DE NAVEGADOR
-- EM 2026-07-25. Status e tamanho observados, nao herdados de relatorio.
--
-- F1  https://legis.senado.leg.br/dadosabertos/senador/5350/mandatos
--     Senado Federal, dados abertos. HTTP 200, 2166 bytes.
--     Trecho literal:
--       <Nome>Jorginho Mello</Nome>
--       <UfParlamentar>SC</UfParlamentar>
--       <PrimeiraLegislaturaDoMandato><NumeroLegislatura>56</NumeroLegislatura>
--         <DataInicio>2019-02-01</DataInicio><DataFim>2023-01-31</DataFim>
--       <SegundaLegislaturaDoMandato><NumeroLegislatura>57</NumeroLegislatura>
--         <DataInicio>2023-02-01</DataInicio><DataFim>2027-01-31</DataFim>
--       <DescricaoParticipacao>Titular</DescricaoParticipacao>
--       <Exercicio><CodigoExercicio>3002</CodigoExercicio>
--         <DataInicio>2022-12-21</DataInicio><DataFim>2022-12-29</DataFim>
--         <SiglaCausaAfastamento>REN</SiglaCausaAfastamento>
--         <DescricaoCausaAfastamento>Renúncia</DescricaoCausaAfastamento></Exercicio>
--       <Partido><Sigla>PL</Sigla><Nome>Partido Liberal</Nome>
--         <DataFiliacao>2012-11-08</DataFiliacao></Partido>
--       <Suplente><DescricaoParticipacao>1º Suplente</DescricaoParticipacao>
--         <NomeParlamentar>Ivete da Silveira</NomeParlamentar></Suplente>
--
-- F2  https://www25.senado.leg.br/web/senadores/senador/-/perfil/5350
--     Senado Federal, pagina de perfil. HTTP 200, 115767 bytes.
--     Trechos literais:
--       "Jorginho Mello - SC (Fora de Exercício) Período 2019-2027"
--       "Nome civil: Jorginho dos Santos Mello Data de Nascimento: 15/07/1956
--        Naturalidade: Ibicaré (SC)"
--       "Jorginho Mello ( Jorginho dos Santos Mello ) Titular Renúncia
--        Ivete da Silveira ( Ivete Marli Appel da Silveira ) Primeiro(a) suplente
--        Em exercício"
--
-- F3  https://www.camara.leg.br/deputados/160509/biografia
--     Camara dos Deputados, biografia oficial. HTTP 200, 44140 bytes.
--     Corroborado por https://dadosabertos.camara.leg.br/api/v2/deputados/160509
--     (HTTP 200, 926 bytes), trecho literal:
--       "nomeCivil":"JORGINHO DOS SANTOS MELLO","siglaUf":"SC",
--       "cpf":"[CPF removido deste arquivo em 17/08/2026 (dado pessoal em espelho publico)]","dataNascimento":"1956-07-15",
--       "municipioNascimento":"Ibicaré","ufNascimento":"SC"
--     O CPF [CPF removido deste arquivo em 17/08/2026 (dado pessoal em espelho publico)] e identico ao do registro do TSE de 2022
--     (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/
--      2022/SC/2040602022/candidato/240001611127, HTTP 200, 13797 bytes,
--      "nomeCompleto":"JORGINHO DOS SANTOS MELLO", partido "PL"), o que fecha a
--     identidade sem ambiguidade de homonimo.
--
-- ---------------------------------------------------------------------
-- SELECT DE VERIFICACAO RODADO CONTRA PRODUCAO EM 2026-07-25 (somente leitura)
--
--   select p.id, c.slug, p.titulo, p.descricao, p.categoria, p.gravidade,
--          p.visivel, p.verificado, p.gerado_por
--     from pontos_atencao p join candidatos c on c.id = p.candidato_id
--    where p.id = '2e174de9-b67e-4b52-87af-4eec5637ac4b';
--
--   VALOR ATUAL OBSERVADO (antes desta migration):
--     slug        = jorginho-mello
--     titulo      = 'Carreira política: 5 mandato(s) registrado(s)'
--     descricao   = 'Jorge Jose de Mello (PP) possui 5 mandato(s) registrado(s):
--                    Senador (DF) 2019-2027, Deputado Federal (SC),
--                    Deputado Estadual (SC), Governador (SC), Senador (SC).'
--     categoria   = 'feito_positivo'  gravidade = 'baixa'
--     visivel     = true              verificado = false   gerado_por = 'ia'
--
--   Depois de 20260725120000 e antes deste arquivo, fontes contem o titulo
--   'Senado Federal: mandato de Jorginho Mello (Senador - SC, 2019-2027)'.
--
--   RESULTADO ESPERADO DEPOIS DESTE ARQUIVO (mesmo SELECT):
--     titulo    = 'Carreira política: deputado estadual, deputado federal e senador por Santa Catarina'
--     descricao comeca com 'Jorginho dos Santos Mello (PL)'
--     descricao NAO contem 'Jorge Jose de Mello', '(PP)' nem 'Senador (DF)'
--     verificado = true   gerado_por = 'curadoria'
--     jsonb_array_length(fontes) = 3
--
--   Prova em uma linha:
--     select p.descricao !~ 'Jorge Jose de Mello|\(PP\)|Senador \(DF\)' as texto_limpo,
--            p.verificado, jsonb_array_length(p.fontes) as n_fontes
--       from pontos_atencao p
--      where p.id = '2e174de9-b67e-4b52-87af-4eec5637ac4b';
--     -- esperado: texto_limpo = true, verificado = true, n_fontes = 3
--
-- CATEGORIA MANTIDA EM 'feito_positivo' DE PROPOSITO. A reclassificacao para
-- 'perfil' seria mais precisa em tese, mas moveria um fato neutro para dentro
-- da contagem de pontos de atencao das views v_ficha_candidato e v_comparador
-- (que contam 'categoria <> feito_positivo'), inflando o lado negativo da
-- ficha sem nenhum fato novo. Correcao de texto nao deve mexer no fiel da
-- balanca editorial.
--
-- REVERSIVEL: o valor anterior de titulo, descricao e fontes esta escrito
-- acima e no comentario de cada UPDATE.
-- NADA E DELETADO.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Texto da claim
-- ---------------------------------------------------------------------
-- A descricao nova afirma somente o que F1, F2 e F3 sustentam literalmente:
-- nome civil, partido, UF, natureza do mandato (titular), periodo das duas
-- legislaturas e o encerramento do exercicio por renuncia com a suplente
-- assumindo. Nao afirma numero total de mandatos, porque a contagem "5" nunca
-- foi verificada e o proprio banco registra 9 linhas de historico_politico
-- para ele. Contagem sem lastro nao volta ao ar.
update public.pontos_atencao
   set titulo = 'Carreira política: deputado estadual, deputado federal e senador por Santa Catarina',
       descricao = 'Jorginho dos Santos Mello (PL) foi deputado estadual e deputado federal por Santa Catarina antes de eleger-se senador pelo estado. O Senado Federal registra o mandato de titular por SC no período das 56ª e 57ª legislaturas (2019-2027), com filiação ao PL desde 08/11/2012, e o exercício encerrado por renúncia em 29/12/2022, quando a primeira suplente, Ivete da Silveira, passou a ocupar a cadeira.',
       verificado = true,
       gerado_por = 'curadoria'
 where id = '2e174de9-b67e-4b52-87af-4eec5637ac4b'::uuid
   and titulo = 'Carreira política: 5 mandato(s) registrado(s)';

-- ---------------------------------------------------------------------
-- 2. Titulo da fonte do Senado
-- ---------------------------------------------------------------------
-- Antes (gravado por 20260725120000):
--   "Senado Federal: mandato de Jorginho Mello (Senador - SC, 2019-2027)"
-- O problema nao e a URL, e o rotulo: ele apresenta 2019-2027 como mandato
-- cumprido. A propria pagina citada diz "(Fora de Exercício)".
-- Depois: tres fontes, cada uma com o que ela prova no titulo.
update public.pontos_atencao
   set fontes = '[{"url":"https://www25.senado.leg.br/web/senadores/senador/-/perfil/5350","data":"2026-07-25","titulo":"Senado Federal: Jorginho Mello (SC), fora de exercício, período 2019-2027, renúncia registrada na chapa"},{"url":"https://legis.senado.leg.br/dadosabertos/senador/5350/mandatos","data":"2026-07-25","titulo":"Senado Federal, dados abertos: mandato titular por SC, filiação ao PL desde 08/11/2012, exercício encerrado em 29/12/2022 por renúncia"},{"url":"https://www.camara.leg.br/deputados/160509/biografia","data":"2026-07-25","titulo":"Câmara dos Deputados: mandatos de deputado federal de Jorginho Mello por SC"}]'::jsonb
 where id = '2e174de9-b67e-4b52-87af-4eec5637ac4b'::uuid
   and fontes IS DISTINCT FROM '[{"url":"https://www25.senado.leg.br/web/senadores/senador/-/perfil/5350","data":"2026-07-25","titulo":"Senado Federal: Jorginho Mello (SC), fora de exercício, período 2019-2027, renúncia registrada na chapa"},{"url":"https://legis.senado.leg.br/dadosabertos/senador/5350/mandatos","data":"2026-07-25","titulo":"Senado Federal, dados abertos: mandato titular por SC, filiação ao PL desde 08/11/2012, exercício encerrado em 29/12/2022 por renúncia"},{"url":"https://www.camara.leg.br/deputados/160509/biografia","data":"2026-07-25","titulo":"Câmara dos Deputados: mandatos de deputado federal de Jorginho Mello por SC"}]'::jsonb;

-- ---------------------------------------------------------------------
-- 3. Linha de historico_politico do mandato de senador
-- ---------------------------------------------------------------------
-- A linha ff82c3cb ("Senador", 2019-2022, PL, SC) esta com os anos certos, mas
-- a observacao atribui o encerramento a "posse no governo estadual em 2023"
-- citando "NSC Total + curadoria 19.csv". A causa registrada no Senado e
-- renuncia em 29/12/2022, anterior a posse. Troca de fonte de imprensa por
-- fonte oficial, sem mexer nos anos.
--
-- Valor atual observado em 2026-07-25:
--   observacoes = 'Mandato encerrado com a posse no governo estadual em 2023
--                  (NSC Total + curadoria 19.csv)'
--   proveniencia = 'manual'
update public.historico_politico
   set observacoes = 'Mandato de titular por SC nas 56ª e 57ª legislaturas (2019-2027). Exercício encerrado por renúncia em 29/12/2022, conforme Senado Dados Abertos (parlamentar 5350, mandato 571, causa de afastamento REN). [corrigido 2026-07-25: a observação anterior atribuía o encerramento à posse no governo estadual em 2023, citando imprensa]',
       proveniencia = 'misto'
 where id = 'ff82c3cb-fe61-460e-b58e-9ef75212c4c1'::uuid
   and observacoes = 'Mandato encerrado com a posse no governo estadual em 2023 (NSC Total + curadoria 19.csv)';
-- Conferencia:
--   select observacoes, proveniencia from historico_politico
--    where id = 'ff82c3cb-fe61-460e-b58e-9ef75212c4c1';
--   -- esperado: observacoes contendo 'renúncia em 29/12/2022', proveniencia 'misto'

commit;
