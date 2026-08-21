# Fontes e casos candidatos ao golden set da fila serial de merge

Snapshot de evidência: 2026-08-21, entre 22:03 e 22:18 UTC. Este documento é uma entrada para o golden set, não uma descrição de automação já instalada.

## Contrato de decisão

| Decisão | Estado esperado |
|---|---|
| `WAIT` | Não muda estado remoto. O item não é o primeiro da fila, há check em andamento, rollback em andamento ou a prova ainda não pertence ao SHA corrente. |
| `BLOCK` | Mantém o primeiro PR como dono exclusivo da fila. Há falha, cancelamento, ausência de check esperado ou branch desatualizado. Deve gerar feedback, sem promover outro PR. |
| `MERGE` | Somente o primeiro PR, no SHA corrente, está atualizado com `main`, é mergeável e passou todo o manifesto de checks do PR. |
| `VERIFY` | O merge foi criado, mas a fila continua travada enquanto deployment e checks pós-merge do SHA exato não chegaram a um estado terminal verde. |
| `ROLLBACK` | Um check pós-merge ou deployment do SHA exato falhou. A fila continua travada até restaurar e verificar o último estado bom, incluindo compensação de banco quando aplicável. |
| `RELEASE` | O SHA mergeado tem deployment de produção bem-sucedido e todos os checks pós-merge configurados verdes. Só aqui o próximo PR pode adquirir a fila. |

Invariantes para graduar todos os casos:

1. A identidade é `PR + head SHA + merge SHA + deployment SHA`, nunca título ou branch isoladamente.
2. Um resultado de SHA antigo não libera nem bloqueia o SHA corrente.
3. Um PR fora da cabeça da fila nunca recebe `MERGE`, mesmo com todos os checks verdes.
4. Falha ou cancelamento no primeiro PR mantém os demais em `WAIT` até o mesmo PR ser corrigido e liberado, ou ser fechado explicitamente por uma pessoa.
5. Sucesso de deployment não substitui checks pós-merge, e check verde não substitui deployment de produção.
6. Rollback de código sem prova do estado do banco não satisfaz `RELEASE` quando o merge inclui migration ou escrita remota.

## Fontes rastreáveis

| ID | Fonte | Evidência usada |
|---|---|---|
| S01 | [PRs abertos](https://github.com/thiago-salvador/puxa-ficha/pulls) via `gh pr list --state open --json ...`, snapshot acima | 6 PRs abertos, em ordem de criação: #43, #44, #45, #46, #47 e #48. Todos estavam `BEHIND`, `MERGEABLE` e com os checks expostos verdes. |
| S02 | API de proteção de `main`, `repos/thiago-salvador/puxa-ficha/branches/main/protection` | `strict=true`; checks exigidos pelo branch protection: `verify` e `Rotas e acessibilidade (build local)`; proteção também vale para admins. |
| S03 | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) | CI roda em `pull_request` e `push` de `main`; `cancel-in-progress: true`; jobs `verify`, `Cobertura (informativa)` e `Rotas e acessibilidade (build local)`. Cobertura é informativa. |
| S04 | [`.github/workflows/replay-migrations.yml`](../../.github/workflows/replay-migrations.yml) | Replay real roda para PR e `main` quando migrations, readbacks, rollbacks ou harness mudam. O gate executa SQL contra Postgres descartável e compara o conjunto de falhas. |
| S05 | [`.github/workflows/a11y-producao.yml`](../../.github/workflows/a11y-producao.yml) | Só roda após push em `main`, contra `https://puxaficha.com.br`; publica relatório quando falha. |
| S06 | [`.github/workflows/ledger-guard.yml`](../../.github/workflows/ledger-guard.yml) | Roda em push de `main`, lê o ledger real do Supabase e falha em divergências definidas. `cancel-in-progress: false`. |
| S07 | [Execuções do GitHub Actions](https://github.com/thiago-salvador/puxa-ficha/actions) via `gh run list --limit 200 --json ...` | Universo medido: 200 execuções recentes, 26 em `failure`, `cancelled`, `timed_out`, `action_required`, `startup_failure` ou `stale`. Os casos abaixo citam o run exato. |
| S08 | [PR #39](https://github.com/thiago-salvador/puxa-ficha/pull/39) | Referência real: 9 checks de PR verdes, merge `5c85b3a4d492f0c6c1067f4bfc00ad136452e269`, CI, CodeQL, ledger e a11y de produção verdes no SHA mergeado, deployment Production `6025485802` com status `success`. |
| S09 | [Deployment de produção da referência](https://puxa-ficha-4c2chlvut-thiagosalvador.vercel.app) | Deployment `6025485802`, SHA `5c85b3a4d492f0c6c1067f4bfc00ad136452e269`, status final `success` em 2026-08-21T16:43:20Z. |
| S10 | [PR #35](https://github.com/thiago-salvador/puxa-ficha/pull/35) e [atividade de deployments](https://github.com/thiago-salvador/puxa-ficha/deployments/activity_log?environments_filter=Preview) | Falha real de deployment Preview `6011094851`, SHA `7000ca33b69a54f4521754c020a9aba3400cb32f`, status `failure`: `Deployment has failed`. |
| S11 | [PR #36](https://github.com/thiago-salvador/puxa-ficha/pull/36) | Reparo real posterior a divergência de ledger: título `ledger: devolve 20260820164117 ao repo, SQL já aplicado pelo MCP`; merge `01113ae...`; replay, CI, ledger e a11y pós-merge verdes. É forward-fix observado, não prova de rollback automático. |

## Casos observados e composições de falha

`OBSERVADO` significa que a combinação central de estado e SHA foi lida do GitHub atual. `COMPOSIÇÃO` combina sinais reais citados para testar uma transição que não foi observada de ponta a ponta. Composição não é alegação histórica.

| ID | Origem | Entrada normalizada | Decisão | Risco capturado |
|---|---|---|---|---|
| G01 | OBSERVADO, S08 e S09 | `pr=39; head=d8873b1; pr_checks=9/9 green; merge=5c85b3a; post={CI,CodeQL,Ledger,A11y}=green; prod.sha=5c85b3a; prod=success` | `RELEASE` | Caso de referência. Impede liberar sem correlação integral de SHA e sem as duas camadas verdes. |
| G02 | OBSERVADO, S01 e S02 | `queue_head=43; head=1364189; mergeable=true; sync=BEHIND; exposed_checks=green` | `BLOCK` | Evita mergear um resultado verde calculado contra base antiga quando a proteção exige branch atualizada. |
| G03 | OBSERVADO, S01 | `queue_head=43; candidate=44; candidate_checks=green; candidate_sync=BEHIND` | `WAIT` | Evita furar a ordem só porque um PR posterior terminou primeiro. |
| G04 | OBSERVADO, S01 e S04 | `queue_head=43; candidate=47; current_head=5e32fdc; CI=green; replay=green; mergeable=true` | `WAIT` | Um gate adicional verde não torna o quinto PR elegível antes do primeiro. |
| G05 | OBSERVADO, [run 32530366143](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32530366143) | `queue_head=47; head=7974128; CI=failure; terminal=true` | `BLOCK` | Falha real de CI precisa travar a fila e produzir feedback. |
| G06 | OBSERVADO, [run 32517124625](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32517124625) | `queue_head=41; head=50fef4e; CI=failure; terminal=true` | `BLOCK` | Evita promover PR seguinte quando o primeiro falhou no gate geral. |
| G07 | OBSERVADO, [run 32445933035](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32445933035) | `queue_head=37; head=b7db2f2; CI=failure; terminal=true` | `BLOCK` | Mantém propriedade da fila durante correção de hardening. |
| G08 | OBSERVADO, [run 32419971238](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32419971238) | `queue_head=35; head=7000ca3; CI=failure; terminal=true` | `BLOCK` | Não confunde falha de checks com autorização para tentar merge. |
| G09 | OBSERVADO, [run 32379563285](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32379563285) | `queue_head=33; head=97ef7fb; CI=failure; terminal=true` | `BLOCK` | Captura uma falha de CI em mudança de métricas. |
| G10 | OBSERVADO, [CI 32378830349](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32378830349) e [replay 32378830303](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32378830303) | `queue_head=32; head=a030fc6; CI=failure; replay=failure` | `BLOCK` | Exige agregar múltiplas falhas do mesmo SHA sem soltar a fila após receber a primeira. |
| G11 | OBSERVADO, [CI 32293784065](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32293784065) e [replay 32293784073](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32293784073) | `queue_head=26; head=3888ad4; CI=failure; replay=failure` | `BLOCK` | Regressão real de duas superfícies independentes no mesmo PR. |
| G12 | OBSERVADO, [run 32265746098](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32265746098) | `queue_head=23; head=bdd8ed5; CI=cancelled; terminal=true` | `BLOCK` | Cancelamento não equivale a verde nem pode ser ignorado silenciosamente. |
| G13 | OBSERVADO, [run 32250044360](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32250044360) | `queue_head=20; head=2f987fe; CI=cancelled; terminal=true` | `BLOCK` | Um rerun cancelado mantém o item bloqueado até nova prova do SHA corrente. |
| G14 | OBSERVADO, [replay 32178043147](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32178043147) e [CI 32178043158](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32178043158) | `queue_head=12; head=8b53662; replay=failure; CI=cancelled` | `BLOCK` | Evita liberar migration com replay falho porque o CI ficou apenas cancelado. |
| G15 | OBSERVADO, [run 32530337456](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32530337456) | `phase=post_merge; merge=ca2a0c8; release_check.Ledger=failure; A11y=green` | `ROLLBACK` | Um check de produção verde não mascara divergência do banco no mesmo SHA. |
| G16 | OBSERVADO, [run 32424010059](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32424010059) | `phase=post_merge; merge=688a805; release_check.Ledger=failure` | `ROLLBACK` | Falha real após entrada em `main`; o próximo PR não pode começar. |
| G17 | OBSERVADO, [run 32304941073](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32304941073) | `phase=post_merge; merge=adfef28; release_check.Ledger=failure` | `ROLLBACK` | Detecta divergência entre repositório e ledger depois do merge. |
| G18 | OBSERVADO, [run 32268001697](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32268001697) | `phase=post_merge; merge=16fd8a8; release_check.CI=failure; A11y=green` | `ROLLBACK` | Impede `RELEASE` quando a superfície pública passa mas o build/teste do merge falha. |
| G19 | OBSERVADO, [run 32263428277](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32263428277) | `phase=post_merge; merge=caaf32f; release_check.CI=failure` | `ROLLBACK` | Falha pós-merge do CI deve acionar restauração, não avançar a fila. |
| G20 | OBSERVADO, [run 32223085524](https://github.com/thiago-salvador/puxa-ficha/actions/runs/32223085524) | `phase=post_merge; merge=986c81c; configured_release_check.Ingestao=failure` | `ROLLBACK` | Se a ingestão estiver no manifesto do release, falha do mesmo SHA é bloqueante. Não trata workflow alheio como sucesso implícito. |
| G21 | OBSERVADO, S10 | `phase=pre_merge; pr=35; head=7000ca3; preview=failure; deployment=6011094851` | `BLOCK` | Falha de preview é feedback de PR e não pode virar merge automático. |
| G22 | COMPOSIÇÃO de S08 | `phase=post_merge; merge=5c85b3a; prod=pending; post_checks=pending` | `VERIFY` | Mantém o lock entre a criação do merge e o término real do deployment. |
| G23 | COMPOSIÇÃO de S08 e S09 | `phase=post_merge; merge=5c85b3a; prod.sha=5c85b3a; prod=success; Ledger=pending` | `VERIFY` | Deployment pronto não libera antes do último check pós-merge. |
| G24 | COMPOSIÇÃO de S08 e S10 | `phase=post_merge; merge=5c85b3a; prod.sha=5c85b3a; prod=failure` | `ROLLBACK` | Reaplica o sinal real de falha Vercel ao estágio de produção para provar a transição de rollback. Não foi uma ocorrência histórica desse SHA. |
| G25 | COMPOSIÇÃO de S10 e S11 | `phase=rollback; failed_merge=688a805; rollback.status=in_progress; next_pr=green` | `WAIT` | Impede corrida em que um PR posterior começa antes da restauração acabar. |
| G26 | COMPOSIÇÃO de S10 e S11 | `phase=rollback; rollback=success; failed_pr.fixed=false; next_pr=green` | `BLOCK` | Restaurar produção não pula o PR que falhou. O primeiro continua dono da fila. |
| G27 | COMPOSIÇÃO de S01, S10 e S11 | `phase=recovery; failed_pr.new_head=new_sha; current_checks=green; sync=up_to_date; next_pr=green` | `MERGE` | Só o mesmo PR corrigido volta a avançar; os posteriores permanecem esperando. |
| G28 | COMPOSIÇÃO de S01 e G05 | `queue_head=47 blocked; candidate=48; candidate_checks=green` | `WAIT` | Um PR posterior verde não contorna uma falha terminal do primeiro. |
| G29 | COMPOSIÇÃO do histórico real de #47, S01 e G05 | `pr=47; current_head=5e32fdc; success.sha=7974128; current_checks=missing` | `WAIT` | Check verde ou vermelho de SHA antigo não prova o novo commit. |
| G30 | COMPOSIÇÃO do histórico real de #47, S01 e G05 | `queue_head=47; current_head=5e32fdc; current_checks=green; sync=up_to_date; old_sha=7974128 failed` | `MERGE` | Falha antiga não envenena permanentemente um SHA novo que passou tudo. |
| G31 | COMPOSIÇÃO de S08 e S09 | `merge=5c85b3a; prod.sha=ca2a0c8; prod=success; checks.merge_sha=green` | `VERIFY` | Deployment verde de outro SHA não comprova que o merge corrente entrou no ar. |
| G32 | COMPOSIÇÃO de S04, S06 e S11 | `merge_touches_migration=true; code_restore=success; db_readback=missing; ledger=unknown` | `ROLLBACK` | Evita declarar restauração completa quando só o código voltou e o estado remoto não foi provado. |
| G33 | OBSERVADO como reparo, S11 | `repair_pr=36; merge=01113ae; replay=green; CI=green; Ledger=green; A11y=green` | `RELEASE` | Referência de reparo comprovado por replay e readback do ledger, sem confundir o título do PR com evidência suficiente. |

## Sequência composta de 10 PRs para provar FIFO

Esta sequência é `COMPOSIÇÃO`. Usa como material real os SHAs e bundles de checks dos PRs #43, #44, #45, #46, #47, #48, #41, #39, #37 e #35, mas não afirma que os dez estiveram abertos simultaneamente. Para isolar FIFO, cada fixture define `sync=up_to_date`, `mergeable=true` e todos os checks do SHA corrente verdes. O grader deve escolher exatamente o primeiro item ainda sem `RELEASE`.

Fila fixa: `P01=#43`, `P02=#44`, `P03=#45`, `P04=#46`, `P05=#47`, `P06=#48`, `P07=#41`, `P08=#39`, `P09=#37`, `P10=#35`.

| ID | Origem | Entrada normalizada | Decisão | Risco capturado |
|---|---|---|---|---|
| F01 | COMPOSIÇÃO, S01 e S08 | `released=[]; all P01..P10=green; queue_head=P01` | `MERGE P01` | Escolha determinística do mais antigo, não do check que respondeu primeiro. |
| F02 | COMPOSIÇÃO, S01 e S08 | `released=[P01]; all remaining=green; queue_head=P02` | `MERGE P02` | O segundo só adquire a fila após `RELEASE` do primeiro. |
| F03 | COMPOSIÇÃO, S01 e S08 | `released=[P01,P02]; all remaining=green; queue_head=P03` | `MERGE P03` | Preserva a ordem ao renovar o lock. |
| F04 | COMPOSIÇÃO, S01 e S08 | `released=[P01..P03]; all remaining=green; queue_head=P04` | `MERGE P04` | Não seleciona por número de PR nem duração de CI. |
| F05 | COMPOSIÇÃO, S01 e S08 | `released=[P01..P04]; all remaining=green; queue_head=P05` | `MERGE P05` | O quinto só fica elegível após quatro releases completos. |
| F06 | COMPOSIÇÃO, S01 e S08 | `released=[P01..P05]; all remaining=green; queue_head=P06` | `MERGE P06` | Evita duas operações de merge simultâneas na metade da fila. |
| F07 | COMPOSIÇÃO, S01 e S08 | `released=[P01..P06]; all remaining=green; queue_head=P07` | `MERGE P07` | Estado histórico do PR não altera a posição da fixture. |
| F08 | COMPOSIÇÃO, S01 e S08 | `released=[P01..P07]; all remaining=green; queue_head=P08` | `MERGE P08` | A referência verde também precisa esperar sua vez. |
| F09 | COMPOSIÇÃO, S01 e S08 | `released=[P01..P08]; all remaining=green; queue_head=P09` | `MERGE P09` | Confirma exclusão mútua perto do fim da fila. |
| F10 | COMPOSIÇÃO, S01 e S08 | `released=[P01..P09]; P10=green; queue_head=P10` | `MERGE P10` | O décimo só começa depois de nove releases completos. |

Caso adversarial da mesma sequência: `released=[P01..P03]; P04=failed; P05..P10=green` deve retornar `BLOCK P04` e `WAIT P05..P10`. Nenhum dos seis posteriores pode receber `MERGE` até P04 terminar o ciclo completo `MERGE -> VERIFY -> RELEASE` após a correção.

## Contagem e lacunas observadas

- Casos tabulados: 43, sendo 33 gerais e 10 passos FIFO.
- Casos integralmente observados: 22. Casos marcados como composição: 21.
- Universo GitHub medido: 6 PRs abertos, 200 runs recentes e 26 runs em conclusão problemática.
- Deployments examinados: os 100 mais recentes; 1 status final diferente de `success`, o Preview do PR #35.
- Referência positiva: G01, com 9 checks no PR, 4 workflows pós-merge correlacionados ao merge SHA e 1 deployment Production no mesmo SHA.
- Não foi observada uma execução automática de rollback de produção. G24 a G27 e G32 são composições necessárias para graduar o requisito, e não prova de que o mecanismo já existe.
- O branch protection atual exige apenas dois contextos. O manifesto mais forte pedido para a fila precisa ser explícito e versionado, pois `CodeQL`, Vercel, replay, ledger e a11y não estão todos representados nos dois contexts protegidos atuais.
