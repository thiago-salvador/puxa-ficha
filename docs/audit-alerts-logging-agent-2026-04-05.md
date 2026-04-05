# Auditoria de execução — Alertas por email (logging + documentação)

**Data**: 2026-04-05  
**Escopo**: trabalho feito pelo agente para (1) auditoria textual da feature no repositório, (2) documentação consolidada no plano, (3) logging estruturado server-side, (4) testes e (5) verificação manual assistida.

Este arquivo existe para você **revisar commit, diff e operação** sem depender do histórico do chat.

---

## 1. Objetivos entregues

| Objetivo | Resultado |
|----------|-----------|
| Inventário de tudo que menciona “alertas” | Consolidado no plano (`docs/plans/2026-04-05-alerts-email-mvp.md`, seção “Auditoria completa”), separando **email** vs **pontos de atenção / UI / quiz** |
| Plano atualizado | Mesmo arquivo: tabelas de arquivos, homônimos, lacunas, logging operacional, checklist marcado |
| Logs em runtime | JSON de uma linha no stdout (`service: "pf-alerts"`) em todas as respostas HTTP das rotas `/api/alerts/*` + eventos do digest + transporte Resend |
| Testes automatizados | `tests/alerts-log.test.ts` |
| Verificação | `npm test` (80/80) e requisição real à rota `subscribe` com body `{}` mostrando log `invalid_payload` |

---

## 2. Arquivos criados (novos)

| Caminho | Função |
|---------|--------|
| `src/lib/alerts-log.ts` | `logAlertsEvent`, `logAlertsApiExit`; JSON por linha; **sem** `import "server-only"` (ver seção 5) |
| `tests/alerts-log.test.ts` | Garante formato JSON e campos de `logAlertsApiExit` |
| `docs/audit-alerts-logging-agent-2026-04-05.md` | Este registro de auditoria |

---

## 3. Arquivos modificados (somente linha de trabalho “alertas + log”)

Para isolar em um commit, o conjunto mínimo esperado é:

- `docs/plans/2026-04-05-alerts-email-mvp.md`
- `src/lib/alerts-log.ts` (novo)
- `src/lib/email.ts`
- `src/app/api/alerts/subscribe/route.ts`
- `src/app/api/alerts/verify/route.ts`
- `src/app/api/alerts/me/route.ts`
- `src/app/api/alerts/toggle/route.ts`
- `src/app/api/alerts/delete-data/route.ts`
- `src/app/api/alerts/unsubscribe-all/route.ts`
- `src/app/api/alerts/send-digest/route.ts`
- `tests/alerts-log.test.ts` (novo)

**Nota:** o working tree do repositório pode conter **muitas outras** alterações não relacionadas (quiz, timeline, ingest, etc.). Este documento **não** as reivindica; filtre pelo diff dos caminhos acima ao auditar.

---

## 4. Comportamento do logging (contrato)

- **Prefixo lógico**: cada linha é um objeto JSON com `service: "pf-alerts"` (rotas) ou `route: "email-transport"` no payload de eventos do Resend em `email.ts`.
- **Evento de saída HTTP**: `event: "http_exit"`, `httpStatus`, `detail.reason` (string estável para filtro em logs).
- **Digest** (`send-digest`): além de `http_exit`, eventos `batch_start`, `subscriber_skipped`, `subscriber_step_failed`, `digest_email_sent`, `digest_email_failed`.
- **Email** (`sendTransactionalEmail`): `resend_missing_api_key`, `resend_request_failed`, `resend_accepted` (com `messageId` quando OK).
- **Proibido intencionalmente nos `detail`**: email integral, tokens, segredos. Permitido: `candidateSlug`, `subscriberId` (UUID), contagens, mensagens de erro truncadas.

---

## 5. Decisões e tentativas (para auditoria de processo)

1. **`import "server-only"` em `alerts-log.ts`**: inicialmente considerado; o pacote npm `server-only`, quando resolvido pelo Node em `tsx --test`, **lança sempre** (não é o stub do Next). **Solução**: não usar `server-only` em `alerts-log.ts`; comentário no arquivo restringe uso a rotas API e `email.ts`.
2. **`npm install server-only`**: foi executado em uma iteração e **desfeito** com `npm uninstall server-only` após constatar o throw no teste. O `package.json` final **não** deve listar `server-only` como dependência direta por causa deste trabalho (confirmar com `git diff package.json` no seu branch).
3. **Porta no dev server**: na verificação assistida, o servidor subiu em **3017** para evitar conflito com outro processo na 3000; o `curl` foi contra `http://localhost:3017`. Comportamento da rota idêntico ao da 3000.

---

## 6. Comandos executados (evidência)

| Comando | Resultado esperado / obtido |
|---------|-----------------------------|
| `npm test` | `tests 80`, `pass 80`, `fail 0` (inclui suíte `alerts-log`) |
| `npm run build` | Build Next concluído com sucesso (avisos de `fetch failed` ao Supabase durante SSG são ambientais se offline) |
| `npx next dev --turbopack -p 3017` (background) + `curl -s -X POST http://localhost:3017/api/alerts/subscribe -H "Content-Type: application/json" -d "{}"` | Resposta JSON `{"error":"Invalid payload"}`; no stdout do Next, linha contendo `"service":"pf-alerts"` e `"route":"subscribe"` e `"reason":"invalid_payload"` |

---

## 7. O que não foi feito neste escopo

- Remoção dos logs (são **definição de produto** para observabilidade, não instrumentação temporária de debug).
- E2E completo com inbox real (subscribe → email → verify → digest); continua pendência operacional no plano.
- ~~Atualização de `CLAUDE.md` / `AGENTS.md` com env vars de alertas~~ — **corrigido em 2026-04-05**: 6 env vars adicionadas (`RESEND_API_KEY`, `CRON_SECRET`, `PF_ALERTS_TOKEN_ENCRYPTION_KEY`, `PF_ALERTS_TOKEN_SALT`, `PF_ALERTS_IP_SALT`, `PF_ALERTS_FROM_EMAIL`).
- `/alertas/*` no `sitemap.ts` — **não aplicável**: as páginas usam `robots: { index: false, follow: false }` (transacionais com token); incluí-las no sitemap seria contraditório.

---

## 8. Checklist rápido para sua revisão

- [ ] `git diff docs/plans/2026-04-05-alerts-email-mvp.md` — auditoria + logging + checklist
- [ ] `git diff src/lib/alerts-log.ts` — política e API de log
- [ ] `git diff src/lib/email.ts` — três eventos Resend
- [ ] `git diff src/app/api/alerts/` — `logAlertsApiExit` / `logAlertsEvent` em cada rota
- [ ] `git diff tests/alerts-log.test.ts`
- [ ] Rodar localmente: `npm test` e um `curl` vazio em `subscribe` e grep `pf-alerts` no terminal do dev

---

## 9. Referência cruzada

- Plano canônico da feature: `docs/plans/2026-04-05-alerts-email-mvp.md`
- Migração SQL: `supabase/migrations/20260406150000_alerts_email_mvp.sql` (não alterada por este trabalho de logging)
