# Project Review Report

Date: 2026-03-31

## Executive Summary

The repo is shippable from a build perspective, but it has several high-risk issues in data integrity, privacy exposure, and operational reliability.

The most important problems are:

1. Public candidate rows are too wide and are being shipped to the browser.
2. The data layer silently falls back to mock data on runtime errors.
3. The TSE pipeline is not reliable for the governor scope the product now claims to support.
4. The "idempotent pipeline" claim is not enforced at the database layer.
5. Documentation, README, and some scripts are materially out of sync with the real codebase.

## Verification Performed

- Read app routes, shared data layer, components, scripts, schema, workflow, docs, and repo instructions.
- Ran `npm run lint`.
- Ran `npm run build`.
- Ran `npm outdated`.
- Ran consistency checks between `data/candidatos.json` and `src/data/mock.ts`.

## Findings

### Critical

#### R1. Public candidate rows are overexposed to the client

- Severity: Critical
- Location:
  - `scripts/schema.sql:43`
  - `scripts/schema.sql:53`
  - `scripts/schema.sql:385`
  - `src/lib/api.ts:26`
  - `src/lib/api.ts:69`
  - `src/app/page.tsx:128`
  - `src/app/candidato/[slug]/page.tsx:133`
- Evidence:
  - The public `candidatos` table includes `cpf` and `email_campanha`.
  - RLS opens `SELECT` to everyone.
  - The app queries `select("*")` and passes the returned objects into client components.
- Impact:
  - Even if the UI does not visibly render those fields, they can still be exposed through public Supabase access and serialized React props.
- Fix:
  - Split public and private columns.
  - Query explicit column lists instead of `*`.
  - Use a public view or DTO layer for browser-bound data.

### High

#### R2. Real-mode failures silently switch list pages to mock data

- Severity: High
- Location:
  - `src/lib/api.ts:21`
  - `src/lib/api.ts:36`
  - `src/lib/api.ts:67`
  - `src/lib/api.ts:75`
  - `src/lib/api.ts:127`
  - `src/lib/api.ts:169`
- Evidence:
  - `getCandidatos()` returns `MOCK_CANDIDATOS` on query failure.
  - `getCandidatoBySlug()` does not mirror that behavior and returns `null`.
- Impact:
  - A transient Supabase outage can make list pages serve mock political data while profile pages 404.
  - This is especially dangerous for a public civic product because failure becomes silent misinformation.
- Fix:
  - Use a single failure strategy.
  - Restrict mock fallback to explicit local/dev mode, never production query errors.

#### R3. Static generation is doing excessive Supabase work and already times out

- Severity: High
- Location:
  - `src/app/candidato/[slug]/page.tsx:17`
  - `src/app/candidato/[slug]/page.tsx:43`
  - `src/lib/api.ts:79`
- Evidence:
  - `generateMetadata()` fetches the full candidate record.
  - The page itself fetches the same candidate again and also fetches the sibling candidate list.
  - `getCandidatoBySlug()` fans out into 12 parallel queries.
  - `npm run build` completed, but produced repeated `fetch failed` timeout errors during page generation.
- Impact:
  - Build-time and ISR regeneration are fragile.
  - Timeouts against Supabase can degrade SEO, metadata generation, and cache freshness.
- Fix:
  - Add memoization/cache around candidate fetches.
  - Reduce per-page query fan-out.
  - Precompute aggregates or fetch through narrower views.

#### R4. TSE situacao/CPF matching is name-based and can bind the wrong person

- Severity: High
- Location:
  - `scripts/lib/ingest-tse-situacao.ts:15`
  - `scripts/lib/ingest-tse-situacao.ts:218`
  - `scripts/lib/ingest-tse-situacao.ts:261`
- Evidence:
  - The script falls back through 2026, 2024, 2022, and 2020.
  - Matching is done by normalized candidate name only.
  - There is no cargo, UF, or curated TSE ID guard in the matching step.
  - Repo data currently has `tse_sq_candidato` empty for all 144 entries.
- Impact:
  - Homonyms and municipal candidates from 2024 can leak the wrong CPF, demographics, and campaign email into the wrong record.
- Fix:
  - Make curated TSE IDs mandatory for production ingestion.
  - Reject ambiguous matches instead of accepting name-only matches.

#### R5. The TSE bulk pipeline ignores the governor scope the product advertises

- Severity: High
- Location:
  - `scripts/lib/ingest-tse.ts:175`
  - `scripts/lib/ingest-tse.ts:255`
  - `data/candidatos.json`
- Evidence:
  - The code explicitly processes only `_BR/_BRASIL` files and comments "all candidates are presidential".
  - The curated data currently contains 13 presidential and 131 governor entries.
- Impact:
  - Governor pages are structurally underfilled for patrimonio and financiamento.
  - Product scope and data pipeline scope are out of sync.
- Fix:
  - Process UF files for governor candidates.
  - Stop claiming statewide coverage until this exists.

#### R6. Idempotence depends on app logic, not on the database

- Severity: High
- Location:
  - `scripts/schema.sql:114`
  - `scripts/schema.sql:131`
  - `scripts/schema.sql:276`
  - `scripts/lib/ingest-tse.ts:215`
  - `scripts/lib/ingest-tse.ts:336`
  - `scripts/lib/ingest-camara.ts:101`
  - `.github/workflows/ingest.yml:1`
- Evidence:
  - `patrimonio`, `financiamento`, and `gastos_parlamentares` have lookup-then-insert logic but no matching `UNIQUE` constraints.
  - The workflow has no `concurrency` guard.
- Impact:
  - Concurrent runs or retries can create duplicates.
  - Later `.single()` reads may start failing.
- Fix:
  - Add DB uniqueness on natural keys.
  - Convert inserts to `upsert`.
  - Add workflow concurrency.

### Medium

#### R7. Date formatting is off by one day for bare `YYYY-MM-DD` values in Brazil

- Severity: Medium
- Location:
  - `src/lib/utils.ts:25`
- Evidence:
  - `formatDate()` uses `new Date(dateString)`.
  - Reproduced locally with `TZ=America/Sao_Paulo`: `new Date("2026-03-31")` formats as `30/03/2026`.
- Impact:
  - Candidate pages can display the wrong day for `DATE` columns.
- Fix:
  - Parse date-only strings manually instead of using the JS UTC parser.

#### R8. Governor directory hides real summaries by hardcoding zeros/nulls

- Severity: Medium
- Location:
  - `src/app/governadores/[uf]/page.tsx:41`
- Evidence:
  - The page builds `processos` and `patrimonios` maps with hardcoded defaults and ships them to `CandidatoGrid`.
  - The file itself says "For now, set defaults."
- Impact:
  - Governor cards understate or erase real process and patrimonio signals.
- Fix:
  - Fetch per-state summaries instead of sending placeholders.

#### R9. The process shortcut in the profile overview is broken

- Severity: Medium
- Location:
  - `src/components/ProfileOverview.tsx:352`
  - `src/components/CandidatoProfile.tsx:108`
  - `src/components/CandidatoProfile.tsx:365`
- Evidence:
  - The overview links to tab `"processos"`.
  - The actual tab id is `"justica"`.
- Impact:
  - The CTA does nothing useful and strands users on the wrong section.
- Fix:
  - Use a literal tab union and correct the target id.

#### R10. `ingestTransparencia` does not persist anything despite the docs claiming it does

- Severity: Medium
- Location:
  - `scripts/lib/ingest-transparencia.ts:45`
- Evidence:
  - The function only queries the API, logs a count, increments `rows_upserted`, and exits.
  - There is no insert or update.
- Impact:
  - The source is presented as active, but is effectively a no-op.
- Fix:
  - Either implement a real persistence target or remove it from commands/docs until it exists.

#### R11. The quality gate does not cover the pipeline code

- Severity: Medium
- Location:
  - `eslint.config.mjs:15`
  - `tsconfig.json`
  - `package.json:5`
  - `.github/workflows/ingest.yml`
- Evidence:
  - `scripts/**` is ignored by ESLint.
  - `scripts` is excluded from TypeScript project checking.
  - There is no `test` script.
  - The only workflow is data ingestion; there is no app CI.
- Impact:
  - A large and critical portion of the repo can regress without automated feedback.
- Fix:
  - Add a separate `tsconfig.scripts.json`.
  - Lint scripts.
  - Add at least one CI job for app build/lint and one for script type-checks.

#### R12. Mock mode is inconsistent and incomplete

- Severity: Medium
- Location:
  - `src/lib/api.ts:21`
  - `src/lib/api.ts:129`
  - `src/lib/api.ts:170`
  - `src/data/mock.ts:133`
- Evidence:
  - `getCandidatos()` ignores the cargo filter when `USE_MOCK` is true.
  - `getCandidatosComResumo()` returns zero/null summaries in mock mode.
  - `getCandidatosComparaveis()` returns all mock candidates, not just presidents.
  - Consistency check found 6 slugs present in `data/candidatos.json` but missing in `src/data/mock.ts`.
  - `ratinho-junior` has the wrong `nome_completo` in mock data (`Carlos Lupi`).
- Impact:
  - Local fallback mode is misleading and cannot be trusted as a product preview.
- Fix:
  - Generate mock data from the curated JSON and validate it with a consistency check.

#### R13. External URLs from the database are rendered without protocol validation

- Severity: Medium
- Location:
  - `src/components/SocialLinks.tsx:23`
  - `src/components/SocialLinks.tsx:45`
  - `src/components/CandidatoProfile.tsx:620`
  - `src/components/CandidatoProfile.tsx:676`
- Evidence:
  - `site_campanha`, source links, and law URLs are rendered directly into `href`.
- Impact:
  - A malformed or malicious row can inject `javascript:` or other unsafe schemes.
- Fix:
  - Normalize and allowlist `http`/`https` before rendering.

### Low

#### R14. Metadata and header posture are incomplete

- Severity: Low
- Location:
  - `src/app/layout.tsx:19`
  - `next.config.ts:1`
- Evidence:
  - `metadataBase` is missing.
  - Build emitted repeated warnings and fell back to `http://localhost:3000` for metadata resolution.
  - No security headers or CSP are configured in repo-visible app config.
- Impact:
  - OG/Twitter metadata can resolve incorrectly.
  - Browser hardening is weaker than it should be for a public civic app.
- Fix:
  - Set `metadataBase`.
  - Add baseline headers or verify they are enforced at the edge.

#### R15. Docs are materially stale

- Severity: Low
- Location:
  - `README.md:1`
  - `AGENTS.md:35`
  - `AGENTS.md:72`
  - `AGENTS.md:76`
  - `AGENTS.md:121`
- Evidence:
  - `README.md` is still the default `create-next-app` template.
  - `AGENTS.md` references `recharts`, `motion`, `zod`, `getPartidoColors`, `src/components/profile/`, and "11 tabelas", none of which reflect the current repo state.
- Impact:
  - Onboarding and future automation will reason from false assumptions.
- Fix:
  - Refresh README and AGENTS to match the code that actually exists.

#### R16. There is at least one stale/broken maintenance script that conflicts with repo rules

- Severity: Low
- Location:
  - `scripts/lib/generate-pontos-factuais.ts:6`
  - `scripts/lib/generate-pontos-factuais.ts:81`
  - `scripts/lib/generate-pontos-factuais.ts:122`
  - `scripts/lib/generate-pontos-factuais.ts:137`
- Evidence:
  - The script generates `pontos_atencao` with `gerado_por: "ia"`, which conflicts with the repo's MVP rule against AI editorial analysis.
  - It uses categories not present in the current type model, and queries `total_bens`, while the schema defines `valor_total`.
- Impact:
  - This script is likely stale and unsafe to run.
- Fix:
  - Either delete it or rewrite it against the current schema and product policy.

## Operational Notes

- `npm run lint` passed with warnings only, but it linted local `assets/` files that are supposed to be local-only.
- `npm run build` succeeded, but emitted:
  - multiple `metadataBase` warnings
  - repeated network timeouts during static generation
- `npm outdated` shows the repo is behind latest releases, but the current Next.js version is not obviously on an unsupported security floor.

## Recommended Plan

### Phase 1: Stop the highest-risk failures

1. Remove `select("*")` from browser-bound app queries and create public DTOs/views.
2. Kill silent mock fallback in production code paths.
3. Fix `formatDate()` and the broken `"processos"` tab link.
4. Add protocol validation for all rendered external URLs.

### Phase 2: Repair data correctness

1. Make `tse_sq_candidato` mandatory for TSE joins.
2. Extend TSE ingestion to governor UF files.
3. Add DB `UNIQUE` constraints and convert insert paths to `upsert`.
4. Make the governor state page fetch real summaries.

### Phase 3: Restore tooling credibility

1. Add script lint/type-check coverage.
2. Add app CI.
3. Fix eslint ignore rules for local-only folders.
4. Add consistency checks for mock data and curated candidate data.

### Phase 4: Clean up repo truth

1. Rewrite `README.md`.
2. Refresh `AGENTS.md`.
3. Remove stale scripts and dead dependencies.
4. Decide whether `/styleguide` is internal-only or supported public surface.
