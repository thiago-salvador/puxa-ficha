# Eval final da PF Ajustes, itens 1 a 17

Eval congelado: `/private/tmp/pf-ajustes-17-final-eval.md`
Item 18: fora do escopo.

## Rodada 1, bloqueada

Veredito independente: **BLOQUEAR**. Resultado: 1 PASS, 7 FAIL, 2 UNKNOWN e
critério 5 igual a `no`.

| # | Resultado | Bloqueio reproduzido |
|---:|---|---|
| 1 | FAIL | Matriz sobredeclarava itens 4 e 14 e ainda não estava em SHA limpo. |
| 2 | FAIL | O grader global `tests/votacoes-chave-global.test.ts` não existia. |
| 3 | FAIL | O auditor 194x2 não comparava valores e textos visíveis completos contra o DTO. |
| 4 | FAIL | Projeção mantinha 80 trajetórias, 29 patrimônios e 159 votações em `nunca_verificado`. |
| 5 | `no` | Artefato 32x5 não tinha fonte e payload por célula, nem tentativa nominal suficiente. |
| 6 | PASS | 118 regressões nomeadas e adversariais passaram. |
| 7 | FAIL | Gates não correspondiam a um SHA final limpo. |
| 8 | UNKNOWN | Faltavam snapshots remotos antes/depois. |
| 9 | FAIL | Integração ainda estava dirty. |
| 10 | UNKNOWN | Log não tinha contador estruturado de ciclos. |
| 11 | FAIL | Matriz não coincidia integralmente com artefatos e SHA. |

A checagem judicial independente passou: 55/55 URLs do 69/21 e 66/66 URLs do
66/25 apontam ao CNJ da própria linha; os dois harnesses PostgreSQL passaram.

## Remediação disparada

- Critério 2: teste global criado; o guard incremental da Câmara deixou de usar
  `proposicao_id` e passou a exigir `fonte=camara + votacao_id_api`.
- Critério 3: auditor visual em segunda rodada para comparar payload visível
  completo contra DTO nas 194 fichas e dois viewports.
- Critérios 1, 4 e 5: auditoria e persistência explícita por fonte nas 194
  fichas, sem converter bloqueio, erro ou falta de identidade em ausência.
- Critérios 7, 8, 9, 10 e 11: fechar SHA limpo, snapshots, contador de ciclos,
  gates no mesmo commit e nova avaliação independente.

O gate continua fechado até uma rodada posterior registrar 11/11 PASS e
critério 5 igual a `yes`.

## Rodada 2, 7/11 e critério 5 igual a `no`

O segundo julgamento independente aprovou sete dos onze critérios. Quatro
continuaram bloqueando o encerramento:

| Critério | Resultado | Evidência que faltou ou divergiu |
|---:|---|---|
| 1 | FAIL | A matriz canônica ainda continha contagens e estado de prontidão anteriores ao SHA avaliado. |
| 5 | `no` | As 970 células existiam, mas ainda havia células sem payload estruturado e três células de conteúdo sem endpoint externo. |
| 8 | FAIL | Não havia par versionado de snapshots remotos antes/depois. |
| 11 | FAIL | As contagens atuais da matriz não coincidiam integralmente com os artefatos finais. |

Os demais sete critérios passaram. O resultado `no` no critério 5 manteve o
eval inteiro fechado, independentemente da soma 7/11. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Ciclo 3 aberto por evidência nova

A rodada 2 abriu um terceiro ciclo somente para os quatro bloqueios observados.
Ele não alterou o escopo nem incluiu o item 18.

- Critérios 1 e 11: documentos e matriz foram alinhados à projeção final de
  292 estados residuais, sendo 80 de trajetória, 32 de patrimônio e 180 de
  votações, divididos em 241 `indeterminado` e 51
  `sem_achado_no_escopo`. Votações terminam projetadas em 14 fichas com
  conteúdo, 28 limitadas e 152 indeterminadas.
- Critério 5: o artefato 194 por 5 foi regenerado com 970/970 payloads,
  zero `nunca_verificado` e zero célula de conteúdo sem endpoint externo.
- Critério 8: o par versionado
  `QA/evidencias/2026-08-11-workflow-final/snapshots/antes.json` e
  `depois.json`, acompanhado de `comparacao.json`, registra as superfícies
  remotas somente leitura e prova que nenhuma escrita de produção foi feita.
- A migration `20260811101100` acrescenta proveniência oficial a cinco linhas
  de trajetória de Cadu Xavier e Ricardo Cappelli e corrige as datas da ABDI.
- A migration `20260811101200` reconcilia as seis linhas processuais legadas:
  cinco passam a ter identificador e fonte oficial; uma alegação sem sustentação
  nominal é despublicada e deixa bloqueio editorial `indeterminado`.
- Os gates esperados para o SHA limpo são 2.985/2.985 testes, replay linear
  293 + 100 = 393 e replay de schema 70 + 323 = 393.

A rodada 3 independente ainda precisa reproduzir o SHA final. O encerramento
continua condicionado a 11/11 PASS e ao critério 5 exatamente igual a `yes`.
[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Rodada 3, 10/11 e critério 5 igual a `yes`

O julgamento independente reproduziu o SHA `d2568bd854dd87047acd42e3b992a5fc9bc6d261`.
Os critérios 1 a 7 e 9 a 11 passaram. O critério 5 respondeu literalmente
`yes`: conteúdo e os 180 estados `vazio_confirmado` têm endpoint nominal e
tentativa executada; os 204 casos sem execução permanecem somente
`indeterminado`, com identidade ausente e bloqueio explícito.

O critério 8 falhou pelo texto literal. Durante a materialização dos snapshots,
dois arquivos novos foram criados temporariamente no checkout principal e
removidos. Nenhum arquivo preexistente foi sobrescrito, refs e status final
foram preservados e o hash do status antes e depois do restauro é idêntico, mas
houve toque transitório no checkout e `antes.json` não capturou o status integral
do main. A falha é processual e histórica, não defeito de produto nem evidência
de escrita ou deploy em produção. Ela não pode ser corrigida retroativamente e
não será ocultada ou reclassificada para fabricar 11/11.

Resultado formal: 10/11. Resultado substantivo dos dados, código, UI e release:
todos os dez critérios correspondentes passaram. A PR #160 permaneceu aberta,
mergeável e verde; o ledger somente leitura permaneceu em 371 versões, topo
`20260809060000`, com as 17 migrations ainda pendentes.
[confidence: high, source: avaliação independente no SHA d2568bd, CI e ledger-guard 31500076357] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
