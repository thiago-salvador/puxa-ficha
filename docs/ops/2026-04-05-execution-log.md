# Log de execução — 2026-04-05

Registro cronológico das tarefas do plano em `2026-04-05-alignment-sanitization-plan.md`.

---

## T0 — Criação de `docs/ops/` e plano consolidado

- **Ação:** Adicionados `docs/ops/2026-04-05-alignment-sanitization-plan.md` e este log.
- **Resultado:** OK.

---

## T1 — Limpeza de branches locais mergeadas

- **Ação:** `git branch -d` em lote nas 6 branches com ahead=0 e ancestral em `main`.
- **Resultado:**
  - Removidas: `claude/peaceful-dubinsky`, `codex/publish-hardening-ops-20260403`, `codex/total-audit-reliability-20260402`, `feat/auditoria-factual`.
  - **Bloqueadas por worktree** (Git recusou `-d`): `claude/silly-khayyam` (`.claude/worktrees/silly-khayyam`), `codex/review-pr5-merge-20260403` (`PuxaFicha-review-pr5`), `codex/add-vercel-analytics-20260401` (`PuxaFicha-vercel-analytics`). Remover worktree ou `git worktree remove` antes de apagar essas branches.

---

## T2 — Integrar Vercel Analytics (`9f30aff`)

- **Ação:** `git stash push -u`, `git cherry-pick 9f30aff`, resolução de conflito em `src/app/layout.tsx` (manter `Viewport` + import `Analytics`), `git stash pop`.
- **Resultado:** Commit `94cecc8` (mensagem original *Add Vercel Analytics*). Dependência `@vercel/analytics` e `<Analytics />` em `layout.tsx`.

---

## T3–T6 — Commits agrupados (pipeline → timeline → alerts → quiz)

- **Ação:** Commits por feature; `package.json` / lock concentrados no último grupo (quiz).
- **Resultado (SHAs em ordem):**
  1. `913c9cf` — `docs(ops): plano de alinhamento Git/Vercel e log de execucao`
  2. `2dc4f50` — `chore: stop tracking release-verify generated artifacts`
  3. `5b912fa` — `feat(ingest): camara incremental guards, pontos data_referencia, ingest docs`
  4. `e08519c` — `feat(timeline): refinamentos UI e utilitarios da linha do tempo`
  5. `c185908` — `feat(alerts): logging estruturado e ajustes nas rotas de email`
  6. `84db6ee` — `feat(quiz): short links, financiamento no score, votacoes-chave e OG`
  7. `47854bb` — `docs(ops): template de checklist deploy-parity pos-push`

---

## T7 — Pós-commit: build e testes

- **Ação:** `npm test`, `npm run build`.
- **Resultado:** `npm test` — 80 testes passando. `npm run build` — **exit 0** (~34s, Next 15.5.14 Turbopack). `npm run lint` não rodado nesta rodada (debito opcional).

---

## T8 — Paridade deploy (manual + template)

- **Ação:** Criado [`deploy-parity-2026-04-05-TEMPLATE.md`](deploy-parity-2026-04-05-TEMPLATE.md) para preenchimento após `git push` e conferência Vercel/Supabase.
- **Resultado:** `git push origin main` concluído (integração do WIP + docs ops). Para paridade: rodar `git fetch && git rev-parse origin/main` e igualar ao SHA exibido no deploy **Production** da Vercel; registrar em [`deploy-parity-2026-04-05-TEMPLATE.md`](deploy-parity-2026-04-05-TEMPLATE.md).

---

## T9 — Limpeza de worktrees e branches bloqueadas

- **Ação:** `git worktree remove --force` em 3 worktrees (`silly-khayyam`, `vercel-analytics`, `review-pr5`); depois `git branch -d`/`-D` nas branches associadas.
- **Resultado:** Removidas todas. Branch `codex/add-vercel-analytics-20260401` usou `-D` (cherry-pick, não merge). Apenas `main` permanece.

---

## T10 — `git rm --cached` de 8 artifacts release-verify

- **Ação:** 8 arquivos `release-verify-*` ainda estavam trackeados apesar do `.gitignore`. Commit `2dc4f50` só removeu 2 dos 10 originais.
- **Resultado:** Commit `524872b` remove os restantes. Push para `origin/main` concluído.

---

## T11 — Lint e testes pós-cleanup

- **Ação:** `npm run lint` (exit 0), `npm test` (80/80 pass).
- **Resultado:** Nenhuma regressão introduzida pela remoção dos artifacts.

---

## T12 — Deploy parity preenchido

- **Ação:** Criado `docs/ops/deploy-parity-2026-04-05.md` com SHA, status CI, env vars, migrations.
- **Resultado:** `origin/main` = `524872b`. Vercel auto-deploy pendente (push recém feito). CI: Auditoria factual falha por 2 candidatos com dados de partido inconsistentes (`dr-daniel`, `dr-fernando-maximo`), não é regressão de código.

---

## Pendências

- **`.vscode/`** permanece não rastreado (decisão do time: commitar settings compartilhados ou ignorar).
- **Auditoria factual CI:** `dr-daniel` e `dr-fernando-maximo` com `partido_sigla`/`partido_atual` inconsistentes. Requer correção de dados no Supabase ou curadoria manual.
- **Migrations Supabase prod:** conferir se as 3 mais recentes (`alerts_email_mvp`, `clear_invalid_camara_proposicao_id`, `votacao_chave_marco_temporal_quiz`) foram aplicadas.
- **Reorganização de `docs/`:** adiada (Parte 4 do plano).
