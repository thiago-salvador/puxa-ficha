# Ingest da Câmara em runner auto-hospedado

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
requisição não mudam nada, porque a conexão não chega ao TLS. Ao menos um run
de 26/09 conseguiu uma ficha no meio da fila, então o bloqueio pode variar por
IP de saída, mas a regra atual é de fato recusar.

## O que o repositório já faz sozinho

- O job `ingest-camara` roda separado do REST (Senado e demais), depois dele.
- `scripts/lib/camara-alcance.ts` sonda a API antes do laço. Sem conexão, cada
  ficha elegível recebe um erro com o código de rede e vira recibo `erro` em
  `coleta_log`, e o job falha em cerca de 1 min, em vez de gastar 90.
- O runner do job vem da variável de repositório `PF_INGEST_CAMARA_RUNNER`. Sem
  ela, o job segue no runner hospedado (e cai no pré-voo acima).

O contrato de recibos não muda com o runner: `EXECUCAO` continua
`gh:<GITHUB_RUN_ID>`, os secrets são os mesmos e a revalidação do cache roda
depois, como antes.

## Passos manuais do mantenedor

Nenhum destes passos é feito por agente ou CI.

1. **Proteger o repositório público antes de registrar o runner.** Em
   Settings > Actions > General > "Fork pull request workflows from outside
   collaborators", escolher "Require approval for all outside collaborators".
   Um runner auto-hospedado num repositório público executa o workflow que
   chegar até ele. O `ingest.yml` nunca roda em `pull_request`, e
   `tests/ingest-camara-runner.test.ts` reprova qualquer workflow que use a
   variável ou o rótulo `puxa-ficha-camara`, mas um PR de fork com workflow
   novo só fica contido pela aprovação manual.
2. **Rodar a pré-checagem no Mac:**
   `bash scripts/instalar-runner-camara.sh --checar`. Confirma macOS arm64 e
   que a API da Câmara responde 200 desta máquina.
3. **Gerar o token de registro** em Settings > Actions > Runners > New
   self-hosted runner (expira em 1 hora).
4. **Instalar:** `bash scripts/instalar-runner-camara.sh`. O script baixa o
   `actions/runner` v2.337.0 com SHA-256 conferido, registra o runner com o
   rótulo `puxa-ficha-camara` e instala o serviço launchd do usuário
   (`svc.sh install`). Recomendado: uma conta macOS padrão dedicada, sem
   privilégio de administrador.
5. **Criar a variável** de repositório `PF_INGEST_CAMARA_RUNNER` com o valor
   `["self-hosted","puxa-ficha-camara"]`.
6. **Manter o Mac acordado no horário do cron** (quarta, 06:00 UTC, 03:00 em
   Brasília), por exemplo com um agendamento de despertar no macOS. Com o
   runner offline, o job fica na fila por até 24 h e depois falha; a
   revalidação espera por ele.
7. **Validar:** disparar o `ingest.yml` com `sources=camara` e
   `incremental=true` e conferir que o job "Câmara dos Deputados" rodou no
   runner `puxa-ficha-camara-mac`, sem "API da Camara inalcancavel" no log.

## Como voltar atrás

Apagar a variável `PF_INGEST_CAMARA_RUNNER` devolve o job ao runner hospedado.
Para remover o runner: `./svc.sh stop && ./svc.sh uninstall` e
`./config.sh remove --token <token de remoção>` dentro de
`~/actions-runner-puxa-ficha`.

## Alternativas descartadas

- **Retry, backoff, User-Agent, concorrência, timeout por requisição:** medidos
  acima, 0 conexões em todas as variações.
- **Rodadas em lotes com retomada no runner hospedado:** cada lote bate no
  mesmo bloqueio; só reduziria o desperdício, o que o pré-voo já faz.
- **Proxy de saída:** custo recorrente e mais um segredo, com o mesmo risco de
  o IP do proxy entrar no bloqueio.
- **Agente launchd rodando o script direto, sem Actions:** perde o
  `gh:<run_id>` dos recibos, a revalidação encadeada e o histórico de runs, e
  exige copiar a service role para um arquivo local.
