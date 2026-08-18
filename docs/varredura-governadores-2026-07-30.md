# Varredura dos pre-candidatos a Governador (2026-07-30)

Verificacao dos 171 pre-candidatos a Governador e Vice-Governador que o site
exibia em 30/07/2026, em 27 UFs. Metodo: nove agentes independentes, um lote de
estados cada, pesquisando a CORRIDA de cada estado e conferindo nossa lista
contra o resultado, com proibicao de devolver fato sem abrir a pagina.

## A regra que evitou uma limpeza enviesada

Instrucao explicita em todos os nove briefings: **ausencia de cobertura
jornalistica nao e prova de desistencia.** Boa parte da lista e de partidos
pequenos (PCO, UP, PSTU, PCB, MISSAO, D35, AGIR, DC, MOBILIZA, PRD) que quase
nao recebem cobertura e lancam candidatura propria em muitos estados por
estrategia. Sem essa regra, a varredura teria removido nanico por silencio da
imprensa, o que seria limpeza enviesada num site civico.

O resultado mostra que a regra estava certa: quase todos os nanicos tem ato
formal verificavel de lancamento ou convencao. Nenhum saiu por falta de
noticia.

Um caso concreto de falso positivo evitado: **Ravenna Castro (D35-PI)** aparece
como desistente em listas de 18 e 20/07, porque em junho havia trocado o
governo pelo Senado. A direcao do partido pediu que ela retomasse e a convencao
de 29/07 a homologou ao Governo. Auditoria que parasse na lista de 20/07 a
removeria por engano.

## Resultado: 149 dos 171 seguem, 22 mudam

### Grupo 1: saiu do governo e foi para cargo que o site nao cobre hoje (6)

Estas pessoas seguem na politica, mudaram de disputa. O site hoje so publica
Presidente, Governador e Vice-Governador, entao manter ou remover depende de
decisao de produto, nao de fato.

| Nome | Partido | UF | Foi para | Data |
|---|---|---|---|---|
| Jesus Rodrigues | CIDADANIA | PI | Deputado Federal | 02/07 |
| Maria da Consolacao | PSOL | MG | Deputada Federal | 26/07 |
| Izalci Lucas | PL | DF | Deputado Federal | 23/07 |
| Ricardo Frota | PDT | RO | Deputado Federal | 25/07 |
| Enilton Rodrigues | PSOL | MA | Senador | 27/07 |
| Marcos Vieira | PSDB | SC | Deputado Estadual (reeleicao) | 10/06 |

### Grupo 2: saiu da disputa e nao tem cargo novo confirmado (13)

Estes sao os casos limpos de `status = 'desistente'`.

| Nome | Partido | UF | Motivo | Data | Confianca |
|---|---|---|---|---|---|
| Mainha | PODE | PI | desistiu, apoia Joel Rodrigues | 15/07 | alta |
| Toni Rodrigues | PL | PI | direcao estadual encerrou a pre-candidatura | 16/07 | alta |
| Tonny Kerley | NOVO | PI | NOVO homologou Elizeu Aguiar em chapa unica | 20/07 | media |
| Caiubi Kuhn | PDT | MT | retirou, apoia Natasha Slhessarenko | 04/07 | alta |
| Antonia Pedrosa | PT | RR | substituida por perder prazo de desincompatibilizacao | 01/06 | alta |
| Andre Portugues | REPUBLICANOS | RJ | partido escolheu Garotinho | 25/07 | alta |
| Emanuel Cacho | PSDB | SE | desistiu citando custo de campanha | 22/07 | alta |
| Sergio Goncalves | UNIAO | RO | federacao fechou chapa com Hildon Chaves | 27/07 | media |
| Giovanni Sampaio | PRD | CE | direcao nacional vetou candidatura a governador | 25/07 | alta |
| Magno Malta | PL | ES | desistiu, segue no Senado com mandato em curso | 18/07 | alta |
| Mario Couto | DC | PA | perdeu o diretorio estadual, sem janela para migrar | 06/07 | alta |
| Tony Garcia | DC | PR | executiva estadual apoiou Sergio Moro | 23/07 | media |
| Camilo Terra | PCB | SP | servidor do MPF sem afastamento; substituido | 18/06 | alta |

Ressalva no Tony Garcia: ele contesta judicialmente, alega compromisso da
executiva nacional, e a Quaest ainda o testou entre 21 e 25/07. E o unico do
grupo em que esperar a convencao do DC-PR seria defensavel.

Ressalva no Camilo Terra: a Wikipedia escreve que ele saiu "apos apresentar
problemas no Ministerio Publico Federal", o que insinua problema juridico. A
fonte jornalistica diz outra coisa: ele e servidor do MPF e nao conseguiu
afastamento. **Nao reproduzir a formulacao da Wikipedia.**

### Grupo 3: mudou de cargo e SEGUE na disputa (3)

Estes nao sao remocao. Se sairem do site sem correcao de cargo, a plataforma
perde gente que esta concorrendo.

| Nome | Partido | UF | Cargo no banco | Cargo real hoje |
|---|---|---|---|---|
| Rafael Luz | MISSAO | RJ | Governador | Vice-Governador (chapa de Coronel Busnello) |
| Francisco Dias | UP | RN | Governador | Vice-Governador (chapa de Arinalda Medeiros) |
| Raquel Bricio | UP | PA | Governador | Vice-Presidente (chapa de Samara Martins) |

O caso da Raquel Bricio nao cabe no enum atual de `cargo_disputado`
(Presidente, Governador, Vice-Governador, Senador, Deputado Federal, Nenhum),
que nao tem Vice-Presidente. Isso e limitacao de schema, nao de dado.

### Grupo 4: NAO tocar, rechecar depois de 05/08 (7)

| Nome | Partido | UF | Por que esperar |
|---|---|---|---|
| Cleitinho | REPUBLICANOS | MG | partido diz que ele nao e candidato, ele nao desistiu, aliados dizem que segue, e o PL deixou a vaga aberta esperando a decisao dele |
| Olimpio Rocha | PSOL | PB | federacao rejeitou por 8 a 4, mas ele recorreu a direcao nacional e o recurso seguia sem decisao |
| Edilson Damiao | UNIAO | RR | anunciou reavaliacao da pre-candidatura, sem saida consumada |
| Cintia Dias | PSOL | GO | negociacao aberta entre governo e Senado, sem acordo fechado |
| Telemaco Brandao | NOVO | GO | partido apoia Wilder Morais, mas ele declarou que mantem a pre-candidatura ate a convencao |
| Jose Roberto Arruda | PSD | DF | elegibilidade genuinamente controversa, sem decisao definitiva; marcar "impedido" agora seria antecipar decisao judicial que nao existe |
| Vera Lucia | PSTU | SP | evidencia de permanencia e fraca (manifesto de dez/2025), mas evidencia de saida e zero; pela regra, mantem |

## O achado que inverte o diagnostico: o site esta SUB-coberto

A varredura procurava excesso e encontrou falta. Cerca de 20 nomes com
candidatura formalizada em convencao nao estao no site:

- **MG:** Patrus Ananias (PT), que lidera a frente progressista com apoio do PSOL
- **RJ:** Coronel Busnello (MISSAO), hoje cabeca de chapa do partido
- **RR:** Nelita Frank (PT), que substituiu Antonia Pedrosa
- **DF:** Elisson Ferreira (AGIR)
- **PE:** Guilherme Fonseca (PSTU)
- **PA:** Gal Leite (UP), que substituiu Raquel Bricio
- **SP:** Carlos Alberto Machado (PCB), que substituiu Camilo Terra
- **RN:** Arinalda Medeiros (UP), que virou cabeca de chapa
- **MA:** Saulo Arcangeli (PSTU)
- **GO:** Luis Cesar Bueno (PT) e Luciana Amorim (UP)
- **RS:** Cesar Pontes (PCO)
- **SC:** Marcelo Brigadeiro (MISSAO), Marcus Sodre (PSTU), Brunno Andrade Dias (PCO), Helio Vaz (AGIR)
- **TO:** Prof. Witer (PSOL), ja homologado

Padrao: em varios casos o site tem quem SAIU e nao tem quem ENTROU no lugar.
Remover sem inserir o substituto faz o partido desaparecer da corrida naquele
estado, o que e pior do que o dado velho.

## A assimetria de vice que precisa de decisao editorial

O banco tem tres pre-candidatos a Vice-Governador: Edegar Pretto (PT-RS),
Felicio Ramuth (MDB-SP) e Amelio Cayres (MDB-TO). Os tres estao corretos como
vice.

O problema e o recorte. No RS, todas as chapas ja tem vice definido (Ernani
Polo com Gabriel Souza, Silvana Covatti com Zucco, Claudio Diaz com Maranata,
Naf Nascimento com Priscila Voigt) e **nenhum esta no banco, so o vice
petista**. Isso da aparencia de recorte politico mesmo sem intencao. Ou o site
cobre vice em todas as chapas, ou em nenhuma.

## Correcoes de dado que a varredura confirmou

- **Tarcisio de Freitas** disputa a REELEICAO ao governo de SP e apoia Flavio
  Bolsonaro; nao e pre-candidato a Presidencia. Convencao do Republicanos em 01/08.
- **Fernando Haddad** deixou o Ministerio da Fazenda e disputa o governo de SP,
  oficializado em convencao em Campinas em 25/07, com Marina Silva e Simone
  Tebet ao Senado na mesma chapa.
- **Ciro Gomes** disputa o governo do CEARA pelo PSDB, oficializado em 16/05, e
  recusou o convite para a Presidencia. O registro de Presidencia dele deve cair.
- **Clecio Luis** e governador do Amapa desde 2023 e disputa reeleicao; nao e
  prefeito de Macapa. Quem era prefeito de Macapa e o Furlan, que renunciou em
  05/03.
- **Hana Ghassan** e a governadora em exercicio do Para desde 02/04/2026.
- **Otaviano Pivetta** e o governador em exercicio de MT desde 31/03/2026.
- **Daniel Vilela** e o governador em exercicio de Goias desde 31/03/2026.
- **Roberto Cidade** foi eleito governador do Amazonas em eleicao indireta em maio.
- **Ratinho Junior** esta no segundo mandato e nao pode se reeleger; o PSD-PR
  lancou Sandro Alex. Ele nao deve entrar em lista de governo.

## Divergencia entre agentes que NAO foi resolvida

Sobre **Eduardo Leite**, dois agentes se contradisseram:

- Um afirmou que ele oficializou pre-candidatura a Presidencia pelo PSD em
  06/03/2026.
- Outro afirmou que ele NAO e pre-candidato a Presidencia e nao renunciou ao
  governo do RS, porque, com a escolha de Ronaldo Caiado pelo PSD, decidiu
  ficar no Piratini ate o fim do mandato (fonte de 30/03/2026).

As duas versoes se reconciliam se ele lancou em marco e recuou quando o partido
escolheu Caiado, mas **isso nao foi verificado**. Consequencia pratica: se a
segunda versao valer, Gabriel Souza segue VICE do RS e nao governador em
exercicio, e qualquer texto do projeto que trate Leite como presidenciavel esta
errado. Precisa de checagem propria antes de virar dado publicado. O documento
`docs/auditoria-fontes-fila-publicacao-2026-07-29.md` afirma a primeira versao
e deve ser corrigido se a segunda se confirmar.

## O que NAO foi feito

Nenhuma escrita no banco. Nada foi removido do site. Este documento e insumo de
decisao.

## Recomendacao de sequencia

1. **Executar o Grupo 2** (13 nomes) como `status = 'desistente'`, que e o
   padrao ja usado no banco e tira do ar sem deletar nada. Se quiser ser
   conservador, deixar Tony Garcia fora deste lote pela contestacao judicial.
2. **Decidir o Grupo 1** (6 nomes): o site passa a cobrir Senado e Camara, ou
   remove quem migrou para la? A resposta muda o produto, nao so estas 6 linhas.
3. **Corrigir cargo do Grupo 3** (Rafael Luz e Francisco Dias para
   Vice-Governador), e decidir o que fazer com Raquel Bricio, que exige
   Vice-Presidente no enum.
4. **Nao tocar o Grupo 4** e rechecar depois de 05/08, quando a janela de
   convencoes fecha.
5. **Inserir os substitutos** antes ou junto das remocoes, para nenhum partido
   desaparecer de um estado.
6. **Decidir a politica de vice**, porque o recorte atual expoe um vice de um
   partido e esconde os demais.
7. Depois do registro de candidaturas em meados de agosto, tudo isso vira
   consultavel no DivulgaCandContas, que e fonte oficial e legivel por maquina.
   A partir dai isso deveria ser automacao agendada, nao varredura manual.

## Adendo de 30/07/2026: identidade das 6 fichas incluidas

As 6 inclusoes da migration `20260730130000_roster_governadores_inclusoes_2026.sql`
nasceram com nome, partido, UF e cargo, e mais nada. A migration
`20260730150000_identidade_inclusoes_governadores_2026.sql` preenche
`data_nascimento`, `naturalidade`, `formacao` e `profissao_declarada`, e a
proveniencia campo a campo esta no cabecalho dela.

**O registro de 2026 nao serviu.** O pacote `consulta_cand_2026.zip` ja existe e
e atualizado diariamente, mas em 30/07 tinha 1.828 linhas no pais, so 10 de
GOVERNADOR, 8 UFs com arquivo vazio (entre elas TO) e 100% das linhas em
`#NE`. Nenhum dos 6 estava la. A fonte usada foi o registro eleitoral do TSE de
anos anteriores (2014, 2018, 2022), pela mesma rota do DivulgaCandContas que as
migrations de identidade de julho ja usam. Os SQ_CANDIDATO correspondentes
entraram em `data/candidatos.json` e passam no `audit:seed-sq-identity:gate`.

Tres pendencias que este doc deixou em aberto foram fechadas com fonte:

- **Nome civil do jeremias-cosmo.** A imprensa so escreve "Jeremias Cosmo". O
  TSE registra `JEREMIAS COSMO SILVA DOS SANTOS`. O vinculo entre os dois nao
  foi presumido: bate municipio de nascimento (Palmares), ano (1980), as duas
  profissoes (bancario do Banco do Brasil e professor da rede estadual) e o
  municipio de atuacao (Ribeirao). Detalhamento no cabecalho da migration.
- **Coronel Busnello e cabeca de chapa**, confirmado. A chapa foi invertida por
  volta de 17-18/07 e homologada em convencao virtual em 23/07, com Rafael Luz
  (Rafa Luz, bombeiro militar) como vice.
- **Marcus Sodre.** O registro do TSE de 2014 e a mesma pessoa: nome civil,
  partido (PSTU) e UF identicos, e a idade derivada da data de nascimento (54)
  bate com a que a imprensa publicou na convencao de 25/07.

**O que ficou nulo, e por que.** `witer-naves` fica sem `data_nascimento` e sem
`formacao`. Ele nao tem registro nenhum no TSE em 2014, 2016, 2018, 2020, 2022
nem 2026, e a fonte jornalistica da a idade (54), nao a data. Idade nao
determina data de nascimento, e "geografo" e profissao, nao grau de instrucao.
Consequencia visivel: a ficha dele sai sem idade, porque
`public.candidatos_publico` deriva idade de `data_nascimento`. Desbloqueia no
registro de agosto.

**Divergencia anotada e nao corrigida.** O TSE grafa o sobrenome do
patrus-ananias como "DE SOUSA" em 2014 e 2022 e "DE SOUZA" em 2018; a API da
Camara diz "SOUZA". O banco usa "Souza". Nao foi mexido: trocar grafia de nome
civil por maioria de fontes e chute, nao correcao.
