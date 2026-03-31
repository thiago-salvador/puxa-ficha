# Summary - Pipeline Fix de Perfis Vazios

## Contexto

Este documento resume a execucao do plano em [docs/plans/2026-03-31-pipeline-fix-final.md](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/docs/plans/2026-03-31-pipeline-fix-final.md).

Objetivo do fix:

- corrigir perfis vazios ou incompletos para candidatos em exercicio
- unificar a resolucao TSE em um unico caminho
- preencher `cargo_atual` via pipeline
- aumentar cobertura de `patrimonio` e `financiamento` sem introduzir match silencioso errado

## O que foi implementado

### 1. Auditoria de completude

Foi criado o script [scripts/audit-completude.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/audit-completude.ts) para:

- carregar `data/candidatos.json`
- buscar `id`, `slug`, `cargo_atual` e `cpf` no Supabase
- contar cobertura por candidato em:
  - `patrimonio`
  - `financiamento`
  - `votos_candidato`
  - `gastos_parlamentares`
  - `historico_politico`
  - `processos`
  - `projetos_lei`
- salvar o relatorio em [scripts/completude-report.json](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/completude-report.json)

### 2. Export de `parseCSV`

Foi extraido `parseCSV()` para [scripts/lib/helpers.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/lib/helpers.ts), removendo duplicacao entre scripts TSE.

### 3. Resolvedor TSE compartilhado

Foi criado [scripts/lib/tse-resolver.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/lib/tse-resolver.ts) com a seguinte hierarquia:

1. `SQ_CANDIDATO` pre-carregado do JSON
2. `CPF` vindo do Supabase
3. nome unico
4. nome + UF

Regras implementadas:

- o resolvedor e stateless por row
- ambiguidade vira `null`
- o caller faz o dedupe por `slug`
- `persist-sq-candidato.ts` e `ingest-tse.ts` usam a mesma logica

### 4. Persistencia de `tse_sq_candidato`

Foi criado [scripts/persist-sq-candidato.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/persist-sq-candidato.ts) para:

- baixar `consulta_cand` para `2018`, `2020`, `2022` e `2024`
- usar o resolvedor compartilhado
- persistir `ids.tse_sq_candidato[ano]` em [data/candidatos.json](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/data/candidatos.json)
- remover matches ambiguos do resultado final

Resultado:

- `114/144` candidatos passaram a ter pelo menos um `SQ_CANDIDATO` persistido

Exemplos confirmados:

- `nikolas-ferreira`
  - `2020: 130001175469`
  - `2022: 130001611005`
- `cleitinho`
  - `2018: 130000613136`
  - `2022: 130001671677`
- `rodrigo-pacheco`
  - `2018: 130000604556`

### 5. Refatoracao do `ingest-tse.ts`

Em [scripts/lib/ingest-tse.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/lib/ingest-tse.ts):

- os anos foram expandidos para `2018`, `2020`, `2022` e `2024`
- `buildSQMap()` passou a:
  - pre-popular com `ids.tse_sq_candidato`
  - usar `createTSEResolver()`
- `processFinanciamento()` deixou de usar match local por nome
- o script passou a logar estatisticas do resolvedor
- o entrypoint agora aceita anos por CLI, por exemplo:
  - `node --import tsx scripts/lib/ingest-tse.ts 2022`

### 6. Preenchimento de `cargo_atual`

Em [scripts/lib/ingest-camara.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/lib/ingest-camara.ts):

- `cargo_atual = "Deputado(a) Federal"` quando `ultimoStatus.situacao` contem `"exerc"`

Em [scripts/lib/ingest-senado.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/lib/ingest-senado.ts):

- `cargo_atual = "Senador(a)"` quando existe `IdentificacaoParlamentar.CodigoPublicoNaLegAtual`

## Divergencias entre plano e API real

Durante a execucao, dois campos previstos no plano nao batiam com o payload atual das APIs:

- Camara
  - plano: `ultimoStatus.situacaoNaLegislatura`
  - API real: `ultimoStatus.situacao`
- Senado
  - plano: `IdentificacaoParlamentar.InExercicio`
  - API real util para mandato ativo: `IdentificacaoParlamentar.CodigoPublicoNaLegAtual`

O codigo foi ajustado para o shape real das respostas.

## Validacao executada

### Baseline antes do fix

Auditoria inicial:

- `patrimonio = 60/144`
- `financiamento = 56/144`
- `cargo_atual = 39/144`

### Estado apos o fix

Auditoria final:

- `patrimonio = 125/144`
- `financiamento = 104/144`
- `cargo_atual = 62/144`

Ganho observado:

- `+65` candidatos com patrimonio
- `+48` candidatos com financiamento
- `+23` candidatos com `cargo_atual`

### Candidatos alvo verificados no banco

`nikolas-ferreira`

- `cargo_atual = "Deputado(a) Federal"`
- patrimonio 2022 presente
- financiamento 2022 presente

`cleitinho`

- `cargo_atual = "Senador(a)"`
- patrimonio 2022 presente
- financiamento 2022 presente

`rodrigo-pacheco`

- `cargo_atual = "Senador(a)"`
- `SQ_CANDIDATO` historico persistido
- patrimonio e financiamento presentes no historico agregado

## Arquivos criados ou alterados

Criados:

- [scripts/audit-completude.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/audit-completude.ts)
- [scripts/lib/tse-resolver.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/lib/tse-resolver.ts)
- [scripts/persist-sq-candidato.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/persist-sq-candidato.ts)
- [docs/2026-03-31-pipeline-fix-summary.md](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/docs/2026-03-31-pipeline-fix-summary.md)

Alterados:

- [data/candidatos.json](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/data/candidatos.json)
- [scripts/lib/helpers.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/lib/helpers.ts)
- [scripts/lib/ingest-camara.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/lib/ingest-camara.ts)
- [scripts/lib/ingest-senado.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/lib/ingest-senado.ts)
- [scripts/lib/ingest-tse.ts](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/lib/ingest-tse.ts)
- [scripts/completude-report.json](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/completude-report.json)

## Pendencias e observacoes

### Fora do escopo deste fix

- `scripts/lib/ingest-tse-situacao.ts` continua com filtro de cargo historico que reduz captura de CPF para varios candidatos
- `npm run check:scripts` global continua falhando por erros pre-existentes fora deste trabalho:
  - `scripts/lib/enrich-wikipedia.ts`
  - `scripts/lib/ingest-capag.ts`
  - `scripts/lib/ingest-ipea.ts`

### Build

`npm run build` compilou com sucesso, mas a etapa de geracao estatica entrou em timeout de rede durante `fetch` em runtime de build. Isso apareceu como problema operacional de acesso externo durante SSG, nao como erro introduzido por este fix.

## Conclusao

O fix cumpriu o objetivo principal:

- o JSON deixou de estar cego para `SQ_CANDIDATO`
- a pipeline TSE passou a usar um unico resolvedor compartilhado
- `cargo_atual` voltou a refletir mandato ativo real para casos federais cobertos
- perfis criticos como Nikolas Ferreira e Cleitinho deixaram de aparecer como perfis vazios na parte de Dinheiro
