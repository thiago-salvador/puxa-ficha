# Paridade deploy — 2026-04-05

| Campo | Valor |
|--------|--------|
| Data/hora da checagem | 2026-04-05T20:50Z |
| `origin/main` SHA (apos push) | `524872b82767e1a32c124c67c05412a23b182f70` |
| Vercel Production — Commit SHA | Pendente deploy auto (push acabou de ocorrer) |
| Vercel Production — Branch | `main` |
| URL usada no smoke | `https://puxa-ficha.vercel.app` |
| Smoke HTTP status | 200 |
| Supabase migrations no repo | 21 arquivos em `supabase/migrations/` |
| Supabase migrations em producao | Conferir via dashboard — ultimas: `alerts_email_mvp`, `clear_invalid_camara_proposicao_id`, `votacao_chave_marco_temporal_quiz` |
| Auditoria factual (CI) | ⚠ Falha em `c761e80`: 2 candidatos bloqueados (`dr-daniel`, `dr-fernando-maximo`) por inconsistencia de partido. Nao e regressao de codigo. |
| Auditoria de completude (CI) | ✅ Sucesso em `c761e80` |
| `npm run lint` | ✅ Sucesso (exit 0) |
| `npm test` | ✅ 80/80 passando |
| Notas | Push `524872b` inclui `git rm --cached` de 8 artifacts release-verify trackeados. Vercel auto-deploy deve alinhar SHA em minutos. |

## Variaveis de ambiente (somente nomes)

Conferir na Vercel (Settings → Environment Variables) vs `.env.example`:

- `SUPABASE_URL` ✓
- `SUPABASE_ANON_KEY` ✓
- `SUPABASE_SERVICE_ROLE_KEY` ✓
- `PF_PREVIEW_TOKEN`
- `PF_INTERNAL_TOKEN`
- `NEXT_PUBLIC_X_HANDLE`
- `INSTAGRAM_APP_ID`
- `TRANSPARENCIA_API_KEY`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `CRON_SECRET`
- `PF_ALERTS_TOKEN_ENCRYPTION_KEY`
- `PF_ALERTS_TOKEN_SALT`
- `PF_ALERTS_IP_SALT`
- `PF_ALERTS_FROM_EMAIL`
- `PF_QUIZ_SHORT_LINK_SALT`

## Branches

Apos limpeza: apenas `main` local. Nenhuma branch stale.
