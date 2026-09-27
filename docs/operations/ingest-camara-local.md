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
- Todo job do `ingest.yml` que recebe segredo de produção (inclusive o
  `revalidate`) exige `github.ref == 'refs/heads/main'`. Isso impede que um
  disparo com `--ref` de uma branch que mudou scripts, mas não o YAML, rode
  código não revisado com a service role. Não impede uma branch que edite o
  próprio YAML: para isso existe o passo de endurecimento abaixo.
- O gate `ids-cohort` do `data-quality.yml` sonda a Câmara antes de checar os
  IDs. Inalcançável, os checks da Câmara saem `error` com o motivo
  `camara_inalcancavel:`, o relatório ganha `camara_inalcancavel` e o log um
  `::warning::`; o gate não os conta como falha. Qualquer outro erro, mismatch
  ou not_found continua reprovando.
- No registro de frescor (`scripts/data/data-freshness-sources.json`) a Câmara
  é `manual` / `on_demand`, com `max_age_hours` 216 mantido. Para fonte
  manual, passar do limiar vira `technical_debt` com afirmações negativas
  suprimidas, e não mais `stale` bloqueante.

## O agente local

`scripts/camara-local/ingest-camara-local.sh`, chamado pelo launchd na quarta
às 06:00 UTC (03:00 em Brasília):

1. busca a `main` pela URL explícita
   (`https://github.com/thiago-salvador/puxa-ficha.git`), fixa o SHA, confere
   com `git ls-remote` e avisa no log se o SHA da rodada anterior não for
   ancestral do atual (main reescrita, force-push); nunca roda branch de
   trabalho nem PR;
2. confere a si mesmo: se o launcher em execução diferir de
   `scripts/camara-local/ingest-camara-local.sh` nesse SHA, para e pede
   reinstalação;
3. cria um worktree descartável nesse SHA em `$TMPDIR`;
4. roda `npm ci --ignore-scripts`: nenhum script de instalação de dependência
   executa. Os quatro pacotes com script (`esbuild`, `@sentry/cli`,
   `unrs-resolver`, `fsevents`) não são necessários para o ingest; o modo
   `--verificar` prova que o grafo inteiro carrega sem eles;
5. roda `./node_modules/.bin/tsx scripts/ingest-all.ts camara
   --skip-camara-validated` e, na mesma revisão fixada, roda
   `camara-cotas ceaps-senado partidos-parlamentares` com Node 24
   (`/opt/homebrew/opt/node@24/bin`), sem `npx` baixar nada; falha da
   primeira chamada não impede a segunda;
6. grava os recibos com `execucao = local:<host>:<AAAAMMDDTHHMMSSZ>`
   (`PF_COLETA_EXECUCAO`, validada em `scripts/lib/coleta-log.ts`);
7. revalida o cache público com as mesmas tags do `ingest.yml`, se o arquivo
   de credenciais trouxer `PF_REVALIDATE_SECRET`;
8. relê os perfis públicos e as votações-chave, calcula a matriz atual e captura
   as fontes parlamentares oficiais apenas dos slugs com células legislativas
   abertas; monta recibos de cobertura e aplica somente os que passam pela
   régua via `scripts/audit/apply-coverage-receipts.ts`, com readback e
   backup privados em `~/Library/Logs/puxa-ficha/prova-parlamentar-<timestamp>/`.
   Falha de leitura não vira vazio;
9. grava o log em `~/Library/Logs/puxa-ficha/ingest-camara-<timestamp>.log`
   (diretório sempre em 700) e apaga o worktree, com sucesso ou erro.

Uma trava com pid (`~/Library/Logs/puxa-ficha/.ingest-camara.lock/pid`) impede
duas rodadas ao mesmo tempo; trava de processo que já morreu é retomada com
aviso no log. O último SHA rodado fica em
`~/Library/Application Support/puxa-ficha/ultimo-sha-main`.

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
2. **Instalar o agente** a partir de um checkout cujo HEAD é a `main` atual,
   sem alteração em `scripts/camara-local/`:
   `bash scripts/camara-local/instalar-agente.sh`. Ele busca a `main` pela URL
   explícita, confere com `ls-remote` e recusa se o HEAD for outro ou se os
   arquivos diferirem da `main`. Depois só copia o script para
   `~/Library/Application Support/puxa-ficha/` e o plist para
   `~/Library/LaunchAgents/br.com.puxaficha.ingest-camara.plist`, com o horário
   de quarta 06:00 UTC convertido para o fuso da máquina. Recusa root e sudo,
   e não carrega nada.
3. **Verificar sem escrever no banco:**
   `bash ~/Library/Application\ Support/puxa-ficha/ingest-camara-local.sh <clone> --verificar`
   deve terminar com `VERIFICACAO_OK` no log.
4. **Carregar o agente:** se uma versão anterior já estiver carregada,
   `launchctl bootout gui/$(id -u)/br.com.puxaficha.ingest-camara`; depois,
   `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/br.com.puxaficha.ingest-camara.plist`.
5. **Primeira rodada assistida (opcional):**
   `launchctl kickstart gui/$(id -u)/br.com.puxaficha.ingest-camara` e
   conferir no log `ingest camara rc=0` e, se houver segredo, `revalidate HTTP 200`.
6. **Manter o Mac ligado na quarta de madrugada.** Se ele estiver dormindo no
   horário, o launchd roda a tarefa ao acordar; se estiver desligado, a
   semana passa sem coleta e a auditoria de frescor acusa.

O script instalado é uma cópia. Depois de mudar `scripts/camara-local/` na
`main`, a rodada seguinte para com "difere ... reinstale" até o instalador
rodar de novo; o launcher nunca roda uma versão diferente da `main`. O código
do ingest vem sempre do SHA da `main` do momento da rodada.

O ingest legislativo do Senado permanece no schedule do Actions. O run
`36192874836` de 25/09/2026 leu a API do Senado a partir do runner hospedado;
o CEAPS em CSV e o histórico partidário parlamentar são executados pelo agente
local até existir prova específica desses endpoints em um run do Actions.

O recibo `partidos-parlamentares` declara apenas o componente `parlamentar`.
Para fechar `mudancas_partido`, a prova de cobertura exige também o componente
`candidatura` de um coletor TSE separado, ambos com `candidate_slug`, escopo
completo e URL/SHA-256 de cada revisão oficial. A régua compara as duas fontes
com o mesmo readback público; um componente isolado permanece aberto.

## Endurecimento recomendado dos segredos (passo manual, ainda não aplicado)

O guard de `github.ref` não protege contra uma branch que edite o
`ingest.yml`. A proteção real é um Environment com política de branch:

1. Criar um Environment dedicado (por exemplo `ingest-producao`) com
   "Deployment branches and tags" restrito à `main`. Um dedicado, e não o
   `Production`: o `Production` é criado pela integração da Vercel e hoje não
   tem segredo, regra nem política; mexer nele afeta os 86 workflows
   `apply-*` que o declaram.
2. Guardar nele `SUPABASE_SERVICE_ROLE_KEY`, `PF_DOADOR_CPF_HASH_SALT` e
   `PF_REVALIDATE_SECRET`.
3. Acrescentar `environment: ingest-producao` aos jobs `ingest-rest`,
   `ingest-camara`, `ingest-tse`, `ingest-news` e `revalidate` (mudança de
   código, em PR próprio, depois do passo 2).
4. Só então avaliar remover os segredos do nível de repositório. Impacto
   medido em 26/09/2026: 14 workflows leem `SUPABASE_SERVICE_ROLE_KEY`; 8 não
   declaram environment e quebrariam sem o segredo de repositório
   (`ingest.yml`, `checagens-coleta.yml`, `data-freshness-audit.yml`,
   `data-quality.yml`, `link-check-fontes.yml`, `processos-coleta-judicial.yml`,
   `rehash-doador-cpf-v2.yml`, `tse-2026-financas.yml`); os outros 6
   (`apply-` e `rollback-candidate-roster-integrity-production.yml`,
   `materializar-doador-recorrente.yml`, `observe-home-updates.yml`,
   `refresh-destaques-votacoes.yml`, `roster-deputados.yml`) declaram
   `environment: production`, que hoje não guarda o segredo, e também
   dependem do segredo de repositório.
   `PF_DOADOR_CPF_HASH_SALT` é lido por `ingest.yml`, `rehash-doador-cpf-v2.yml`
   e `tse-2026-financas.yml`; `PF_REVALIDATE_SECRET` por `ingest.yml`,
   `revalidate-cache.yml` e `tse-2026-financas.yml`. Cada um precisa do
   `environment:` antes da remoção.

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
