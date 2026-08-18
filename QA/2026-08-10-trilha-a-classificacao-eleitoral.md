# Trilha A: classificação eleitoral (itens 12, 5, 10, 13, 15)

Branch `trilha-a`, a partir de `21dd9c3` (tip de `base-lancamento`, já com o
adendo de DoD). Nada aplicado, nada mergeado, nada em produção.

## Correções da revisão que bloqueou 94ba890

A revisão da Raiz achou seis defeitos no primeiro commit. Todos corrigidos, e
cada um ganhou regressão com caso real mais sintético equivalente, para provar
que a regra é geral e não remendo por slug.

| # | Defeito | Correção | Prova |
|---|---|---|---|
| 1 | "Presidente do Senado Federal" casava como pleito **presidencial**, e virava cargo eletivo em conflito com o mandato de senador do Rodrigo Pacheco | `tipoDePleitoDoCargo` devolve `null` para presidência de instituição; mesa diretora entra em `cargo-nao-eletivo` | Pacheco sem conflito + 5 casas legislativas sintéticas |
| 2 | C1 classificava a duplicata mas **não a removia** da ficha | `removerDuplicatasComprovadas` aplicada em `prepareHistoricoPoliticoPublicDisplayList`, ponto único das três superfícies; retenção por ordem **total** (cargo mais específico, proveniência, campos, id) | Ciro Gomes com uma linha só, e mesmo resultado com a entrada invertida |
| 3 | Sucessão constitucional virava eleição patrimonial | `buildPatrimonioEleicoes` descarta linha cujo `resolveResultadoEleitoral` dá `nao_aplicavel` | Edilson Damião sem 2026 + nomeação/mesa/eleição interna sintéticas |
| 4 | Atalho de "candidatura do ano corrente" vencia situação conhecida do registro | situação é resolvida **antes** do atalho | indeferido, cancelado e inapto em 2026 |
| 5 | O auditor definia o esperado de (e) chamando `classificarSobreposicoes`, o que tornava o invariante tautológico | detector **próprio** no auditor + manifesto congelado par a par (`scripts/audit/sobreposicoes-congeladas.json`), gerado por script separado e revisável no diff | par novo, par sumido ou marca divergente reprovam |
| 6 | Faltavam regressões dos casos citados | 12 casos novos em `tests/trilha-a-cenarios-nomeados.test.ts` | 31 casos no arquivo |

O invariante (e) passou a ser **bicondicional por linha**: a tela marca
`· período em conferência` exatamente nas linhas que estão em algum par C4 do
manifesto congelado. Por par acusava falso, porque uma linha participa de vários
pares ao mesmo tempo (o João Campos tem quatro mandatos de deputado terminando
em 2018, em conflito entre si e em acumulação legal com a chefia de gabinete).

## Correções da quinta revisão, que bloqueou 55c0634

| # | Contrato | Correção |
|---|---|---|
| 1 | `ProfileSourceFooter` é server-renderizado a partir da ficha **crua**, não do DTO, então a limpeza não passava por ele: o HTML de `/candidato/amelio-cayres` trazia `id 270001654140` quatro vezes, no texto e no atributo `data-pf-profile-sources` | `sanitizeFontePublica` aplicada entrada por entrada, antes de montar texto e atributo |
| 2 | O auditor conferia classificação, não **remoção**: uma dedupe nova poderia entrar sem passar pelo manifesto | cada id que existe no normalizado e some da lista pública precisa de exatamente uma C1 congelada com exatamente um lado sobrevivente |
| 3 | A fixture do David Almeida tinha 11 cargos genéricos e nenhuma duplicata, então provava contagem e não deduplicação | passa a usar as 12 linhas reais do banco, com a presidência da ALEAM duplicada pelo Wikidata, e exige que a removida seja exatamente ela |

**Erro meu que esta revisão expôs.** Meu readback anterior varria o HTML servido
só por `SQ_CANDIDATO`, e não por id numérico solto. Por isso ele passou verde com
o identificador do Amélio visível na página. O scanner agora procura os dois, e
ignora URL também na forma percent-encoded (a imagem do Wikimedia do Renan Santos
tem um id de foto de 15 dígitos que gerava falso positivo).

## Correções da quarta revisão, que bloqueou 10a1fa8

| # | Contrato | Correção |
|---|---|---|
| 1 e 2 | A remoção de C1 tinha migrado para fora de `prepare`, criando dedupe paralelo no DTO e no badge | `prepareHistoricoPoliticoPublicDisplayList` volta a ser o **contrato único**: qualquer lista normalizada entra e sai pública. `buildPublicHistoricoPoliticoDisplayListFromRaw` faz só `normalize` e `prepare` |
| 3 | O teste de superfícies modelava um caminho que a página não usa | passa por `raw → normalize → prepare`, com Ciro 10/10/10/10, Amélio 10/10/10/10 e David 11/11/11/11 (David sem duplicata, para provar que o contrato não come linha legítima) |
| 4 | Auditor e gerador calculavam as três classes na mesma passada | C1 sobre o normalizado, remoção, e C4/C5 só sobre a lista pública. Resultado: **C1=7, C4=65, C5=27** |
| 5 | `cargo-nao-eletivo` comparava com acento | normaliza diacrítico antes de reconhecer Assembleia/Assembléia |
| 6 | A máscara documental rodava ANTES do tratamento de SQ/id, então `SQ_CANDIDATO 28000160782` (11 dígitos) virava `SQ_CANDIDATO [documento mascarado]` e o rótulo sobrevivia órfão | SQ/id sai primeiro; a URL vai até o espaço e só a pontuação terminal de frase é devolvida ao texto |
| 7 | `redes_sociais` e outros campos de URL passavam direto por `maskDocumentLikeSequences` | a máscara exportada agora protege URL por construção; a versão crua não é exportada |

## Correções da terceira revisão, que bloqueou 9f34492

| # | Contrato | Correção | Prova |
|---|---|---|---|
| 1 | A sanitização corrompia URL de fonte: id de **11 e de 14 dígitos** virava `[documento mascarado]` (a máscara de CPF/CNPJ casa esses tamanhos) e `?SQ_CANDIDATO=` virava texto. Nos três o link quebrava calado | URL é **retirada antes** de qualquer limpeza, guardada em token sem dígito e reposta byte a byte | 4 URLs, uma por tamanho de id, mais o caso de várias no mesmo texto |
| 2 | `fonte_dados` não passava pela limpeza | mesma função aplicada; varredura global mediu **65 entradas em 63 fichas** com id solto fora de URL, e zero depois | scanner global + readback |
| 3 | C1 casava por cargo + período, e deduplicaria em **qualquer ficha** com o mesmo par de rótulos | cada equivalência passa a carregar o `candidatos.id` onde foi comprovada | teste sintético que **falha fechado em C4** em outra ficha |
| 4 | C1, C4 e C5 eram calculadas na mesma passada | C1 sobre o **cru** (é lá que a duplicata existe e que `candidato_id` está disponível), dedup, e só então C4/C5 sobre a lista pública | readback API = DOM = timeline |
| 5 | André Kamai caía em C4 porque "Presidente estadual do PT-AC" não tem a palavra "partido"; e Assembleia/Assembléia eram tratadas como casas diferentes | reconhecimento por `cargo-nao-eletivo` e comparação sem diacrítico | Kamai em C5 + as duas grafias da ALETO |

Efeito na classificação: C5 44 → 29, C1 1 → 7, C4 56 → 65.

**Erro meu que esta revisão expôs.** No round anterior eu afirmei que "URL de
fonte fica intacta". Era verdade só para o id de 12 dígitos, que foi o único que
testei. Os outros dois tamanhos e a query quebravam, e eu não tinha medido.

## Correções da segunda revisão, que bloqueou 8ed4d7c

| # | Contrato | Correção | Prova |
|---|---|---|---|
| 1 | O identificador do TSE vazava: o rótulo `SQ_CANDIDATO` virava texto e o **número ficava**, e a limpeza só existia no DTO | `src/lib/observacao-publica.ts`, sanitização única chamada no DTO, no DOM e na timeline; tira rótulo e valor, e preserva URL de fonte | 4 casos, com a observação real do Lula 2018 |
| 2 | `buildTimelineEvents` tinha rótulo próprio, então cargo partidário e presidência interna saíam sem a marca na timeline | passa a usar `formatHistoricoCargoTituloPublico` | 4 casos, incluindo Partido Missão e Presidente do Senado |
| 3 | C5 era classe de descarte ("nem os dois são eletivos") e engolia duplicata e acúmulo proibido | C5 exige **forma positiva** de acumulação (pasta de nomeação, mesa diretora, direção partidária); equivalência virou C1; dúvida virou C4 | 44 pares reauditados: 44 → 28 C5, 1 → 7 C1, 56 → 66 C4 |
| 4 | API servia 11 linhas e o DOM mostrava 10; o badge prometia 11 | lista pública aplicada no DTO e no badge | readback exige API = DOM = timeline nas seis fichas |

Reauditoria de C5, linha a linha: 8 pares eram **o mesmo cargo duas vezes** (ALETO
e ALEAM com grafias diferentes, MCTI antes e depois da renomeação, secretaria de
SP com nome curto e longo, MEC com o rótulo neutro do Wikidata, Ministério da
Infraestrutura genérico e específico) e viraram C1 nomeadas. Governador com
vice-governador da mesma chapa, e deputado estadual com vice-prefeito, saíram de
C5 e viraram C4: não são acumulação prevista, são conflito. Os 28 que sobraram
têm forma explícita, do tipo senador licenciado para ministério ou deputado
presidindo a própria casa.

## O que estava errado, e em que camada

O rastreio fonte → banco → API → DOM mostrou que **o banco está certo em 155 das
157 linhas** e quem errava era a conversão de exibição. Só uma linha da base tem
dado divergente da fonte oficial.

O caso mais grave não estava na nota: a ficha do **Lula publicava
"2002 - Não Eleito" e "2022 - Não Eleito"**, e a do **Zema, "2018 - Não Eleito" e
"2022 - Não Eleito"** — quatro eleições que os dois venceram. Confirmado no DOM
ao vivo de `puxaficha.com.br/candidato/flavio-bolsonaro` e no payload real de
`/api/candidato-profile/<slug>` rodado pelas funções de exibição.

| Causa | Local | Camada | Efeito |
|---|---|---|---|
| Resultado deduzido da **forma** (`periodo_inicio === periodo_fim`) mais o substring `"tse"` | `src/lib/historico-display.ts:139` | exibição | 160 falsos "Não Eleito" |
| Colapso eleição+posse cria a forma degenerada que a regra acima lê errado | `src/lib/historico-dedupe.ts:482` | exibição | Lula 2002/2022, Zema, Flávio 2018 |
| Todo `periodo_inicio` com `proveniencia='tse'` vira ano de eleição, inclusive **posse** | `src/lib/public-profile-dto.ts:155` | derivação | 27 "eleições" em ano sem pleito |
| Sem estado de registro indeferido; prefixo `"Candidatura:"` oculto de forma case-sensitive | `src/lib/historico-display.ts:174` | exibição | item 12 |
| Sem classificação de cargo não eletivo | ausente | classificação | item 13 |
| `eleito_por = 'nao eleito'` no registro **indeferido** do Lula em 2018 | banco | **dado** | única migration |

## A única divergência de dado, provada no raw

| Linha | Raw oficial do TSE | Persistido | Veredito |
|---|---|---|---|
| Lula 2018 | `descricaoSituacao='Indeferido'`, `descricaoTotalizacao='Concorrendo'`, `candidatoApto=false` | `'nao eleito'` | **divergente → migration** |
| Rui 2006 | `descricaoSituacao='Indeferido'`, `descricaoTotalizacao='Não eleito'` | `'nao eleito'` | **fiel ao raw → não se toca** |
| Cíntia 2012 | consulta_cand_2012 | `NULL` | já correto |

O TSE separa **situação do registro** de **totalização dos votos**. O fix adota
essa separação, e é ela que explica por que duas linhas aparentemente iguais
recebem tratamento oposto. Nenhum dado bruto foi apagado: `observacoes` segue
íntegra e é dela que sai o estado exibido.

## Invariantes globais (adendo `21dd9c3`)

Instrumento: `scripts/audit/auditar-classificacao-eleitoral.ts`, versionado e
reexecutável pela Raiz na Fase 4. Roda o **pipeline real de exibição** sobre as
280 fichas e conta o que sairia na tela.

**Por que não é SQL nos quatro primeiros.** O banco está certo neles; um `SELECT`
devolveria a mesma contagem antes e depois, que é exatamente a prova que o adendo
chama de prova que não prova nada. O único invariante com defeito persistido tem
readback SQL próprio.

| Inv. | Instrumento | Antes | Depois |
|---|---|---|---|
| (a) indeferida exibida como candidatura real | oráculo, bucket `indeferido_como_derrota` | **7** | **0** |
| (a') mesmo defeito, camada de dado | `SELECT count(*) FROM historico_politico WHERE observacoes ~* 'INDEFERID' AND eleito_por = 'nao eleito';` | **2** | **1** |
| (b) raw ELEITO exibido "Não Eleito" | oráculo, `falso_nao_eleito` | **160** | **0** |
| (c) cargo interno de partido tratado como pleito | oráculo, `cargo_partidario` | **1** | **0** |
| (d) eleição em ano sem pleito, qualquer superfície | oráculo, timeline + patrimônio | **28** | **0** |
| (e) sobreposição sem precedência aplicada | detector independente do auditor, cruzado com o manifesto congelado | **116** | **0** |

Reprodução: `node --import tsx scripts/audit/auditar-classificacao-eleitoral.ts`.
Saídas integrais em `QA/evidencias/trilha-a/` (depois) e
`QA/evidencias/trilha-a/antes/` (mesmo instrumento, com os dois arquivos de
exibição revertidos ao estado de `21dd9c3`).

**(a') não fecha em zero, e isso é a resposta certa.** Restam Rui 2006, fiel ao
raw, e a linha é nomeada no arquivo residual. Zerar exigiria escrever contra a
fonte. O invariante **visual** (a), esse sim, fecha em 0 sem exceção: a ficha do
Rui passa a exibir "Registro indeferido" por código, sem escrita nenhuma.

## Sobreposição de mandatos: como (e) é conferido sem tautologia

O risco era óbvio: se a regra "se aplica a tudo", a contagem zera sozinha. As
classes foram fechadas **antes** do fix, cada uma com critério objetivo, e a
classe residual **pode ficar não vazia**: se ela zerasse, seria sinal de que a
regra passou do ponto. Manifesto par a par em
`scripts/audit/sobreposicoes-congeladas.json`, com ficha, as duas linhas (cargo,
período, proveniência), classe, campo decisor e justificativa.

O auditor **não chama** `classificarSobreposicoes`: ele tem detector próprio,
escrito no arquivo dele, e cobra o resultado contra o manifesto congelado e
contra a tela. A geração do manifesto mora em
`scripts/audit/congelar-sobreposicoes.ts`, separada de propósito, e regenerar é
ato deliberado cujo diff mostra qual par mudou de classe.

| Classe | Critério | Resultado |
|---|---|---|
| C1 duplicata | equivalência comprovada **uma a uma**, em tabela curada; relação genérica entre cargos não autoriza merge | 7 |
| C2 fim com fonte | só resolve com data real citada com fonte institucional na própria linha; **proibido** derivar de duração ou geometria | 0 |
| C3 pleito × posse | exige `tipo_evento` estruturado **e** fonte de posse nomeada | 0 |
| C4 conflito | dois cargos **eletivos** no mesmo período, ou acumulação sem forma reconhecida | **65, declarados na ficha** |
| C5 acumulação permitida | exige **forma positiva**: pasta de nomeação, mesa diretora ou direção partidária | 27 |

C2 e C3 vazias é resultado honesto, não lacuna: com os critérios estritos, nada
na base se qualificou. As 65 de C4 aparecem na ficha como
`· período em conferência`, com o período que o banco tem. Nenhuma data foi
criada, alterada ou apagada.

**Duas travas que tornam a conferência falsificável.** A incompatibilidade usada
é jurídica, não de rótulo: dois cargos eletivos simultâneos é impossível,
enquanto deputado licenciado para ministério é acumulação legal — por isso C4 e
C5 são classes distintas em vez de um balde só. E a classificação não escreve:
há teste que compara `periodo_inicio`/`periodo_fim` antes e depois e exige
igualdade.

## Cargo não eletivo: o que mudou de fato (condição 4)

Não existe superfície separada para cargo não eletivo. A aba Trajetória tem uma
lista só ("Cargos e mandatos") e a timeline agregada usa um tipo genérico
`cargo`. Filtrar as cinco linhas apagaria fato verdadeiro. Então **o dado foi
preservado e a descrição ajustada**: a linha continua visível, marcada como
`· cargo não eletivo`, e o que ela perde é o tratamento de pleito — não recebe
desfecho eleitoral nem gera ano de eleição no patrimônio (era daí que saía a
"eleição de 2025" do Renan Santos).

## Os cinco cenários nomeados, depois do fix

| Item | Antes | Depois |
|---|---|---|
| 12 Lula 2018 | `2018 - Não Eleito` | `2018 - Registro indeferido`, com o motivo agora visível |
| 12 Lula 2002/2022 | `Não Eleito` | `Eleito` |
| 5 Daciolo 2014 | `2014 - Não Eleito` | `2014 - Eleito` |
| 10 Flávio 2018 | `2018 - Não Eleito` | `2018 - Eleito` |
| 13 Renan Santos 2025 | cargo partidário como mandato, e "eleição de 2025" no patrimônio | `· cargo não eletivo`, sem eleição derivada |
| 15 Zema | `2023:nao_coletado` em Eleições sem dado | 2023 fora; 2018 e 2022 ficam |

Cobertos por `tests/trilha-a-cenarios-nomeados.test.ts` (**54 casos**),
`tests/classificacao-eleitoral.test.ts` (**26 casos**) e
`tests/profile-source-footer-sanitizacao.test.tsx` (**5 casos**, HTML server-renderizado), com as observações
copiadas do banco.

## Gates

| Prova | Resultado |
|---|---|
| Suíte completa | **2610 pass, 1 fail**; o fail é a entrada em `recortes.json`, que é ato da Raiz |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run check:dead-code` | exit 0, `--max-issues 0` |
| `npm run build` | exit 0 |
| `audit:cobertura:allowlist` no recorte próprio (3 flags) | exit 0 |
| `audit:cobertura:allowlist` sem flags, com a proposta aplicada | OK |
| `provar-migration-trilha-a.sh`, Postgres 17 efêmero | **7 ramos, todos como esperado** |
| Readback das superfícies públicas | servidor local desta branch (`:3020`), payload de `/api/candidato-profile/<slug>` renderizado pelas funções reais |

Readback observado, servidor local desta branch:

- **Ciro Gomes**: a linha genérica "Ministro" sumiu; sobra "Ministro da Fazenda
  1994-1995". A duplicata deixou de ser só classificada.
- **Edilson Damião**: "2026 · Governador" sem desfecho, e `patrimonio_eleicoes`
  só com 2022. A falsa eleição de 2026 saiu.
- **Lula**: "2018 - Registro indeferido", "2002 - Eleito", "2022 - Eleito".
- **Zema**: 2023 fora de `patrimonio_eleicoes`; 2018 e 2022 como Eleito.
- **Rodrigo Pacheco e André Kamai**: a API devolve 404, as fichas deles não são
  publicadas hoje. A regressão dele é coberta pelos testes e pelo
  auditor sobre a base inteira, não pelo readback público, e isso está dito aqui
  porque prova ausente não é prova.

**O SSR não server-renderiza a trajetória.** O HTML servido traz cabeçalho,
biografia e números; as linhas de histórico são carregadas no cliente
(`DeferredCandidatoProfile`). Então o readback do SSR cobra dele o que ele de
fato serve: zero identificador interno e zero URL corrompida. A igualdade
API = DOM = timeline = badge é medida sobre o payload real do servidor local.

**Não verificado nesta rodada:** screenshot da aba Trajetória renderizada. O
painel de browser da sessão travou (`pane is currently hidden`) em três
tentativas, incluindo depois de resize e re-navegação. O readback acima veio do
payload do servidor local passado pelas funções reais de exibição, que é o mesmo
caminho API para DOM já conferido byte a byte contra o DOM ao vivo do Flávio em
produção. Falta a foto, não a medição.
| `replay-migrations.sh linear --tolerante` | 290 aplicadas, 88 falhas, fecha com 378 arquivos |

A migration **falha no replay linear de propósito**, igual à `20260809070000`: no
replay a ficha do Lula existe mas a linha de 2018 não, e a condição de
cardinalidade exatamente 1 manda abortar. Abrir um guard ali transformaria 0 em
no-op silencioso, que é abrir mão da própria condição. A falha está medida e
registrada em `falhas-replay-linear.json` e `quebras-previstas.json`.

## O que a Raiz precisa fazer, nesta ordem

1. Acrescentar o objeto de `recorte_proposto` de
   `scripts/audit/recortes-trilha-a.proposta.json` ao array `recortes` de
   `scripts/audit/recortes.json`, depois de `verificacao-campos-b2-20260809`.
   Só isso fecha o único teste vermelho. Conferido por simulação local.
2. Rodar `npm test` e `npm run audit:cobertura:allowlist` sem flags: verdes.
3. Aplicar a migration `20260810085000` com autorização nomeada (R-59), e o
   readback `SELECT eleito_por FROM historico_politico ...` saindo de
   `'nao eleito'` para `NULL`.
4. Fase 4: reexecutar
   `node --import tsx scripts/audit/auditar-classificacao-eleitoral.ts` contra
   produção depois da re-materialização e exigir os mesmos zeros de (a) a (e).

## Achados fora de escopo, para a Raiz decidir

- **`renan-filho` com linhas de Roraima** (Vereador 2012 PSD/RR, Deputado
  Estadual 2018 PRB/RR) sendo ele de Alagoas. Cheiro de homônimo na ingestão,
  não de classificação. Não toquei.
- **`fonte_dados` com id solto**: 65 entradas em 63 fichas traziam o
  identificador fora de URL. Agora saem sanitizadas na API; o valor continua no
  banco, e reescrever a citação na origem é decisão editorial, não de exibição.
- **Payload do TSE congela `descricaoTotalizacao='Concorrendo'`** para candidato
  com registro indeferido. Vale nota na metodologia quando a coleta usar esse
  endpoint, porque lido sem a situação ele sugere disputa que não houve.
- **65 conflitos de período** ficam visíveis como
  `· período em conferência` até a curadoria. É dívida de dado exposta, não
  escondida, e é a maior fila de trabalho que esta trilha deixa aberta.
