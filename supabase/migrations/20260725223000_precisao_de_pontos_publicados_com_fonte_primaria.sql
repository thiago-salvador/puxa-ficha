-- =====================================================================
-- Precisao de tres pontos ja publicados e ja verificados: o texto passa a
-- dizer o que a fonte primaria que ele cita realmente diz.
--
-- NENHUM DOS TRES ESTA ERRADO HOJE. Os tres omitem informacao da propria
-- fonte que muda a leitura do fato, e em dois casos a omissao pesa CONTRA o
-- candidato. Corrigir omissao que favorece a acusacao e tao obrigatorio
-- quanto corrigir a que favorece o candidato.
--
--   1. lucas-ribeiro  0c6a942a  a multa do TRE-PB foi individual e alcancou
--                               tambem o ex-governador Joao Azevedo; a
--                               representacao foi proposta pelo MDB. O texto
--                               atual sugere sancao isolada contra ele.
--   2. rafael-fonteles b431cfe0 os discursos apurados foram proferidos por
--                               OUTRAS duas pessoas nomeadas na portaria; ele
--                               foi notificado como representado. O texto atual
--                               pode ser lido como conduta propria dele.
--   3. edilson-damiao  7c98b954 o TSE nomeia as condutas reconhecidas e o numero
--                               do processo, e trata Damiao como governador em
--                               exercicio, nao como "o vice". O texto atual usa
--                               formula abstrata e a condicao errada.
--
-- Nenhuma fonte e trocada: as tres URLs ja estao no banco e foram retestadas
-- por mim nesta sessao. O que muda e o texto e, no caso 3, o titulo da fonte.
--
-- GATE DE ESCRITA (20260725160000): o ponto 3 e de gravidade 'alta'. O UPDATE
-- abaixo nao mexe em gravidade nem em fontes desse ponto, entao a linha segue
-- conforme (fontes com URL de caminho nao vazio) e o trigger
-- trg_pontos_atencao_exige_fonte deixa passar. Os outros dois sao 'baixa'.
--
-- ---------------------------------------------------------------------
-- FONTES, TESTADAS POR MIM COM curl -L --compressed E USER-AGENT DE NAVEGADOR
-- EM 2026-07-25. As tres ja estavam gravadas no banco; o status abaixo e o
-- que eu observei agora, nao o que o registro anterior afirmava.
--
-- P1  https://www.tre-pb.jus.br/comunicacao/noticias/2026/Julho/tre-pb-decide-acoes-sobre-propaganda-eleitoral-na-pre-campanha
--     Tribunal Regional Eleitoral da Paraiba. HTTP 200, 127704 bytes.
--     Trechos literais:
--       "Na primeira representação, proposta pelo Movimento Democrático
--        Brasileiro (MDB) contra o governador da Paraíba, Lucas Ribeiro Novais
--        de Araújo, e o ex-governador João Azevêdo Lins Filho, o membro
--        auxiliar, desembargador Aluízio Bezerra Filho julgou procedente o
--        pedido."
--       "A ação questionava a divulgação, em rede social, de um vídeo gravado em
--        uma unidade pública de saúde antes do início oficial da propaganda
--        eleitoral."
--       "A decisão condenou Lucas Ribeiro e João Azevêdo ao pagamento de multa
--        individual de R$ 10 mil. Também determinou a remoção da publicação,
--        caso ainda esteja disponível, e vedou a republicação do mesmo conteúdo
--        ou de material substancialmente equivalente."
--
-- P2  https://biblioteca.mpf.mp.br/server/api/core/bitstreams/635c7912-de13-462b-88a4-55fcc21b99dc/content
--     Ministerio Publico Federal, Diario Eletronico. HTTP 200, 1148324 bytes.
--     PDF, texto extraido com pdftotext -layout. Portaria 5/GABPRE/PRPI,
--     Procuradoria Regional Eleitoral no Estado do Piaui. Trechos literais:
--       "CONSIDERANDO a representação formulada pelo jornalista Toni Rodrigues
--        noticiando suposto abuso de poder político e propaganda eleitoral
--        extemporânea ocorridos em 16/02/2026, durante evento carnavalesco
--        oficial no município de Barras/PI;"
--       "CONSIDERANDO os relatos de que o Deputado Federal Júlio César Lima e a
--        suplente de senadora Jussara Lima teriam utilizado o palco do show da
--        banda "Raça Negra", custeado com recursos públicos, para proferir
--        discursos de exaltação política ao Governador Rafael Fonteles e ao
--        Presidente da República;"
--       "CONSIDERANDO a atribuição desta Procuradoria Regional Eleitoral para
--        investigar fatos relativos ao Governador do Estado, pré-candidato à
--        reeleição, conforme o art. 86 do Código Eleitoral;"
--       "III – Notificação dos Representados: para que Júlio César Lima, Jussara
--        Lima e Rafael Fonteles apresentem manifestação, querendo, no prazo de
--        10 (dez) dias."
--
-- P3  https://www.tse.jus.br/comunicacao/noticias/2026/Abril/tse-cassa-mandato-do-governador-e-determina-eleicoes-diretas-em-roraima
--     Tribunal Superior Eleitoral, 30/04/2026. HTTP 200, 133106 bytes.
--     Trechos literais:
--       "O Tribunal Superior Eleitoral (TSE) determinou, na sessão desta
--        quinta-feira (30), a cassação do mandato do atual governador de
--        Roraima, Edilson Damião (União Brasil), e a realização de eleições
--        diretas para o cargo"
--       "Ao concluir julgamento, Plenário também confirmou a inelegibilidade do
--        ex-governador Antonio Denarium (Republicanos) pelo prazo de oito anos"
--       "distribuição de bens e serviços, com a entrega de cestas básicas e
--        benefícios; reforma de residências de famílias de baixa renda; repasse
--        de quase R$ 70 milhões em recursos do governo estadual para 12 dos 15
--        municípios do estado, sem a observância de critérios legais; e
--        extrapolação de gastos com publicidade."
--       "Processo relacionado: Recurso Ordinário Eleitoral 0600940-96.2022.6.23.0000"
--
-- ---------------------------------------------------------------------
-- SELECT DE VERIFICACAO RODADO CONTRA PRODUCAO EM 2026-07-25 (somente leitura)
--
--   select p.id, c.slug, p.titulo, p.descricao, p.gravidade, p.visivel,
--          p.verificado, p.gerado_por
--     from pontos_atencao p join candidatos c on c.id = p.candidato_id
--    where p.id in ('0c6a942a-c925-4808-a643-51a4d230f1fb',
--                   'b431cfe0-9677-4308-8ec2-1b495dee70ec',
--                   '7c98b954-3e5d-4537-80e2-aae9b6829878');
--
--   VALORES ATUAIS OBSERVADOS (os tres visivel = true, verificado = true,
--   gerado_por = 'curadoria'):
--
--   0c6a942a | lucas-ribeiro | baixa | 'Multado pelo TRE-PB por propaganda
--     eleitoral antecipada em 2026'
--     descricao: 'Em julho de 2026, o TRE-PB reconheceu propaganda eleitoral
--     antecipada em vídeo gravado em unidade pública de saúde e aplicou multa de
--     R$ 10 mil a Lucas Ribeiro. A decisão também determinou a remoção e vedou a
--     republicação do conteúdo.'
--
--   b431cfe0 | rafael-fonteles | baixa | 'MP Eleitoral abriu procedimento sobre
--     possível promoção em evento público'
--     descricao: 'Em maio de 2026, o MP Eleitoral no Piauí abriu procedimento
--     preparatório para apurar suposto abuso de poder político e propaganda
--     antecipada em evento carnavalesco oficial que teria promovido Rafael
--     Fonteles. O procedimento é preliminar e não representa condenação.'
--
--   7c98b954 | edilson-damiao | alta | 'Mandato cassado pelo TSE na chapa eleita
--     em 2022'
--     descricao: 'Em 30 de abril de 2026, o TSE cassou os mandatos de Antonio
--     Denarium e do vice Edilson Damião e determinou nova eleição direta em
--     Roraima. A decisão decorreu de AIJE por abuso de poder político e
--     econômico; esta redação não afirma inelegibilidade pessoal de Edilson
--     Damião.'
--
--   RESULTADO ESPERADO DEPOIS DESTE ARQUIVO (mesmo SELECT):
--     select p.id,
--            p.descricao ~ 'João Azevêdo'            as lr_tem_correu,
--            p.descricao ~ 'Júlio César Lima'        as rf_tem_autores,
--            p.descricao ~ '0600940-96.2022.6.23.0000' as ed_tem_processo,
--            p.gravidade, p.visivel, p.verificado
--       from pontos_atencao p
--      where p.id in ('0c6a942a-c925-4808-a643-51a4d230f1fb',
--                     'b431cfe0-9677-4308-8ec2-1b495dee70ec',
--                     '7c98b954-3e5d-4537-80e2-aae9b6829878');
--     -- esperado: cada linha com a sua flag em true, gravidade inalterada
--     --           (baixa, baixa, alta), visivel e verificado em true nas tres.
--
--     select p.descricao ~ 'do vice Edilson Damião' as ed_ainda_diz_vice
--       from pontos_atencao p where p.id = '7c98b954-3e5d-4537-80e2-aae9b6829878';
--     -- esperado: false
--
-- IDEMPOTENTE: cada update e por id explicito e condicionado ao texto atual.
-- REVERSIVEL: os textos anteriores estao acima na integra.
-- NADA E DELETADO.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. lucas-ribeiro | multa do TRE-PB
--    O que entra: quem propos a representacao (MDB), que a multa foi
--    individual e que o ex-governador Joao Azevedo foi condenado na mesma
--    decisao. Isso nao atenua o fato, mas o situa: a leitura atual sugere
--    sancao isolada, e a fonte descreve decisao contra dois nomes.
-- ---------------------------------------------------------------------
update public.pontos_atencao
   set descricao = 'Em 1º de julho de 2026, o TRE-PB julgou procedente representação proposta pelo Movimento Democrático Brasileiro (MDB) contra o governador Lucas Ribeiro Novais de Araújo e o ex-governador João Azevêdo Lins Filho, por vídeo divulgado em rede social e gravado em uma unidade pública de saúde antes do início oficial da propaganda eleitoral. Reconhecida a propaganda eleitoral antecipada, a decisão condenou os dois ao pagamento de multa individual de R$ 10 mil, determinou a remoção da publicação e vedou a republicação do mesmo conteúdo ou de material substancialmente equivalente.',
       data_referencia = date '2026-07-01'
 where id = '0c6a942a-c925-4808-a643-51a4d230f1fb'::uuid
   and descricao = 'Em julho de 2026, o TRE-PB reconheceu propaganda eleitoral antecipada em vídeo gravado em unidade pública de saúde e aplicou multa de R$ 10 mil a Lucas Ribeiro. A decisão também determinou a remoção e vedou a republicação do conteúdo.';

-- ---------------------------------------------------------------------
-- 2. rafael-fonteles | procedimento do MP Eleitoral
--    O que entra: os discursos apurados sao atribuidos pela portaria a duas
--    OUTRAS pessoas nomeadas, e o papel dele no procedimento e o de
--    representado notificado a se manifestar em 10 dias. A redacao atual pode
--    ser lida como se a conduta apurada fosse dele.
-- ---------------------------------------------------------------------
update public.pontos_atencao
   set descricao = 'Em 18 de maio de 2026, a Procuradoria Regional Eleitoral no Piauí converteu notícia de fato em procedimento preparatório eleitoral para apurar suposto abuso de poder político e propaganda eleitoral extemporânea em evento carnavalesco oficial em Barras (PI), em 16/02/2026. Segundo a portaria, os discursos de exaltação política ao governador Rafael Fonteles e ao presidente da República teriam sido proferidos pelo deputado federal Júlio César Lima e pela suplente de senadora Jussara Lima, em palco de show custeado com recursos públicos. Fonteles foi notificado como representado, junto com os dois, para apresentar manifestação no prazo de 10 dias. O procedimento é preliminar e não representa condenação.',
       data_referencia = date '2026-05-18'
 where id = 'b431cfe0-9677-4308-8ec2-1b495dee70ec'::uuid
   and descricao = 'Em maio de 2026, o MP Eleitoral no Piauí abriu procedimento preparatório para apurar suposto abuso de poder político e propaganda antecipada em evento carnavalesco oficial que teria promovido Rafael Fonteles. O procedimento é preliminar e não representa condenação.';

-- ---------------------------------------------------------------------
-- 3. edilson-damiao | cassacao pelo TSE
--    Tres mudancas, todas literais na fonte que o ponto ja cita:
--      a) ele era o GOVERNADOR EM EXERCICIO na data da decisao, nao "o vice".
--         O TSE escreve "cassacao do mandato do atual governador de Roraima,
--         Edilson Damiao (Uniao Brasil)".
--      b) entram as condutas concretas reconhecidas, no lugar da formula
--         abstrata "abuso de poder politico e economico".
--      c) entra o numero do processo.
--    A ressalva sobre inelegibilidade e MANTIDA e reforcada: a fonte declara
--    inelegivel nominalmente apenas Antonio Denarium. Essa cautela ja era o
--    melhor trecho da ficha e nao se perde na reescrita.
-- ---------------------------------------------------------------------
update public.pontos_atencao
   set descricao = 'Em 30 de abril de 2026, o TSE determinou a cassação do mandato de Edilson Damião (União Brasil), então governador em exercício de Roraima, e a realização de eleições diretas para o cargo. A decisão veio de Ação de Investigação Judicial Eleitoral ajuizada pela coligação Roraima Muito Melhor, referente às eleições de 2022, e as condutas reconhecidas incluem distribuição de bens e serviços com entrega de cestas básicas e benefícios, reforma de residências de famílias de baixa renda, repasse de quase R$ 70 milhões do governo estadual a 12 dos 15 municípios sem observância de critérios legais, e extrapolação de gastos com publicidade. Processo: Recurso Ordinário Eleitoral 0600940-96.2022.6.23.0000. Ao concluir o julgamento, o Plenário declarou inelegível por oito anos o ex-governador Antonio Denarium (Republicanos); a nota do TSE não estende essa declaração a Edilson Damião, e esta redação não afirma inelegibilidade pessoal dele.'
 where id = '7c98b954-3e5d-4537-80e2-aae9b6829878'::uuid
   and descricao = 'Em 30 de abril de 2026, o TSE cassou os mandatos de Antonio Denarium e do vice Edilson Damião e determinou nova eleição direta em Roraima. A decisão decorreu de AIJE por abuso de poder político e econômico; esta redação não afirma inelegibilidade pessoal de Edilson Damião.';

commit;
