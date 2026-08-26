# Programa de Governo Presidencial 2026 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publicar, para candidaturas presidenciais de 2026, um resumo por IA revisado na Visão geral e o texto integral pesquisável em uma aba Programa, com fonte oficial do TSE e publicação fail-closed.

**Architecture:** Manter um manifesto editorial pequeno para a Visão geral e registros integrais separados por candidatura. A ficha recebe somente o manifesto; a aba busca o texto aprovado em uma rota pública com cache e rate limit. Coleta, extração e geração por IA acontecem fora do runtime, produzem rascunhos versionáveis e exigem revisão humana antes de qualquer estado `aprovado`.

**Tech Stack:** Next.js App Router, React 19, TypeScript, JSON versionado, Node test runner, Playwright, Axe, scripts Node/tsx, utilitários locais `pdfinfo` e `pdftotext` somente na ingestão.

**Dependencies:** Tasks 1 and 2 block all implementation. Task 4 depends on Task 3. Tasks 5 and 6 depend on Task 4. Task 7 depends on Tasks 3 through 6. Task 8 depends on the human review gate in Task 7.

---

### Task 1: Freeze the eval and Unlazy ledger

**Files:**
- Create: `docs/operations/programas-governo-presidencia-eval.md`
- Modify: `GATES.md`

**Step 1: Write the acceptance eval**

Define binary criteria for source identity, extraction completeness, summary fidelity, publication states, lazy loading, route behavior, UI, accessibility, scope and cost. Use deterministic graders except for summary fidelity, which uses a model family different from the generator and permits `unknown`.

**Step 2: Lint the eval**

Run:

```bash
python3 /Users/thiagosalvador/.claude/skills/eval/scripts/eval_lint.py docs/operations/programas-governo-presidencia-eval.md
```

Expected: exit 0 and no framework violation.

**Step 3: Create the solo gate ledger**

Translate every acceptance-changing criterion into a gate with an observable outcome. Give each runnable gate a reviewed `CHECK`, a success-only `EXPECT`, and pending evidence. Keep the human review as a manual gate.

**Step 4: Parse and lint without executing**

Run:

```bash
node /Users/thiagosalvador/.claude/skills/unlazy/scripts/gate-check.mjs --status GATES.md
node /Users/thiagosalvador/.claude/skills/unlazy/scripts/gate-lint.mjs GATES.md
```

Expected: a valid ledger, zero malformed gates and `LINT OK`.

**Step 5: Commit the planning artifacts**

```bash
git add GATES.md docs/plans/2026-08-25-programa-governo-presidencia-implementation.md docs/operations/programas-governo-presidencia-eval.md
git commit -m "docs: plan presidential government programs"
```

### Task 2: Establish the source registry and domain schema

**Files:**
- Create: `src/lib/programa-governo.ts`
- Create: `scripts/data/programas-governo-presidencia-2026-fontes.json`
- Create: `tests/programa-governo-schema.test.ts`
- Modify: `package.json`

**Step 1: Write failing schema tests**

Cover:

- the five approved editorial states;
- presidential year and office invariants;
- strict `SQ_CANDIDATO` matching;
- TSE domain allowlist for direct PDF and dataset URLs;
- 64-character lowercase SHA-256 values;
- page ranges and stable section ids;
- 120 to 180 words and four to six themes only for approved or review-pending summaries;
- evidence attached to every theme and every material summary sentence;
- approval requiring review date, source hash and extracted-text hash;
- a changed source hash invalidating prior approval;
- public conversion removing reviewer identity and generation internals not intended for the browser.

Run:

```bash
node --conditions react-server --import tsx --test tests/programa-governo-schema.test.ts
```

Expected: FAIL because the schema module does not exist.

**Step 2: Implement the minimal domain types and validators**

Create explicit types for:

```ts
type ProgramaGovernoEstado =
  | "nao_coletado"
  | "fonte_ausente"
  | "extracao_falhou"
  | "aguardando_revisao"
  | "aprovado"
```

Add small-manifest, full-record, section, evidence, generation and public DTO types. Implement validators that throw a path-specific error and public converters that fail closed.

**Step 3: Add the source registry**

Seed one row per official presidential candidature with a resolved PuxaFicha slug when available, `SQ_CANDIDATO`, official TSE document URL, dataset URL, collection timestamp and current editorial state. Rows without a safely resolved public profile remain recorded but cannot be published.

**Step 4: Make the source registry test prove current identity**

Compare the registry against the authoritative 2026 presidential rows already versioned in `supabase/migrations/20260816011000_chapas_2026_tse_pos_registro.sql`. Reject name-only matching, missing official candidates and duplicate `SQ_CANDIDATO` values.

**Step 5: Run the schema suite**

Run:

```bash
node --conditions react-server --import tsx --test tests/programa-governo-schema.test.ts
```

Expected: PASS with a unique success marker `PROGRAMAS_SCHEMA_PASS`.

**Step 6: Commit**

```bash
git add src/lib/programa-governo.ts scripts/data/programas-governo-presidencia-2026-fontes.json tests/programa-governo-schema.test.ts package.json
git commit -m "feat: define government program source contract"
```

### Task 3: Build deterministic PDF extraction and review packets

**Files:**
- Create: `scripts/lib/programas-governo-extracao.ts`
- Create: `scripts/programas-governo-presidencia.ts`
- Create: `scripts/prompts/programa-governo-resumo-v1.md`
- Create: `tests/fixtures/programas-governo/textual.pdf`
- Create: `tests/fixtures/programas-governo/scan-sem-texto.pdf`
- Create: `tests/programa-governo-extracao.test.ts`
- Modify: `package.json`

**Step 1: Write failing extraction tests**

Exercise a textual PDF and a no-text control. Require:

- temporary workspace outside the repository;
- SHA-256 measured from PDF bytes;
- page count from `pdfinfo`;
- text split by page from `pdftotext`;
- preserved page order, paragraphs and list markers;
- deterministic section ids and extracted-text hash;
- explicit `extracao_falhou` when a page is missing or text is not trustworthy;
- no downloaded PDF or temporary text left inside the worktree;
- refusal of non-TSE URLs before network access.

Run:

```bash
node --conditions react-server --import tsx --test tests/programa-governo-extracao.test.ts
```

Expected: FAIL because the extractor does not exist.

**Step 2: Implement extraction behind injectable adapters**

Keep network, command execution and clock injectable. Production adapters may call `pdfinfo` and `pdftotext`; tests use fixtures and fake network. Do not add a runtime PDF dependency to the Next.js application.

**Step 3: Implement dry-run and review packet commands**

Support:

```bash
npm run data:programas-governo -- --dry-run
npm run data:programas-governo -- --slug=<slug> --extract
npm run data:programas-governo -- --slug=<slug> --review-packet
```

The review packet contains extracted sections, page mapping, prompt version and an empty structured slot for AI output. It never sets `aprovado`.

**Step 4: Store the prompt contract**

Require neutral pt-BR, source-only claims, 120 to 180 words, four to six non-duplicated themes, evidence per claim and structured JSON output. Explicitly forbid feasibility judgments, external knowledge and campaign copy.

**Step 5: Run tests and a source dry-run**

Run:

```bash
npm run test:programas-governo:extracao
npm run data:programas-governo -- --dry-run
```

Expected: both exit 0; the dry-run reports every source classification and performs no repository write.

**Step 6: Commit**

```bash
git add scripts/lib/programas-governo-extracao.ts scripts/programas-governo-presidencia.ts scripts/prompts/programa-governo-resumo-v1.md tests/fixtures/programas-governo tests/programa-governo-extracao.test.ts package.json
git commit -m "feat: extract official government program text"
```

### Task 4: Generate, judge and stage the presidential pilot content

**Files:**
- Create: `src/data/programas-governo/presidencia-2026/<slug>.json` for each safely resolved source
- Create: `src/data/programas-governo-presidencia-2026.ts`
- Create: `scripts/audit/audit-programas-governo.ts`
- Create: `tests/programa-governo-data.test.ts`
- Create: `.codex-local/programas-governo-presidencia-2026/review.html` (local review artifact, ignored)
- Modify: `package.json`

**Step 1: Extract every safely resolved presidential document**

Run the extractor for the official BR cohort. Record absent source, failed extraction and unresolved profile distinctly. Do not promote any output to approved.

**Step 2: Generate summaries with AI**

Use the versioned prompt and only the extracted program text. Record generator provider, model, prompt version, timestamp and evidence anchors. Keep every generated record in `aguardando_revisao`.

**Step 3: Run a different-family binary judge**

For each summary sentence and theme, ask a model family different from the generator whether the claim is supported by the cited page or section. Permit `yes`, `no` or `unknown`. Any `no` or `unknown` blocks review readiness and requires regeneration or correction.

**Step 4: Write the audit before accepting data**

The audit must independently calculate:

- official presidential cohort size;
- resolved, absent, failed and review-pending counts;
- unique `SQ_CANDIDATO` coverage;
- source-domain and hash validity;
- page and section coverage;
- summary word count and theme count;
- evidence completeness;
- zero approved records before human review.

It prints `PROGRAMAS_DADOS_PASS` only after all machine-checkable conditions pass.

**Step 5: Create the local human review artifact**

Generate one accessible HTML page with, for each candidate, the summary, themes, evidence excerpts, page references, source link and extraction diagnostics. Validate the artifact with Playwright. It must not change approval state.

**Step 6: Run data tests**

```bash
npm run audit:programas-governo
node --conditions react-server --import tsx --test tests/programa-governo-data.test.ts
```

Expected: `PROGRAMAS_DADOS_PASS` and tests green with all records still non-public.

**Step 7: Commit the review-pending data**

```bash
git add src/data/programas-governo scripts/audit/audit-programas-governo.ts tests/programa-governo-data.test.ts package.json
git commit -m "data: stage presidential government programs for review"
```

### Task 5: Add the approved-only lazy public route

**Files:**
- Create: `src/lib/programa-governo-server.ts`
- Create: `src/app/api/candidato-profile/[slug]/programa/route.ts`
- Create: `tests/programa-governo-route.test.ts`
- Modify: `tests/candidato-profile-rate-limit.test.ts`
- Modify: `scripts/audit-route-guards.ts`
- Modify: `scripts/audit-public-security-surface.ts`

**Step 1: Write failing route tests**

Cover:

- 200 with only the approved public DTO;
- explicit public status without content for every non-approved state;
- 404 for unknown slug;
- 429 before file loading after the rate limit;
- cache headers on public reads and `no-store` on 429;
- no reviewer identity, internal judge output or prompt body in the response;
- path traversal and malformed slugs rejected;
- full text absent from the parent profile endpoint.

Run:

```bash
node --conditions react-server --import tsx --test tests/programa-governo-route.test.ts tests/candidato-profile-rate-limit.test.ts
```

Expected: FAIL because the route does not exist and the route count remains three.

**Step 2: Implement server-only loading**

Use an explicit slug-to-loader map. Validate the stored record again on load. Return content only when `estado === "aprovado"`; all other states return metadata without summary or full text.

**Step 3: Implement the route**

Follow the existing sibling route pattern: fixed-window IP limit before loading, public cache headers, deterministic status mapping and public DTO conversion.

**Step 4: Update cross-route security audits**

Change the rate-limit contract from three to four read routes and add the new route to guard and public-security audits.

**Step 5: Run route and security tests**

```bash
npm run test:programas-governo:route
npm run audit:route-guards
npm run audit:public-security-surface:gate
```

Expected: all pass with `PROGRAMAS_ROUTE_PASS` from the focused suite.

**Step 6: Commit**

```bash
git add src/lib/programa-governo-server.ts src/app/api/candidato-profile/[slug]/programa/route.ts tests/programa-governo-route.test.ts tests/candidato-profile-rate-limit.test.ts scripts/audit-route-guards.ts scripts/audit-public-security-surface.ts
git commit -m "feat: expose approved government programs lazily"
```

### Task 6: Add the overview card and accessible Programa tab

**Files:**
- Create: `src/components/ProgramaGovernoSection.tsx`
- Modify: `src/lib/candidato-profile-tabs.ts`
- Modify: `src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx`
- Modify: `src/components/DeferredCandidatoProfile.tsx`
- Modify: `src/components/DeferredCandidatoProfileClient.tsx`
- Modify: `src/components/CandidatoProfile.tsx`
- Modify: `tests/candidato-profile-tabs.test.ts`
- Create: `tests/programa-governo-ui.test.tsx`

**Step 1: Write failing component and integration tests**

Require:

- Programa appears only for presidential profiles in the pilot;
- `?tab=programa`, click, keyboard arrows and browser history work;
- the overview card shows summary, four to six themes, AI-reviewed label and both actions only for approved content;
- other states show specific empty copy without leaking draft text;
- selecting the tab performs one lazy request and parent HTML contains no full program text;
- loading, failed fetch, no search result and approved states are distinct;
- search is case-insensitive and accent-insensitive without mutating the source text;
- result count is announced, next and previous result controls work and retain visible focus;
- the table of contents anchors valid heading ids;
- headings, paragraphs, lists and page references render semantically;
- the TSE button identifies that it opens a new tab.

Run:

```bash
node --conditions react-server --import tsx --test tests/candidato-profile-tabs.test.ts tests/programa-governo-ui.test.tsx
```

Expected: FAIL because the tab and components do not exist.

**Step 2: Add the canonical tab id and eligibility rule**

Add `programa` to both visible tab id lists. Filter it with an explicit `programaEnabled` prop, mirroring but not coupling it to `pesquisasEnabled`.

**Step 3: Transport only the small manifest**

Resolve the summary manifest on the server and pass it through the deferred profile components. Do not add full text to `FichaCandidato` or `PublicCandidatoProfileDto`.

**Step 4: Implement the overview card**

Use the existing overview grid contract and data attributes. Render approved summary and themes, or a truthful state-specific notice. Keep long labels and URLs break-safe.

**Step 5: Implement the tab state machine**

Fetch on first activation with `AbortController`, cache the successful result in component state and do not refetch on tab round trips. Render loading, failed and state-specific empty panels before approved content.

**Step 6: Implement accessible search and document rendering**

Preserve the full source text in the DOM. Calculate match locations separately, use semantic `mark` elements for visual highlighting, announce counts politely and provide deterministic result navigation.

**Step 7: Run focused tests**

```bash
npm run test:programas-governo:ui
```

Expected: `PROGRAMAS_UI_PASS` and all focused tests green.

**Step 8: Commit**

```bash
git add src/components/ProgramaGovernoSection.tsx src/lib/candidato-profile-tabs.ts 'src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx' src/components/DeferredCandidatoProfile.tsx src/components/DeferredCandidatoProfileClient.tsx src/components/CandidatoProfile.tsx tests/candidato-profile-tabs.test.ts tests/programa-governo-ui.test.tsx
git commit -m "feat: add presidential government program experience"
```

### Task 7: Prove the real UI and collect human review

**Files:**
- Create: `tests/visual/programa-governo.spec.ts`
- Create: `tests/visual/programa-governo.playwright.config.ts`
- Modify: `package.json`
- Modify: `src/data/programas-governo-presidencia-2026.ts` only after explicit human approval
- Modify: approved candidate JSON records only after explicit human approval

**Step 1: Write the visual test before implementation is declared complete**

On a real presidential route, verify:

- overview card layout at 1440 x 900 and 390 x 844;
- direct `?tab=programa` navigation;
- lazy request happens only after opening the tab;
- table of contents, search and result navigation;
- no horizontal overflow with long unbroken text;
- keyboard tab and arrow navigation;
- external TSE link;
- state-specific empty surface for one non-approved profile;
- Axe has no moderate, serious or critical violations;
- screenshots are produced for overview, tab, mobile and empty state.

**Step 2: Run the visual test against review fixtures**

```bash
npm run test:visual:programas-governo
```

Expected: PASS with screenshots and `PROGRAMAS_VISUAL_PASS`.

**Step 3: Present the human review artifact**

Thiago or an explicitly designated editor reviews each summary and its evidence. Record corrections in the versioned record, regenerate the review artifact and rerun the machine judge after every material text change.

**Step 4: Apply approval only after explicit review**

Set `estado: "aprovado"` and `reviewed_at` only for individually approved records. Leave absent, failed, unresolved or unapproved candidates in their truthful states.

**Step 5: Rerun data, route, UI and visual proof on approved records**

```bash
npm run verify:programas-governo
```

Expected: all focused gates pass against the real approved content.

**Step 6: Commit approved content and visual proof**

```bash
git add src/data/programas-governo tests/visual/programa-governo.spec.ts tests/visual/programa-governo.playwright.config.ts package.json
git commit -m "data: publish reviewed presidential programs"
```

### Task 8: Full verification and final scope audit

**Files:**
- Create: `scripts/audit/verify-programas-governo-scope.mjs`
- Modify: `package.json`
- Update: `GATES.md` evidence only through the Unlazy checker

**Step 1: Add an allowlist-based scope audit**

Fail if the branch changes Supabase migrations, production configuration, unrelated candidate data, polling data, governor program data or any file outside the declared implementation, tests, docs and ledger scope.

**Step 2: Run the positive control and scope audit**

Prove the scope checker rejects a deliberately disallowed fixture path, then run it against the actual diff. Print `PROGRAMAS_SCOPE_PASS` only after both checks behave correctly.

**Step 3: Inspect every Unlazy command before approval**

Run:

```bash
node /Users/thiagosalvador/.claude/skills/unlazy/scripts/gate-check.mjs --status GATES.md
node /Users/thiagosalvador/.claude/skills/unlazy/scripts/gate-lint.mjs GATES.md
```

Read every `CHECK`, `EXPECT`, `CWD` and called script. Do not approve any command that writes remote state, deploys, pushes or merges.

**Step 4: Execute the approved gates sequentially**

Run:

```bash
node /Users/thiagosalvador/.claude/skills/unlazy/scripts/gate-check.mjs --approve GATES.md
```

Expected: every runnable gate exits 0 and matches its success-only marker.

**Step 5: Reverify after the final diff**

Run:

```bash
node /Users/thiagosalvador/.claude/skills/unlazy/scripts/gate-check.mjs --reverify GATES.md
```

Expected: `ALL MET`, zero unmet and zero abandoned gates.

**Step 6: Recheck authorship and diff**

```bash
git config user.name
git config user.email
git diff origin/main...HEAD --check
git status --short
git log --format='%h %an <%ae> %s' origin/main..HEAD
```

Expected: Thiago Salvador is the author, diff check is clean, only expected artifacts remain and no remote action has occurred.

**Step 7: Commit the final verifier**

```bash
git add scripts/audit/verify-programas-governo-scope.mjs package.json
git commit -m "test: gate presidential government programs"
```

No push, pull request, merge, database write or deployment is part of this plan without a separate explicit request.
