# Auditoria de integridade dos releases anteriores

- Gerada em: 2026-08-31T12:03:46.717Z
- Resultado: **PASS COM LIMITAÇÕES**
- Provas: 8 pass, 0 fail, 3 unavailable
- Política: consulta remota read-only; ausência de evidência nunca conta como pass.

| Prova | Estado | Coletada em | Fonte | SHA | Comando | Resultado ou limitação |
|---|---|---|---|---|---|---|
| public-deployment-identity | pass | 2026-08-31T11:57:17.534Z | https://puxaficha.com.br/api/deployment-info | 7f462c92c81ef61903f775483cf10fdfaf53224b | `GET /api/deployment-info` | Public alias serves production/main SHA 7f462c92c81e |
| complete-public-smoke | pass | 2026-08-31T11:57:17.689Z | public routes, APIs, accessibility and pesquisas | 7f462c92c81ef61903f775483cf10fdfaf53224b | `npm run release:smoke` | Deployment proof plus launch, search, a11y and pesquisas smokes passed |
| known-historical-regressions | pass | 2026-08-31T12:03:32.968Z | public SHA source tree | 7f462c92c81ef61903f775483cf10fdfaf53224b | `git show <public-sha>:<fixed-files>` | Both known historical false-green regressions are fixed in the deployed SHA |
| github-open-state | pass | 2026-08-31T12:03:32.992Z | GitHub thiago-salvador/puxa-ficha | 7f462c92c81ef61903f775483cf10fdfaf53224b | `gh api open pulls and issues` | Zero open pull requests and zero open issues at collection time |
| github-public-sha-checks | pass | 2026-08-31T12:03:33.719Z | GitHub checks and workflow runs for thiago-salvador/puxa-ficha | 7f462c92c81ef61903f775483cf10fdfaf53224b | `gh api commit checks, statuses and runs for <public-sha>` | 19 latest checks, 1 latest statuses and 9 latest workflows are green |
| supabase-specialized-workflow-receipts | pass | 2026-08-31T12:03:35.584Z | GitHub production migration workflows | 7f462c92c81ef61903f775483cf10fdfaf53224b | `gh api latest workflow_dispatch runs for five migration-specific workflows` | 5 migration-specific apply, ledger and readback workflow receipts are green |
| vercel-production-deployment | pass | 2026-08-31T12:03:38.134Z | Vercel production alias | 7f462c92c81ef61903f775483cf10fdfaf53224b | `vercel inspect https://puxaficha.com.br --json` | READY production deployment dpl_B483gm5CZwcF7REXtUxKDG37rzrf owns puxaficha.com.br |
| vercel-runtime-log-availability | pass | 2026-08-31T12:03:41.232Z | Vercel runtime logs, last 24 hours | 7f462c92c81ef61903f775483cf10fdfaf53224b | `vercel logs --project puxa-ficha --environment production --since 24h --limit 20 --json` | 20 retained runtime entries are available with zero HTTP 5xx |
| supabase-migration-ledger | unavailable | 2026-08-31T12:03:46.451Z | Supabase PostgreSQL migration ledger | 7f462c92c81ef61903f775483cf10fdfaf53224b | `psql read-only ledger audit:ledger:gate` | Supabase database credential is absent |
| supabase-release-invariants | unavailable | 2026-08-31T12:03:46.452Z | Migration-specific production readbacks | 7f462c92c81ef61903f775483cf10fdfaf53224b | `psql default_transaction_read_only=on -f <manifest-readback>` | Supabase database credential is absent |
| sentry-evidence | unavailable | 2026-08-31T12:03:46.452Z | Sentry project issues | 7f462c92c81ef61903f775483cf10fdfaf53224b | `GET Sentry unresolved issues API` | Sentry credential was rejected by the read-only issues API |

## Limitações explícitas

- supabase-migration-ledger: Supabase database credential is absent
- supabase-release-invariants: Supabase database credential is absent
- sentry-evidence: Sentry credential was rejected by the read-only issues API

## Interpretação

- Nenhuma prova executada divergiu. Itens unavailable permanecem fora da garantia e exigem nova coleta quando a fonte estiver acessível.
