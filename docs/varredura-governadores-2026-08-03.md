# Varredura de inclusoes pos-convencoes (2026-08-03)

Checagem de 40 nomes apontados como lancados ou pre-lancados e ausentes do site,
mais uma releitura dos que a varredura de 30/07 tinha marcado como fora da
disputa. Metodo: busca com leitura de pagina, cruzada com duas fontes que a
varredura anterior nao tinha.

## As duas fontes novas

**1. O registro de candidatura de 2026 do TSE parou de ser vazio.** Em 30/07 o
pacote `consulta_cand_2026.zip` tinha 1.828 linhas, so 10 de GOVERNADOR e 100%
dos campos em `#NE`. Na versao de 02/08 as 22h34 ele tem **7.200 linhas, 32 delas
de Governador e Vice**, com nome civil, data de nascimento, UF de nascimento,
grau de instrucao, ocupacao e SQ_CANDIDATO. Onde o registro existe, ele vale mais
que qualquer nota de imprensa, e foi o que destravou dois nomes.

O registro segue ate 15/08 e o arquivo e atualizado todo dia. **A partir de
15/08 esta varredura deveria ser um script, nao uma leitura de noticia.**

**2. Balanco do Congresso em Foco de 27/07**, com os 51 governadores homologados
na primeira semana de convencoes, estado a estado. Serve de segunda fonte
independente e foi ele que confirmou Gilberto Vasconcelos e Elisson Ferreira.

## Resultado: 8 fichas mudaram, 5 continuam bloqueadas por identidade

### Entraram no site (7)

| Nome | Partido | UF | Ato | Identidade veio de |
|---|---|---|---|---|
| Lenilda Luna | UP | AL | convencao 21/07 | TSE 2022, dep. federal AL |
| Aroldo Felix | UP | BA | convencao 25/07 | TSE 2022, governo SE |
| Jose Estevao | DC | BA | convencao 02/08 | JOTA (perfil dos pre-candidatos BA) |
| Professor Robson Raymundo | PSTU | DF | lancamento 01/08 | TSE 2022, governo DF |
| Luis Cesar Bueno | PT | GO | convencao 01/08 | TSE 2022, dep. estadual GO |
| Saulo Arcangeli | PSTU | MA | convencao 29/07 | **registro TSE 2026** |
| Dr. Luisinho | AGIR | AC | convencao + registro | **registro TSE 2026** |

Dr. Luisinho nao estava na lista pedida. Apareceu porque o registro do TSE de
2026 do Acre ja tem a candidatura dele e o site nao tinha a ficha.

Luis Cesar Bueno era exatamente o caso que 30/07 barrou com o motivo certo: "a
convencao ainda era FUTURA em 30/07". Ela ocorreu em 01/08.

### Voltou a disputa (1)

**Emanuel Cacho (PSDB-SE)** saiu como `desistente` em 30/07, com base em fonte de
22/07 na qual desistia citando custo de campanha. A federacao PSDB-Cidadania
mudou de rota e o oficializou em convencao no domingo 02/08, com Suely Barreto na
vice (G1 SE).

Isto valida o desenho da saida de 30/07: como nada foi deletado, a volta foi um
UPDATE de tres campos. Ele nao tem nenhum ponto de atencao cadastrado, entao a
republicacao nao levou claim sem link-check para o ar.

### Publicadas com nome civil PROVISORIO (5)

**Decisao do Thiago, tomada as 10h39 de 03/08 com o custo declarado.** A primeira
versao deste documento tinha estas cinco de fora, mantendo a regra de 30/07. Ele
optou por publicar agora com `nome_completo` igual ao nome de urna em vez de
esperar ate 15/08.

Isso e placeholder, nao dado, e esta marcado como tal em `fonte_dados`, para que
a proxima migration de identidade ache as cinco linhas por query em vez de por
memoria:

```sql
SELECT slug FROM public.candidatos
WHERE 'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)' = ANY(fonte_dados);
```

A candidatura, essa sim, esta verificada em convencao para os cinco.

| Nome | Partido | UF | Ato verificado |
|---|---|---|---|
| Gilberto Vasconcelos | PSTU | AM | convencao 25/07 no CAUA/Ufam (G1 + Congresso em Foco) |
| Elisson Ferreira | AGIR | DF | convencao 20/07 (G1 + Congresso em Foco + Correio Braziliense) |
| Yuri Ezequiel | UP | PB | convencao 29/07 (G1, JPB2) |
| Carlos Machado | PCB | SP | convencao 01/08 (G1, Metropoles) |
| Guilherme Fonseca | PSTU | PE | ja era lacuna em 30/07 |

Nenhum dos cinco tem registro no TSE de 2014, 2018, 2022 nem 2024 nos cargos
sondados, e a imprensa so publica o nome de urna. Foram procurados tambem em
2024 nos municipios plausiveis (Manaus, Joao Pessoa, Sao Luis, Franca) e na
pagina de campanha do Carlos Machado, que traz biografia e nenhum nome civil.
Sao primeira candidatura. O pacote `consulta_cand_2026` foi rebaixado as 10h40 de
03/08 e continuava na versao de 02/08 22h34, sem AM, DF, PB, PE nem SP no cargo
de governador. **Corrige sozinho quando o registro de 2026 alcancar esses
estados**, o que deve ocorrer antes de 15/08, e o recheque agendado para 06/08 ja
carrega a query acima.

## O que a lista pedia e a evidencia contradiz

Metade dos 40 nomes nao entra, e por motivos diferentes.

### Disputam outro cargo, que o site nao cobre (6)

| Nome | UF | Cargo real |
|---|---|---|
| Expedito Mendonca (PCO) | DF | Senado |
| Evandro Craveiro (Democrata) | PI | Senado; o Democrata lancou Ravenna Castro ao governo |
| Eder Mauro (PL) | PA | Senado |
| Lahesio Bonfim (NOVO) | MA | Senado, desde 11/06 |
| Enilton Rodrigues (PSOL) | MA | Senado, desde 27/07 |
| Paulo Serra (PSDB) | SP | Camara |
| Adriana Accorsi (PT) | GO | reeleicao a deputada federal, convencao 01/08 |

### Sairam da disputa e a saida se sustenta (6)

Recheque de 03/08 confirmou as decisoes de 30/07:

- **Magno Malta (ES)**: convencao do PL em 01/08 apoiou Pazolini; a filha,
  Maguinha, foi ao Senado. Ele segue senador.
- **Caiubi Kuhn (MT)**: o PDT-MT nao o lancou; "recuou com a candidatura".
- **Toni Rodrigues (PI)**: retirada em 17/07 (G1); em 01/08 aparece no palanque
  da federacao adversaria.
- **Kim Kataguiri (SP)**: desistiu em 20/06 (G1), tenta reeleicao a Camara.
- **Maria da Consolacao (MG)**: o PSOL reprovou a candidatura propria em votacao
  interna e ela retirou a pre-candidatura.
- **Sergio Gama (PB)**: o DC-PB lancou **Pedro Coutinho** apos a desistencia
  dele.

### Ja estavam no site (2)

- **Garotinho (RJ)**, publicado.
- **Amelio Cayres (TO)**, publicado como **vice de Vicentinho Junior pelo MDB**.
  A lista o dava como Republicanos; o banco esta certo e a lista, nao.

### Sem desfecho ate 03/08 (7)

Nao entram hoje, e nenhum deles esta encerrado:

| Nome | UF | Situacao |
|---|---|---|
| Tony Garcia (DC) | PR | a nova executiva estadual reverteu e homologa em **05/08** |
| Antonia Pedrosa (PT) | RR | convencao do PT-RR e em **04/08**; o PT abriu mao de candidatura propria em 14 estados |
| Roberto Rocha | MA | confirmou a disputa; convencao do PRTB em **04/08** |
| Delcidio do Amaral (PRD) | MS | nao definiu cargo; convencao de agosto sem data confirmada |
| Paulo Hartung (PSD) | ES | o PSD-ES segue sem rumo definido |
| Washington Reis (MDB) | RJ | o MDB coligou com o PSD de Eduardo Paes e a irma dele, Jane Reis, e a vice |
| Rodrigo Bolsonaro (AGIR) | RN | so "comunicacao de pre-candidatura", sem convencao |
| Brunno Dias (PCO) | SC | sem evidencia de convencao, igual a 30/07 |
| Mario Couto (DC) | PA | a JOTA ainda o lista, mas nada supera a perda do diretorio em 06/07 |

### Um caso fechado pelo registro oficial

**Paulo Cesar Quartiero (DC-RR)** nao disputa governo. Ele ja **registrou
candidatura a DEPUTADO FEDERAL** (consulta_cand 2026 RR, SQ 230002533592, PAULO
CESAR JUSTO QUARTIERO, DC). A evidencia de governo que circula e da eleicao
SUPLEMENTAR de maio, da qual ele retirou a candidatura em 20/05.

## Sobre "alguem que esta no site desistiu?"

### Achado: Wilson Witzel saiu, e estava publicado (1)

**Wilson Witzel (D35-RJ)** desistiu da pre-candidatura em 01/08 e declarou apoio
a Anthony Garotinho, que ja esta publicado no site. Confirmado por G1 RJ e Folha
de S.Paulo no mesmo dia. Ele estava `publicavel = true` como Governador do RJ ate
agora, com 1 ponto de atencao visivel. Marcado `desistente` neste lote.

A pista veio do log de outra sessao na Daily Note do vault (09:29, Codex, rodando
auditoria de frescor do seed) e foi **verificada por fonte propria antes de
virar escrita**, nao aceita pelo log.

### Fora esse, o quadro geral

Para o resto do elenco publicado, a resposta honesta e que **hoje ainda nao da
para fechar isso**. As convencoes so terminam em 05/08 e o registro so em 15/08.
O que foi possivel verificar:

- Os 13 nomes que 30/07 marcou como desistentes foram rechecados. **Doze
  continuam corretos. Um voltou (Emanuel Cacho) e ja foi religado.**
- Cruzando os 32 registros de governador e vice do TSE de 2026 contra o banco,
  **todo mundo que registrou ja tem ficha**, exceto Dr. Luisinho, que entrou
  neste lote.
- Cruzando os 51 homologados do balanco do Congresso em Foco contra o banco,
  **as duas unicas ausencias eram Gilberto Vasconcelos e Elisson Ferreira**, os
  dois bloqueados por nome civil.

Fora o Witzel, nao apareceu outro nome publicado que tenha desistido. Mas isso e
"nao encontrei", nao e "nao existe": a varredura de 30/07 foi feita com nove
agentes cobrindo 27 UFs uma a uma, e esta nao repetiu aquele esforco. E o proprio
Witzel so apareceu porque outra sessao tropecou nele, o que mostra o tamanho do
ponto cego. **O recheque com forca de prova e depois de 15/08, contra o
DivulgaCandContas, por script.**

## A politica de vice foi decidida e ligada

**O site passa a cobrir vice em todas as chapas, com o registro do TSE como fonte
unica.** Decisao do Thiago em 03/08, fechando a pendencia de 30/07.

O que muda na pratica: o banco tinha 3 vices (Edegar Pretto PT-RS, Felicio
Ramuth MDB-SP, Amelio Cayres MDB-TO). No RS todas as chapas ja tinham vice e so o
petista aparecia, o que parecia recorte politico sem ser. Agora sao 19.

**Por que o criterio novo e neutro:** entra quem esta no registro do TSE, e nada
mais. Nao depende de cobertura de imprensa, tamanho de partido nem escolha
editorial, e completa sozinho conforme o registro avanca ate 15/08. Chapa sem
vice no site hoje e estado da fonte, nao curadoria.

Entraram 15 vices novos, todos com identidade oficial do proprio registro (nome
civil, nascimento, instrucao, ocupacao e SQ_CANDIDATO em `fonte_dados`). Os 16
SQ_CANDIDATO foram para `data/candidatos.json` e passaram no
`audit:seed-sq-identity:gate -- 2026`: 16 pares conferidos, zero divergencia de
pessoa e zero de data de nascimento.

Junto veio a correcao que o registro expos: **Roberto Claudio (CE)** estava como
`Governador` e despublicado. O TSE o registra como **vice de Ciro Gomes** pelo
Uniao Brasil (SQ 60002531352). Era dado errado, nao so ausencia.

Dois slugs nao derivam do nome de urna, de proposito: `larissa-rosado`, porque o
nome de urna e so "Larissa" e slug de uma palavra tao generica colide com
qualquer homonima futura; e `baba`, que foi mantido seguindo o precedente de
`mainha` ja no banco.

## Paridade entre repo e producao, que estava quebrada

O banco tinha migrations de hoje que nao existiam em `supabase/migrations/`,
aplicadas por outra sessao direto na producao. Reconstruido com
`supabase migration fetch`.

**Duas armadilhas do comando, para quem repetir isto:**

1. Ele **reescreve todos os arquivos historicos** removendo linhas em branco. No
   nosso caso foram 289 arquivos modificados, 5.830 insercoes e 7.449 remocoes de
   puro ruido. `git checkout -- supabase/migrations` logo depois reverte os
   rastreados e deixa so os novos, que sao untracked.
2. Ele tambem trouxe as quatro migrations de 30/07 sob versoes diferentes
   (`20260730135753` e irmas) das que o repo ja tinha (`20260730120000` e irmas).
   Nao sao duas operacoes: e a mesma, com o numero que o MCP gerou. As quatro
   foram descartadas, porque a versao do repo tem a documentacao completa e a do
   banco tem so um resumo.

**A causa raiz continua de pe:** migration aplicada pelo MCP ganha versao
automatica, e arquivo escrito a mao ganha outra. Enquanto os dois caminhos
existirem, repo e banco divergem de novo. O `fetch` e o conserto, nao a
prevencao.

## O que este lote NAO fez

- Nao mexeu em nenhum dos nove nomes sem desfecho. Recheque agendado para 06/08
  as 9h, um dia depois de fechar a janela de convencoes.
- Nao criou ponto de atencao nenhum. As fichas novas nascem sem historico,
  patrimonio e votacoes ate a ingestao rodar, igual as seis de 30/07.
- Nao rodou o link-check de republicacao para Emanuel Cacho porque ele nao tem
  nenhuma claim cadastrada. Para qualquer proxima volta de desistente, o gate do
  PR #42 continua obrigatorio:
  `npx tsx scripts/link-check-pontos-atencao.ts --revalidar=<slug>`
