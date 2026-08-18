-- Saidas da disputa majoritaria estadual, ciclo 2026
--
-- CONTEXTO. A janela de convencoes partidarias de 2026 vai de 20/07 a 05/08 e o
-- registro de candidatura no TSE vai ate meados de agosto. Ate o registro
-- NINGUEM e candidato oficial: todos sao pre-candidatos, e "deixou de ser
-- pre-candidato" e fato jornalistico, nao dado do DivulgaCandContas (testado:
-- a API de 2026 devolve lista vazia). Por isso tudo aqui e curadoria com fonte
-- nomeada, verificada por leitura direta de pagina em 30/07/2026.
--
-- METODO. Nove agentes independentes varreram as 27 UFs, um lote de estados
-- cada, pesquisando a corrida do estado e conferindo a lista publicada contra o
-- resultado. Instrucao explicita em todos: ausencia de cobertura jornalistica
-- NAO e prova de desistencia, porque boa parte da lista e de partido pequeno que
-- quase nao recebe imprensa. So entra aqui quem tem evidencia POSITIVA de saida.
-- Resultado da varredura: 149 dos 171 nomes seguem e nao sao tocados.
--
-- NADA E DELETADO. As fichas saem da superficie publica e o historico permanece,
-- entao a operacao e reversivel se o quadro mudar antes do registro.
--
-- Detalhamento completo em docs/varredura-governadores-2026-07-30.md

BEGIN;

-- ---------------------------------------------------------------------------
-- BLOCO 1: saiu da disputa e nao tem cargo novo confirmado (13)
-- status 'desistente' + publicavel false + cargo 'Nenhum', que e a combinacao
-- exigida pela CHECK candidatos_publicavel_requires_disputa e o padrao ja usado
-- no banco (jose-carlos-aleluia, pedro-cunha-lima, wanderlei-barbosa).
-- ---------------------------------------------------------------------------

-- mainha (PODE-PI): desistiu em 15/07/2026 e declarou apoio a Joel Rodrigues.
--   Portal Clube News, 15/07: "José Maia, o Mainha, não é mais pré-candidato a governador".
-- toni-rodrigues (PL-PI): direcao estadual encerrou a pre-candidatura em 16/07.
--   Portal Clube News, 17/07: "ficando encerrada a pré-candidatura de Toni Rodrigues".
-- tonny-kerley (NOVO-PI): o NOVO homologou Elizeu Aguiar em chapa majoritaria
--   propria e unica na convencao de 20/07 e ele nao consta em nenhum cargo.
--   Confianca media: evidencia e o partido ter lancado outro nome, nao declaracao dele.
-- caiubi-kuhn (PDT-MT): retirou a pre-candidatura em 04/07 e passou a apoiar
--   Natasha Slhessarenko; o PDT entrou na coligacao dela indicando outro vice.
--   Circuito MT, 04/07.
-- antonia-pedrosa (PT-RR): substituida pelo PT por nao ter cumprido o prazo de
--   desincompatibilizacao do cargo de professora da rede estadual. Folha BV, 01/06.
-- andre-portugues (REPUBLICANOS-RJ): o partido escolheu Anthony Garotinho na
--   convencao de 25/07 e a chapa dele consta como retirada. Metropoles, 25/07.
-- emanuel-cacho (PSDB-SE): desistiu por volta de 22/07 citando custo de campanha;
--   a federacao PSDB/Cidadania coligou-se ao Republicanos. Fan F1, 22/07.
-- sergio-goncalves (UNIAO-RO): a federacao Uniao Progressistas fechou a chapa
--   majoritaria com Hildon Chaves no governo e Cirone Deiro na vice.
--   Eu Ideal, 27/07: "O candidato sou eu. Isso já está acertado com o vice-governador".
--   Confianca media: nenhuma fonte aberta diz para qual cargo ele migrou.
-- giovanni-sampaio (PRD-CE): a direcao nacional da federacao PRD-Solidariedade
--   decidiu nao lancar candidato a governador em nenhum estado e o realocou para
--   a Assembleia. O Povo, 25/07. Deputado Estadual nao existe no enum de
--   cargo_disputado, por isso 'Nenhum'.
-- magno-malta (PL-ES): desistiu em 18/07 e segue no Senado com mandato em curso;
--   o PL passou a apoiar Pazolini. Sim Noticias, 18/07.
-- mario-couto (DC-PA): perdeu o diretorio estadual em 06/07 para grupo aliado de
--   outro pre-candidato e ficou fora da janela para migrar de partido.
--   Opiniao em Pauta, 06/07.
-- tony-garcia (DC-PR): a nova executiva estadual do DC-PR oficializou apoio a
--   Sergio Moro em 23/07. Cristiano Lima, 23/07: "fica superada a possibilidade".
--   Confianca media: ele contesta judicialmente e alega compromisso da executiva
--   nacional. E o unico do bloco em que esperar a convencao seria defensavel.
-- camilo-terra (PCB-SP): e servidor do MPF e nao conseguiu afastamento para
--   disputar; substituido por Carlos Machado. Sampi, 18/06. NOTA: a Wikipedia
--   escreve que ele saiu "apos apresentar problemas no MPF", o que insinua
--   problema juridico e NAO e o que a fonte jornalistica diz. Nao reproduzir.

UPDATE public.candidatos
SET status = 'desistente',
    publicavel = false,
    cargo_disputado = 'Nenhum',
    situacao_candidatura = NULL,
    ultima_atualizacao = NOW()
WHERE slug IN (
  'mainha',
  'toni-rodrigues',
  'tonny-kerley',
  'caiubi-kuhn',
  'antonia-pedrosa',
  'andre-portugues',
  'emanuel-cacho',
  'sergio-goncalves',
  'giovanni-sampaio',
  'magno-malta',
  'mario-couto',
  'tony-garcia',
  'camilo-terra'
);

-- ---------------------------------------------------------------------------
-- BLOCO 2: migrou para cargo que o site nao publica hoje (6)
--
-- Estas pessoas SEGUEM na politica, so mudaram de disputa. Marcar 'desistente'
-- seria factualmente falso. Por isso: cargo_disputado passa a refletir a
-- realidade e publicavel vira false, porque a superficie publica hoje so cobre
-- Presidente, Governador e Vice-Governador. Se o projeto passar a cobrir Senado
-- e Camara, basta religar publicavel.
-- ---------------------------------------------------------------------------

-- jesus-rodrigues (CIDADANIA-PI) -> Deputado Federal, 02/07. Meio News:
--   "estou retirando minha pré-candidatura a governador e agora sou pré-candidato
--   a deputado federal". A federacao PSDB/Cidadania concentrou o majoritario em
--   Lucia Santos.
-- maria-da-consolacao (PSOL-MG) -> Deputada Federal, 26/07. A convencao da
--   federacao PSOL/Rede reprovou candidatura propria ao governo por votacao
--   interna e decidiu apoiar Patrus Ananias. O Fator, 26/07.
-- izalci-lucas (PL-DF) -> Deputado Federal, 23/07. O PL nacional descartou a
--   pre-candidatura dele ao GDF e apoia Celina Leao. O Tempo, 23/07:
--   "O nosso sonho não acabou, apenas foi adiado".
-- ricardo-frota (PDT-RO) -> Deputado Federal, 25/07. Homologado na nominata de
--   nove candidatos a deputado federal do PDT, partido que nao apresentou nome
--   ao governo. Rondonia Dinamica, 25/07.
-- enilton-rodrigues (PSOL-MA) -> Senador, 27/07. Retirou a pre-candidatura ao
--   governo no acordo PT-PSOL e passou a disputar o Senado na chapa de Felipe
--   Camarao. Imirante, 28/07.

UPDATE public.candidatos
SET cargo_disputado = 'Deputado Federal',
    publicavel = false,
    ultima_atualizacao = NOW()
WHERE slug IN ('jesus-rodrigues', 'maria-da-consolacao', 'izalci-lucas', 'ricardo-frota');

UPDATE public.candidatos
SET cargo_disputado = 'Senador',
    publicavel = false,
    ultima_atualizacao = NOW()
WHERE slug = 'enilton-rodrigues';

-- marcos-vieira (PSDB-SC) -> Deputado Estadual (reeleicao), 10/06. O PSDB-SC
--   reuniu cerca de 300 liderancas e decidiu por aclamacao apoiar a reeleicao de
--   Jorginho Mello, sem candidatura propria ao governo; ele, que preside o
--   partido no estado, disputa a reeleicao como deputado estadual. ClicRDC, 10/06.
--   'Deputado Estadual' nao existe no enum de cargo_disputado, entao fica
--   'Nenhum' e o cargo real esta registrado aqui.
UPDATE public.candidatos
SET cargo_disputado = 'Nenhum',
    publicavel = false,
    situacao_candidatura = NULL,
    ultima_atualizacao = NOW()
WHERE slug = 'marcos-vieira';

-- ---------------------------------------------------------------------------
-- BLOCO 3: mudou de cargo e SEGUE na disputa (3)
--
-- Estas tres pessoas estao concorrendo, so nao ao cargo que a ficha diz. Sai da
-- superficie publica porque publicar "candidato a Governador" para quem e
-- candidato a Vice e dado errado. A correcao do cargo para Vice-Governador ficou
-- explicitamente com o Thiago, junto da decisao de politica de vice (hoje o banco
-- tem vice de uma chapa so, o que da aparencia de recorte politico).
-- ---------------------------------------------------------------------------

-- rafael-luz (MISSAO-RJ): o partido inverteu a chapa e ele passou a candidato a
--   VICE-governador de Coronel Busnello. Tempo Real RJ, 18/07: "ele substitui o
--   bombeiro militar Rafa Luz, que passa a integrar a chapa como candidato a
--   vice-governador".
-- francisco-dias (UP-RN): a UP promoveu Arinalda Medeiros a cabeca de chapa e ele
--   virou VICE. DeFato, 29/07. NAO e desistencia.
-- raquel-bricio (UP-PA): descartou o governo do PA para ser candidata a
--   VICE-PRESIDENTE na chapa de Samara Martins, confirmada na convencao nacional
--   da UP em 26/07. Correio Braziliense, 26/07. O enum de cargo_disputado nao tem
--   Vice-Presidente, entao o cargo dela nao e representavel no schema atual.

UPDATE public.candidatos
SET publicavel = false,
    ultima_atualizacao = NOW()
WHERE slug IN ('rafael-luz', 'francisco-dias', 'raquel-bricio');

-- ---------------------------------------------------------------------------
-- BLOCO 4: Eduardo Leite nao concorrera
--
-- Decisao informada pelo Thiago em 30/07/2026, que encerra uma divergencia entre
-- dois agentes desta apuracao: um afirmou que ele oficializou pre-candidatura a
-- Presidencia pelo PSD em 06/03/2026, outro que, com a escolha de Ronaldo Caiado
-- pelo PSD, ele decidiu ficar no governo do RS ate o fim do mandato. A ficha ja
-- estava fora do ar (status 'removido'), mas seguia com cargo 'Presidente', que
-- agora e falso.
--
-- Consequencia a propagar: docs/auditoria-fontes-fila-publicacao-2026-07-29.md
-- afirma que ele e pre-candidato a Presidencia e precisa de correcao.
-- ---------------------------------------------------------------------------

UPDATE public.candidatos
SET status = 'desistente',
    cargo_disputado = 'Nenhum',
    situacao_candidatura = NULL,
    publicavel = false,
    ultima_atualizacao = NOW()
WHERE slug = 'eduardo-leite';

COMMIT;
