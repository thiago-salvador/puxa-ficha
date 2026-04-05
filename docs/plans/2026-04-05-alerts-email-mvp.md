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
