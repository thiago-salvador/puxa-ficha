# A decisão de 08/08: o ledger não vira registro de escrita

A issue #131 descreve um mesmo defeito em três casos: alguém mudou dado em
produção e o repositório não sabe. Em dois deles foi script de serviço rodando
com `--apply`. No terceiro foi o `apply_migration` do MCP da Management API, que
carimba timestamp próprio e produz divergência sozinho, sem ninguém errar nada
(registrado em [`ledger-divergencia-20260808.md`](ledger-divergencia-20260808.md)).

A pergunta que precisava de resposta durável não era como consertar cada caso.
Era onde uma escrita em produção deixa rastro quando ela não é uma migration.

## As quatro opções

**1. `supabase db push` como via única.** Toda escrita vira migration, o ledger
passa a descrever tudo e a divergência acaba por construção.

**2. Registrar a execução de script no ledger.** Script que roda com `--apply`
insere uma linha em `supabase_migrations.schema_migrations`, e passa a existir um
lugar só onde se pergunta o que aconteceu com o banco.

**3. Trilha separada, com gate.** O ledger continua significando apenas
"migration aplicada". Escrita fora de migration passa por um helper que grava
linha própria, e um gate reprova quem escreve sem passar por ele.

**4. Só o guard de ledger.** Manter o comparador entre ledger e repositório que
a PR #132 entregou, e parar por aí.

## O que foi escolhido

A opção 3. O helper é `scripts/lib/escrita-auditada.ts`, a trilha mora em
`coleta_log` com `natureza = 'escrita'`, e o gate é
`scripts/audit/lib/escrita-auditada-gate.ts` travado por
`tests/escrita-auditada-gate.test.ts`.

Três razões, em ordem de peso.

A primeira é que as duas superfícies respondem perguntas diferentes. O ledger
responde "que schema é esse", e a resposta precisa ser reproduzível: aplicar as
migrations do repositório em um banco vazio tem que dar o banco de produção.
A trilha responde "quem mexeu no dado, quando e por quê", e essa resposta não
reconstrói nada. Misturar as duas estraga a primeira sem melhorar a segunda.

A segunda é que a tabela já existia com a forma certa. `coleta_log` é
append-only, tem `execucao`, `detalhe`, `volume` e `duracao_ms`, tem os índices
certos, e o `Settings/WORKFLOWS.md` já mandava registrar nela desde 04/08.
Faltava uma coluna, `natureza`, que separa "fui buscar dado" de "mudei dado".
Criar tabela nova custaria migration, tipos, consumidores e uma segunda
convenção para a mesma pergunta.

A terceira é que a regra já existia em texto e não valia nada. A medição de 08/08
achou oito scripts de operador que escrevem em tabela de domínio sem trilha
auditada, um deles sendo o caso 1 da própria issue; sete dos oito não mencionam
`coleta_log` em lugar nenhum, e o oitavo registra como coleta, sem motivo nem
volume. O que muda de verdade nesta rodada não é a existência da regra: é a
existência do gate.

## Por que as outras três foram descartadas

**Contra a opção 1, `db push` como via única.** O custo aparece na forma errada
de trabalho. Correção de dado descoberta por amostragem vira arquivo imutável no
histórico, o que impede dry-run barato, impede recorte iterativo e transforma
qualquer conserto em migration nova. Pior: não resolve o caso que originou a
decisão. A divergência do terceiro caso veio de uma ferramenta de aplicar
migration, não de um script. Uma política que só fala de scripts deixaria essa
porta aberta.

**Contra a opção 2, script no ledger.** Ela quebra exatamente a propriedade que
faz o ledger valer alguma coisa. Uma linha em `schema_migrations` afirma que
existe um arquivo em `supabase/migrations/` que, reaplicado, produz aquele
estado. Execução de script não produz nada reaplicável: depende do dado do dia,
do recorte, de flags. Linha de ledger sem arquivo é precisamente o que o guard
novo reprova, e essa opção pedia para criá-las de propósito. Vale a mesma frase
do caso da migration renomeada: escrever no ledger para acomodar o repositório é
mudar produção para salvar aparência.

**Contra a opção 4, só o guard.** Ele detecta divergência de schema, não escrita
de dado. Os dois primeiros casos da issue não mudaram schema nenhum: mudaram
milhares de linhas de tabela e passariam pelo guard com o ledger perfeitamente
igual ao repositório. O guard é necessário e continua, mas cobre outra falha.

## O que a escolha custou

Duas coisas, ambas assumidas.

A view `coleta_log_ultima` precisou ser recriada na mesma migration que cria a
coluna. Ela é `distinct on (fonte, escopo, alvo)` sem `where` e é servida na
superfície pública por `src/lib/api.ts`. Sem o filtro `natureza = 'coleta'`, uma
linha de escrita, por ser a mais recente do trio, apareceria para o usuário final
como última tentativa de coleta. Coluna e view andam juntas ou a correção
introduz o defeito que pretende evitar.

E a ordem de rollout virou parte do contrato, não uma boa prática. O helper
aplica a escrita de domínio antes de gravar a trilha, e a trilha lança quando o
insert falha. Com a migration não aplicada, um script migrado rodando com
`--apply` gravaria o dado e só depois quebraria ao registrar: dado dentro, rastro
fora. O preflight é o que converte esse erro caro em uma mensagem barata: antes
da primeira escrita de domínio, o helper faz um `select` das nove colunas que o
insert da trilha preenche e recusa a rodada inteira se elas não estiverem lá. A
ordem obrigatória e a consequência de invertê-la estão em `Settings/WORKFLOWS.md`,
seção "Escrita em produção fora de migration".

Vale registrar que a ordem `preflight` antes de `aplicar()` foi a segunda versão
do helper. A primeira aplicava a escrita de domínio e gravava a trilha depois,
lançando se a trilha falhasse, o que não desfaz nada: as duas escritas são
requisições PostgREST independentes, sem transação em volta, então a primeira já
está commitada quando a segunda falha. Inverter essas duas linhas reintroduz a
issue #131 pela mão da correção dela.

## O que continua fora de cobertura

Reconstruir o banco a partir do repositório. A trilha diz que uma escrita
aconteceu, quem fez e quantas linhas foram tocadas; ela não guarda o que o dado
era antes, e não é um caminho de replay. Isso continua sendo o escopo maior da
issue #131.
