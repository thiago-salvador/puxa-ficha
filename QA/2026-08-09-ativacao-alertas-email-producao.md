# Ativação dos alertas por email em produção

Data: 2026-08-09. Autorização nomeada do dono na mesma conversa, sobre plano
detalhado: cadastrar a variável em Production, redeployar e rodar a janela de
validação com rollback drill.

Este recibo foi reescrito quatro vezes, sempre depois de revisão independente. O
que mudou em cada rodada está em "Correções acumuladas".

## Diagnóstico

O aviso "Alertas por email estão em validação operacional e ficam indisponíveis
até o envio real ser comprovado em caixa de teste" não era texto errado. Era o
bloco de fallback de `src/components/alerts/FollowCandidateButton.tsx:106`,
servido porque `NEXT_PUBLIC_ALERTS_EMAIL_ENABLED` nunca foi cadastrada em
produção. `vercel env ls production` trazia 17 variáveis e nenhuma delas.

O resto do recurso já estava no ar e sem gate de flag nenhum: as oito rotas de
`/api/alerts/*`, a página `/alertas/gerenciar` e o cron diário `0 12 * * *`. Só
a superfície de assinatura na ficha estava escondida. Por isso o dono recebia os
emails enquanto o site dizia que o recurso estava indisponível.

## Cronologia medida

Identificadores e instantes completos, como estão nos artefatos.

| Instante (UTC) | Evento | Fonte |
|---|---|---|
| 2026-08-09T21:13:58Z | primeiro cadastro da variável | revisão independente; não persistido neste diretório |
| 2026-08-09T21:14:16.574Z | `dpl_bFcFvcEGFtmA16XxAvWDkAW4Hot8` criado, redeploy de `dpl_GmZwhzpHva9Gd93uBWeH3UsLzs6q`, flag ligada | `deployments-janela.json` |
| 2026-08-09T21:22:24.370Z a 2026-08-09T21:24:56.439Z | janela E2E completa, doze eventos, sete rotas HTTP | `runtime-logs-pf-alerts.jsonl` |
| entre 21:24:56Z e 21:25:54Z | variável removida (rollback drill) | não persistido; ver critério 9 |
| 2026-08-09T21:25:54.459Z | `dpl_6fHn3Req3Zgm5E4cWaPnViQpuWPG` criado, redeploy de `dpl_bFcFvcEGFtmA16XxAvWDkAW4Hot8`, flag desligada | `deployments-janela.json` |
| 2026-08-09T21:28:17.705Z | variável recadastrada, é a que está viva | `env-metadata-api.json` |
| 2026-08-09T21:28:25.260Z | `dpl_4WhsmgnU7hL9sLMFP41eDLetDuqq` criado, redeploy de `dpl_6fHn3Req3Zgm5E4cWaPnViQpuWPG`, flag religada | `deployments-janela.json` |
| 2026-08-09T23:08:37.136Z | leitura de DOM em produção, já sob o commit `0b08a3b6e763be3cf438f45553062dd57f30244b` | `dom-ficha-pos-ativacao.json` |
| 2026-08-09T23:09:11.999645Z | leitura final do banco | `sql-estado-final.json` |

**A janela contém dez deployments, dos quais cinco são de produção.** Três deles
pertencem a este ato e dois nasceram de push no Git, em sessões concorrentes. A
seleção dos três não é feita por horário nem por ordem, e sim por regra
determinística sobre campos da própria API, descrita no critério 12.

## Manifesto de evidências

Diretório: `QA/evidencias/2026-08-09-ativacao-alertas/`, versionado.

Os artefatos não ficam em `output/`, que o Git ignora. Este repo já pagou esse
preço: prova em pasta ignorada não sobrevive ao PR.

| Arquivo | SHA-256 |
|---|---|
| `deployments-janela.json` | `70dae2178d80e46036483a614e49f0a55f63c1ee35dd703458f933a06d8d941f` |
| `dom-ficha-pos-ativacao.json` | `45169bda565c5ee590d14e38dae5caa879178be6ccb349eade9e2f541eceef6e` |
| `email-verificacao-metadata.json` | `2031756ac4577290ca8d353d6ae1f41fcafee3ca2da7b89e0f26f954c26d9e1d` |
| `env-ls-production.txt` | `6f9d9ed778605658ce88e821e3270b1cba413bd6b8a7887a137ac6b680e73020` |
| `env-metadata-api.json` | `b4adc2b1f27a2ff6211713781793903bc687f3098b51d18142b2259aa6e25494` |
| `git-estado-criterio-11.json` | `990de38440941e6ee9ee697b62a70662f4370c9368e68de5e1e9c69b8e05e766` |
| `runtime-logs-pf-alerts.jsonl` | `b48510a0e87c8c6fb9a1ac1513bad3add9047d4732ca7115d30111bcb3e87b4a` |
| `sql-estado-final.json` | `a0fccdc0ef315bbc18c10c5229aeffa4144eef5c995780a6a25933caff23dc26` |

Conferir: `cd QA/evidencias/2026-08-09-ativacao-alertas && shasum -a 256 -c MANIFEST.sha256`

### Dados pessoais e segredos

Nenhum endereço privado foi preservado nos artefatos. O único endereço que
permanece é o remetente público do produto, `alertas@puxaficha.com.br`, que já é
visível para qualquer pessoa que receba um alerta.

O endereço da caixa de teste foi substituído por `[test-inbox-redacted]`. Os dois
valores de `email_hash` que apareciam em `sql-estado-final.json` foram removidos,
sem substituição por outro identificador: `hashAlertEmail`, em
`src/lib/alerts-shared.ts`, é SHA-256 **sem sal** sobre o endereço normalizado,
então o valor é correlacionável por quem tenha um endereço candidato. Uma revisão
anterior deste recibo afirmou que esse hash era salgado; a afirmação era falsa e
foi escrita sem conferir a implementação. O campo `createdBy` foi removido de
`env-metadata-api.json`, porque identifica um usuário e não é necessário para o
critério, que afirma existência e escopo da variável, não autoria.

`env-ls-production.txt` lista apenas nomes de variáveis, todos com valor
`Encrypted`. Nenhum artefato carrega token, cookie ou valor de segredo.

## Registro por critério

**Seis critérios em PASS: 1, 2, 4, 7, 8 e 12.**
**Seis critérios em FAIL: 3, 5, 6, 9, 10 e 11.**

Nenhum critério foi reduzido de escopo para virar PASS. O texto de cada um é o
mesmo do eval aprovado antes da execução.

O contrato de `Settings/CANDIDATE_DATA_COMPLETENESS_EVAL.md` é explícito: o
localizador aponta para um arquivo absoluto existente e traz o SHA-256 do
conteúdo, e referência textual ou transcript do agente não passam. Todo critério
cujo grader era leitura ao vivo não persistida é FAIL, mesmo quando o
comportamento observado foi o esperado.

Os caminhos absolutos abaixo são os do worktree isolado
`/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas`,
onde este commit foi construído. Em qualquer checkout, o caminho repo-relativo é
`QA/evidencias/2026-08-09-ativacao-alertas/`.

---

### Critério 1: flag cadastrada com escopo Production

- **Resultado:** PASS
- **Timestamp (UTC):** 2026-08-09T21:28:17.705Z (criação da variável viva)
- **SHA aplicável:** não há commit aplicável, porque a variável é configuração de
  projeto e não código. O identificador derivado da evidência é `Z16V6HQcG5G0maxC`.
- **Comando:** `GET https://api.vercel.com/v9/projects/{projectId}/env?teamId={orgId}&decrypt=false`; corroborado por `npx vercel env ls production`
- **Localizador:** `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas/QA/evidencias/2026-08-09-ativacao-alertas/env-metadata-api.json`
- **SHA-256:** `b4adc2b1f27a2ff6211713781793903bc687f3098b51d18142b2259aa6e25494`
- **Corroboração:** `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas/QA/evidencias/2026-08-09-ativacao-alertas/env-ls-production.txt`, SHA-256 `6f9d9ed778605658ce88e821e3270b1cba413bd6b8a7887a137ac6b680e73020`

### Critério 2: ficha sem o aviso e com a superfície real

- **Resultado:** PASS
- **Timestamp (UTC):** 2026-08-09T23:08:37.136Z
- **SHA aplicável:** `0b08a3b6e763be3cf438f45553062dd57f30244b`, lido de
  `/api/deployment-info` no mesmo instante da captura e registrado no artefato
- **Comando:** Playwright `page.evaluate` sobre o DOM de `https://puxaficha.com.br/candidato/lula`, após scroll e 4s de espera pela hidratação
- **Localizador:** `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas/QA/evidencias/2026-08-09-ativacao-alertas/dom-ficha-pos-ativacao.json`
- **SHA-256:** `45169bda565c5ee590d14e38dae5caa879178be6ccb349eade9e2f541eceef6e`
- **Medido:** `validacaoOperacional` 0, `receberAlertas` 1, `seguirCandidato` 1

### Critério 3: cadastro E2E pelo formulário em produção

- **Resultado:** FAIL
- **Timestamp (UTC):** 2026-08-09T21:22:24.530Z
- **SHA aplicável:** `a1ffde9849850000d0974886b7eff53ff03fe8b1`, commit do deployment `dpl_bFcFvcEGFtmA16XxAvWDkAW4Hot8`
- **Comando:** `get_runtime_logs`, query `pf-alerts`, janela 21:10Z a 21:35Z
- **Localizador:** `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas/QA/evidencias/2026-08-09-ativacao-alertas/runtime-logs-pf-alerts.jsonl`
- **SHA-256:** `b48510a0e87c8c6fb9a1ac1513bad3add9047d4732ca7115d30111bcb3e87b4a`
- **Motivo do FAIL:** o critério exige resposta 200 **e** uma linha nova em
  `alert_subscribers` com `verified=false`. O artefato prova a saída da rota,
  com `"reason":"requires_verification_email_sent"`. O estado da linha foi lido
  ao vivo por SQL e não persistido, e a linha foi apagada às 21:24:56Z pelo
  próprio critério 7, então não há como conferir depois.

### Critério 4: envio real para a caixa de teste

- **Resultado:** PASS
- **Timestamp (UTC):** 2026-08-09T21:22:24.370Z (aceite do provedor) e 2026-08-09T21:22:25Z (entrega na caixa)
- **SHA aplicável:** `a1ffde9849850000d0974886b7eff53ff03fe8b1`
- **Comando:** `get_runtime_logs`, query `pf-alerts`; leitura da caixa de teste via conector Gmail
- **Localizador:** `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas/QA/evidencias/2026-08-09-ativacao-alertas/email-verificacao-metadata.json`
- **SHA-256:** `2031756ac4577290ca8d353d6ae1f41fcafee3ca2da7b89e0f26f954c26d9e1d`
- **Corroboração:** `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas/QA/evidencias/2026-08-09-ativacao-alertas/runtime-logs-pf-alerts.jsonl`, SHA-256 `b48510a0e87c8c6fb9a1ac1513bad3add9047d4732ca7115d30111bcb3e87b4a`
- **Amarração:** o `messageId` do Resend `37d02bd7-64a5-4f1c-8994-15ee0c3d4572`
  aparece nos dois artefatos, ligando o log de produção à mensagem recebida sem
  expor o endereço.

### Critério 5: confirmação pelo link do email

- **Resultado:** FAIL
- **Timestamp (UTC):** 2026-08-09T21:23:13.218Z
- **SHA aplicável:** `a1ffde9849850000d0974886b7eff53ff03fe8b1`
- **Comando:** `get_runtime_logs`, query `pf-alerts`, janela 21:10Z a 21:35Z
- **Localizador:** `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas/QA/evidencias/2026-08-09-ativacao-alertas/runtime-logs-pf-alerts.jsonl`
- **SHA-256:** `b48510a0e87c8c6fb9a1ac1513bad3add9047d4732ca7115d30111bcb3e87b4a`
- **Motivo do FAIL:** o critério exige que o SQL mostre `verified=true` e
  `verified_at` preenchido. O artefato prova `"reason":"verified_ok"` na rota,
  que é a saída do handler, não o estado da linha. O SQL foi lido ao vivo e não
  persistido.

### Critério 6: follow e unfollow

- **Resultado:** FAIL
- **Timestamp (UTC):** 2026-08-09T21:23:48.703Z (unfollow) e 2026-08-09T21:24:05.970Z (follow)
- **SHA aplicável:** `a1ffde9849850000d0974886b7eff53ff03fe8b1`
- **Comando:** `get_runtime_logs`, query `pf-alerts`, janela 21:10Z a 21:35Z
- **Localizador:** `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas/QA/evidencias/2026-08-09-ativacao-alertas/runtime-logs-pf-alerts.jsonl`
- **SHA-256:** `b48510a0e87c8c6fb9a1ac1513bad3add9047d4732ca7115d30111bcb3e87b4a`
- **Motivo do FAIL:** o critério exige contagem em `alert_subscriptions` igual a
  1 e depois 0 para o assinante de teste. O artefato traz `"reason":"unfollow_ok"`
  e `"reason":"follow_ok"`, que são motivos de saída da rota, não contadores. As
  contagens foram lidas ao vivo e não persistidas.

### Critério 7: descadastro e exclusão

- **Resultado:** PASS
- **Timestamp (UTC):** 2026-08-09T21:24:37.750Z (descadastro), 2026-08-09T21:24:56.337Z (exclusão) e 2026-08-09T23:09:11.999645Z (conferência de resíduo)
- **SHA aplicável:** `a1ffde9849850000d0974886b7eff53ff03fe8b1`
- **Comando:** `get_runtime_logs`, query `pf-alerts`; e SQL `select count(*)` em `alert_subscribers` e em `alert_subscriptions` filtrando pelo `email_hash` do assinante de teste
- **Localizador:** `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas/QA/evidencias/2026-08-09-ativacao-alertas/sql-estado-final.json`
- **SHA-256:** `a0fccdc0ef315bbc18c10c5229aeffa4144eef5c995780a6a25933caff23dc26`
- **Corroboração:** `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas/QA/evidencias/2026-08-09-ativacao-alertas/runtime-logs-pf-alerts.jsonl`, SHA-256 `b48510a0e87c8c6fb9a1ac1513bad3add9047d4732ca7115d30111bcb3e87b4a`
- **Por que este passa e 3, 5, 6 e 10 não:** o estado final que o critério exige
  é ausência, e ausência é conferível depois. `subscriber_teste` 0 e
  `subscriptions_teste` 0 estão persistidos no artefato.

### Critério 8: monitoramento

- **Resultado:** PASS
- **Timestamp (UTC):** janela 2026-08-09T21:10:00Z a 2026-08-09T21:35:00Z
- **SHA aplicável:** `a1ffde9849850000d0974886b7eff53ff03fe8b1`
- **Comando:** `get_runtime_logs`, `projectId=prj_e1FrAm7eB0K8X0N7udqreQz5ragS`, query `pf-alerts`, `environment=production`
- **Localizador:** `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas/QA/evidencias/2026-08-09-ativacao-alertas/runtime-logs-pf-alerts.jsonl`
- **SHA-256:** `b48510a0e87c8c6fb9a1ac1513bad3add9047d4732ca7115d30111bcb3e87b4a`
- **Medido:** doze eventos no total. **Onze têm `httpStatus` 200**, cobrindo as
  sete rotas HTTP (`subscribe`, `verify`, `me`, `toggle`, `unsubscribe-all`,
  `delete-data`, `session`). O décimo segundo é `resend_accepted`, emitido pelo
  rótulo `email-transport`, que **não tem `httpStatus`** por não ser saída de
  rota HTTP: registra o aceite do provedor de email. PII redigida na origem em
  todos eles.

### Critério 9: rollback exercitado

- **Resultado:** FAIL
- **Timestamp (UTC):** 2026-08-09T21:25:54.459Z (deployment sem a flag) e 2026-08-09T21:28:25.260Z (deployment com a flag religada)
- **SHA aplicável:** `a1ffde9849850000d0974886b7eff53ff03fe8b1`, commit dos dois deployments do drill
- **Comando:** `GET /v6/deployments` e `GET /v13/deployments/{id}`, janela 21:10Z a 22:00Z
- **Localizador:** `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas/QA/evidencias/2026-08-09-ativacao-alertas/deployments-janela.json`
- **SHA-256:** `70dae2178d80e46036483a614e49f0a55f63c1ee35dd703458f933a06d8d941f`
- **Motivo do FAIL:** o critério exige o aviso presente uma vez com a flag
  removida e zero vez com ela religada, nos dois estados. O artefato prova que os
  dois deployments existem, com que commit e em que ordem de redeploy, e não o
  conteúdo do DOM em cada um. As duas leituras de DOM do drill foram feitas ao
  vivo e não persistidas. A remoção da variável entre 21:24:56Z e 21:25:54Z
  também não tem artefato: a listagem de env mostra apenas o estado corrente.
  Reproduzir exigiria desligar a flag em produção outra vez, o que a revisão
  vetou, então o critério fica FAIL e não é rebaixado.

### Critério 10: assinante real intacto

- **Resultado:** FAIL
- **Timestamp (UTC):** 2026-08-09T21:12Z (baseline) e 2026-08-09T23:09:11.999645Z (medição final)
- **SHA aplicável:** `0b08a3b6e763be3cf438f45553062dd57f30244b`, commit em produção no instante da medição final
- **Comando:** SQL sobre `alert_subscribers` lendo `verified`, `updated_at`, `last_digest_sent_at` e a contagem de inscrições por join
- **Localizador:** `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas/QA/evidencias/2026-08-09-ativacao-alertas/sql-estado-final.json`
- **SHA-256:** `a0fccdc0ef315bbc18c10c5229aeffa4144eef5c995780a6a25933caff23dc26`
- **Motivo do FAIL:** o critério exige comparação contra um baseline pré-ato. O
  baseline persistido cobre só `subscribers_total`, `subscriptions_total` e
  `real_updated_at`. Os outros três campos que o critério nomeia, `real_verified`,
  `real_last_digest` e `real_inscricoes`, só têm medição pós-ato, e afirmar que
  não mudaram exigiria inventar retroativamente o valor anterior. Uma revisão
  anterior deste recibo fez exatamente isso ao declarar PASS.

### Critério 11: zero mudança de código

- **Resultado:** FAIL
- **Timestamp (UTC):** 2026-08-09T21:45Z (coleta do estado Git)
- **SHA aplicável:** `0b08a3b6e763be3cf438f45553062dd57f30244b`, HEAD do checkout compartilhado na coleta
- **Comando:** `git log --since=2026-08-09T20:00:00Z --until=2026-08-09T23:59:00Z --date=iso-strict --format='%H|%cd|%an|%s' 0b08a3b` e `git worktree list`
- **Localizador:** `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas/QA/evidencias/2026-08-09-ativacao-alertas/git-estado-criterio-11.json`
- **SHA-256:** `990de38440941e6ee9ee697b62a70662f4370c9368e68de5e1e9c69b8e05e766`
- **Motivo do FAIL:** o artefato registra o estado recuperável e, com ele, a
  razão de o critério não fechar. O `git status` pré-ato não foi persistido, ou
  seja falta o lado esquerdo da comparação. Pelo menos duas sessões concorrentes
  commitaram no mesmo checkout dentro da janela, e uma delas, no commit
  `0b08a3b`, absorveu arquivos que esta sessão havia deixado untracked. E
  `git status` não registra autoria de escrita, então nem um baseline persistido
  separaria as sessões com certeza.

### Critério 12: custo dentro do teto

- **Resultado:** PASS
- **Timestamp (UTC):** 2026-08-09T21:14:16.574Z (primeiro deployment do ato) a 2026-08-09T21:28:25.260Z (terceiro)
- **SHA aplicável:** `a1ffde9849850000d0974886b7eff53ff03fe8b1`, commit dos três deployments do ato, gravado como `commitSha` em cada registro
- **Comando:** `GET /v6/deployments?projectId=...&since=...&until=...` e `GET /v13/deployments/{id}` para cada um, somente leitura
- **Localizador:** `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-recibo-alertas/QA/evidencias/2026-08-09-ativacao-alertas/deployments-janela.json`
- **SHA-256:** `70dae2178d80e46036483a614e49f0a55f63c1ee35dd703458f933a06d8d941f`
- **Regra determinística de seleção:** `target == "production" AND source == "cli" AND meta.action == "redeploy" AND meta.originalDeploymentId != null`.
  Aplicada sobre os dez deployments da janela, seleciona exatamente três. Os
  outros dois de produção nasceram de push no Git e trazem `source == "git"`, sem
  `action` e sem `originalDeploymentId`. A regra não usa horário nem ordem, e é
  reaplicável por terceiro sobre o próprio artefato.
- **Corrente de redeploy, que fecha a seleção:**
  `dpl_GmZwhzpHva9Gd93uBWeH3UsLzs6q` (anterior ao ato) →
  `dpl_bFcFvcEGFtmA16XxAvWDkAW4Hot8` →
  `dpl_6fHn3Req3Zgm5E4cWaPnViQpuWPG` →
  `dpl_4WhsmgnU7hL9sLMFP41eDLetDuqq`.
  Cada um aponta para o anterior em `meta.originalDeploymentId`, e nenhum outro
  deployment da janela entra na corrente.
- **Medido:** 3 deployments de produção atribuíveis ao ato, teto de 4; 14 minutos
  e 8,7 segundos entre o primeiro e o terceiro, teto de 90 minutos.

---

## O que a janela fechou no gate do produto

O comportamento de descadastro e exclusão, que é o único dos cinco itens do gate
do `Settings/CANDIDATE_DATA_COMPLETENESS_WORKFLOW.md` que nunca havia sido
exercitado em produção, foi exercitado e tem evidência conferível (critério 7).

Os itens de cadastro, confirmação e follow foram exercitados e funcionaram, mas a
evidência não sobreviveu ao contrato (critérios 3, 5 e 6). Fechá-los exige uma
nova janela com captura persistida do estado do banco a cada transição, antes de
considerar o gate do produto integralmente comprovado.

## Correções acumuladas

1. **O "defeito novo" no email era falso positivo e foi removido.** A primeira
   versão afirmava que o link de apagar dados chegava corrompido no email real. A
   revisão independente foi ao MIME bruto e refutou. Não há defeito de produto e
   nenhuma correção é indicada. O erro de método foi meu: a assinatura que
   observei era igualmente compatível com dupla decodificação na ferramenta de
   leitura, e eu não fui à fonte primária antes de escrever o diagnóstico e abrir
   uma tarefa.
2. **Horário do cadastro da variável corrigido.** A primeira versão dizia 21:16Z.
   O primeiro cadastro foi 21:13:58Z, e a variável que está viva foi criada
   2026-08-09T21:28:17.705Z, no recadastro pós rollback drill.
3. **Recibo passou a cumprir o contrato de evidência**, com resultado, timestamp
   UTC, SHA aplicável, comando ou query, localizador absoluto existente e SHA-256
   por critério.
4. **A afirmação de aprovação integral caiu, e as versões seguintes também não
   sobreviveram.** A primeira declarava os doze critérios aprovados. A segunda
   inventou duas categorias intermediárias que o contrato não prevê. A terceira
   ainda declarava PASS no critério 10 apoiada num baseline que não cobria os
   campos comparados. Só existem PASS e FAIL, e o placar é seis e seis.
5. **Endereço da caixa de teste removido** dos artefatos, substituído por
   `[test-inbox-redacted]`.
6. **Os dois `email_hash` saíram de `sql-estado-final.json`, e a alegação de que
   eram salgados era falsa.** `hashAlertEmail` é SHA-256 sem sal sobre o endereço
   normalizado, correlacionável por quem tenha um endereço candidato, e o
   repositório é público.
7. **Worktree movido para caminho estável.** Os localizadores apontavam para um
   diretório de sessão sob `/private/tmp`, que não sobrevive à máquina nem à
   sessão.
8. **Cronologia com identificadores e instantes completos**, e a contagem de
   deployments explicitada: dez na janela, cinco de produção, três do ato. A
   versão anterior dizia "três deployments de produção criados por esta sessão"
   sem regra que sustentasse a atribuição.
9. **Critério 12 ganhou regra determinística de seleção**, baseada em `source`,
   `meta.action` e `meta.originalDeploymentId`, mais a corrente de redeploy. Sem
   ela, a atribuição dos três seria só asserção.
10. **Critério 8 corrigido na contagem.** A versão anterior dizia que os doze
    eventos tinham `httpStatus` 200. São onze; o décimo segundo é
    `resend_accepted`, que não tem `httpStatus`.
11. **Critério 11 ganhou artefato próprio**, que registra o estado Git
    recuperável e a razão da impossibilidade de isolar a sessão. Continua FAIL,
    agora com localizador e SHA-256.
12. **`createdBy` removido de `env-metadata-api.json`**, e
    `email-verificacao-metadata.json` passou a conter só fatos persistidos ali,
    sem alegações sobre estado de token, MIME bruto, renderização do cliente ou
    DKIM, que não têm fonte primária armazenada neste diretório.

## Defeito de método, que é o que vale guardar

O primeiro grader escrito para o critério 2 era `curl | grep` no HTML da ficha.
Ele deu 0 ocorrências de "Alertas da ficha" **antes** do ato, quando o aviso
estava comprovadamente na tela, porque `CandidatoProfile` é carregado por
`DeferredCandidatoProfile` depois da hidratação. Um grader de HTML aprovaria a
mudança sem medir nada.

Os seis FAIL são do mesmo tipo: eu instrumentei a execução para observar, não
para provar. Ler o banco ao vivo entre dois cliques responde "funcionou?" na hora
e não deixa nada conferível depois. Num fluxo cujo último passo apaga o próprio
sujeito, isso é irrecuperável.

O segundo padrão, que apareceu três vezes no mesmo dia, é afirmar propriedade
técnica sem abrir o que a implementa: o link do email dado como corrompido sem
ler o MIME, o hash de email dado como salgado sem ler `hashAlertEmail`, e os três
deployments atribuídos ao ato sem uma regra que os selecionasse.

## Estado ao fim

- `NEXT_PUBLIC_ALERTS_EMAIL_ENABLED=true` em Production, criada
  2026-08-09T21:28:17.705Z. Variável é de projeto, então sobrevive a deploys
  futuros sem nova ação. A captura de DOM de 2026-08-09T23:08:37.136Z confirma
  isso contra o deployment do commit `0b08a3b6e763be3cf438f45553062dd57f30244b`,
  gerado por outra sessão depois desta janela.
- Banco no estado medido em 2026-08-09T23:09:11.999645Z: 1 assinante,
  2 inscrições, zero resíduo do teste.
- A ativação em produção segue válida. Os seis FAIL são de evidência, não de
  comportamento, e nenhum deles indica desligar a flag.
