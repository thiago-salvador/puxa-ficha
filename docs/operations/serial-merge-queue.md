# Fila serial de PR, merge e produção

## Estado seguro inicial

A automação nasce com `enabled: false` em
`.github/serial-merge-queue.json`. Os arquivos locais não alteram GitHub,
Vercel, banco ou produção. Publicar esses arquivos, criar secrets, configurar o
hold da Vercel e mudar `enabled` para `true` são ações remotas separadas.

Quando ativa, a fila mantém exatamente um PR como dono do slot. O PR mais
antigo por `createdAt`, com o menor número como desempate, só é selecionado
quando não há slot ativo. O lock atravessa atualização, checks, merge, deploy,
smoke e recovery. Uma falha nunca libera o próximo PR.

## Modelo de segurança

- O coordenador acorda por eventos de PR, conclusão de workflows, status,
  deployment, agenda e dispatch manual. Todas as execuções compartilham o grupo
  `serial-merge-queue`, com `cancel-in-progress: false`.
- `pull_request_target` nunca faz checkout do SHA do PR. O único checkout é
  `refs/heads/main`, com `persist-credentials: false`, e nenhum campo do payload
  é interpolado no shell.
- O workflow apenas chama o motor versionado da default branch. Código, SQL,
  artifacts e caches vindos do PR não rodam em passos que recebem tokens
  privilegiados. Os smokes do repositório rodam em passos separados, sem tokens
  de GitHub, Vercel ou runtime privado.
- O dispatch pós-merge valida SHA, PR mergeado, `main` e labels do slot antes
  de instalar dependências ou executar os smokes da default branch confiável.
- Qualquer estado diferente de sucesso explícito bloqueia. Ausente, pendente,
  skipped, neutral, stale, cancelled e timed out não contam como verde.
- Duas labels ativas ou fases contraditórias são incidentes, não uma chance de
  escolher outro PR.
- O contexto persistido em comentários só é aceito quando o autor ou GitHub App
  está na allowlist e o payload passa no schema estrito. Antes do merge, o
  coordenador relê base, head e lock; antes do Instant Rollback, revalida na
  Vercel o par deployment anterior e SHA anterior.
- Smokes pós-merge e de recuperação rodam em runners separados, sem secrets. Os
  passos que publicam status, promovem ou fazem rollback usam runners novos e
  nunca fazem checkout do commit candidato.

## Labels e estado

| Label | Uso |
|---|---|
| `merge-queue/active` | Dono exclusivo do slot. |
| `merge-queue/pre-merge` | Atualização e checks do head SHA. |
| `merge-queue/post-merge` | Merge concluído; CI, deploy e produção ainda sob gate. |
| `merge-queue/rollback` | Recovery em andamento; a fila continua presa. |
| `merge-queue/blocked` | Intervenção necessária, sem liberar o slot. |
| `merge-queue/rollback-pr` | PR técnico de revert; nunca entra como candidato FIFO. |

As labels persistem o estado entre execuções do Actions. Não remova a label
`active` para "destravar": isso quebraria a garantia serial. Use a recuperação
manual abaixo.

## Secrets e permissões

Configure em `Settings > Secrets and variables > Actions` somente depois da
aprovação explícita de ativação:

A variável `SERIAL_MERGE_QUEUE_ENABLED` deve permanecer ausente ou `false`.
Enquanto ela não for `true`, todos os jobs da fila são pulados antes de checkout,
setup ou leitura de secrets. A config local `enabled` é um segundo lock.

| Secret | Obrigatório | Finalidade |
|---|---:|---|
| `MERGE_QUEUE_GH_TOKEN` | sim | API de PR, merge, labels, status, dispatch, revert e incidentes que precisam gerar eventos subsequentes. |
| `VERCEL_TOKEN` | sim | Inspeção, promoção e Instant Rollback. |
| `VERCEL_ORG_ID` | sim | Escopo explícito da equipe Vercel. |
| `VERCEL_PROJECT_ID` | sim | Projeto exato, sem depender de `.vercel/project.json`. |
| `PF_RUNTIME_SMOKE_SECRET` | não | Smoke privado; quando presente, exige `ok=true` e `total=5`. |

Segredo obrigatório ausente mantém o slot em `BLOCK` e proíbe merge, promoção
ou rollback parcial. O token GitHub deve pertencer ao Thiago ou a uma GitHub
App dedicada e ter somente os acessos necessários a Actions, contents,
deployments, issues, pull requests e commit statuses deste repositório. O
`GITHUB_TOKEN` do coordenador fica read-only; o watchdog usa seu próprio
`GITHUB_TOKEN` apenas para abrir issue.

O GitHub envia notificação de Inbox e email conforme as preferências da conta
do Thiago. Não há envio por email implementado no workflow.

## Hold e promoção na Vercel

Antes de habilitar a fila, configure o projeto `puxa-ficha` na Vercel:

1. Confirme a integração GitHub e `main` como Production Branch.
2. Em `Settings > Environments > Production > Deployment Checks`, adicione o
   commit status obrigatório `Serial release gate`.
3. Mantenha a atribuição automática de domínios de produção ligada. A Vercel
   cria o build de `main`, mas o mantém staged até o status do gate ficar verde.
4. Confirme num PR de ativação controlado que o deployment não recebe
   `puxaficha.com.br` enquanto o gate está pending.

O coordenador só publica `Serial release gate=success` depois de correlacionar
o deployment staged com o `merge_commit_sha`, confirmar estado `READY`, CI,
CodeQL, ledger, replay quando aplicável e smokes contra o deployment. A Vercel
então promove o deployment. Só depois o coordenador prova o domínio público.

Se o Deployment Check não existir ou não estiver bloqueando a promoção, a
política `failClosedOnMissingHold` impede o merge. Não habilite a fila usando a
atribuição automática comum sem o hold.

## Checks e prova de produção

Os nomes exatos e a política estão versionados em
`.github/serial-merge-queue.json`. Antes do merge, o head SHA precisa estar
atualizado com `main`, ser o mesmo SHA consultado e ter todos os checks presentes
verdes, além dos obrigatórios. `CodeRabbit` só é exigido quando existir; replay
é condicional aos paths que o disparam.

Depois do merge, o mesmo slot fica ativo até uma única execução provar:

1. `merge_commit_sha` ainda é a ponta de `main`.
2. CI, cobertura, acessibilidade, CodeQL, ledger e replay aplicável passaram no
   SHA exato.
3. O GitHub Deployment `Production` e o deployment Vercel correspondem ao SHA,
   e o deployment staged está `READY`.
4. Os smokes de lançamento, busca e acessibilidade passaram.
5. Depois da promoção,
   `https://puxaficha.com.br/api/deployment-info` respondeu HTTP 200 com
   `ok=true`, `environment=production`, `commitRef=main` e o SHA exato.
6. Os smokes públicos passaram novamente; o smoke privado também passa quando
   seu secret está configurado.

Só então as labels do slot são removidas e o próximo PR pode ser selecionado.

## Falhas e incidentes

Falha de PR, merge, deploy, promoção, smoke, rollback ou notificação cria ou
atualiza um incidente GitHub atribuído a `thiago-salvador`. O coordenador
deduplica pela assinatura formada por PR, fase, SHA e classe da falha.

Depois que o PR de revert fica verde e é mergeado, o dispatch de recovery espera
os checks do SHA restaurado, promove explicitamente o deployment correspondente,
prova o readback público e roda novamente os três smokes. O slot original só
muda para recuperado depois que esses sinais aparecem verdes no mesmo SHA.

Um watchdog independente observa a conclusão do workflow `Serial merge queue`.
Se o coordenador crashar, for cancelado ou terminar sem sucesso, o watchdog
abre uma issue atribuída ao Thiago. Entregas repetidas do mesmo evento não criam
duplicatas porque a issue contém o marcador oculto
`serial-merge-queue-watchdog:run:<run-id>`.

O workflow bloqueado pode terminar com sucesso técnico: `BLOCK` é um estado de
negócio esperado e persistido. Exit diferente de zero fica reservado para erro
do próprio coordenador, que é o caso coberto pelo watchdog.

## Rollback e recuperação

Antes do merge, o coordenador captura `main_before_sha`, deployment público
anterior, URL e ID Vercel, readback e smokes do baseline.

### Falha antes da promoção

O domínio continua no deployment anterior. O slot muda para rollback, é criado
um PR de revert auditável e os checks do SHA restaurado são executados. Nenhum
outro PR entra na fila até o revert estar na `main`, o deployment de recuperação
estar `READY` e o baseline ser provado novamente.

### Falha depois da promoção

1. Manter o mesmo slot em rollback e abrir incidente.
2. Executar Instant Rollback para o deployment anterior comprovadamente verde.
3. Esperar o rollback terminar e provar `main_before_sha` no domínio público.
4. Criar e concluir o PR de revert auditável.
5. Esperar o deployment do revert ficar `READY`.
6. Executar `vercel promote` nesse deployment e repetir a prova completa.

O passo 6 é obrigatório: Instant Rollback desliga a atribuição automática de
domínios. A promoção do deployment de recuperação sai desse estado e reativa o
fluxo normal. Se qualquer passo falhar, o slot permanece bloqueado.

### Recuperação manual

Use recuperação manual somente com o incidente e o PR ativo identificados:

1. Pause novos avanços com `enabled: false` em uma mudança revisada na default
   branch. Não remova o lock.
2. Confirme pelas APIs o PR, fase, `head_sha` ou `merge_commit_sha`,
   `main_before_sha`, deployment atual e deployment anterior.
3. Se a falha ocorreu antes da promoção, conclua o revert e seus checks. Se
   ocorreu depois, faça Instant Rollback, prove o SHA anterior, conclua o revert
   e promova o deployment de recuperação.
4. Rode novamente todos os checks e readbacks de produção. Registre os links no
   incidente.
5. Só remova as labels de fase e `active` quando código e produção estiverem no
   SHA restaurado e todos os gates estiverem verdes.
6. Reative com `enabled: true` em outra mudança revisada.

Rollback, promote, merge, alteração de secrets e mudança de configuração remota
exigem autorização explícita que nomeie a ação. Este runbook não concede essa
autorização.

## Migrations e efeitos irreversíveis

PR que toca migrations, rollback SQL, workflows privilegiados, `vercel.json`,
rotas ou scripts de escrita externa é bloqueado antes do merge. O job
privilegiado nunca executa SQL vindo do PR.

A automação não aceita um manifesto autoafirmado pelo próprio PR como prova. A
saída desse bloqueio é manual e exige inventário com identidades e
cardinalidades, pré e pós-condições executáveis, compensação idempotente, prova
apply/read/compensate em ambiente descartável, backup restaurável e aprovação
nomeada para a escrita remota. Sem reversibilidade comprovada, não existe
rollback automático honesto: o PR permanece ativo e a fila para.

Email, cron, Storage, DNS, billing, credenciais e APIs externas com escrita
seguem a mesma regra fail-closed.

## Dry-run, ativação e pausa

### Dry-run local

Com a configuração inicial desabilitada, o dry-run não usa secrets nem rede e
prova que a entrega está inerte:

```bash
node scripts/merge-queue/coordinator.mjs reconcile \
  --config .github/serial-merge-queue.json \
  --dry-run
```

Para exercitar estados ativos sem rede, rode os testes determinísticos. O teste
de dry-run injeta um snapshot e adapters espiões e exige zero escrita; o golden
set cobre as transições observadas:

```bash
node --test tests/merge-queue/dry-run.test.mjs
node --test tests/merge-queue/golden-set.test.mjs
```

Um dry-run contra a fila real ainda precisa dos tokens somente para leitura. Ele
não executa mutations, mas só deve ser feito depois de validar o escopo das
credenciais e usar uma cópia temporária da config com `enabled: true`.

### Ativação

1. Mantenha `enabled: false` enquanto workflows, testes e runbook são revisados.
2. Configure e valide o hold `Serial release gate` na Vercel.
3. Crie os quatro secrets obrigatórios e confira o escopo do token sem expor
   valores.
4. Rode dry-run e golden set. Confirme `remoteWrites == 0`.
5. Obtenha confirmação explícita para ativar a automação e processar PRs reais.
6. Em uma mudança isolada, altere `enabled` para `true`. Só depois da revisão e
   merge dessa mudança, defina `SERIAL_MERGE_QUEUE_ENABLED=true` e observe o
   primeiro PR até a prova de produção.

### Pausa

Mude primeiro `SERIAL_MERGE_QUEUE_ENABLED=false` e depois `enabled` para `false`.
Isso impede selecionar ou avançar estado, mas não
apaga o slot existente. Se houver PR ativo ou recovery, preserve as labels e o
incidente até a restauração ser provada. Para emergência após promoção, pause e
siga a recuperação, não libere o próximo PR.

## Limites conhecidos

- O merge Git é atômico; deploy, banco e efeitos externos não são uma única
  transação. O lock e o recovery compensatório fornecem serialização, não uma
  promessa impossível de atomicidade distribuída.
- GitHub Issues geram email apenas conforme as preferências da conta.
- `deploymentId` pode ser nulo em `/api/deployment-info`; a prova usa o SHA.
- Os arquivos deste pacote não configuram secrets, labels, branch protection ou
  Vercel remotamente e não ativam a fila.
