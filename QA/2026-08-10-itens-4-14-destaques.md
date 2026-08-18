# Itens 4 e 14: destaques com conteúdo real e vazio honesto

Trilha C, branch `trilha-c`. Desenvolvido **exclusivamente** contra o contrato
B-E2 da Trilha B (`QA/2026-08-09-trilha-b-contrato-de-dados.md`) e suas fixtures
(`QA/contratos/trilha-b-fixtures.json`), trazidos para cá por `git checkout
trilha-b --`, sem cópia manual.

Sem banco, migration, push, merge ou deploy. Timeline, `recortes.json` e as
baselines da Raiz intocados. Contratos dos itens 7 e 8 preservados.

## O que o contrato mudou no plano, antes de escrever código

O item 4/14 nasceu como "destaques vazios, apresentar alguma coisa pelo menos".
Duas linhas do contrato mudam o que é possível:

1. **Sanção não vira ponto de atenção, e não vai virar no lançamento.** O guard
   `motivoRecusaDeFonte()` recusa gravidade alta sem fonte pública. Se a
   ampliação dependesse de a coleta encher `pontos_atencao`, ela não encheria
   nada. Por isso sanção passa a entrar na aba por **caminho próprio**.
2. **Lista vazia não é ficha limpa.** Quem separa é a proveniência
   (`sancoes_verificacao`, `processos_verificacao`), não o tamanho da lista. Só
   `encontrado` e `vazio_confirmado` autorizam afirmar algo.

O gate desta frente é **zero afirmações falsas, não zero fichas vazias**, e a
frase que a aba dizia antes violava isso em silêncio: "Nenhum alerta ou ponto
positivo visível registrado no momento" mistura "consultamos e não achamos" com
"nunca consultamos".

## O que mudou

`src/lib/destaques-ficha.ts` (novo, puro) monta a aba a partir do que a ficha já
tem, e traduz o vocabulário fechado do contrato para o que a superfície pode
dizer:

| Estado da fonte | O que a aba diz |
|---|---|
| `encontrado` | mostra o conteúdo |
| `vazio_confirmado` | "Consultado, nada encontrado", com a data |
| `nao_aplicavel` | "Não se aplica a esta candidatura" |
| `sem_achado_no_escopo` | "Curadoria limitada: a ausência aqui não é conclusão" |
| `indeterminado`, `erro` | "Não foi possível verificar" |
| sem linha | "Ainda não verificado" |

Três decisões que o contrato obrigou e estão no código:

- **sanção expirada continua na lista**, separada da vigente. Vigência sai de
  `data_fim`, não de um campo `ativo` (que nem chega à superfície). Somar a
  lista inteira anunciaria como atual o que já acabou;
- **proveniência `encontrado` com lista vazia fecha em "não foi possível
  verificar"**, porque afirmar "nada encontrado" contradiria a própria fonte;
- **`null` e falha de leitura degradam para "ainda não verificado"**, nunca para
  limpeza.

## Um estado do contrato faltava no tipo do app

`ColetaResultado` em `src/lib/types.ts` tinha 5 estados; o vocabulário fechado do
contrato B-E2 tem 6. Faltava `sem_achado_no_escopo`, que é justamente um dos que
**não** fecham cobertura. Sem ele no tipo, o compilador não cobrava o caso e a
superfície o trataria como desconhecido. Acrescentado, com a citação do contrato
no comentário.

## Correções do bloqueio de 10/08

### 1. Readback estava medindo o universo errado

Media `candidatos` (280 linhas), que inclui ficha que a superfície pública nunca
mostra. O universo canônico é `candidatos_publico`, **194**. Corrigido, com
teste que lê o próprio arquivo do readback e reprova se a tabela voltar.

### 2. `pontos_atencao` vazio não é mais "Consultado, nada encontrado"

A tabela é curadoria editorial e não tem proveniência de coleta que autorize
afirmar consulta. Estado próprio `sem_curadoria_editorial`, frase "Nenhum
destaque editorial publicado", categoria `editorial`, e **fora do cálculo de
cobertura factual**.

### 3. Fontes elegíveis que estavam sendo ignoradas

Trajetória, patrimônio e votações passaram a entrar, cada uma com regra
explícita:

- **mandato**: regra positiva fail-closed, detalhada na seção do bloqueio de
  10/08 abaixo;
- **patrimônio**: só `estado === "publicado"`. `vazio_confirmado` é ausência
  honesta, `nao_coletado` não vira nada;
- **votações**: voto com votação-chave, que depois do item 7 só existe por
  votação exata.

### 4. O caso `renan-santos`, auditado e respondido

Lido do banco em 10/08: 1 ponto de atenção, 0 sanções, 0 processos, 0 votos, 0
patrimônio, e trajetória com duas linhas. As duas linhas são:

| Linha | Por que não vira destaque |
|---|---|
| "Presidente Nacional do Partido Missão", mandato, 2025 | cargo interno de partido, não é cargo eletivo nem público. É o item 13 da triagem, defeito cuja correção é da Trilha A |
| "Presidente", candidatura, 2026 | é a candidatura atual, pleito e não feito |

**A resposta honesta é que ele continua com 1, e isso não é a régua falhando: é
a régua funcionando.** Promover qualquer uma das duas seria afirmar como feito o
que não é. O teste `Renan não ganha destaque a partir de conteúdo que não
sustenta afirmação` congela esse resultado. A decisão foi aceita na revisão de
10/08 e não foi revertida: depois da regra positiva, ele continua com 1, agora
com o print da ficha real em `caso-renan-santos-um.png`.

## Correções do bloqueio de 10/08, segunda rodada

### 1. Três fontes entravam na conta sem card na tela

`totalExibido` somava mandato, patrimônio e votação, e o componente não
renderizava nenhum dos três. O cabeçalho dizia "(5)" e a aba mostrava um card,
ou nenhum. Pior: uma ficha SÓ com mandato caía fora do ramo de vazio e não
renderizava nada, nem conteúdo nem estado por fonte.

As três passaram a ter seção própria, e o card carrega o que a fonte sustenta:

| Fonte | O que o card diz | Proveniência no card |
|---|---|---|
| Mandato | cargo, período e partido/estado | fonte efetiva, pela regra da seção seguinte |
| Patrimônio | valor declarado e ano da eleição | link oficial quando existe; sem link, nenhum link inventado |
| Votação-chave | título, casa, data e **o voto da pessoa** | a votação exata que o item 7 garantiu |

Dois efeitos colaterais corrigidos junto:

- o **card do topo** contava só `pontos_atencao`, então uma ficha exibia "1
  destaque" no topo e "Destaques (5)" na aba. Agora os três números (card, badge
  da navegação e cabeçalho) saem da mesma conta;
- a aba **com** conteúdo não declarava o estado das outras fontes. Uma ficha com
  um item parecia completa enquanto cinco fontes seguiam sem verificação. O
  bloco "Estado das outras fontes" passou a aparecer também nesse caso, e não
  emite marcador de item, então não infla a contagem.

### 2. A promoção de trajetória virou regra positiva

A versão anterior excluía por texto, e `jarir-pereira` era promovido com "Membro
da Executiva Estadual do PSOL Ceará", que não contém a palavra "partido".
Blacklist erra em silêncio e na direção perigosa: o que ela não previu vira
afirmação publicada.

A regra agora é positiva e fail-closed, sobre o **cargo canônico**:

1. **cargo eletivo**, casamento exato contra o conjunto fechado de 11 nomes, o
   mesmo de `CARGOS_ELETIVOS` em `scripts/audit/lib/coverage-model.ts`;
2. **chefia de pasta no Executivo**, ancorada no início do canônico
   (`Ministro...`, `Secretário...`).

Tudo que não casa não entra. Existe ainda um guard de estrutura partidária, e
ele é a **segunda** rede: na auditoria de 10/08 ele pega **zero** linhas além do
que a regra positiva já barra, e essa é a evidência de que a exclusão do
`jarir-pereira` e do `renan-santos` não depende de reconhecer o texto de nenhum
dos dois.

#### Auditoria completa, as 1.022 linhas públicas

`npx tsx scripts/audit/auditar-mandatos-promoviveis.ts`, detalhe em
`QA/evidencias/2026-08-10-item4-14-destaques/auditoria-mandatos.json`.

| Resultado | Linhas |
|---|---|
| Promovidas | 521 |
| Excluídas por `nao_e_mandato` (candidatura, filiação, pré-candidatura) | 468 |
| Excluídas por `cargo_fora_da_regra_positiva` | 17 |
| Excluídas por `sem_ano_de_inicio` | 16 |
| Excluídas pelo guard partidário, **além** da regra positiva | 0 |

As 17 fora da regra positiva, nome a nome, porque é aí que um cargo público
legítimo poderia estar sendo perdido em silêncio: presidência de Assembleia
Legislativa (Tocantins ×3, Ceará, Amazonas ×2, Alerj), presidência de autarquia
(ABDI, Conab, IPHAN), Diretor-Geral do DNIT, Chefe de Gabinete do Governo de
Pernambuco, Interventor na Segurança Pública do DF, "Dirigente sindical",
"deputy mayor of Manas", e as duas partidárias (`jarir-pereira`,
`renan-santos`).

**Esse é o custo consciente do fail-closed:** presidir uma Assembleia ou o IPHAN
é cargo público de verdade. **Decisão do Thiago em 10/08: os 17 ficam fora nesta
entrega**, e a lista acima permanece aqui para revisão futura. As 16 sem ano de
início são dívida de dado, não defeito de regra: sem quando, o card não tem o
que dizer.

### 2b. Proveniência efetiva no card de mandato

O card lia `historico_politico.proveniencia` direto, e ela é **nula em 11 dos 423
mandatos promovidos**: linha legada, anterior à coluna. Nesses casos o card saía
sem dizer de onde a afirmação veio, que é o oposto do que esta frente faz.

Card e auditoria passaram a usar `resolveHistoricoRowProvenance`
(`src/lib/historico-provenance.ts`), o contrato canônico, que resolve o legado
por `observacoes` e cujo pior caso é `manual`, nunca vazio.

Os 11 nulos **não** resolvem todos em manual, e a distinção importa: a observação
carrega a origem em 8 deles.

| Coluna nula resolve para | Linhas |
|---|---|
| `tse` | 8 |
| `manual` | 3 |

Distribuição das 521 promovidas por proveniência efetiva: `tse` 359, `manual` 87,
`wikidata` 52, `misto` 23. O rótulo diz o que a fonte é sem promover nenhuma:
curadoria manual continua curadoria manual, e não vira "oficial".

**A prova é sobre o HTML servido, não sobre o objeto.** Todo card carrega
`data-pf-mandato-proveniencia` com valor não vazio; o readback confere isso nas
194 fichas e o auditor sai com exit 1 se aparecer um sem. Medido: **423
promovidos, 11 com coluna nula, 0 cards sem proveniência efetiva**.

### 3. O readback passou a medir a mesma forma que a tela

Antes ele montava patrimônio por caminho próprio e passava votos crus, sem o
join da votação-chave, o que fazia a fonte "votações" medir zero em qualquer
ficha. Agora ele usa `buildPatrimonioEleicoes`, o join de `votacoes_chave` e as
mesmas normalizações que `src/lib/api.ts` aplica
(`normalizeHistoricoPoliticoForDisplay`, `normalizePatrimonioForDisplay`).

E acrescentou a prova que o bloqueio pediu: para **cada uma das 194 fichas**, ele
renderiza a aba Destaques do `CandidatoProfile` real com `renderToStaticMarkup` e
compara `totalExibido` com a contagem de cards no DOM. Divergência em qualquer
ficha derruba o script com exit 1.

## Readback no universo público, só leitura

`npx tsx scripts/audit/readback-destaques-ficha.ts`, sobre `candidatos_publico`.
Recalculado depois das correções, sem preservar nada por expectativa.

| Medida | Antes | Depois |
|---|---|---|
| Fichas públicas | 194 | 194 |
| Com conteúdo na aba | 60 | **162** |
| Vazias | 134 | 32 |
| Vazias por **ausência confirmada** | — | **0** |
| Vazias por **falta de verificação** | — | **32** |
| Fichas que ganharam conteúdo real | — | **102** |

Por fonte, itens e fichas alcançadas:

| Fonte | Itens | Fichas com ao menos um |
|---|---|---|
| Patrimônio declarado | 505 | 158 |
| Mandatos exercidos | 423 | 106 |
| Votações-chave | 110 | 35 |
| Destaques editoriais | 97 | 60 |
| Processos judiciais | 12 | 9 |
| Sanções administrativas | 2 | 1 |

**Prova de DOM: 194 fichas renderizadas, 0 divergências.** Todo item contado tem
card visível.

**O 0 continua sendo o número que importa.** Nenhuma das 32 fichas vazias pode
dizer "consultado, nada encontrado". A aba antiga afirmava "nenhum alerta
registrado" para 134 fichas, o que o dado não sustenta.

Nenhuma ficha foi preenchida para deixar de parecer vazia: as 102 que ganharam
conteúdo tinham mandato, patrimônio publicado, votação-chave, sanção ou processo
já verificados e que não chegavam à aba.

Patrimônio responde por 505 dos 1.149 itens, e é a fonte que mais mexe na
distribuição. O card é verdadeiro e rastreável (valor declarado, ano, link
oficial), mas ele torna a aba majoritariamente patrimonial. **Decisão do Thiago
em 10/08: fica como está, sem condensar agora.**

## Prova visual

Todas em `QA/evidencias/2026-08-10-item4-14-destaques/`, geradas por
`npx tsx scripts/audit/print-destaques-casos-obrigatorios.ts` contra o servidor
local, na página real do produto.

**SHA em prova: `60cb7b4`, worktree limpo**, servidor reiniciado do zero com
`.next` removido antes de subir. O commit final desta rodada só acrescenta os
PNGs e o recibo por cima desse SHA, e o código sob prova é o mesmo.

**A rodada anterior salvou um print inválido**: `ataides-oliveira` com o card
superior em 1 e a aba em 5, capturado antes da correção do card do topo, porque
o script só olhava o cabeçalho. Agora ele lê os **três** números
(`data-pf-overview-destaques`, a badge da aba e o cabeçalho) e falha imprimindo
os valores lidos quando qualquer um diverge. Também registra o SHA e se o
worktree está limpo: evidência sem SHA não diz de qual código ela é prova.

Conferido nesta geração: `ben-mendes` 0/0/0, `renan-santos` 1/1/1,
`ataides-oliveira` 5/5/5.

| Arquivo | Caso | O que mostra |
|---|---|---|
| `caso-destaques-zero.png` | `ben-mendes`, Destaques (0) | cabeçalho, o aviso de que parte do vazio é falta de verificação, e o estado das seis fontes |
| `caso-renan-santos-um.png` | `renan-santos`, Destaques (1) | cabeçalho, o alerta com fontes, e o estado das cinco fontes sem conteúdo |
| `caso-tres-fontes-com-card.png` | `ataides-oliveira`, Destaques (5) | as três fontes novas com card: Senador 2011-2019 com fonte declarada, duas declarações de bens e o voto no impeachment |

Complementar, da rodada anterior: `destaques-tres-estados.png`, o componente
montado com as fixtures do contrato B-E2.

## Provas

| Prova | Resultado |
|---|---|
| `tests/destaques-ficha-contrato-b.test.ts` (montador puro, contra as fixtures) | 21 pass, 0 fail |
| `tests/destaques-candidato-profile.test.tsx` (componente real) | 14 pass, 0 fail |
| Readback com prova de DOM em 194 fichas | 0 divergências, exit 0 |
| Readback com prova de proveniência | 0 cards sem fonte efetiva, exit 0 |
| Auditoria de mandatos | 0 promovidos sem proveniência efetiva, exit 0 |
| Prints com os três números conferidos | 0/0/0, 1/1/1 e 5/5/5, exit 0 |
| Suíte completa | **2631 pass, 4 fail** |
| `npm run check:dead-code` | exit 0, `--max-issues 0` |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run settings:check` | 7 pass, 0 fail |
| `npm run build` | exit 0 |

## Decisões editoriais desta entrega

Tomadas pelo Thiago em 10/08 e aplicadas como estão:

- os **17 cargos fora da regra positiva continuam fora**. A lista segue no
  recibo para revisão futura, não como pendência desta entrega;
- as **declarações patrimoniais publicadas continuam todas**, sem condensar
  agora, mesmo respondendo por 505 dos 1.149 itens.

As 4 falhas são as mesmas do item 7 e continuam sendo propriedade da Raiz:
`recortes.json`, `POSTERIORES`, `schemaReplayTamanho` e `aplicadas_esperadas`.
Nenhuma delas é desta frente, e nenhum arquivo de baseline foi tocado.

O teste consome o JSON de fixtures em vez de repetir os objetos: fixture copiada
vira fixture desatualizada no dia em que a Trilha B mudar a forma.

## O que NÃO foi feito

Nada de timeline (é da Trilha A). Nada de coleta, migration, banco ou deploy. A
aba não passou a inferir nada: onde não há conteúdo verificado, ela continua
vazia, e agora explica por quê.

## Execução residual dos itens 4 e 14, 10/08/2026

Esta rodada reabriu o universo no head `d17163f` e corrigiu dois defeitos do
readback anterior antes de reutilizar qualquer contagem:

1. o medidor procurava aliases inexistentes, `sancoes` e `processos`, em vez de
   `transparencia-sanctions` e `processos-curadoria`;
2. `coleta_log_ultima` era lida sem paginação. A view passa de mil linhas, então
   parte da proveniência desaparecia por limite de resposta.

Com os dois defeitos corrigidos, o banco atual, somente leitura, mede:

| Fonte factual | Estados nas 194 fichas |
|---|---|
| Sanções | 163 `vazio_confirmado`, 1 com conteúdo, 30 erros explícitos |
| Processos | 16 `vazio_confirmado`, 9 com conteúdo, 169 inconclusivas ou com erro |
| Trajetória | 106 com conteúdo, 88 `nunca_verificado` |
| Patrimônio | 158 com conteúdo, 7 `vazio_confirmado`, 29 `nunca_verificado` |
| Votações-chave | 35 com conteúdo, 159 `nunca_verificado` |

O universo permanece em 162 fichas com conteúdo e 32 vazias. Isso corrige a
leitura das causas, mas não fabrica card nem converte erro em ausência.

### Contrato novo para trajetória e votações

O contrato de API, DTO e DOM aceita duas auditorias dedicadas em `coleta_log`:

- `destaques-trajetoria`: recorte de mandatos que a regra positiva permite
  publicar;
- `destaques-votacoes`: recorte de votos com votação-chave exata ligada.

Uma proposta SQL chegou a derivar esses resultados pela presença ou ausência no
próprio dataset. A revisão adversarial mostrou que isso não prova que a coleta
externa aconteceu. Ela foi retirada de `supabase/migrations` e de
`supabase/rollback`, ficando somente em
`QA/evidencias/2026-08-10-item4-14-destaques/proposta-autoauditoria/` para
preservar o experimento e seu rollback sem permitir aplicação acidental.

Simulação da proposta auto-auditada sobre o banco atual, sem escrita:

| Fonte | Antes | Depois simulado |
|---|---:|---:|
| Trajetória em `nunca_verificado` | 88 | 0 |
| Trajetória em `vazio_confirmado` | 0 | 88 |
| Votações em `nunca_verificado` | 159 | 0 |
| Votações em `vazio_confirmado` | 0 | 159 |

Essas conversões são apenas uma demonstração do comportamento rejeitado. Não
são resultado aprovado. Trajetória continua com 88 `nunca_verificado` e
votações com 159 `nunca_verificado` até existir evidência de consulta às fontes
subjacentes. As 32 fichas continuam vazias por falta de verificação e o total de
vazios honestos completos permanece 0.

Provas locais desta rodada:

- testes focados da montagem, DTO/API, componente e isolamento da proposta;
- Postgres 17 efêmero: 4 cenários e 16 asserções, incluindo universo vazio
  recusado, replay com 77 e universo medido com 194 por fonte aplicados,
  classificação e rollback das 388 linhas do universo atual;
- replay linear completo da versão anterior provou que o SQL era tecnicamente
  reversível, mas não resolveu a insuficiência semântica da fonte;
- readback 194/194, 0 divergências de DOM e 0 cards de mandato sem fonte;
- predicado SQL de mandato comparado à regra TypeScript sobre 1.454 linhas:
  769 promovíveis em ambos e 0 divergências. O volume persistido é booleano,
  não contagem crua, porque o DTO deduplica a lista antes do DOM.

O harness PostgreSQL permanece como prova do experimento, não como autorização
de aplicação. O código de leitura e renderização continua útil para quando
existirem resultados legítimos de fonte.

Pendência desta frente: executar ou materializar verificação real das fontes de
trajetória e votações. Até lá, não existe migration aplicável e os itens 4 e 14
permanecem bloqueados por evidência, sem transformar ausência no dataset em
`vazio_confirmado`.

### Reauditoria externa das 32 fichas vazias

A pendência acima foi parcialmente executada na mesma sessão, depois da revisão
independente. `scripts/audit/auditar-fontes-destaques-vazios.ts` derivou os 32
slugs do readback 194/194 e consultou somente fontes em que havia chave de
identidade suficiente. O relatório nominal e os SHA-256 dos pacotes ficam em
`QA/evidencias/2026-08-10-item4-14-destaques/auditoria-fontes-32.json`.

| Fonte | Consulta externa real | Resultado nas 32 |
|---|---:|---|
| Sanções CGU | 7 fichas, 21 respostas de CEIS/CNEP/CEAF | 7 `vazio_confirmado`; 25 erros por CPF válido ausente, sem requisição |
| Processos DJEN | 24 fichas cobertas pelo recibo da PR #158 | 24 bloqueios editoriais; 8 não reconsultadas nesta rodada |
| Trajetória TSE | 8 fichas, 12 SQs em seis pacotes `consulta_cand` | 8 `sem_achado_no_escopo`; 24 sem SQ consultável |
| Patrimônio TSE | as mesmas 8 fichas, seis pacotes `bem_candidato` | 3 positivas, 5 indeterminadas e 24 não coletadas |
| Votações | nenhuma | 0/32 têm ID Câmara ou Senado versionado; 32 seguem não coletadas |

As sete consultas de sanções apenas renovaram evidência já compatível com o
banco atual. As 25 restantes não foram chamadas, e por isso continuam erro,
nunca ausência.

Na trajetória, todos os 12 registros encontrados casaram por SQ mais nome e
nenhum sustenta resultado eleito. O TSE só prova esses pleitos, não a carreira
inteira. A proposta local em `proposta-trajetoria-tse-8/` grava exatamente oito
`sem_achado_no_escopo`; permanece fora de `supabase/migrations`, do ledger e de
`recortes.json`. Ela inclui allowlist, rollback e readback, sem aplicação.

Patrimônio encontrou conteúdo oficial para `andre-marinho`, `jose-estevao` e
`samara-mineiro`. André depende da carga do item 1 na PR #156. José e Samara
ficaram como dependência nominal da PR residual de patrimônio aberta pela Raiz.
Depois dessas cargas, a projeção honesta é 29 fichas vazias, não 32, porque as
três passam a ter card patrimonial real.

`dr-luisinho` e `preta-lu` seguem sem linhas em `bem_candidato_2026`, mas o
`consulta_cand_2026` atual traz `ST_DECLARAR_BENS` nulo, não `N`. A auditoria
portanto os classifica como indeterminados e não aceita ausência oficial baseada
somente em zero linhas. `henrique-areas`, `izadora-dias` e `luan-monteiro`
também permanecem indeterminados em patrimônio pelo mesmo gate fail-closed.

O contrato integral de vazio ainda não fecha: nenhuma das 32 tem as cinco
fontes concluídas, o total de vazios honestos completos continua 0 e votações
continua bloqueada por identidade/aplicabilidade. A diferença é que a pendência
agora está medida por ficha e por fonte, com consulta externa separada de
presença no dataset.

## Promoção autorizada do TSE-8, 11/08/2026

Após decisão editorial nominal do Thiago, a carga limitada das oito trajetórias
foi promovida para os diretórios aplicáveis, sem aplicação no banco. A
reauditoria externa foi executada de novo às `2026-08-11T11:28:01.895Z` e
remeçou as 32 fichas:

| Fonte | Resultado remedido nas 32 |
|---|---|
| Sanções | 7 `vazio_confirmado`; 25 erros explícitos por CPF válido ausente |
| Processos | 24 bloqueios editoriais; 6 indeterminados; 2 erros por `encontrado` sem card publicável |
| Trajetória | 8 `sem_achado_no_escopo`; 24 bloqueios de identidade por falta de SQ seguro |
| Patrimônio | 3 encontradas; 5 indeterminadas; 24 bloqueios de identidade por falta de SQ seguro |
| Votações | 32 bloqueios de identidade por falta de ID Câmara/Senado |

A migration `20260810124000` grava somente as oito verificações limitadas. Ela
recusa universo 0/8 ou 7/8, reexecução, verificação igual ou posterior e qualquer
divergência no payload. Henrique Areas e Luan Monteiro dependem de três pacotes
cada; por isso suas linhas não fingem uma URL singular, e os anos e SQs ficam no
detalhe. Rollback alterado ou parcial aborta e preserva a carga e o ledger.

Provas locais desta promoção:

- Postgres 17: 7 cenários e 17 asserções, todos verdes;
- allowlist isolada: 1 migration, 1 escrita declarada, 0 violações;
- focais de destaques e honestidade: 68 pass, 0 fail;
- typecheck, check:scripts e lint: exit 0;
- projeção sem escrita: 194 fichas renderizadas, 0 divergências DTO/DOM, 8
  estados `curadoria_limitada`, 0 cards fabricados e 0 vazios honestos completos.

O estado continua preparado, não aplicado. Ainda faltam integração em
`recortes.json`, merge, aplicação autorizada, deploy no mesmo SHA e readback
público. As 24 trajetórias sem SQ e as 32 votações sem identificador permanecem
como bloqueios reais de identidade/aplicabilidade, não como ausência.

[confidence: high, source: auditoria externa, Postgres 17, suíte focal e readback 194] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Remediação final do eval, ciclos 2 e 3, 11/08/2026

A medição deixou de usar as 32 fichas vazias como universo. O novo artefato
`QA/evidencias/2026-08-11-itens-4-14-destaques/matriz-fontes-194.json`
tem 970 células únicas, uma para cada combinação de 194 fichas e cinco fontes
factuais. Cada célula registra endpoint ou identidade ausente, estado da
identidade, tentativa executada ou bloqueio, resultado e evidência nominal.
Depois da correção disparada pelo segundo eval, as 970/970 células têm payload
estruturado, nenhuma fica em `nunca_verificado` e toda célula com conteúdo tem
endpoint externo.

A recontagem global também corrigiu a referência de patrimônio: além das 29
células silenciosas do banco atual, a migration `20260810093000` retira duas
ausências que não tinham `ST_DECLARAR_BENS=N` e expõe mais três fichas fora do
recorte antigo das 32 vazias (`ricardo-cappelli`, `cadu-xavier` e
`renan-santos`). Depois das dependências anteriores, o residual honesto é 32.

| Fonte | Banco atual | Projeção local integrada |
|---|---|---|
| Trajetória | 106 conteúdo, 88 nunca verificadas | 106 conteúdo, 31 limitadas, 57 indeterminadas |
| Patrimônio | 158 conteúdo, 7 ausências, 29 nunca verificadas | 161 conteúdo, 1 ausência, 32 indeterminadas |
| Votações | 35 conteúdo, 159 nunca verificadas | 14 conteúdo, 28 limitadas, 152 indeterminadas |

A migration aplicável `20260811101000_destaques_estados_residuais_194.sql`
grava 292 estados nominais: 80 de trajetória, 32 de patrimônio e 180 de
votações. São 241 `indeterminado` e 51 `sem_achado_no_escopo`; há zero
`vazio_confirmado` e zero `nao_aplicavel` novos. A carga não fecha cobertura
como se fosse ausência. Ela elimina silêncio e publica o bloqueio real.

Duas migrations complementares fecham proveniência que a matriz global tornou
visível:

- `20260811101100_historico_fontes_oficiais_cadu_cappelli.sql` corrige cinco
  trajetórias de Cadu Xavier e Ricardo Cappelli com fontes oficiais específicas
  e corrige a passagem de Cappelli pela ABDI de 2019/2023 para 2024/2026;
- `20260811101200_processos_legados_fontes_oficiais.sql` reconcilia seis linhas
  processuais antigas que estavam publicadas sem número e sem URL. Cinco passam
  a ter identificador e fonte oficial. A alegação de Andorra, sem ato nominal
  oficial que a sustente, é despublicada e deixa um bloqueio editorial
  `indeterminado`, sem fingir ausência judicial.

Patrimônio ganhou o caminho dedicado `destaques-patrimonio` em banco, API, DTO
e DOM. Uma verificação global `indeterminado` prevalece sobre uma ausência de
um único pleito, porque vazio em uma eleição não prova cobertura de todas as
eleições aplicáveis.

Provas locais:

- readback projetado: 194 fichas, zero `nunca_verificado`, zero divergência DOM
  e zero card fabricado;
- matriz nominal: 970/970 células, zero duplicata, zero célula sem payload e
  zero conteúdo sem endpoint externo;
- Postgres 17: 7 cenários e 12 asserções, incluindo universo 0/194 e 193/194,
  reexecução, estado posterior, rollback alterado e rollback exato;
- Postgres 17 das fontes de trajetória: 7 cenários e 17 asserções;
- Postgres 17 dos processos legados: 7 cenários e 19 asserções;
- focais finais dos itens 4 e 14: 56 pass, 0 fail;
- typecheck e check:scripts: exit 0;
- allowlist isolada: uma migration, uma escrita declarada, zero violação.

Neste ciclo 3, antes do commit final, não houve novo push, aplicação, escrita
remota, merge, deploy ou ativação de cron.
As janelas `20260811101000`, `20260811101100` e `20260811101200` estão
integradas em `recortes.json`, com allowlists, rollbacks e readbacks pareados.
Os gates finais esperados no SHA limpo são 2.985/2.985 testes, replay linear
293 + 100 = 393 e schema 70 + 323 = 393. A rodada 3 independente ainda precisa
reproduzir esse SHA e retornar 11/11 com critério 5 igual a `yes`.

[confidence: high, source: matriz nominal 194x5, readback projetado, Postgres 17 e gates locais do ciclo 3] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
