# QA: o gate `audit:cobertura:allowlist` deixou de ser vermelho por construção

Data: 2026-08-09

## Escopo

Separar as duas dívidas que se escondiam atrás de um único `exit 1` com 550
violações, decidir o que o comando pelado do `package.json` deveria fazer, e
congelar a dívida legítima de um jeito que sobreviva ao merge de uma migration
vinda de outro PR.

Nenhuma migration aplicada, nenhuma escrita em banco, nenhum merge.

## Composição real das 550, medida antes de mexer

| Categoria | Linhas | É defeito de migration? |
|---|---|---|
| Statement de escrita sem anotação `@write` | 298 | Sim, dívida legítima |
| `slug ... fora da coorte da allowlist` | 202 | Não, artefato de invocação |
| `slug ... fora por construção` | 6 | Não, artefato de invocação |
| `(tabela, slug) não está na allowlist` | 11 | Não, artefato de invocação |
| `... não casa com nenhuma entrada` | 13 | Não, artefato de invocação |
| `referência não está no bloco referencias` | 20 | Não, artefato de invocação |

**252 das 550 não eram defeito de migration nenhuma.** As 298 primeiras são
linhas agregadas por arquivo; contando statement a statement pela própria função
do checker, a dívida real é de **905 statements em 298 arquivos**.

Duas correções de precisão sobre a medição original:

1. A dívida se conta em **905 statements**, não 298. As 298 são arquivos.
2. **18 desses arquivos são posteriores a 02/08**, a data da convenção. Não é
   tudo legado: a convenção já existia e 18 migrations passaram assim mesmo.
   Os outros 280 são anteriores.

## Defeitos encontrados, e o que provou cada um

| # | Defeito | Como foi medido |
|---|---|---|
| 1 | O comando pelado caía num `--allowlist` **default** e sem janela, conferindo TODOS os recortes contra a autorização de UM | `check-migrations-allowlist.ts:225` antes da mudança: `allowlistPath` caía em `allowlist-presidenciaveis.json` |
| 2 | Essa default **nunca governou recorte nenhum** | `git log --diff-filter=A` em `allowlist-presidenciaveis.json` dá `7e2a19e`, commit sem nenhuma migration junto; e rodar cada uma das 33 migrations anotadas contra ela não produz um único `OK` |
| 3 | A lista de janelas morava num comentário, listava 4 de 14 recortes e ninguém a conferia | Cabeçalho do script antes da mudança contra os 12 arquivos `allowlist-*.json` no diretório |
| 4 | `--ate` era declarado obrigatório no `CLAUDE.md` e o script não cobrava | `--desde=20260802` sozinho rodava e varria tudo depois dele |
| 5 | **13 migrations declaram `@write` que allowlist nenhuma autoriza** | Varredura de cada arquivo anotado contra as 12 allowlists, janela de um arquivo só: a melhor ainda reprova, de 1 a 52 violações |
| 6 | `allowlist-correcoes-claims.json` e `allowlist-limpeza-familia-sem-mandato.json` nasceram no MESMO commit da migration que deviam governar, e as duas migrations saíram sem uma anotação sequer | `git show --stat fda8063` e `a881e03`: cada um traz a allowlist e a migration, e `grep -c "@write"` nas duas migrations dá 0 |

O defeito 6 é o mais caro dos seis: a autorização foi aprovada por ti, ficou
registrada no repositório, e o gate nunca a exercitou contra o SQL.

## Decisão 1: o que o comando pelado passa a fazer

`scripts/audit/recortes.json` vira a fonte de verdade dos pares
(janela, allowlist): **13 neste slice**. O décimo quarto,
`verificacao-campos-b2-20260809`, existe só no checkout combinado com o trabalho
da B2 e viaja no PR dele, junto com a migration e a allowlist, porque recorte
apontando para allowlist ausente reprova. O comando pelado roda a checagem 2
**uma vez por recorte**,
cada uma na própria janela e contra a própria allowlist, e a checagem 1 sobre a
árvore inteira contra o baseline. Isso mata as 252 por construção, não por
exceção: nenhuma escrita passou a ser tolerada, elas só passaram a ser conferidas
contra a autorização certa.

O default sumiu. `--allowlist` agora exige `--desde` e `--ate` juntos, com
`exit 2` se faltar, que é o contrato que o `CLAUDE.md` já declarava.

Três invariantes novos, todos fail-closed, porque o mapa também pode mentir:

- janelas não podem se sobrepor (sobreposição faz a mesma escrita passar se
  QUALQUER uma das duas allowlists aceitar);
- toda migration com `@write` tem que cair em exatamente um recorte;
- todo `allowlist-*.json` tem que ter dono, ou motivo declarado em
  `allowlists_sem_recorte`. É o invariante que impede o defeito 6 de repetir.

## Decisão 2: baseline por arquivo, e o que foi descartado

**Escolhido:** congelar por ARQUIVO em
`scripts/audit/baseline-escritas-sem-anotacao.json`, com `statements` e `sha256`.
Sem nenhum total no arquivo, de propósito: um total quebraria no merge da
migration que vem de outro PR, e ainda diria "piorou" sem dizer onde.

**Descartado: anotar retroativamente.** O custo não são as 905 anotações, que são
mecânicas. É que cada anotação só vira gate se existir uma allowlist autorizando
o par `(tabela, slug, campos)`, e essa decisão editorial nunca foi registrada
para 296 migrations **já aplicadas em produção**. Escrever essas allowlists hoje
é inventar retroativamente a aprovação que o gate existe para provar, e ainda
produz um diff de 296 arquivos que ninguém revisa de verdade. Preço aceito pela
escolha: a dívida velha continua visível e não conferida; o gate garante que ela
não cresça.

O `sha256` existe por um caso específico: trocar QUAL linha um `UPDATE` já
aplicado atinge mantém a contagem igual e muda a produção. Sem o hash, seria a
única escrita realmente invisível que sobreviveria ao congelamento.

## As 13 sem autorização

Não entram no baseline, porque a dívida delas é outra: a escrita está declarada,
o que falta é a aprovação. Viraram três recortes com `allowlist: null` e
`divida` preenchida em `recortes.json`, impressos e nomeados numa seção
`DÍVIDA CONGELADA` a cada run. Fechar exige a decisão editorial de quem aprovou
o recorte.

| Recorte | Migrations | Janela |
|---|---|---|
| `editoriais-e-homonimos-20260805` | 11 | `20260805004921..20260805137000` |
| `historico-judicial-sem-merito-20260807` | 1 | `20260807054000` |
| `marcadores-tse-residuais-20260808` | 1 | `20260808032540` |

## Correção da primeira versão: `divida` era rótulo, não congelamento

A primeira entrega deixou um buraco real, e ele é o mesmo modo de falha que este
trabalho existe para fechar. Enquanto `divida` era só uma string de motivo, o
laço dos recortes dava `continue` no recorte inteiro. Consequência: dentro de um
recorte de dívida, **um arquivo novo caindo na janela e uma violação a mais
passavam em silêncio**, e um recorte novo podia nascer com `divida` e comprar a
mesma dispensa com uma linha de JSON. A dispensa de reprovar era a saída mais
barata para qualquer escrita que não passasse na allowlist.

O que a dívida congela agora, por recorte:

| Campo | O que trava |
|---|---|
| `arquivos` | conjunto EXATO de `.sql` na janela no congelamento |
| `violacoes_sha256` | impressão digital das violações e escritas declaradas, ordenada e deduplicada |
| `violacoes` | quantas linhas a impressão digital cobre, só para o relatório ser legível |

E o roster de nomes que podem carregar `divida` saiu do JSON e virou a constante
`DIVIDAS_CONGELADAS`, no código do checker. Isso é a regra, não um detalhe de
implementação: se a lista morasse em `recortes.json`, criar dívida nova seria
acrescentar uma linha ao mesmo arquivo que já se está editando.

Dívida histórica congelada em 09/08/2026:

| Recorte | Arquivos | Linhas congeladas |
|---|---|---|
| `correcoes-claims-pos-factcheck` | 1 | 5 |
| `limpeza-familia-sem-mandato` | 1 | 2 |
| `editoriais-e-homonimos-20260805` | 11 | 93 |
| `historico-judicial-sem-merito-20260807` | 1 | 2 |
| `marcadores-tse-residuais-20260808` | 1 | 2 |

## Segunda revisão: o CodeRabbit achou um fail-open dentro do próprio gate

A CI do PR #149 passou inteira e o review entrou como `COMMENTED`, não
`CHANGES_REQUESTED`, ou seja formalmente não havia comentário bloqueante. Os
quatro foram validados um a um em vez de aceitos pelo rótulo, e três procediam.

**O grave, reproduzido antes de corrigir.** `valor()` só casava `--nome=valor`.
Rodar `--allowlist X --desde Y --ate Z` na forma com ESPAÇO fazia os três
lookups voltarem `undefined`, o comando caía no modo completo e imprimia `OK`
com exit 0. Quem estava autorando um recorte novo lia verde e concluía que o
recorte dele passou, quando nada dele tinha sido conferido. É a mesma classe de
bug que este PR existe para matar, dentro do PR. O parser virou estrito: forma
com espaço, flag desconhecida, argumento posicional, valor vazio e flag repetida
saem todos com **exit 2**, e o modo completo nunca é alcançado por omissão.

**Allowlist ausente saía como `ENOENT` com stack trace**, no `readFileSync` de
`conferirRecorte`, sem dizer qual recorte estava errado e parecendo defeito do
checker. O inventário passou a conferir que toda allowlist referenciada existe
no disco, e a validação do mapa virou **pré-voo**: roda antes do laço dos
recortes, porque é ele quem lê os arquivos.

**Recorte com `divida` e allowlist não nula nunca exercitava a allowlist.** O
ramo da dívida dá `continue` antes da checagem de "allowlist que não conferiu
escrita nenhuma", e o inventário conta a allowlist como referenciada. Resultado:
autorização registrada, referenciada e nunca exercida, que é o defeito 6 deste
mesmo relatório sobrevivendo em outra forma. Não virou erro, porque é dívida
histórica congelada e erro permanente devolveria o gate ao vermelho por
construção. Virou rótulo explícito **`ALLOWLIST NÃO EXERCITADA`** no relatório,
nos dois recortes onde isso acontece.

**A contagem de recortes** dizia 14 no recibo e no cabeçalho do checker, contra
13 no slice. Corrigida nos dois, com a nota de que o décimo quarto pertence ao
checkout combinado com a B2. O `CLAUDE.md` não tem contagem, então o comentário
errou nessa parte e nada foi mudado lá.

**E o gate entrou na CI.** `npm run audit:cobertura:allowlist` virou passo do job
`verify` em `.github/workflows/ci.yml`. Antes disso ele saía vermelho por
construção, e gate que ninguém executa é gate desligado: dois documentos
chegaram a declarar "allowlist OK" com ele em exit 1.

## Verificação

Onze bordas executadas end-to-end em `tests/audit-gate-divida-e2e.test.ts`, que
sobe o **processo real** do checker contra uma árvore de fixture apontada por
`PF_AUDIT_RAIZ` e afirma o código de saída. Teste de unidade das funções puras
não serviria: o que falhava não era a comparação, era o `continue` que dispensava
o recorte de reprovar. Só o exit code prova que a borda está ligada. Fixture em
vez de mutar `supabase/migrations/` para não deixar migration de mentira no
repositório se o teste quebrar no meio.

| Cenário | Esperado | Medido |
|---|---|---|
| Fixture intacta (senão os outros casos não provam nada) | exit 0 | exit 0 |
| **Recorte novo declarando `divida`** | exit 1 | exit 1, `não está no roster fechado` |
| **Arquivo novo dentro de janela de dívida** | exit 1 | exit 1, `entrou na janela de uma dívida congelada` |
| **Migration do baseline editada, contagem intacta** | exit 1 | exit 1, `sha256 diferente` |
| **Violação a mais dentro da dívida congelada** | exit 1 | exit 1, `as violações mudaram` |
| Bloco `divida` removido de recorte do roster | exit 1 | exit 1, `perdeu o bloco divida` |
| **Flags na forma com espaço** | exit 2 | exit 2, sem cair no modo completo |
| Flag desconhecida, e posicional solto | exit 2 | exit 2 |
| Forma com `=` (a rigidez não pode virar bloqueio) | exit 0 | exit 0 |
| **Recorte apontando para allowlist ausente** | exit 1 nomeado | exit 1, `não existe no diretório`, sem `ENOENT` e sem stack trace |
| **Dívida com allowlist e zero writes** | exit 0 rotulado | exit 0, `ALLOWLIST NÃO EXERCITADA` |

Uma nota de método sobre a última linha: a primeira versão dessa fixture reusou a
allowlist do recorte limpo e o gate reprovou com `referenciada por mais de um
recorte`. Era o gate certo e a fixture errada, corrigida com allowlist própria.

E as bordas do mapa, executadas contra a árvore real com arquivo criado, gate
rodado e arquivo removido em seguida:

| Cenário | Esperado | Medido |
|---|---|---|
| Migration nova com escrita sem `@write` | exit 1 | exit 1, `não está no baseline` |
| Migration nova anotada, fora de todo recorte | exit 1 | exit 1, `não cai em recorte nenhum` |
| **Migration só de schema, vinda de outro PR** | exit 0 | exit 0, em silêncio |
| `--allowlist` sem `--desde`/`--ate` | exit 2 | exit 2 |
| `--desde` sem `--allowlist` | exit 2 | exit 2 |

O caso da migration só de schema é o que a instrução pedia para proteger: a
migration paralela não derruba o gate, porque nada aqui é contado globalmente.

`npm test` também valida o mapa contra a árvore real
(`recortes.json cobre a árvore de migrations de hoje`), então migration mergeada
de outro PR com `@write` e sem recorte aparece no CI, não só para quem lembrar de
rodar o gate na mão.

## Separação do slice, e o que ela provou

O checkout misturava este gate com o trabalho B2 (`20260809070000`), com a
triagem pré-lançamento e com o tooling de replay. O slice do gate foi isolado em
`chore/gate-allowlist-dividas-congeladas`, num worktree próprio a partir do
`main` mergeado (`0b08a3b`), com **8 arquivos e nada de B2**:

```
.github/workflows/ci.yml
CLAUDE.md
QA/2026-08-09-gate-allowlist-recortes-e-baseline.md
Settings/STATUS.md
scripts/audit/baseline-escritas-sem-anotacao.json
scripts/audit/check-migrations-allowlist.ts
scripts/audit/recortes.json
tests/audit-gate-divida-e2e.test.ts
tests/audit-migrations-allowlist.test.ts
```

(Nove arquivos. O `ci.yml` entrou na segunda rodada, com o passo que põe o gate
no job `verify`.)

A separação provou o contrato na prática: o `recortes.json` do slice do gate tem
**13 recortes, não 14**. A entrada `verificacao-campos-b2-20260809` pertence ao
slice do B2, junto com a migration e a allowlist dela, porque um recorte que
aponta para allowlist inexistente reprova. É exatamente a regra "migration de
dados nova exige as três coisas no mesmo PR" aplicada ao próprio trabalho.

Nada foi mergeado e nada foi empurrado.

## Gates

Reexecutados nos dois lugares. O slice isolado é o que este commit entrega; o
checkout com B2 é a árvore compartilhada, onde o gate também precisa passar.

| Gate | Slice isolado | Checkout + B2 |
|---|---|---|
| `npm test` | **2503/2503** | **2515/2515** com `NEXT_PUBLIC_SITE_URL=https://puxaficha.com.br` |
| focados (`audit-migrations-allowlist` + `audit-gate-divida-e2e`) | 35/35 | 35/35 |
| `npm run audit:cobertura:allowlist` | exit 0, 5 dívidas nomeadas | exit 0, 5 dívidas nomeadas |
| `npm run lint` | limpo | 0 erros (1 warning pré-existente em `.firecrawl/scratchpad`, não tocado) |
| `npm run typecheck` | limpo | limpo |
| `npm run check:dead-code` | limpo | limpo |

**A execução pelada no checkout com B2 dá 2511/2515.** As quatro falhas vêm do
`.env.local`, que define `NEXT_PUBLIC_SITE_URL`; com a variável passada
explicitamente na frente do comando, a suíte fecha em 2515/2515. Não é defeito
deste slice, e o slice isolado não sofre disso porque o worktree não tem
`.env.local`. Quem for reproduzir os números da coluna da direita precisa da
variável, senão vai ler quatro falhas de ambiente como regressão deste trabalho.

## Dívida que fica aberta, em ordem de custo

1. **7 statements, allowlist já aprovada.** Anotar `20260803101537` e
   `20260803112556` exercita `allowlist-correcoes-claims.json` e
   `allowlist-limpeza-familia-sem-mandato.json`, que já têm autorização
   registrada. É a única dívida da lista que não precisa de decisão nova.
2. **13 migrations sem autorização.** Precisa da decisão editorial de quem
   aprovou os recortes de 05/08, 07/08 e 08/08.
3. **905 statements congelados.** Encolhe por arquivo, quando alguém tocar num.
4. **O gate não roda no CI.** Não está em `.github/workflows/`. Agora que ele
   sai verde e é legível, entrar no `ci.yml` passou a fazer sentido; antes teria
   sido só mais um check vermelho permanente.
