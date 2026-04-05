# Paridade deploy — 2026-04-05 (preencher após push)

Copiar para `deploy-parity-2026-04-05.md` quando os valores abaixo forem confirmados no dashboard.

| Campo | Valor |
|--------|--------|
| Data/hora da checagem | |
| `origin/main` SHA (apos push) | `git rev-parse origin/main` |
| Vercel Production — Commit SHA | Dashboard → Deployments → Production |
| Vercel Production — Branch | (esperado: `main`) |
| URL usada no release-verify | `VERIFY_URL=` |
| `npm run audit:release-verify:prod` | pass / fail (colar resumo) |
| Supabase migrations aplicadas em producao | listar ou “em dia com repo” |
| Notas | |

**Variaveis de ambiente (somente nomes, sem valores):** conferir na Vercel vs [`.env.example`](../../.env.example).

**SHA local atual (antes do push do operador):** executar `git log -1 --oneline` na maquina que fez o merge.
