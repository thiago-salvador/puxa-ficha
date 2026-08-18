# Item 7: implementação do dataset v2 e do matching por votação

Trilha C, branch `trilha-c`. **Nada aplicado, nada escrito no banco, nada
despublicado, sem push, merge ou deploy.** As migrations estão criadas e
provadas contra o gate; aplicar exige autorização nomeando o ato.

Decisão editorial em [`2026-08-10-item7-decisao-editorial-v2.md`](2026-08-10-item7-decisao-editorial-v2.md).
Auditoria e proposta em [`2026-08-10-item7-votacoes-chave-auditoria-e-proposta.md`](2026-08-10-item7-votacoes-chave-auditoria-e-proposta.md).

## O que foi entregue

| Frente | Arquivo |
|---|---|
| Chave composta, DDL | `supabase/migrations/20260810090000_votacoes_chave_chave_por_votacao.sql` |
| Despublicação das 6 linhas e dos 100 pares | `supabase/migrations/20260810090100_despublicar_votacoes_chave_defeituosas.sql` |
| Dataset editorial v2 | `supabase/migrations/20260810090200_votacoes_chave_dataset_v2.sql` |
| Rollbacks | `supabase/rollback/20260810090*.rollback.sql` |
| Allowlist do recorte | `scripts/audit/allowlist-votacoes-chave-v2-20260810.json` |
| Proposta de recorte para a Raiz | `scripts/audit/recortes-trilha-c.proposta.json` |
| Matching por chave exata | `scripts/lib/ingest-camara.ts`, função `ingestVotos` |
| Régua de classificação | `scripts/lib/votacao-classificacao.ts` |
| Dry-run | `scripts/audit/dry-run-votacoes-chave-v2.ts` |
| Testes | `tests/votacoes-chave-dataset-v2.test.ts`, `tests/ingest-votos-falhas.test.ts`, `tests/daciolo-votacoes-pos-ajuste.test.tsx`, `tests/votacao-classificacao.test.ts` |
| Prova executável das pré-condições | `scripts/audit/provar-despublicacao-votacoes.sh`, `npm run audit:despublicacao:provar` |
| Proposta de baselines para a Raiz | `scripts/audit/baselines-trilha-c.proposta.json` |

## Uma matéria aprovada saiu, e o motivo é medição

Você aprovou 13. Entram **12**.

A denúncia criminal contra Michel Temer (votação `2143164-138`, 02/08/2017, 263
a 227) saiu no dry-run: `GET /votacoes/2143164-138/votos` devolve `{"dados": []}`.
A votação existe e o placar está na descrição oficial, mas a Câmara não publicou
a lista de votos individuais desse id. A matéria não atribuiria voto a candidato
nenhum e entraria como linha morta.

Ela volta para PENDENTE. A regra de rótulo dela ficou guardada em teste: se o id
reaparecer numa migration, a descrição tem de dizer que SIM barra a abertura do
processo criminal. Se você quiser publicá-la mesmo assim, ou buscar o voto
nominal em outra fonte, é decisão sua e eu preparo.

## O matching novo

`ingestVotos` foi reescrita. O que saiu, e por quê:

- **saiu a busca por `proposicao_id`**: uma proposição tem muitas votações, e
  aceitar qualquer uma publicava destaque, urgência e redação final como posição
  de mérito;
- **saiu a leitura de `/deputados/{id}/votacoes`**, que trazia inclusive votação
  de comissão da mesma proposição;
- **saiu o `plenVotacoes.slice(0, 3)`**: não há mais busca a limitar. Ele
  deixava 30 votações fora do alcance só no Teto de Gastos.

O que entrou:

- chave composta `(fonte, votacao_id_api)`, com índice único parcial;
- recusa de votação classificada como `procedimental` **contra a descrição
  oficial da fonte**, não contra o texto editorial da ficha. Quem escreve o texto
  editorial é a curadoria; o que precisa ser conferido é a fonte;
- votação sem `votacao_id_api` não é carregada, então não casa voto nenhum e não
  aparece;
- cache por execução: sem ele, 12 votações vezes 59 deputados seriam 708
  chamadas para o mesmo conteúdo.

**O Senado ficou fora desta frente, e isso é decisão explícita.** As 13 linhas do
Senado nunca foram auditadas, continuam sem `votacao_id_api` e seguem no matching
antigo, por proposição. Aplicar a régua nova a elas agora despublicaria votos que
você não aprovou despublicar. A auditoria do Senado é frente própria.

## Pré-condições da migration destrutiva

A 20260810090100 apaga 6 votações e 100 pares, e não é reversível por SQL.
Agora ela confere TRÊS coisas dentro da transação, antes da primeira exclusão:

1. as 6 linhas existem e com os metadados medidos (título, casa, data,
   proposição). Linha editada desde a auditoria reprova aqui;
2. a contagem de pares bate uma a uma: 20, 20, 27, 8, 12, 13. Par a mais
   significa coleta nova depois da medição, e apagar levaria junto o que
   ninguém conferiu;
3. o total é exatamente 100.

A conferência por UUID e a do total são separadas de propósito, e o ramo P6 da
prova mostra por quê: mover 5 pares de uma linha para outra fecha o total em 100
e só a checagem por UUID pega.

A pós-condição continua, e cresceu: zero linhas restantes **e** zero pares
órfãos.

### Prova executável, em Postgres real

`npm run audit:despublicacao:provar`, container efêmero com imagem presa por
digest. Asserção sobre texto de SQL não prova guard nenhum; quem prova é o
Postgres.

| Ramo | Estado | Esperado | Resultado |
|---|---|---|---|
| P1 | estado exato medido | aplica, 0 votações e 0 pares no fim | PASS |
| P2 | uma das 6 linhas ausente | aborta, e as outras 5 ficam intactas | PASS |
| P3 | um par a menos (19 no Teto) | aborta, 99 pares intactos | PASS |
| P4 | um par a mais | aborta, 101 pares intactos | PASS |
| P5 | metadado divergente | aborta, nada apagado | PASS |
| P6 | 5 pares movidos entre linhas, total ainda 100 | aborta, nada apagado | PASS |

Todo ramo adversarial cobra duas coisas: abortar **e** não ter apagado nada.

## Falhas do matching agora sobem para IngestResult.errors

O caminho antigo engolia exceção com `catch {}` e seguia. Sete modos de falha
passaram a ser nomeados e propagados, e nenhum conta como voto:

- erro no `select` de `votacoes_chave`, **sem cachear**: congelar "zero
  votações" faria todo candidato seguinte da execução sair sem voto em silêncio;
- falha no detalhe da votação;
- descrição ausente com HTTP 200, tratada como indeterminada e não como
  "não procedimental": sem o texto oficial não dá para afirmar o que foi votado;
- votação procedimental na fonte, recusada e nomeada;
- **HTTP 200 com `dados: []` em `/votos`**, que é o caso da denúncia contra
  Temer. Uma votação aprovada é, por construção, nominal com centenas de votos:
  lista vazia é a fonte não ter publicado o voto individual, e tratar como
  sucesso gravaria "ninguém votou";
- falha de rede em `/votos`, **sem virar mapa vazio nem cache vazio**;
- upsert recusado pelo banco. Só linha confirmada conta; contar tentativa faria
  o relatório dizer que gravou o que foi recusado.

### Cache só aceita carregamento íntegro

A versão anterior declarava esse contrato no comentário e não o cumpria:
marcava o carregamento como `degradado` e salvava no cache assim mesmo. A
condição agora é literal, `erros.length === 0`, e não "tem alguma votação".

O modo de falha que isso fecha é caro e silencioso: um 503 transitório no
detalhe de uma votação, na primeira ficha da execução, congelava a lista PARCIAL
para as outras 58. A votação que caiu virava "não existe" nelas, com aparência
de dado apurado.

O custo é assumido e é de propósito: com uma votação quebrada ou procedimental
no dataset, o detalhe é rebaixado a cada candidato, em vez de uma vez só. Nesse
estado o dataset tem defeito de curadoria a corrigir, e cache barato esconderia
o defeito em vez de pressioná-lo.

Continuidade dentro da chamada continua valendo: uma votação defeituosa não
impede as outras de casar, e o teste cobra as duas coisas juntas.

`tests/ingest-votos-falhas.test.ts` cobre os sete modos com uma costura de IO
injetável, mais o caminho feliz, a continuidade e três casos de cache: falha
transitória no detalhe que tem de ser retentada na chamada seguinte,
carregamento parcial que não pode ser cacheado, e carregamento íntegro que tem
de ser cacheado uma vez só. 14 casos.

## Dry-run, contagens exatas

`npx tsx scripts/audit/dry-run-votacoes-chave-v2.ts`. Só leitura: lê o banco para
o estado atual, lê as 12 votações na Câmara Dados Abertos e cruza com os ids de
deputado de `data/candidatos.json`. Detalhe em
`QA/evidencias/2026-08-10-item7-votacoes/dry-run-dataset-v2.json`.

| Medida | Valor |
|---|---|
| Pares publicados hoje | 181 |
| Pares que a despublicação remove | **100** |
| Pares que o matching novo produz | **166** |
| Pares publicados depois | **247** |
| Votações recusadas por procedimental no dry-run | 0 |
| Fichas no universo | 280 |
| Fichas com id da Câmara | 59 |

Pares por matéria nova, todas conferidas contra `/votacoes/{id}/votos`:

| Votação | Matéria | Votos nominais | Pares |
|---|---|---|---|
| `14493-503` | Maioridade penal (1º turno) | 485 | 22 |
| `2123843-93` | Vaquejada (2º turno) | 430 | 20 |
| `340812-195` | Comissão da Mulher, Idoso, Criança, Juventude e Minorias | 393 | 20 |
| `2270800-135` | Prerrogativas parlamentares (1º turno) | 488 | 13 |
| `2515648-44` | Sustação do Decreto 12.466/2025 | 482 | 13 |
| `2351506-122` | Imunidade tributária (2º turno) | 472 | 13 |
| `2473389-58` | Contenção de despesas | 467 | 13 |
| `2383019-54` | Número de deputados por estado | 478 | 12 |
| `2494565-52` | Sustação de ação penal | 463 | 11 |
| `2430143-140` | Regulamentação da reforma tributária | 450 | 11 |
| `2324721-94` | Silvicultura e licenciamento ambiental | 443 | 11 |
| `2409076-34` | Permanência no ensino médio | 452 | 7 |

## Readback da distribuição por ficha

| Votações na ficha | Antes | Depois |
|---|---|---|
| 0 | 219 | **228** |
| 1 | 13 | 6 |
| 2 | 21 | 7 |
| 3 | 6 | 9 |
| 4 | 7 | 4 |
| 5 | 5 | 8 |
| 6 | 8 | 4 |
| 7 | 1 | 6 |
| 9 | 0 | 5 |
| 10 | 0 | 1 |
| 11 | 0 | 1 |
| 12 | 0 | 1 |
| **Fichas com algum voto** | **61** | **52** |

**Nove fichas ficam sem votação nenhuma, e isso não é regressão escondida.** Elas
só tinham votos vindos das 6 linhas defeituosas, ou seja, o que tinham era
errado. Em troca, o teto por ficha sobe de 7 para 12 e o total de pares sobe de
181 para 247, todos endereçados por votação exata.

## Reprodução da área de votações do cabo-daciolo

Conferido um a um em `/votacoes/{id}/votos` com o `idDeputado` 178938:

| | Antes | Depois |
|---|---|---|
| Votações na ficha | 2 | **3** |
| Quais | Teto de Gastos (EC 95), Reforma Trabalhista | Maioridade penal (**Não**), Comissão da Mulher (**Não**), Vaquejada (**Sim**) |
| Estado | as duas defeituosas | as três com votação exata |

Duas provas, uma automatizada e uma visual:

- `tests/daciolo-votacoes-pos-ajuste.test.tsx` renderiza o componente real da
  ficha com esses três votos e prova três cartões, a ausência das duas
  defeituosas e a declaração do sentido do SIM em cada um;
- **screenshot** em `QA/evidencias/2026-08-10-item7-votacoes/daciolo-votacoes-depois.png`,
  gerado renderizando o mesmo componente com a fixture medida e capturando com
  Playwright em light mode. A captura foi verificada antes de salvar: 3 cartões
  presentes, zero ocorrências de "Teto de Gastos" e zero de "Reforma
  Trabalhista".

O screenshot é do componente com a fixture, não da página em produção, e a
distinção importa: a migration não foi aplicada, então produção ainda mostra o
estado ANTES. Apresentar a página atual como se fosse o depois seria falso.

## Provas

| Prova | Resultado |
|---|---|
| `tests/votacoes-chave-dataset-v2.test.ts` (novo, 15 casos) | 15 pass, 0 fail |
| `tests/daciolo-votacoes-pos-ajuste.test.tsx` (novo, 4 casos) | 4 pass, 0 fail |
| `tests/votacao-classificacao.test.ts` | 20 pass, 0 fail |
| `tests/ingest-votos-falhas.test.ts` (novo, 14 casos) | 14 pass, 0 fail |
| `npm run audit:despublicacao:provar` (novo, 6 ramos em Postgres real) | OK, 6/6 |
| Suíte completa | **2596 pass, 4 fail** (as 4 são propriedade da Raiz, ver abaixo) |
| `npm run audit:cobertura:allowlist` do recorte | exit 0, 24 escritas declaradas dentro da allowlist |
| `npm run audit:cobertura:allowlist` sem flags | **falha**, e o motivo é o recorte |
| `npm run check:dead-code` | exit 0, `--max-issues 0` |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run settings:check` | 7 pass, 0 fail |
| `npm run build` | exit 0 |
| Replay linear em container | 293 aplicadas, 87 falhas, total 380 |

### As 4 falhas, uma a uma

**Nenhuma é da lógica desta entrega.** As quatro falhas atuais são de arquivos
que pertencem à Raiz. Houve ainda uma flake conhecida na rodada anterior, que
não reapareceu.

| Caso | Causa | Dono |
|---|---|---|
| `recortes.json cobre a árvore de migrations de hoje` | falta a entrada do recorte | Raiz |
| `contrato da view candidatos_publico` | falta declarar as 3 novas em `POSTERIORES` | Raiz |
| `classificador puro (#136)` | `schemaReplayTamanho` desatualizado | Raiz |
| `gate do repositório (#136)` | `aplicadas_esperadas` desatualizado | Raiz |

Na rodada anterior havia uma quinta falha, o flake conhecido de
`backfill-historico-periodo-fim`, que não reapareceu nesta execução. Ele tinha
sido conferido isolado duas vezes com 2 pass, e é o caso já registrado na base
de contenção de subprocesso sob carga.

**Nada de baseline foi alterado nesta entrega.** A rodada anterior atualizou
quatro pontos de contabilidade da árvore de migrations; eles foram **revertidos**
e entregues como proposta em `scripts/audit/baselines-trilha-c.proposta.json`,
com o número medido e como medi cada um.

**Provado com as propostas aplicadas, e restaurado.** Apliquei as cinco de forma
temporária (o recorte mais as quatro baselines), medi, e restaurei:

| Com as propostas aplicadas | Resultado |
|---|---|
| `audit-migrations-allowlist` + `migrations-classificacao` + `candidatos-publico-view-contrato` | **80 pass, 0 fail** |
| `npm run audit:cobertura:allowlist` sem flags | `OK: nenhuma escrita nova sem anotação, todo recorte dentro da própria allowlist, todo @write coberto.` |

Depois da restauração, `git diff` dos quatro arquivos de baseline contra
`cdad1a2` sai vazio e `recortes.json` está idêntico ao HEAD. Nenhum deles entra
no commit da trilha.

### Uma armadilha do gate que custou uma falha

O checker decide se uma migration declara escrita procurando a **substring** da
anotação no arquivo inteiro. O DDL `20260810090000` explicava em prosa que não
carrega essa anotação, e a palavra na prosa bastava para ele ser contado como
escrita declarada e cobrar recorte que não precisa. O mesmo tropeço apareceu no
meu próprio teste. Os dois foram corrigidos para falar da anotação sem escrevê-la.

O que os testes do dataset garantem, e que é o ponto: nenhuma das 12 é
procedimental na descrição **oficial**, toda uma respeita o limiar de 10% de
minoria, as 2 retiradas e as 4 pendentes não podem voltar por descuido, e toda
matéria declara o que SIM significa.

## Para a Raiz

1. `scripts/audit/recortes.json` é ato seu. A proposta está em
   `scripts/audit/recortes-trilha-c.proposta.json`, janela
   `20260810090000..20260810090200`, sem sobreposição e sem dívida.
2. **`20260810090100` não é reversível por SQL.** Os 100 pares vieram de coleta,
   e a coleta que os produziu é justamente a defeituosa. O rollback falha de
   propósito e explica isso. Aplicar exige backup confirmado.
3. Ordem de aplicação: `090000` (DDL), `090100` (despublicação), `090200`
   (dataset). Depois, rodar o ingest da Câmara para popular os 166 pares.
4. O Senado segue no matching antigo, não auditado. Frente própria.
