# Ranking Ordenacao Expandida Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adicionar `ordem=desc|asc` em `/rankings/[slug]` para permitir leitura inversa do ranking sem alterar a versao canonica indexavel.

**Architecture:** Manter a coleta de dados em `src/lib/api.ts` como esta e mover a semantica de ordenacao, query e URL para helpers puros em `src/lib/rankings.ts`, onde o comportamento pode ser coberto por testes. A page individual passa a ler `ordem` junto de `cargo` e `uf`, ajustar metadata/share/JSON-LD com base nisso e renderizar um controle simples no bloco de filtro, mantendo `desc` como default canonico.

**Tech Stack:** Next.js App Router, TypeScript, server components, Tailwind CSS, `node:test` via `tsx --test`, pipeline existente com `npm run check:scripts`, `npm run lint`, `npm run build` e `npm run audit:release-verify`.

---

**Dependency note:** Task 2 depende da Task 1. Task 3 depende da Task 2. Task 4 fecha a validacao e atualiza a documentacao de execucao.

### Task 1: Contrato puro de ordenacao e query

**Files:**
- Modify: `tests/rankings.test.ts`
- Modify: `src/lib/rankings.ts`

**Step 1: Write the failing tests**

Adicionar em `tests/rankings.test.ts` casos cobrindo:

```ts
it("normalizes ranking sort order and query state", async () => {
  const { normalizeRankingViewState } = await import("../src/lib/rankings")

  assert.deepEqual(normalizeRankingViewState({ ordem: "asc" }), {
    cargo: "Presidente",
    estado: undefined,
    sortOrder: "asc",
    isFiltered: true,
  })

  assert.deepEqual(normalizeRankingViewState({ cargo: "Governador", uf: "sp", ordem: "desc" }), {
    cargo: "Governador",
    estado: "SP",
    sortOrder: "desc",
    isFiltered: true,
  })
})

it("sorts ranking entries ascending with nulls last and nome_urna as tie-breaker", async () => {
  const { sortRankingEntries } = await import("../src/lib/rankings")

  const entries = sortRankingEntries([
    { candidato: { nome_urna: "Zelia", slug: "zelia" }, metricValue: 10 },
    { candidato: { nome_urna: "Ana", slug: "ana" }, metricValue: 10 },
    { candidato: { nome_urna: "Bruno", slug: "bruno" }, metricValue: null },
    { candidato: { nome_urna: "Carlos", slug: "carlos" }, metricValue: 15 },
  ], "asc")

  assert.deepEqual(entries.map((entry) => entry.candidato.slug), ["ana", "zelia", "carlos", "bruno"])
})

it("builds ranking paths with cargo, uf and sort order only when necessary", async () => {
  const { buildRankingPath } = await import("../src/lib/rankings")

  assert.equal(buildRankingPath("gastos-parlamentares", { cargo: "Presidente", sortOrder: "desc" }), "/rankings/gastos-parlamentares")
  assert.equal(buildRankingPath("gastos-parlamentares", { cargo: "Presidente", sortOrder: "asc" }), "/rankings/gastos-parlamentares?ordem=asc")
  assert.equal(buildRankingPath("gastos-parlamentares", { cargo: "Governador", estado: "SP", sortOrder: "asc" }), "/rankings/gastos-parlamentares?cargo=Governador&uf=SP&ordem=asc")
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx tsx --test tests/rankings.test.ts
```

Expected: FAIL por helper ausente ou assinatura incompatível com `sortRankingEntries(entries, "asc")`.

**Step 3: Write minimal implementation**

Em `src/lib/rankings.ts`:

```ts
export type RankingSortOrder = "desc" | "asc"

export interface RankingViewState extends RankingFilters {
  sortOrder: RankingSortOrder
}

export function normalizeRankingViewState(input: {
  cargo?: string | null
  uf?: string | null
  ordem?: string | null
}): RankingViewState {
  const base = normalizeRankingFilters({ cargo: input.cargo, uf: input.uf })
  const sortOrder = input.ordem === "asc" ? "asc" : "desc"
  return {
    ...base,
    sortOrder,
    isFiltered: base.isFiltered || sortOrder !== "desc",
  }
}

export function sortRankingEntries<T extends RankingEntryLike>(entries: T[], sortOrder: RankingSortOrder = "desc"): T[] {
  // manter null no final e empate por nome_urna
}

export function buildRankingPath(
  slug: string,
  input: { cargo: RankingCargo; estado?: string; sortOrder?: RankingSortOrder }
): string {
  // omitir ordem quando for desc e omitir uf fora de Governador
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
npx tsx --test tests/rankings.test.ts
```

Expected: PASS nas suites de rankings, incluindo os novos casos de `asc`.

**Step 5: Commit**

```bash
git add tests/rankings.test.ts src/lib/rankings.ts
git commit -m "feat: add ranking sort order helpers"
```

### Task 2: Integrar `ordem` na page individual e metadata

**Files:**
- Modify: `src/app/rankings/[slug]/page.tsx`
- Reuse from Task 1: `src/lib/rankings.ts`

**Step 1: Refactor page to use pure helpers from Task 1**

Trocar parsing manual de query por helpers puros:

```ts
const view = normalizeRankingViewState({ cargo: sp.cargo, uf: sp.uf, ordem: sp.ordem })
const estado = definition.supportsUf ? view.estado : undefined
const pagePath = buildRankingPath(slug, {
  cargo: view.cargo,
  estado,
  sortOrder: view.sortOrder,
})
```

Usar `view.isFiltered` para `robots`, mantendo canonical em `/rankings/${slug}`.

**Step 2: Update metadata and sharing copy**

Ajustar `title`, `description`, `shareUrl`, `share title` e `ItemListOrder` para refletirem a ordem atual:

```ts
const orderLabel = view.sortOrder === "asc" ? "Menor para maior" : "Maior para menor"
const title = view.isFiltered
  ? `${definition.title} · ${filterLabel} · ${orderLabel} — Puxa Ficha`
  : `${definition.title} — Puxa Ficha`
const itemListOrder = view.sortOrder === "asc"
  ? "https://schema.org/ItemListOrderAscending"
  : "https://schema.org/ItemListOrderDescending"
```

**Step 3: Run build to verify integration**

Run:

```bash
npm run build
```

Expected: PASS com `/rankings/[slug]` gerando normalmente e sem erro de tipos em `searchParams`.

**Step 4: Re-run targeted rankings tests**

Run:

```bash
npx tsx --test tests/rankings.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/rankings/[slug]/page.tsx src/lib/rankings.ts tests/rankings.test.ts
git commit -m "feat: wire ranking sort order into detail page"
```

### Task 3: Controle de ordenacao na UI

**Files:**
- Modify: `src/app/rankings/[slug]/page.tsx`
- Verify only: `src/components/RankingTable.tsx`

**Step 1: Add the order control to the filter block**

Expandir o `<form method="get">` com um terceiro campo de ordenacao, sem transformar a page em client component:

```tsx
<label className="block">
  <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
    Ordem
  </span>
  <select
    name="ordem"
    defaultValue={view.sortOrder}
    className="mt-2 w-full rounded-[14px] border border-border bg-background px-4 py-3 text-[length:var(--text-body)] font-medium text-foreground"
  >
    <option value="desc">Maior para menor</option>
    <option value="asc">Menor para maior</option>
  </select>
</label>
```

Ajustar o grid do form para caber `cargo`, `uf`, `ordem` e o botao sem quebrar mobile.

**Step 2: Keep ordering reflected in the rendered table**

Nao mudar `RankingTable.tsx` a menos que precise de rótulo extra. A tabela deve receber `dataset.entries` ja ordenado e continuar emitindo `data-pf-ranking-position` conforme a ordem renderizada.

**Step 3: Run lint and build**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS nos dois comandos.

**Step 4: Manual sanity check**

Com o servidor local rodando, abrir:

```text
/rankings/gastos-parlamentares
/rankings/gastos-parlamentares?ordem=asc
/rankings/gastos-parlamentares?cargo=Governador&uf=SP&ordem=asc
```

Expected:
- o controle mostra a ordem atual
- a tabela inverte a ordem visivel
- `null` continuam no final
- a URL canonica nao muda

**Step 5: Commit**

```bash
git add src/app/rankings/[slug]/page.tsx
git commit -m "feat: add ranking sort order control"
```

### Task 4: Validacao final e log de execucao

**Files:**
- Modify: `docs/plans/2026-04-05-ranking-tematico.md`
- Verify: `scripts/release-verify.ts`

**Step 1: Re-run proportional validation**

Run:

```bash
npm run test
npm run check:scripts
npm run lint
npm run build
npm run audit:release-verify
```

Expected:
- rankings seguem verdes
- qualquer falha residual fora de rankings fica registrada explicitamente

**Step 2: Update the feature doc with the execution result**

Acrescentar em `docs/plans/2026-04-05-ranking-tematico.md`:

```md
- Fase 6 executada com suporte a `ordem=asc|desc`
- canonical mantida em `desc`
- variantes `asc` tratadas como `noindex`
- validacoes executadas e resultado do release-verify
```

**Step 3: Review diff scope**

Run:

```bash
git diff --stat
```

Expected: diffs concentrados em `src/lib/rankings.ts`, `src/app/rankings/[slug]/page.tsx`, `tests/rankings.test.ts` e doc/log.

**Step 4: Commit**

```bash
git add docs/plans/2026-04-05-ranking-tematico.md src/lib/rankings.ts src/app/rankings/[slug]/page.tsx tests/rankings.test.ts
git commit -m "feat: add expanded ranking ordering"
```

---

## Registro de Execucao

### Status (2026-04-05)

**Ambiente:** Worktree isolado em `.worktrees/ranking-ordenacao-expandida` (branch `ranking-ordenacao-expandida`)

**Tarefas concluidas:**

#### Task 1: Contrato puro de ordenacao e query ✅
- [x] Testes criados: `normalizes ranking sort order and query state`, `sorts ascending`, `builds ranking paths`
- [x] Testes falharam conforme esperado (3 falhas: helpers ausentes)
- [x] Implementacao minima em `src/lib/rankings.ts`:
  - `export type RankingSortOrder = "desc" | "asc"`
  - `export interface RankingViewState extends RankingFilters`
  - `export function normalizeRankingViewState()`
  - `sortRankingEntries()` parametrizado com `sortOrder`
  - `export function buildRankingPath()`
- [x] Testes passaram: 9/9 passando
- [x] Arquivos criados no worktree:
  - `src/lib/rankings.ts` (helpers de ordenacao)
  - `src/data/ranking-definitions.ts` (definicoes de rankings)
  - `tests/rankings.test.ts` (suite de testes)

#### Task 2: Integrar `ordem` na page individual e metadata ✅
- [x] Page refatorada para usar `normalizeRankingViewState()`
- [x] `searchParams` atualizado para aceitar `ordem?: string`
- [x] Metadata atualizada com `orderLabel` no titulo e descricao
- [x] `itemListOrder` dinamico no JSON-LD (asc/desc)
- [x] `sortRankingEntries()` aplicado no dataset da page
- [x] Componentes criados: `RankingTable.tsx`, `ShareButtons.tsx`
- [x] API de rankings portada para `src/lib/api.ts`:
  - `getRankingDataResource()`
  - `getRankingData()`
  - Helpers internos: `toRankingCandidateSummary`, `toRankingFieldCandidate`, etc.

#### Task 3: Controle de ordenacao na UI ✅
- [x] Campo `ordem` adicionado ao form (`<select name="ordem">`)
- [x] Grid do form ajustado para caber cargo + uf + ordem + botao
- [x] Exibicao do `orderLabel` no hero da page
- [x] `RankingTable.tsx` mantida sem mudancas (recebe entries ja ordenados)
- [x] `shareTitle` atualizado com orderLabel

#### Task 4: Validacao (pendente)
- [ ] `npm run test` - validar suite completa
- [ ] `npm run lint` - verificar estilo
- [ ] `npm run build` - verificar compilacao
- [ ] `npm run check:scripts` - verificar scripts
- [ ] Atualizar `docs/plans/2026-04-05-ranking-tematico.md`

### Arquivos modificados/criados no worktree

```
src/lib/rankings.ts                    # helpers de ordenacao expandida
src/data/ranking-definitions.ts        # definicoes dos rankings MVP
tests/rankings.test.ts                 # testes TDD (9 casos)
src/lib/api.ts                         # + getRankingDataResource() e helpers
src/components/RankingTable.tsx        # tabela/cards de ranking
src/components/ShareButtons.tsx        # botoes de compartilhamento
src/app/rankings/[slug]/page.tsx       # page individual com ordenacao
```

### Proximos passos

1. Rodar validacoes finais (`test`, `lint`, `build`)
2. Promover para branch principal se validacoes passarem
3. Atualizar documentacao de feature no `ranking-tematico.md`
