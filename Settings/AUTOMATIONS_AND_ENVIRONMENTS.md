# Automações e ambientes

## Ambientes

| Ambiente | Uso | Regra |
|---|---|---|
| Local | Desenvolvimento, testes e auditorias | Node 24; `.env.local` fora do Git; banco remoto só com comando explicitamente seguro. |
| Preview | Revisão de PR na Vercel | Não pressupor segredos ou permissão de escrita; validar UI com dados não destrutivos. |
| Produção | `puxaficha.com.br` e Supabase ligado | Escrita apenas por workflow autorizado; sempre fazer readback. |

O projeto Vercel de produção usa Next.js, Node 24.x e região `gru1`. O Supabase
ligado é a autoridade operacional de dados; migrations locais continuam sendo a
autoridade versionada do schema e dos snapshots.

## Variáveis de ambiente

Documente nomes, nunca valores.

| Grupo | Variáveis |
|---|---|
| Supabase público/servidor | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Operações privilegiadas | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` |
| Site | `NEXT_PUBLIC_SITE_URL` |
| Sentry | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, amostragens, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` |
| Metadados | `NEXT_PUBLIC_X_HANDLE`, `INSTAGRAM_APP_ID` |
| Interno e cache | `PF_REVALIDATE_SECRET`, `PF_PREVIEW_TOKEN`, `PF_INTERNAL_TOKEN`, `PF_FORCE_PRODUCTION_SECURITY_HEADERS` |
| Curadoria e quiz | `PF_CURATION_PHASE`, `PF_QUIZ_SHORT_LINK_SALT` |
| Alertas e email | `NEXT_PUBLIC_ALERTS_EMAIL_ENABLED`, `RESEND_API_KEY`, `CRON_SECRET`, `PF_ALERTS_FROM_EMAIL`, `PF_ALERTS_REPLY_TO_EMAIL`, `PF_ALERTS_TOKEN_SALT`, `PF_ALERTS_IP_SALT`, `PF_ALERTS_TOKEN_ENCRYPTION_KEY` |
| Ingestão | `TRANSPARENCIA_API_KEY`, `PF_DOADOR_CPF_HASH_SALT` |
| Backup | `BACKUP_ENCRYPTION_KEY` |

A lista de nomes é a tabela acima. Service role, tokens de banco e chaves de
ingestão nunca recebem prefixo `NEXT_PUBLIC_`.

## Crons da Vercel

Horários do arquivo `vercel.json`. A conversão para BRT abaixo vale fora do
horário de verão, inexistente no Brasil em 06/08/2026.

| Rota | UTC | BRT | Função |
|---|---:|---:|---|
| `/api/news/refresh` | 08:00 diária | 05:00 | Atualizar notícias. |
| `/api/news/refresh/recover` | 08:30 diária | 05:30 | Recuperar lotes pendentes sem duplicar execução. |
| `/api/internal/published-consistency` | 09:00 diária | 06:00 | Conferir consistência publicada. |
| `/api/internal/runtime-smoke` | 09:30 diária | 06:30 | Smoke operacional. |
| `/api/alerts/send-digest` | 12:00 diária | 09:00 | Enviar digest de alertas habilitados. |
| `/api/internal/revalidate-public-cache` | `*/15 * * * *` | a cada 15 min | Invalidar cache público das fichas. |

## GitHub Actions

| Workflow | Disparo | Papel |
|---|---|---|
| `ci.yml` | Push e PR | Lint, tipos, testes, build, browser smoke e acessibilidade. |
| `backup-db.yml` | 05:30 UTC diária e manual | Backup do banco. |
| `ingest.yml` | Quarta, 06:00 UTC e manual | Câmara e Senado; lotes manuais de TSE, **sanções** e notícias; revalidação após sucesso. |
| `patrimonio-rerun.yml` | Domingo, 09:00 UTC e manual (ativado em 12/08/2026; primeiro disparo 16/08) | Re-run de patrimônio do ciclo 2026 em dry-run: baixa o pacote oficial do TSE e compara por composição contra o baseline auditado. Não escreve, não recebe secret; publicar o delta continua exigindo migration com gate. |
| `data-quality.yml` | Quinta, 09:00 UTC; dia 3, 07:00 UTC; manual | Coorte, superfície pública, integridade da cadeia partidária e auditoria de identidade SQ. |
| `link-check-fontes.yml` | Segunda, 09:00 UTC e manual | Verificar links das fontes publicadas. |
| `revalidate-cache.yml` | Manual | Revalidar tags públicas autorizadas. |

No `audit:superficie`, R8 reprova reversão A→B e B→A no mesmo ano; R9 reprova
uma cadeia que não admite ordenação cronológica contínua depois da mesma
normalização usada pela ficha; R10 apenas avisa quando um partido de mudança
visível só tem suporte em trajetória despublicada. R8 e R9 de ficha pública
falham o job. Os mesmos achados em ficha não pública ficam como backlog nominal.

Automação de ingestão roda no `main` e usa segredos apenas nos contextos
autorizados. Pull requests nunca devem receber credenciais de produção.

### Fontes que o `ingest.yml` aceita, e as duas que se parecem

O input `sources` é validado contra uma allowlist no próprio workflow:
`camara`, `senado`, `tse`, `transparencia`, `sancoes`, `google-news`. Os nomes
são o vocabulário de CLI de `VALID_SOURCES` em `scripts/ingest-all.ts`, e **não**
são os `source` que os ingests declaram em `coleta_log` (o de sanções declara
`transparencia-sanctions`).

Duas fontes têm nomes parecidos e fazem coisas diferentes, e confundi-las já
produziu um run verde sem trabalho feito:

| Fonte | O que roda | Persiste? |
|---|---|---|
| `transparencia` | consulta de gastos no Portal | **não**: stub declarado |
| `sancoes` | `ingestTransparenciaSanctions` (CEIS, CNEP, CEAF) | sim, em `sancoes_administrativas` |

`sancoes` entrou na allowlist em 10/08/2026 (trilha B do lançamento). Antes
disso a recoleta de sanções era indispatchável por este workflow, e o run
`31336467753` saiu `success` sem escrever uma linha porque disparou a fonte
errada. Ver `Settings/STATUS.md`.

## Operação segura

- Jobs automáticos registram `execution_id`, resultado, volume e cursor quando
  aplicável.
- Uma execução inconclusiva não autoriza repetição cega.
- Cron de notícia, ingestão ou alerta deve ser idempotente.
- Publicação editorial nunca é automática.
- Mudança de schedule atualiza este arquivo e o catálogo de fontes no mesmo PR.
