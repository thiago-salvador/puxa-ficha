# Runbook de reconstrução

Uso: perda do projeto Vercel, do projeto Supabase ou do vínculo entre eles.
Produção continua protegida: restauração, troca de domínio, deploy e ativação de
cron exigem autorização nomeada antes de executar.

## 1. Inventário sem valores

| Superfície | Onde fica | Nomes | Acesso |
|---|---|---|---|
| Vercel, runtime | Project Settings > Environment Variables | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_X_HANDLE`, `INSTAGRAM_APP_ID`, `PF_REVALIDATE_SECRET`, `PF_PREVIEW_TOKEN`, `PF_INTERNAL_TOKEN`, `PF_FORCE_PRODUCTION_SECURITY_HEADERS`, `PF_CURATION_PHASE`, `PF_QUIZ_SHORT_LINK_SALT`, `NEXT_PUBLIC_ALERTS_EMAIL_ENABLED`, `RESEND_API_KEY`, `CRON_SECRET`, `PF_ALERTS_FROM_EMAIL`, `PF_ALERTS_REPLY_TO_EMAIL`, `PF_ALERTS_TOKEN_SALT`, `PF_ALERTS_IP_SALT`, `PF_ALERTS_TOKEN_ENCRYPTION_KEY`, `TRANSPARENCIA_API_KEY`, `PF_DOADOR_CPF_HASH_SALT` | Confirmar no painel: Thiago |
| GitHub Actions | Repository Settings > Secrets and variables > Actions | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `PF_REVALIDATE_SECRET`, `TRANSPARENCIA_API_KEY`, `BACKUP_ENCRYPTION_KEY`, `CRON_SECRET`, `MERGE_QUEUE_GH_TOKEN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Confirmar no painel: Thiago |
| Supabase | Project Settings > API e Database > Connection string | URL do projeto, anon key, service role, Session pooler e senha do banco | Confirmar no painel: Thiago |
| Provedor de email | Resend > API Keys e Domains | valor usado em `RESEND_API_KEY` e domínio do remetente | Confirmar no painel: Thiago |
| Observabilidade | Sentry > Project Settings | DSN, organização, projeto e token de source maps | Confirmar no painel: Thiago |
| Operador local, runners históricos OpenCode | Ambiente local do operador | `PF_OPENCODE_GO` | Recriar apontando para o cliente OpenCode canônico antes de retomar esses runners |

Os cinco últimos nomes da linha do GitHub Actions existem por causa da fila de
merge serial e do watchdog de crons: `MERGE_QUEUE_GH_TOKEN`, `VERCEL_TOKEN`,
`VERCEL_ORG_ID` e `VERCEL_PROJECT_ID` só aparecem em `serial-merge-queue.yml`, e
`CRON_SECRET` aparece nele e em `cron-watchdog.yml`. Num DR que só recomponha a
ingestão eles não são necessários; sem eles a fila não roda.

Medir a lista, em vez de confiar nesta tabela:

```bash
grep -rhoE 'secrets\.[A-Z_0-9]+' .github/workflows/*.yml | sort -u
```

A lista canônica de nomes fica na tabela acima e em
[`Settings/AUTOMATIONS_AND_ENVIRONMENTS.md`](../Settings/AUTOMATIONS_AND_ENVIRONMENTS.md),
seção "Variáveis de ambiente".
Nunca copiar valores para este arquivo, issue, log ou commit.

## 2. Ordem de reconstrução

1. **Criar um projeto Supabase novo.** Não apontar o domínio ou a Vercel para
   ele antes do readback. Anotar o novo URL/ref somente no gerenciador de
   segredos autorizado.
2. **Restaurar o banco.** Preferir o restore gerenciado do Supabase quando o
   acesso à conta original existir. Para perda de conta ou restauração
   independente, baixar o artifact cifrado `backup-db-<run_id>` do workflow
   [`backup-db.yml`](../.github/workflows/backup-db.yml), decifrar e restaurar
   no projeto novo:

   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
     -pass env:BACKUP_ENCRYPTION_KEY \
     -in puxa-ficha-<data>.dump.enc -out puxa-ficha.dump
   pg_restore --no-owner --no-privileges \
     -d "postgresql://<projeto-novo>" puxa-ficha.dump
   ```

   O procedimento e os cuidados com PII estão em
   [`scripts/backup-supabase.sh`](../scripts/backup-supabase.sh). Sempre restaurar
   primeiro em projeto novo, nunca por cima de produção.
3. **Validar migrations.** O repositório sozinho não reconstrói os dados atuais:
   o replay linear medido ainda tem falhas históricas. O dump é a fonte de
   restauração; migrations validam e evoluem o schema. Antes de aplicar qualquer
   sucessora, executar:

   ```bash
   scripts/audit/replay-migrations.sh --schema-gate
   npm run audit:ledger:gate
   ```

   Aplicar somente migrations ausentes, na ordem, pelo procedimento autorizado
   de [`Settings/AUTOMATIONS_AND_ENVIRONMENTS.md`](../Settings/AUTOMATIONS_AND_ENVIRONMENTS.md),
   seções "Scripts de banco, ingestão e auditoria" e "Operação segura". Não usar
   `db push` amplo para tentar corrigir divergência de ledger.
4. **Recriar o projeto Vercel.** Importar `thiago-salvador/puxa-ficha`, usar
   Next.js, Node 24.x e região `gru1`. Repor as variáveis pelo inventário acima,
   sem copiar entre Production e Preview por suposição. O arquivo
   [`vercel.json`](../vercel.json) recria os seis crons da aplicação.
   Inventário de paths e horários (UTC e BRT) na seção 3; não inventar a lista.
5. **Ligar domínio.** Adicionar `puxaficha.com.br` ao projeto novo e confirmar
   DNS/certificado no painel antes da troca. A alteração de DNS e a promoção do
   deploy exigem autorização nomeada. O DNS atual tem, além do apex e de `www`,
   um registro curinga `*.puxaficha.com.br` apontando para a Vercel, coberto
   pelo certificado curinga e respondendo 404 (medido em 02/09/2026 com
   `dig +short <nome-inexistente>.puxaficha.com.br`). Nenhuma rota, cron ou
   integração depende dele; ao reconstruir, decidir se ele volta ou não, e
   registrar aqui.
6. **Reativar GitHub Actions.** Repor os secrets, confirmar que os workflows
   estão ativos e conferir os agendamentos em
   [`Settings/AUTOMATIONS_AND_ENVIRONMENTS.md`](../Settings/AUTOMATIONS_AND_ENVIRONMENTS.md),
   seções "Crons da Vercel" e "GitHub Actions".
   Não disparar ingest, revalidação ou cron de escrita como teste de conectividade.

A fila de merge serial governa como uma mudança volta a entrar em `main` depois
da reconstrução: convenção em
[`.github/serial-merge-queue.json`](../.github/serial-merge-queue.json) e
manifesto de mudança irreversível em
[`.github/merge-queue/irreversible-change-manifest.json`](../.github/merge-queue/irreversible-change-manifest.json).

## 3. Verificação final

Executar depois do deploy autorizado e da troca de domínio. Os três comandos
abaixo são gates obrigatórios. O último usa `CRON_SECRET` e só passa com
`.ok == true` e `.total == 6` (cinco checagens públicas mais o
quiz-short-link). Não pular, não afrouxar o jq, não aceitar total diferente de 6.

```bash
curl -fsS https://puxaficha.com.br/api/deployment-info |
  jq -e '.ok == true and .environment == "production" and (.commitSha | length == 40)'

curl -fsS https://puxaficha.com.br/api/candidato-slugs |
  jq -e '.slugs | type == "array" and length > 0'

curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" \
  https://puxaficha.com.br/api/internal/runtime-smoke |
  jq -e '.ok == true and .total == 6'
```

O runtime-smoke cobre home, ficha (`/candidato/lula`), API de perfil, SHA de
deploy (`/api/deployment-info`), 404 real e criação/resolução do short-link do
quiz. Falha em qualquer um dos três comandos interrompe a promoção do ambiente.

### Crons em vercel.json (6)

Fonte: array `crons` de [`vercel.json`](../vercel.json). Os schedules da Vercel
são UTC. BRT = UTC-3 o ano todo (horário de verão abolido no Brasil). Se este
quadro divergir do arquivo, o arquivo vence.

| Path | Schedule UTC | BRT (UTC-3) |
|---|---|---|
| `/api/alerts/send-digest` | `0 12 * * *` | 09:00 |
| `/api/news/refresh` | `0 8 * * *` | 05:00 |
| `/api/news/refresh/recover` | `30 8 * * *` | 05:30 |
| `/api/internal/published-consistency` | `0 9 * * *` | 06:00 |
| `/api/internal/runtime-smoke` | `30 9 * * *` | 06:30 |
| `/api/internal/revalidate-public-cache` | `*/15 * * * *` | a cada 15 min |

## 4. Confirmar no painel

Responsável por confirmar: **Thiago**.

- Quem mantém acesso administrativo a Vercel, GitHub, Supabase, Resend e Sentry.
- Se Point in Time Recovery está ativo e qual é a retenção atual do Supabase.
- Onde existe a segunda cópia de `BACKUP_ENCRYPTION_KEY`, fora do GitHub.
- Se `puxaficha.com.br` e seus registros DNS estão sob a conta esperada.
- Se notificações de falha de cron e de novas issues estão habilitadas.

## 5. RTO, RPO e ensaio de restauração

Objetivos declarados em 02/09/2026, a partir do que o projeto de fato tem. Não
são promessas medidas: a coluna "medido" só se preenche com um ensaio.

| Métrica | Definição aqui | Objetivo | Medido |
|---|---|---|---|
| RPO (perda máxima de dado) | Idade do último dump restaurável. O `backup-db.yml` roda todo dia às 05:30 UTC (02:30 BRT) e guarda 14 dias de artifacts cifrados. Só vale para as tabelas que não se reconstroem pelas migrations e pelos ingestores: `alert_subscribers`, `noticias_candidato`, `coleta_log`. O resto se refaz do repositório. | Até 24 h para essas três tabelas; menor se o PITR do Supabase estiver ativo (confirmar na seção 4) | Ensaio de 02/09/2026: dado mais recente em `coleta_log` de 08:07 UTC num dump de 09:45 UTC. Atenção: o agendamento do GitHub atrasa 4 a 6 h (runs de 31/08 a 02/09 começaram entre 09:44 e 11:41 UTC), então o dump do dia fica pronto por volta do meio-dia UTC, não às 05:30 |
| RTO do banco | Do início da restauração até o readback passar num projeto novo: decifrar, `pg_restore`, conferir contagens. | Até 60 min | Ensaio de 02/09/2026, dump de 30 MB: 1 s de `pg_restore`, 3 s do container ao readback, mais o download do artifact. Em projeto Supabase novo, contar a criação do projeto e a rede |
| RTO da aplicação | Do banco pronto até os três gates da seção 3 passarem: repor variáveis, deploy, domínio. | Até 2 h | pendente de ensaio |

### Como ensaiar sem tocar produção

O script [`scripts/audit/drill-restore-backup.sh`](../scripts/audit/drill-restore-backup.sh)
restaura um artifact do `backup-db.yml` num PostgreSQL 17 descartável em Docker,
mede os segundos do `pg_restore`, conta tabelas e linhas das três tabelas acima,
lê o dado mais recente de `coleta_log` (é o RPO observado) e apaga o dump
decifrado e o container no fim. Ele recusa qualquer URL de banco: o único
destino é o container que ele mesmo cria.

```bash
run_id="$(gh run list --workflow=backup-db.yml --status success --limit 1 --json databaseId -q '.[0].databaseId')"
gh run download "$run_id" --name "backup-db-$run_id" --dir backups/
BACKUP_ENCRYPTION_KEY='<a chave, fora do histórico do shell>' \
  scripts/audit/drill-restore-backup.sh backups/puxa-ficha-*.dump.enc
```

A linha `DRILL_RESTORE_OK={...}` traz `segundos_restore`, `segundos_total`,
`erros_pg_restore`, as contagens e `dado_mais_recente_coleta_log`. Copiar os
números para a tabela abaixo; `erros_pg_restore` acima de zero merece leitura
do log antes de aceitar o ensaio. O RTO da aplicação se mede à parte, num
projeto Vercel de teste, seguindo os passos 4 a 6 da seção 2 com cronômetro.

Cadência: um ensaio por trimestre e um depois de qualquer mudança no
`backup-db.yml`, no `backup-supabase.sh` ou na versão maior do Postgres.

### Ensaios realizados

| Data | Artifact (run) | Bytes | `segundos_restore` | `erros_pg_restore` | candidatos / alert_subscribers / noticias_candidato | RPO observado | Quem |
|---|---|---|---|---|---|---|---|
| 2026-09-02 | `backup-db-33615805264` (`puxa-ficha-20260902T094543Z.dump.enc`) | 30.138.523 | 1 (3 no total) | 0 (`pg_restore_rc` 1 só pelo `schema "public" already exists`) | 328 / 37 / 32.051 (33 tabelas, `coleta_log` 14.533) | dado mais recente 2026-09-02T08:07Z, 1 h 38 min antes do dump | Thiago, PostgreSQL 17 local via Docker |

Aprendizado do primeiro ensaio: `read -rs` engole a linha seguinte quando se
cola mais de um comando de uma vez, e a chave "errada" era o próprio comando.
Colar a chave sozinha, com Enter, e conferir o tamanho antes de decifrar.
