# Puxa Ficha - Pipeline Fix Final

## Goal

Corrigir o problema estrutural de perfis vazios para candidatos como Nikolas Ferreira, Cleitinho e outros politicos em exercicio, sem introduzir matches TSE errados ou regressao de cobertura.

## Diagnostico Confirmado

- `data/candidatos.json` esta com `ids.tse_sq_candidato = {}` para todos os 144 candidatos.
- `cargo_atual` nao e preenchido pela pipeline; hoje depende de seeds manuais.
- `scripts/lib/ingest-tse.ts` ainda roda so com `anos = [2018, 2022]`.
- `processPatrimonio()` ja usa `SQ_CANDIDATO` corretamente; o gargalo esta no `buildSQMap()`.
- `processFinanciamento()` ainda faz match por nome e falha de forma silenciosa.
- A chave real das tabelas filhas e `candidatos.id` (UUID), nao `slug`.
- Baseline atual no banco:
  - patrimonio: 64/144 candidatos
  - financiamento: 60/144
  - votos: 49/144
  - gastos: 19/144
  - historico: 97/144
  - cargo_atual preenchido: 39/144

## Regras Estruturais

- Um unico resolvedor TSE deve ser usado tanto por `scripts/persist-sq-candidato.ts` quanto por `scripts/lib/ingest-tse.ts`.
- O resolvedor deve ser stateless para cada row. Ele resolve uma row e retorna um candidato, mas nao deduplica por `slug` internamente.
- A deduplicacao por `slug` e a marcacao de ambiguo ficam no caller.
- Hierarquia de resolucao:
  - `SQ persistido`
  - `CPF vindo do Supabase`
  - `nome unico`
  - `nome + UF`
- Sem filtro de cargo historico para anos passados. O cargo atual de 2026 nao pode bloquear um match valido de 2022.
- Match ambiguo deve virar `no-match + log`, nunca persistencia silenciosa.

## Nota de Execucao

Este plano nao inclui snippets detalhados em todos os steps no formato mais prescritivo da skill de escrita de planos, mas isso nao e bloqueador neste caso. Apos multiplas rodadas de auditoria contra o codigo real, a especificacao ficou precisa o suficiente para execucao: define arquivos, responsabilidades, chaves de matching, criterios de sucesso e riscos operacionais com clareza.

## Ordem de Execucao

1. Criar auditoria de completude.
2. Corrigir `cargo_atual` com gate de mandato ativo.
3. Exportar `parseCSV` de `helpers.ts`.
4. Criar resolvedor compartilhado em `scripts/lib/tse-resolver.ts`.
5. Persistir `tse_sq_candidato` no JSON usando o resolvedor.
6. Refatorar `ingest-tse.ts` para usar o mesmo resolvedor e expandir anos.
7. Rodar rollout completo e validar ganho real de cobertura.

## File Map

- `scripts/audit-completude.ts`
  - novo script de auditoria
- `scripts/lib/helpers.ts`
  - exportar `parseCSV`
- `scripts/lib/tse-resolver.ts`
  - novo resolvedor compartilhado
- `scripts/lib/ingest-camara.ts`
  - preencher `cargo_atual` so para deputados em exercicio
- `scripts/lib/ingest-senado.ts`
  - preencher `cargo_atual` so para senadores em exercicio
- `scripts/persist-sq-candidato.ts`
  - novo script para popular `ids.tse_sq_candidato`
- `scripts/lib/ingest-tse.ts`
  - expandir anos e trocar o match local pelo resolvedor compartilhado
- `data/candidatos.json`
  - persistir `tse_sq_candidato` por ano

## Task 1 - Audit de Completude

Objetivo: medir o baseline real antes de qualquer ajuste.

Implementacao:

- Criar `scripts/audit-completude.ts`.
- Carregar `data/candidatos.json`.
- Buscar `id`, `slug`, `cargo_atual` e `cpf` em batch na tabela `candidatos`.
- Resolver `slug -> UUID`.
- Contar por candidato:
  - patrimonio
  - financiamento
  - votos
  - gastos
  - historico
  - processos
  - projetos
- Salvar em `scripts/completude-report.json`.

Comando:

```bash
npx tsx scripts/audit-completude.ts
```

Saida esperada:

- baseline proximo de:
  - `com_patrimonio ~ 64`
  - `com_financiamento ~ 60`
- lista clara de candidatos com `ids.camara` mas `cargo_atual = null`

## Task 2 - cargo_atual via Pipeline

Objetivo: corrigir o gap mais visivel sem marcar ex-mandatarios como ativos.

### Camara

Arquivo: `scripts/lib/ingest-camara.ts`

Regra:

- usar `ultimoStatus.situacaoNaLegislatura`
- se contiver `"exerc"`, setar:
  - `cargo_atual = "Deputado(a) Federal"`

### Senado

Arquivo: `scripts/lib/ingest-senado.ts`

Regra:

- usar `IdentificacaoParlamentar.InExercicio`
- se for `"S"`, setar:
  - `cargo_atual = "Senador(a)"`

Comandos de validacao:

```bash
npx tsx scripts/lib/ingest-camara.ts
npx tsx scripts/lib/ingest-senado.ts
```

Checagem minima:

- `nikolas-ferreira` com `cargo_atual = "Deputado(a) Federal"`
- ex-deputados continuam com `cargo_atual = null`

## Task 3 - Exportar parseCSV

Objetivo: remover duplicacao e permitir reuse no script de persistencia.

Arquivos:

- `scripts/lib/helpers.ts`
- `scripts/lib/ingest-tse.ts`

Implementacao:

- mover a implementacao local de `parseCSV()` de `ingest-tse.ts` para `helpers.ts`
- exportar `parseCSV()` de `helpers.ts`
- atualizar `ingest-tse.ts` para importar `parseCSV` de `./helpers`

Validacao:

```bash
npm run check:scripts
```

## Task 4 - Criar o Resolvedor Compartilhado

Objetivo: garantir que persistencia e pipeline usem a mesma logica de matching.

Arquivo:

- `scripts/lib/tse-resolver.ts`

### Responsabilidade

Receber:

- lista de candidatos do JSON
- ano de referencia

Buscar:

- `slug, cpf` no Supabase

Construir:

- `sqToSlug` a partir de `ids.tse_sq_candidato[ano]`
- `cpfToSlug` a partir do banco
- `nameMap: Map<string, CandidatoConfig[]>`

### API sugerida

```ts
export interface ResolveResult {
  slug: string
  method: "sq-preloaded" | "cpf" | "name-unique" | "name-uf"
}

export interface ResolverStats {
  sqPreloaded: number
  cpf: number
  nameUnique: number
  nameUf: number
  ambiguous: number
  noMatch: number
}

export interface TSEResolver {
  resolveRow(row: Record<string, string>): ResolveResult | null
  stats: ResolverStats
  ambiguousSlugs: string[]
}
```

### Regras de resolucao

- `SQ_CANDIDATO` ja persistido no JSON ganha prioridade.
- Se houver CPF na row e ele existir no banco, usar CPF.
- Se o nome normalizado tiver um unico candidato, usar esse.
- Se houver mais de um candidato com o mesmo nome, tentar desambiguar por `SG_UF`.
- Se continuar ambiguo, retornar `null` e registrar o slug em `ambiguousSlugs`.
- O resolvedor nao deve manter `resolvedSlugs`.

### Motivo da regra stateless

- `persist-sq-candidato.ts` e `buildSQMap()` precisam deduplicar por candidato no nivel do caller.
- `processFinanciamento()` precisa resolver varias rows do mesmo candidato no mesmo ano.
- Se o resolvedor deduplicar por `slug` internamente, o financiamento quebra.

Validacao:

```bash
npm run check:scripts
```

## Task 5 - Persistir tse_sq_candidato

Objetivo: preencher o JSON com `SQ_CANDIDATO` por ano usando o resolvedor compartilhado.

Arquivo:

- `scripts/persist-sq-candidato.ts`

### Regras de implementacao

- caminho correto do JSON:

```ts
const CANDIDATOS_PATH = path.join(__dirname, "../data/candidatos.json")
```

- anos:

```ts
const ANOS = [2018, 2020, 2022, 2024]
```

- reutilizar o mesmo padrao de download e unzip ja usado por `ingest-tse.ts`
- usar `createTSEResolver(candidatos, ano)`
- para cada row do CSV `consulta_cand_*`, chamar `resolver.resolveRow(row)`

### Dedupe no caller

O caller deve controlar o mapa `slug -> sq`.

Regras:

- se `slug` ainda nao apareceu, persistir o `sq`
- se o mesmo `slug` aparecer de novo com o mesmo `sq`, ignorar
- se o mesmo `slug` aparecer com outro `sq`, remover do resultado e marcar como ambiguo

### Resultado esperado

- `ids.tse_sq_candidato` preenchido para candidatos com match forte
- ambiguos fora do JSON e listados para revisao manual

Comando:

```bash
npx tsx scripts/persist-sq-candidato.ts
```

Checagens:

- `nikolas-ferreira` deve ter `2022`
- `cleitinho` deve ter pelo menos um ano historico valido
- `rodrigo-pacheco` deve ter anos historicos validos

## Task 6 - Refatorar ingest-tse.ts

Objetivo: eliminar o caminho paralelo fragil da pipeline.

Arquivo:

- `scripts/lib/ingest-tse.ts`

### Mudancas

- expandir:

```ts
const anos = [2018, 2020, 2022, 2024]
```

- `buildSQMap()` passa a:
  - pre-popular `sqMap` com `ids.tse_sq_candidato[ano]`
  - criar `resolver = await createTSEResolver(candidatos, ano)`
  - usar `resolver.resolveRow(row)` para rows ainda nao resolvidas

- `processPatrimonio()` nao precisa mudar sua logica de negocio
  - ele ja consome `sqMap` corretamente

- `processFinanciamento()` deve deixar de usar `nameMap.get(nome)`
  - trocar para `resolver.resolveRow(row)`
  - como o resolvedor e stateless, varias rows do mesmo candidato continuam resolvendo normalmente

### Regra importante

- se `processFinanciamento()` continuar usando o match por nome local, o risco estrutural permanece
- a unica fonte de verdade para resolucao TSE passa a ser `createTSEResolver()`

Comando:

```bash
npx tsx scripts/lib/ingest-tse.ts
```

Logs esperados:

- quantos foram resolvidos por:
  - `sq-preloaded`
  - `cpf`
  - `name-unique`
  - `name-uf`
  - `ambiguous`
  - `no-match`

## Task 7 - Rollout e Verificacao Final

Comandos:

```bash
npx tsx scripts/ingest-all.ts
npx tsx scripts/audit-completude.ts
npm run check:scripts
npm run build
```

Checagem local:

- abrir `/candidato/nikolas-ferreira`
- verificar:
  - hero com `cargo_atual = "Deputado(a) Federal"`
  - aba Dinheiro com patrimonio de 2022
  - aba Dinheiro com financiamento de 2022

## Criterios de Sucesso

- 100% dos candidatos com `ids.camara` e mandato ativo com `cargo_atual` correto
- 100% dos candidatos com `ids.senado` e `InExercicio = "S"` com `cargo_atual` correto
- `tse_sq_candidato` preenchido para pelo menos 60/144 candidatos
- `nikolas-ferreira` com:
  - `cargo_atual` preenchido
  - patrimonio 2022
  - financiamento 2022
- coorte prioritaria de MG com patrimonio auditado
- patrimonio global nao pode cair abaixo de 64/144

## Riscos e Mitigacoes

- TSE 2026 ainda nao existe
  - usar apenas `[2018, 2020, 2022, 2024]`
- ambiguidade em homonimos
  - `Map<string, candidato[]>` + UF + no-match quando ambiguo
- cargo historico divergente do cargo atual
  - nao usar filtro de cargo historico para bloquear match valido
- caminhos paralelos de resolucao
  - proibidos; tudo usa `scripts/lib/tse-resolver.ts`
- regressao de cobertura
  - comparar `scripts/completude-report.json` antes e depois

## Resultado Esperado

Ao final:

- o JSON deixa de ser cego para `SQ_CANDIDATO`
- a pipeline TSE deixa de depender de match local fragil
- `cargo_atual` passa a refletir mandato ativo real
- Nikolas deixa de ser um perfil "meio vazio" apesar de ser deputado federal em exercicio
