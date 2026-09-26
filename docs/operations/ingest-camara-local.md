# Coleta semanal da Câmara fora do GitHub Actions

## Por que existe

Em 26/09/2026 a API de Dados Abertos da Câmara
(`dadosabertos.camara.leg.br`) parou de aceitar conexão dos runners hospedados
do GitHub. Os runs `36215277830` e `36248805025` do `ingest.yml` foram
cancelados no teto de 90 min com `fetch failed` em quase todas as fichas, cerca
de 100 s cada. O último ingest agendado com Câmara verde foi o de 23/09
(`35848305925`).

Diagnóstico no runner (branch `diag/camara-runner-network`, run `36273227394`,
IP de saída `48.214.53.115`):

| Medição | Resultado |
|---|---|
| curl nos 3 endpoints, UA padrão, UA de navegador, UA do projeto | 0/9, `rc=28` em 15 s, `connect=0` |
| curl fixando cada um dos 3 IPs (`200.219.133.190-192`), 3 vezes | 0/9 |
| TCP puro na 443 dos 3 IPs, sem TLS | 0/3, timeout de 15 s |
| 20 sequenciais sem pausa, 10 com 3 s de pausa, 5 em paralelo | 0/35 |
| Node `fetch` (mesmo cliente do ingest) | 0/14, `UND_ERR_CONNECT_TIMEOUT` |
| Controle: Senado e Google, do mesmo runner | 200 |
| Mesma API, fora do GitHub | 200 em ~0,1 s nos 3 IPs |

O SYN não volta. User-Agent, retry, backoff, concorrência menor e timeout por
requisição não mudam nada, porque a conexão não chega ao TLS.

## O que o repositório faz sozinho

- No `ingest.yml`, a Câmara tem job próprio (`ingest-camara`), só por disparo
  manual. `scripts/lib/camara-alcance.ts` sonda a API antes do laço: sem
  conexão, cada ficha elegível recebe um erro com o código de rede, vira
  recibo `erro` em `coleta_log`, e o job falha em cerca de 1 min.
- A Câmara saiu do schedule do Actions. `coleta_log_ultima` fica com a
  tentativa mais recente, e um `erro` do Actions gravado depois da coleta local
  esconderia o recibo bom.
- Todo job do `ingest.yml` que recebe a service role exige
  `github.ref == 'refs/heads/main'`; disparo de outra branch pula a ingestão.

## O agente local

`scripts/camara-local/ingest-camara-local.sh`, chamado pelo launchd na quarta
às 06:00 UTC (03:00 em Brasília):

1. busca `origin/main` no clone e fixa o SHA; nunca roda branch de trabalho
   nem PR;
2. cria um worktree descartável nesse SHA em `$TMPDIR`;
3. roda `npm ci --ignore-scripts`: nenhum script de instalação de dependência
   executa. Os quatro pacotes com script (`esbuild`, `@sentry/cli`,
   `unrs-resolver`, `fsevents`) não são necessários para o ingest; o modo
   `--verificar` prova que o grafo inteiro carrega sem eles;
4. roda `npx tsx scripts/ingest-all.ts camara --skip-camara-validated` com
   Node 24 (`/opt/homebrew/opt/node@24/bin`), o mesmo modo incremental que o
   cron usava;
5. grava os recibos com `execucao = local:<host>:<AAAAMMDDTHHMMSSZ>`
   (`PF_COLETA_EXECUCAO`, validada em `scripts/lib/coleta-log.ts`);
6. revalida o cache público com as mesmas tags do `ingest.yml`, se o arquivo
   de credenciais trouxer `PF_REVALIDATE_SECRET`;
7. grava o log em `~/Library/Logs/puxa-ficha/ingest-camara-<timestamp>.log` e
   apaga o worktree, com sucesso ou erro.

Uma trava (`~/Library/Logs/puxa-ficha/.ingest-camara.lock`) impede duas rodadas
ao mesmo tempo. Se uma rodada morrer por `kill -9`, apague o diretório da trava
à mão.

## Passos manuais do mantenedor

Nenhum destes passos é feito por agente ou CI.

1. **Criar o arquivo de credenciais**, fora do repositório:

   ```bash
   mkdir -p ~/.config/puxa-ficha && chmod 700 ~/.config/puxa-ficha
   touch ~/.config/puxa-ficha/ingest-camara.env
   chmod 600 ~/.config/puxa-ficha/ingest-camara.env
   ```

   Conteúdo, uma chave por linha, sem aspas e sem `export`:

   ```text
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   PF_REVALIDATE_SECRET=...
   ```

   `PF_REVALIDATE_SECRET` é opcional; sem ela a coleta roda e o cache só é
   revalidado no próximo run do Actions ou à mão. Qualquer outra chave faz o
   script parar. O script recusa o arquivo se ele não for do usuário, se for
   link simbólico ou se a permissão não for 600.
2. **Instalar o agente** a partir de um checkout atualizado da `main`:
   `bash scripts/camara-local/instalar-agente.sh`. Ele só copia o script para
   `~/Library/Application Support/puxa-ficha/` e o plist para
   `~/Library/LaunchAgents/br.com.puxaficha.ingest-camara.plist`, com o horário
   de quarta 06:00 UTC convertido para o fuso da máquina. Recusa root e sudo,
   e não carrega nada.
3. **Verificar sem escrever no banco:**
   `bash ~/Library/Application\ Support/puxa-ficha/ingest-camara-local.sh <clone> --verificar`
   deve terminar com `VERIFICACAO_OK` no log.
4. **Carregar o agente:**
   `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/br.com.puxaficha.ingest-camara.plist`.
5. **Primeira rodada assistida (opcional):**
   `launchctl kickstart gui/$(id -u)/br.com.puxaficha.ingest-camara` e
   conferir no log `ingest camara rc=0` e, se houver segredo, `revalidate HTTP 200`.
6. **Manter o Mac ligado na quarta de madrugada.** Se ele estiver dormindo no
   horário, o launchd roda a tarefa ao acordar; se estiver desligado, a
   semana passa sem coleta e a auditoria de frescor acusa.

O script instalado é uma cópia. Depois de mudar `scripts/camara-local/` na
`main`, rode o instalador de novo. O código do ingest, esse sim, vem sempre do
SHA da `main` do momento da rodada.

## Como voltar atrás

`launchctl bootout gui/$(id -u)/br.com.puxaficha.ingest-camara`, depois apagar
o plist, o script em `~/Library/Application Support/puxa-ficha/` e o arquivo
de credenciais. Para rodar a Câmara pelo Actions de novo, se a Câmara voltar a
aceitar os runners, basta disparar o `ingest.yml` com `sources=camara`.

## Alternativas descartadas

- **Runner auto-hospedado:** um PR de fork pode pedir o rótulo do runner e,
  com uma aprovação, rodar no Mac com acesso ao home; `workflow_dispatch` e
  push de branch também alcançam o runner; o estado persiste entre runs.
  Recusado na revisão de segurança do PR #518.
- **Retry, backoff, User-Agent, concorrência, timeout por requisição:** medidos
  acima, 0 conexões em todas as variações.
- **Rodadas em lotes com retomada no runner hospedado:** cada lote bate no
  mesmo bloqueio.
- **Proxy de saída:** custo recorrente e mais um segredo, com o mesmo risco de
  o IP do proxy entrar no bloqueio.
