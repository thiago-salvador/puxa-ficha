# Descoberta GitHub para a fila serial de merges

Snapshot read-only: `2026-08-21T19:07:29-03:00`, repositório `thiago-salvador/puxa-ficha`, `main` em `ca2a0c8b6bc7c02a0123ab7c3fe3eab15e43638d`.

## Conclusão operacional

A fila precisa combinar duas garantias diferentes:

1. Um grupo fixo de `concurrency`, com `cancel-in-progress: false`, impede dois coordenadores de escreverem ao mesmo tempo.
2. Labels persistentes guardam qual PR possui o único slot entre execuções. A ordem interna do GitHub Actions não pode decidir a ordem dos PRs, pois a documentação não garante essa ordem.

O slot só pode ser liberado depois que o SHA de merge passar por todos os checks aplicáveis em `main`, pelo deployment `Production` da Vercel e pela verificação de produção. Em caso de falha, o PR original continua como dono do slot durante o rollback. Nenhum outro PR é selecionado.

O estado atual prova que esse bloqueio pós-merge é necessário: no SHA atual da `main`, `ca2a0c8`, o deployment `Production` e o status `Vercel` estavam em `success`, mas `Ledger do banco vs supabase/migrations` terminou em `failure`.

## Estado real do repositório

### Proteção e merges

- `main` está protegida, com proteção aplicada também a administradores.
- Checks obrigatórios, ambos da app GitHub Actions, app id `15368`:
  - `verify`
  - `Rotas e acessibilidade (build local)`
- A proteção usa `strict: true`, portanto o PR precisa estar atualizado com a base.
- Há zero aprovações obrigatórias, sem Code Owners obrigatório e sem resolução obrigatória de conversas.
- Force push e deleção da `main` estão proibidos.
- Não há rulesets adicionais.
- Auto-merge do repositório está desativado.
- Merge commit e squash estão habilitados. Rebase está desabilitado.
- A configuração atual remove a branch depois do merge.
- O repositório é público e pertence a uma conta pessoal.
- A conta autenticada na inspeção foi `thiago-salvador`, com permissão administrativa no repositório. Foram observados somente os nomes dos scopes `read:org`, `repo` e `workflow`, sem registrar credencial.

### PRs abertos no snapshot

Todos eram não-draft, apontavam para `main` e não tinham labels. A seleção determinística seria a primeira linha.

| Ordem | PR | Criado em UTC | Head SHA |
|---|---:|---|---|
| 1 | #43 | 2026-08-21 21:44:03 | `136418930f4b12686ec53ece6028e0ce7f98d647` |
| 2 | #44 | 2026-08-21 21:44:15 | `b9f9565eb24fcf250d4d792afa748644797708b1` |
| 3 | #45 | 2026-08-21 21:45:01 | `c99aeab9e02cf26bbcc7017d1238211fd2e71593` |
| 4 | #46 | 2026-08-21 21:48:49 | `fd04e78774cd1bf3c862226bb85428f8571d50c5` |
| 5 | #47 | 2026-08-21 21:50:37 | `5e32fdc8d2f1d721c1c2637a1b88824da350c3bb` |
| 6 | #48 | 2026-08-21 21:50:56 | `10575cb008fa5e873d9b6adb3753435bccdeb320` |

Critério de seleção: listar PRs `open`, `draft=false`, `base.ref=main`, excluir o PR interno de rollback e ordenar por `created_at` ascendente, com `number` ascendente como desempate. A seleção só acontece quando não existe nenhum dono ativo.

## Inventário de checks

### No PR

| Check ou status | Origem | Classe | Observação |
|---|---|---|---|
| `verify` | GitHub Actions, `CI` | obrigatório | Required pela proteção. |
| `Rotas e acessibilidade (build local)` | GitHub Actions, `CI` | obrigatório | Required pela proteção. |
| `Cobertura (informativa)` | GitHub Actions, `CI` | informativo local | O nome declara que é informativo, mas o pedido de todos verdes exige `success` quando existir. |
| `Gate de replay (conjunto de falhas congelado)` | GitHub Actions, `Replay real de migrations` | condicional local | Só aparece quando paths de migration, rollback ou harness mudam. Foi observado no PR #47. |
| `CodeQL` | GitHub Advanced Security | segurança externo | Observado nos seis PRs. |
| `Analyze (python)` | GitHub Actions, workflow dinâmico CodeQL | segurança externo | Default setup configurado. |
| `Analyze (javascript-typescript)` | GitHub Actions, workflow dinâmico CodeQL | segurança externo | Default setup configurado. |
| `Vercel` | Vercel GitHub App, commit status | deployment externo | Preview observado nos seis PRs. |
| `CodeRabbit` | CodeRabbit, commit status | revisão externa | Observado em cinco dos seis PRs; ausência não deve ser confundida com falha sem uma política explícita que o torne obrigatório. |

O CodeQL default setup está `configured`, usa query suite `extended` e runner `standard`, cobrindo `javascript`, `javascript-typescript`, `python` e `typescript`.

Política segura de leitura para o PR:

- Consultar check runs e o combined commit status do SHA exato de head.
- Exigir presença e `success` dos dois contexts required.
- Para todos os checks e statuses que existirem no SHA, bloquear enquanto estiverem `queued`, `in_progress` ou `pending`, e bloquear em `failure`, `error`, `cancelled`, `timed_out`, `action_required` ou `stale`.
- Tratar `neutral` e `skipped` como não verdes, salvo allowlist explícita por nome. Não inferir sucesso porque um check esperado não apareceu.
- Reconsultar o PR imediatamente antes do merge e exigir que `head.sha`, `base.ref`, `draft`, estado aberto e mergeabilidade continuem válidos.

### Na `main`, depois do merge

| Check ou status | Origem | Classe | Aplicação |
|---|---|---|---|
| `verify` | GitHub Actions, `CI` | obrigatório também no novo SHA | Todo push da `main`. |
| `Rotas e acessibilidade (build local)` | GitHub Actions, `CI` | obrigatório também no novo SHA | Todo push da `main`. |
| `Cobertura (informativa)` | GitHub Actions, `CI` | informativo local | Todo push da `main`. |
| `Acessibilidade (produção)` | GitHub Actions | pós-merge de produção | Todo push da `main`, testa `https://puxaficha.com.br`. |
| `Ledger do banco vs supabase/migrations` | GitHub Actions | pós-merge de produção | Todo push da `main`, faz SELECT no Supabase e compara o ledger. |
| `Gate de replay (conjunto de falhas congelado)` | GitHub Actions | pós-merge condicional | Só quando os paths configurados mudam. |
| `Analyze (python)` e `Analyze (javascript-typescript)` | CodeQL dinâmico | segurança pós-merge | Observados em pushes recentes da `main`. |
| `Vercel` | Vercel GitHub App, commit status | externo | Precisa ser `success` no SHA de merge. |
| Deployment `Production` | Vercel GitHub App | externo | O status mais recente do deployment do SHA precisa ser `success`. |

`Revalidar tags públicas` é somente `workflow_dispatch`; não integra hoje o fluxo automático de push. Se a definição de “entrou no ar” exigir revalidação de cache, o coordenador precisa dispará-lo explicitamente e esperar seu resultado no SHA correto.

## Eventos que podem acordar o coordenador

| Evento | Uso | Restrição |
|---|---|---|
| `workflow_run: completed` para `CI`, `Replay real de migrations` e `CodeQL` | Reavaliar checks GitHub Actions sem polling contínuo. | Workflow privilegiado deve usar apenas APIs e nunca baixar artifact, cache ou código do PR. |
| `pull_request_target` em `opened`, `reopened`, `synchronize`, `ready_for_review`, `converted_to_draft` e `closed` | Descobrir nova fila e mudanças de elegibilidade usando o workflow da `main`. | Nunca fazer checkout do head, nunca executar campos do evento no shell e nunca rodar código do PR com token de escrita. |
| `status` | Reavaliar statuses externos `Vercel` e `CodeRabbit`. | Validar repositório e SHA via API, não confiar isoladamente no payload. |
| `check_run: completed` | Reavaliar checks de GitHub Apps externas. | Não cobre checks cuja suite foi criada pelo GitHub Actions, por proteção contra recursão. |
| `deployment_status` | Acordar quando a Vercel altera o deployment. | `inactive` não dispara workflow. Sempre consultar o deployment do SHA exato. |
| `workflow_dispatch` | Recuperação manual e dry-run. | O arquivo precisa existir na default branch. |
| `schedule` | Reconciliação periódica quando um evento for perdido ou o runner morrer. | Não seleciona outro PR se existir label ativa. |

`check_run` e `check_suite` não substituem `workflow_run`: o GitHub não dispara esses eventos para suites criadas pelo próprio GitHub Actions ou associadas a ele.

## Lock persistente e máquina de estados

Labels propostas, ainda inexistentes no repositório:

- `merge-queue/active`, único dono do slot.
- `merge-queue/pre-merge`.
- `merge-queue/post-merge`.
- `merge-queue/rollback`.
- `merge-queue/blocked`.
- `merge-queue/rollback-pr`, exclui o PR técnico de rollback da seleção normal.

Invariantes:

1. Todas as execuções usam o mesmo grupo `serial-merge-queue`, sem cancelamento da execução ativa.
2. No começo de cada execução, listar `merge-queue/active` em issues e PRs com `state=all`, pois a label precisa continuar visível no PR depois que ele for fechado pelo merge.
3. Zero labels ativas permite selecionar o PR elegível mais antigo e atribuir imediatamente a ele `merge-queue/active`, antes de avaliar os checks. Uma label ativa obriga retomar somente esse PR. Duas ou mais labels ativas causam falha fechada, sem merge e sem remoção automática.
4. O mesmo PR mantém `merge-queue/active` durante pre-merge, merge, checks de `main`, deploy, verificação de produção e rollback.
5. Labels de fase devem ser mutuamente exclusivas. Estado ausente ou contraditório causa falha fechada.
6. Imediatamente antes do merge, confirmar novamente o dono, o head SHA aprovado e o SHA atual da `main`. A chamada de merge deve incluir o head SHA esperado.
7. Depois do merge, obter `merge_commit_sha` pela API do PR e usar somente esse SHA para checks, statuses e deployments. Nunca usar apenas “última execução” ou o nome da branch.
8. Liberar o slot significa remover todas as labels da fila do PR original somente após o gate pós-merge completo. Em qualquer falha, manter `active` e marcar `blocked` ou `rollback`.

O `concurrency` é o mutex, não a fila. A label é o registro persistente. A ordenação de PRs é recalculada pelo coordenador, não herdada da ordem de runs do Actions.

## `GITHUB_TOKEN` e checks pós-merge

Eventos produzidos por `GITHUB_TOKEN` normalmente não criam novos workflow runs. As exceções documentadas são `workflow_dispatch`, `repository_dispatch` e alguns eventos de PR criados ou atualizados por workflow, estes últimos sujeitos a aprovação. Portanto, um merge autenticado com `GITHUB_TOKEN` não pode depender do gatilho `push` para criar a CI pós-merge.

Forma segura:

1. Adicionar `workflow_dispatch` aos workflows que precisam ser provados no SHA de `main`, no mínimo `CI`, `Acessibilidade (produção)` e `Ledger vs repositório`. `Replay real de migrations` já possui esse evento.
2. Após o merge, disparar cada workflow explicitamente com `ref=main` usando `GITHUB_TOKEN` com `actions: write`.
3. Registrar o instante do dispatch e localizar a execução por workflow id, `event=workflow_dispatch`, `head_sha=merge_commit_sha` e criação posterior ao dispatch.
4. Esperar a conclusão de todas as execuções aplicáveis e reconsultar checks, combined status e deployment `Production` no SHA exato.
5. Se a `main` não continuar no SHA esperado durante o gate, falhar fechado. Não atribuir checks de outro commit ao merge atual.

O coordenador privilegiado não deve usar `actions/checkout`, executar scripts do PR, restaurar caches, baixar artifacts do PR nem interpolar título, branch, labels ou conteúdo do PR em shell. Toda leitura de PR é tratada como dado não confiável e validada pelas APIs.

## Rollback e limites reais

Falha antes do merge não altera a `main`; basta manter o slot no PR e aguardar correção.

Falha depois do merge exige um commit de revert, não force push. Como a `main` protegida exige PR, o rollback precisa usar uma branch e um PR técnico, marcado `merge-queue/rollback-pr`, enquanto o PR original continua com `merge-queue/active`. O rollback só é concluído quando o SHA que restaura o código passa novamente pelos checks de `main`, pelo deployment `Production` e pela verificação de produção. Se a `main` avançar inesperadamente antes do revert, o coordenador deve parar, pois um revert automático já não garante restauração isolada.

Há um limite material: revert de Git não desfaz escrita de banco nem efeitos externos. Os workflows de aplicação de migrations atuais são manuais, mas qualquer futura automação de banco só poderá participar dessa fila com rollback compensatório específico, idempotente e testado, ou restauração explicitamente autorizada. Sem isso, PR que possa causar mutação irreversível deve ser bloqueado para merge automático. Não existe promessa tecnicamente correta de “voltar tudo” apenas com revert de código.

## Permissões e nomes sensíveis observados

Configuração Actions atual:

- Actions habilitado, qualquer action permitida, sem exigência de pin por SHA no nível do repositório.
- Permissão default de workflow: `read`.
- `GITHUB_TOKEN` não pode aprovar reviews de PR.
- Ambientes: `Preview` e `Production`, ambos sem protection rules e sem deployment branch policy.
- Nenhum environment secret ou environment variable foi listado em `Preview` ou `Production`.

Nomes de repository secrets, sem leitura de valores:

- `BACKUP_ENCRYPTION_KEY`
- `PF_REVALIDATE_SECRET`
- `SUPABASE_ANON_KEY`
- `SUPABASE_DB_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `TRANSPARENCIA_API_KEY`

Não há repository variables.

Permissões mínimas propostas para o job coordenador, declaradas explicitamente:

```yaml
permissions:
  actions: write
  checks: read
  contents: write
  deployments: read
  issues: write
  pull-requests: write
  statuses: read
```

`contents: write` é necessário para branch e commit de rollback; `issues: write` gerencia labels; `pull-requests: write` faz merge e cria o PR técnico; `actions: write` dispara os checks pós-merge. Se o rollback for isolado em outro job, o job normal de coordenação deve receber apenas as permissões estritamente usadas pela fase.

Os workflows que executam código do PR permanecem com `contents: read`, `persist-credentials: false` e sem secrets. O token privilegiado fica somente no coordenador API-only da default branch.

## Dry-run e prova de ativação

O modo dry-run deve fazer todas as leituras, selecionar o candidato e emitir a decisão, mas não pode criar ou remover label, disparar workflow, criar branch ou PR, fazer merge, revert, deploy, comentário ou qualquer outra escrita remota.

Esta descoberta não alterou o GitHub. Criar labels, instalar workflow, mudar proteção, habilitar auto-merge, fazer merge ou deploy continua fora de escopo e exige uma fase posterior explicitamente autorizada.

## Fontes oficiais

- [GITHUB_TOKEN e supressão de novos workflows](https://docs.github.com/en/actions/concepts/security/github_token)
- [Controle de concorrência](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [Eventos que disparam workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [Uso seguro de workflows privilegiados](https://docs.github.com/en/actions/reference/security/secure-use)
- [REST API de check runs](https://docs.github.com/en/rest/checks/runs)
- [REST API de commit statuses](https://docs.github.com/en/rest/commits/statuses)
- [REST API de deployment statuses](https://docs.github.com/en/rest/deployments/statuses)
- [REST API de workflow runs](https://docs.github.com/en/rest/actions/workflow-runs)
- [REST API de labels](https://docs.github.com/en/rest/issues/labels)
