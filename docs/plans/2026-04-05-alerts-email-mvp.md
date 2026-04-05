# Alertas por Email — MVP

**Data**: 2026-04-05
**Status**: Em andamento
**Branch**: main (commit direto, feature autocontida)

## Resumo

Sistema de alertas por email: usuarios podem acompanhar candidatos e receber digest quando houver atualizacoes (processos, mudancas de partido, patrimonio, noticias, pontos de atencao publicados).

## Arquitetura

```
FollowCandidateButton (client)
  ↓ fetch
/api/alerts/subscribe → email de verificacao (Resend)
  ↓ click
/api/alerts/verify → confirm + save manage token (localStorage)
  ↓
/api/alerts/toggle → follow/unfollow candidatos
/api/alerts/me → listar subscriptions
/api/alerts/unsubscribe-all → cancelar todos
/api/alerts/delete-data → apagar cadastro (LGPD)
/api/alerts/send-digest → cron: envia resumo de mudancas (CRON_SECRET)
```

### Tabelas (migration `20260406150000_alerts_email_mvp.sql`)

- `alert_subscribers`: cadastro, email hash, manage token criptografado, verificacao
- `alert_subscriptions`: relacao subscriber ↔ candidato
- `candidate_changes`: log automatico via triggers (processos, mudancas partido, patrimonio, noticias, pontos atencao)
- `notification_log`: deduplicacao de digest por data

### Seguranca

- AES-256-GCM para manage tokens
- SHA-256 para email/token/IP hashing
- `candidatos_publico` view (nunca tabela base)
- RLS nas 4 tabelas
- Rate limit por IP hash no subscribe
- Dev key automatica fora de producao

### Env vars necessarias

- `RESEND_API_KEY` (obrigatorio)
- `CRON_SECRET` (obrigatorio para digest)
- `PF_ALERTS_TOKEN_ENCRYPTION_KEY` (32 bytes hex, obrigatorio em prod)
- `PF_ALERTS_TOKEN_SALT` (opcional, default dev)
- `PF_ALERTS_IP_SALT` (opcional, default dev)
- `PF_ALERTS_FROM_EMAIL` (opcional, default `alertas@puxaficha.com.br`)

## Checklist de implementacao

### Codigo existente (pré-auditoria)

- [x] `src/lib/alerts.ts` — server-only, encryption, Supabase queries
- [x] `src/lib/alerts-shared.ts` — hashing, URL builders, email templates
- [x] `src/lib/alerts-client.ts` — localStorage management
- [x] `src/lib/email.ts` — Resend API transport
- [x] `src/app/api/alerts/subscribe/route.ts`
- [x] `src/app/api/alerts/verify/route.ts`
- [x] `src/app/api/alerts/me/route.ts`
- [x] `src/app/api/alerts/toggle/route.ts`
- [x] `src/app/api/alerts/send-digest/route.ts`
- [x] `src/app/api/alerts/delete-data/route.ts`
- [x] `src/app/api/alerts/unsubscribe-all/route.ts`
- [x] `src/app/alertas/gerenciar/page.tsx`
- [x] `src/app/alertas/verificar/page.tsx`
- [x] `src/components/alerts/AlertVerifyClient.tsx`
- [x] `src/components/alerts/AlertsManageClient.tsx`
- [x] `src/components/alerts/FollowCandidateButton.tsx`
- [x] `supabase/migrations/20260406150000_alerts_email_mvp.sql`
- [x] `tests/alerts.test.ts` — 6/6 passando
- [x] `.env.example` atualizado
- [x] `scripts/schema.sql` ja contem as tabelas + triggers

### Correcoes da auditoria

- [x] Integrar FollowCandidateButton no CandidatoProfile.tsx
- [x] Extrair `stringField` duplicado para alerts-shared.ts
- [x] Lint + build validados
- [x] Commit consolidado
- [x] Auditoria completa + logging operacional documentados neste arquivo
- [x] `src/lib/alerts-log.ts` + logs em todas as respostas das 7 rotas + `sendTransactionalEmail`
- [x] `tests/alerts-log.test.ts`

## Log de sessao

### 2026-04-05 16:11 — Auditoria inicial

Leitura completa dos 17 arquivos. Testes 6/6 OK. Problemas identificados:

1. **FollowCandidateButton nao integrado** no CandidatoProfile (invisivel ao usuario)
2. **`stringField` duplicado** em 5 routes
3. Sem rate limiting em middleware para `/api/alerts/*` (aceito: subscribe tem rate limit proprio)
4. `send-digest` usa `CRON_SECRET` nao documentado em CLAUDE.md
5. Migration depende de `is_public_attention_point()` (ja existe no schema.sql)

### 2026-04-05 16:12 — Correcoes e commit

- Integrado FollowCandidateButton na tab "geral" do CandidatoProfile (apos overview, antes de noticias)
- Extraido `alertBodyStringField` para alerts-shared.ts, removido de 5 routes
- Testes: 78/78 (6 alerts + 72 existentes)
- Lint: clean
- Build: 312+ pages, todas as 9 rotas de alerts compilam
- **Commit `37a9abc`**: 20 files, 2634 insertions

### Pendencias pos-commit (operacional, nao codigo)

1. Aplicar migration no Supabase (`supabase db push` ou SQL no dashboard)
2. Configurar no Vercel: `RESEND_API_KEY`, `CRON_SECRET`, `PF_ALERTS_TOKEN_ENCRYPTION_KEY`
3. Criar GitHub Action workflow para digest (cron diario chamando `/api/alerts/send-digest` com `CRON_SECRET`)
4. Testar fluxo completo em staging: subscribe → email → verify → toggle → digest

### 2026-04-05 16:17 — Operacional

- Vercel env vars: ja configuradas (RESEND_API_KEY, CRON_SECRET, PF_ALERTS_TOKEN_ENCRYPTION_KEY, salts, from email)
- Supabase: 4 tabelas verificadas OK (0 rows, prontas)
- Migration: `supabase db push` confirma "up to date" (tabelas ja existiam via schema.sql)
- GitHub Action `alerts-digest.yml`: cron diario 12:00 UTC (09:00 BRT), chaining habilitado
- Registrado no `notify-workflow-failure.yml` para alerta de falha
- **Commit `f57a6c6`**: workflow + notificacao
- Push para GitHub + deploy Vercel **Ready** em producao
- Rotas verificadas em puxaficha.com.br:
  - `/alertas/verificar` → 200
  - `/alertas/gerenciar` → 200
  - `POST /api/alerts/subscribe` → 400 (validacao correta com body vazio)
  - `GET /api/alerts/me` → erro esperado sem token

### Pendencia final

- Testar fluxo end-to-end real: subscribe com email valido → receber email → verificar → toggle → digest

---

## Auditoria completa (inventario 2026-04-05)

### Feature "Alertas por email" — arquivos canonicos

| Area | Caminhos |
|------|-----------|
| Plano | `docs/plans/2026-04-05-alerts-email-mvp.md` (este arquivo) |
| API | `src/app/api/alerts/subscribe/route.ts`, `verify`, `me`, `toggle`, `unsubscribe-all`, `delete-data`, `send-digest` |
| Lib servidor | `src/lib/alerts.ts`, `src/lib/alerts-shared.ts`, `src/lib/alerts-log.ts`, `src/lib/email.ts` |
| Lib cliente | `src/lib/alerts-client.ts` |
| Paginas | `src/app/alertas/gerenciar/page.tsx`, `src/app/alertas/verificar/page.tsx` |
| UI | `src/components/alerts/FollowCandidateButton.tsx`, `AlertsManageClient.tsx`, `AlertVerifyClient.tsx` |
| Ficha | `src/components/CandidatoProfile.tsx`, `src/app/candidato/[slug]/CandidatoFichaView.tsx` |
| Privacidade | `src/app/privacidade/page.tsx` |
| Dados | `supabase/migrations/20260406150000_alerts_email_mvp.sql`, `scripts/schema.sql` (tabelas + triggers) |
| Testes | `tests/alerts.test.ts`, `tests/alerts-log.test.ts` |
| CI | `.github/workflows/alerts-digest.yml`, `notify-workflow-failure.yml` (lista "Digest de alertas") |
| Config | `.env.example` (`RESEND_API_KEY`, `PF_ALERTS_*`, implicitamente `CRON_SECRET` no digest) |

### O que NAO e esta feature (homonimos "alertas")

| Tema | Onde | Significado |
|------|------|-------------|
| Aba ficha "Alertas" | `CandidatoProfile.tsx`, `candidato-profile-tabs.ts` | Pontos de atencao editoriais |
| `alertas_graves` / comparador | `api.ts`, `ComparadorPanel.tsx`, etc. | Metricas de pontos criticos |
| Timeline lane "Alertas" | `timeline-utils.ts`, `TimelineTab.tsx` | Pontos com `data_referencia` |
| Quiz | `quiz-types.ts`, `QuizDetailPanel.tsx` | `alertas_contradicao` |
| `AlertBanner.tsx`, `ui/alert.tsx` | Componentes UI | Banner pontos / shadcn |
| Migracao `split_positive_points_from_alerts` | `supabase/migrations/20260403121500_...` | Refatoracao pontos_atencao |
| SMTP em AGENTS.md | Secrets | Email quando **workflow** GitHub falha |

### Lacunas documentais / produto (sem mudanca obrigatoria)

1. `CLAUDE.md` / `AGENTS.md` nao listam `RESEND_API_KEY`, `CRON_SECRET`, `PF_ALERTS_*` (vale espelhar `.env.example` ou este plano).
2. `src/app/sitemap.ts` nao inclui `/alertas/gerenciar` nem `/alertas/verificar` (pode ser intencional).

---

## Logging operacional (implementado 2026-04-05)

### Modulo

- `src/lib/alerts-log.ts`: `logAlertsEvent`, `logAlertsApiExit`
- Formato: **uma linha JSON** por evento no stdout (`console.info` / `warn` / `error`), campo `service: "pf-alerts"` (transporte email usa `route: "email-transport"`).
- **Nota:** o modulo **nao** usa `import "server-only"` (o pacote npm `server-only` quebra `tsx --test`). Uso restrito a rotas API e `email.ts`, documentado no arquivo.

### Politica de dados

- **Proibido** em `detail`: email integral, tokens, `CRON_SECRET`, chaves API.
- Permitido: `candidateSlug`, `subscriberId` (UUID), contagens, razoes simbolicas (`reason`), `messageId` do Resend.

### Cobertura

| Rota / modulo | Eventos |
|---------------|---------|
| `subscribe` | `http_exit` em **todas** as respostas HTTP (400–503, 200, 429) com `detail.reason` |
| `verify` | Idem |
| `me` | Idem |
| `toggle` | Idem |
| `delete-data` | Idem |
| `unsubscribe-all` | Idem |
| `send-digest` | `http_exit` 401/503/200; `batch_start`; por assinante: `subscriber_skipped`, `subscriber_step_failed`, `digest_email_sent`, `digest_email_failed` |
| `email-transport` | `resend_missing_api_key`, `resend_request_failed`, `resend_accepted` |

### Onde ler em producao

- Vercel: **Logs** da funcao (Runtime Logs) filtrando `pf-alerts` ou `email-transport`.

### Log de sessao — logging

- **2026-04-05**: Instrumentacao completa das 7 rotas + `sendTransactionalEmail`; testes `tests/alerts-log.test.ts`; plano atualizado com auditoria e esta secao.

### Pendencia final (inalterada)

- E2E real: subscribe → inbox → verify → toggle → digest (validar tambem linhas de log no ambiente alvo).
