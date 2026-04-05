# Plano: alinhamento Git, Vercel, Supabase e higiene do repo

**Atualizado:** 2026-04-05 (iteração com feedback do time)

## Diagnóstico confirmado

- Working tree: ~98 alterações (64 modificados + 34 não rastreados), fora do histórico publicado.
- `HEAD` = `origin/main` (ex.: `6fa2f96`) — histórico remoto sincronizado; **produção na Vercel só reflete commits deployados**, não o disco local.
- Branches locais: 6 já incorporadas em `main` (ahead = 0, merge-base confirma); **1 branch com trabalho pendente:** `codex/add-vercel-analytics-20260401` (commit `9f30aff` — Vercel Analytics). O `main` commitado **ainda não** inclui `@vercel/analytics` nem `<Analytics />`; o WIP local espelha esse commit.

## Prioridade e ordem

1. **Ship:** integrar WIP em `main` com commits/PRs **agrupados por feature** (rollback claro).
2. **Verify:** paridade SHA deploy produção ↔ `origin/main`, env, migrations Supabase, `npm run audit:release-verify:prod` com `VERIFY_URL` canônico.
3. **Sanitize:** remoções diretas com mensagens descritivas (`chore:` / `docs:`) — **sem pasta `archive/`** para texto versionado; o Git já preserva histórico.
4. **Reorganizar `docs/`:** **adiado** até a Parte 1 fechada; depois incremental (uma pasta por vez + grep de links em `CLAUDE.md`, `AGENTS.md`, `docs/dev-playbook.md`, planos).

## Parte 1 — Paridade Git ↔ Vercel ↔ Supabase

- Registrar em `docs/ops/deploy-parity-YYYY-MM-DD.md`: SHA de `origin/main`, SHA do último deploy de **Production** na Vercel, branch de produção, checklist de variáveis (só nomes, sem valores).
- Conferir migrations aplicadas no Supabase de produção vs `supabase/migrations/`.
- Smoke: `VERIFY_URL=https://… npm run audit:release-verify:prod` (e repetir em Preview se usar PRs).

## Parte 2 — Sanitização (sem quarentena de código)

- Remover docs/scripts obsoletos com **delete + commit** explícito; recuperação via `git checkout <sha> -- path`.
- Quarentena/arquivo separado faz sentido para **dados grandes ou sensíveis**, não para markdown/scripts já versionados.
- Tratar artefatos gerados: `scripts/release-verify-*.json|md` estão no `.gitignore` mas ainda podem estar **trackeados** — usar `git rm --cached` e parar de versionar.

## Parte 3 — Branches

- **Lote:** `git branch -d` nas 6 branches já mergeadas em `main` (falha segura se ainda houver trabalho não mergeado).
- **Exceção:** `codex/add-vercel-analytics-20260401` — **cherry-pick** `9f30aff` para `main` (equivalente a merge de uma linha única) ou merge da branch; depois apagar a branch local.

## Parte 4 — Agrupamento do WIP (~4 commits / PRs)

Ordem sugerida (dependências → features de produto):

| # | Grupo | Escopo principal |
|---|--------|------------------|
| 1 | Pipeline / ingest | `.github/workflows/ingest.yml`, `scripts/ingest-all.ts`, `scripts/lib/ingest-camara.ts`, `scripts/lib/types.ts`, `scripts/lib/camara-incremental-guards.ts`, `scripts/lib/pontos-atencao-dates.ts`, scripts de backfill/recalc/smoke camara, `scripts/schema.sql`, `scripts/seed*.sql`, `scripts/seed-posicoes-declaradas.ts`, `data/candidatos.json`, migrations `pontos_atencao`, `clear_invalid_camara_*`, docs de ingest (`docs/*ingest*.md`, `docs/ingest-logs-index.md`), testes `camara-incremental-guards`, `pontos-atencao-dates`, hunks de `package.json` / lock só desses scripts |
| 2 | Timeline visual | `src/components/timeline/*`, `src/lib/timeline-utils.ts`, `tests/timeline-utils.test.ts`, `CandidatoFichaView` / `CandidatoProfileSections` se só timeline, `docs/plans/2026-04-04-timeline-visual.md`, hunks em `src/lib/types.ts` / `mock.ts` se dedicados à timeline |
| 3 | Alertas email | `src/app/api/alerts/*`, `src/lib/email.ts`, `src/lib/alerts-log.ts`, `tests/alerts-log.test.ts`, `.env.example`, `docs/plans/2026-04-05-alerts-email-mvp.md`, `docs/audit-alerts-logging-agent-2026-04-05.md`, hunks `AGENTS.md` / `CLAUDE.md` / `dev-playbook` focados em alertas |
| 4 | Quiz + short links | `src/app/quiz/**`, `src/app/api/quiz/**`, `src/app/quiz/r/**`, componentes quiz, `src/lib/quiz-*`, `src/data/quiz/**`, `tests/quiz-*`, `playwright.quiz-og.config.ts`, `playwright.config.ts` / `tests/visual/quiz-resultado-og.spec.ts`, migration `quiz_short_links`, `votacao_chave_marco_temporal_quiz`, `scripts/check-quiz-votacoes-chave.ts`, docs/planos de quiz e `audit-quiz-docs-governance`, planos ranking se forem só documentação de produto |

**Cross-cutting:** `package.json` / `package-lock.json` — aplicar com `git add -p` por commit ou acumular scripts por grupo. **Vercel Analytics:** integrar via cherry-pick **antes** ou no último commit (layout + dependência já no mesmo grupo que toca `layout.tsx`).

## Parte 5 — Trilha de log

- Este arquivo: plano estável.
- `docs/ops/2026-04-05-execution-log.md`: append por tarefa (comando, resultado, SHA, notas).
- Após paridade: `docs/ops/deploy-parity-YYYY-MM-DD.md`.

## O que não fazer agora

- Mover obsoleto para `archive/` no repo (duplica história).
- Reorganização ampla de `docs/` antes do ship + verify.
