# A divergência de ledger de 08/08: mesma migration, dois números

`supabase/migrations/20260808010000_marcadores_tse_residuais_patrimonio.sql`
existia no repositório com esse nome. O ledger do banco registrava a mesma
migration como `20260808032540`. Nenhuma das duas versões estava errada sobre o
conteúdo: elas eram o mesmo SQL, com dois números diferentes.

O arquivo foi renomeado para `20260808032540`. É o terceiro caso do padrão da
issue #131, e o primeiro em que o rastro existia dos dois lados e ainda assim
não batia.

## O que aconteceu

A migration foi aplicada pelo `apply_migration` do MCP da Management API, não
por `supabase db push`. Essa rota não usa o nome do arquivo como versão: ela
carimba o próprio timestamp no momento da aplicação. O arquivo continuou dizendo
`20260808010000`, o banco gravou `20260808032540`, e a partir daí o repositório
afirmava uma versão que nunca existiu em produção enquanto produção carregava
uma versão que não existia no repositório.

Nada disso quebrou o site. O dado foi corrigido, as pós-condições rodaram e a
ficha pública ficou certa. O que quebrou foi a promessa de que
`supabase/migrations/` descreve o banco.

## Como foi detectado

Comparação direta, feita em 08/08 com duas medições independentes na mesma
sessão:

1. `select version from supabase_migrations.schema_migrations order by version`
   contra o projeto de produção, somente leitura.
2. Os prefixos de versão dos arquivos em `supabase/migrations/*.sql`.

O resultado veio em três blocos:

| Bloco | O que é |
|---|---|
| Interseção | Migrations com arquivo e registro, o caso normal |
| Só locais | 6 arquivos sem registro no ledger |
| Só remota | 1 versão no ledger sem arquivo, `20260808032540` |

Das 6 só locais, 5 são as migrations retidas da completude (`20260807050000` a
`20260807053000`), divergência deliberada e protegida por
`tests/migrations-retidas-gate.test.ts`. Sobrou exatamente uma de cada lado, e
elas se encaixaram: mesmo `name` (`marcadores_tse_residuais_patrimonio`) e
statements idênticos. A prova foi md5 sobre o texto normalizado dos dois lados,
removendo linhas de comentário e todo espaço em branco, com duas migrations
vizinhas usadas como controle negativo para mostrar que a normalização
discrimina em vez de colapsar tudo no mesmo hash.

## Por que o rename resolve, e a alternativa não

O banco já registra `20260808032540` com esses statements. Renomear o arquivo
faz o repositório afirmar o que de fato aconteceu, e custa uma linha de
histórico do git.

A alternativa seria inserir `20260808010000` no ledger, ou reescrever a linha
existente. Isso é mudar produção para acomodar um nome de arquivo: uma escrita
no banco cujo único propósito é salvar a aparência do repositório, exatamente o
tipo de atalho que criou a issue #131. Um número de versão não é dado do
produto, e o lado que tem autoridade sobre o que aconteceu é o que executou.

Efeito colateral que precisou ser tratado no mesmo commit: o número velho
aparecia como referência textual em outros arquivos, porque as 5 migrations
retidas e o gate delas citam o intervalo de migrations já aplicadas para
explicar por que um `db push` as aplicaria fora de ordem. Todas as citações
passaram a apontar `20260808032540`. As menções que sobram ao número velho são
históricas e vivem neste documento.

## O que o guard novo passa a impedir

Até esta rodada, nenhum workflow comparava o ledger com o repositório. A
divergência foi encontrada porque alguém foi olhar, não porque algo avisou, e
foi assim nos três casos do padrão.

O comparador que entra agora roda essa mesma diferença de forma automática e
recorrente, e reprova quando aparece versão no ledger sem arquivo, ou arquivo
sem versão no ledger fora da lista conhecida de exceções. Ele não impede que
alguém aplique migration por fora: impede que isso fique silencioso até a
próxima auditoria manual. O caso de hoje teria sido pego no primeiro run depois
do `apply_migration`, não semanas depois.

Ele também não fecha a issue #131. Reconstruir o banco a partir do repositório
continua sem cobertura, e as 5 retidas continuam sendo divergência de propósito.
O que muda é que divergência nova deixa de depender de curiosidade humana para
aparecer.
