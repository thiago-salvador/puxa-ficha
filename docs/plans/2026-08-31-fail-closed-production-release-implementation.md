# Fail-Closed Production Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Impedir que um SHA não verificado alcance o domínio público e restaurar automaticamente o último deployment comprovado quando o fechamento público falhar.

**Architecture:** A fila existente continua como dona do lock FIFO e passa a modelar separadamente stage, promoção, fechamento público e recuperação. Um workflow confiável recebe o SHA mergeado e a identidade do deployment anterior, testa a URL imutável da Vercel, publica um Deployment Check único, aguarda a promoção automática, repete a prova no domínio público e executa rollback instantâneo se necessário. Supabase permanece read-only nesse fluxo, e migrations continuam protegidas por manifesto e rollback específico.

**Tech Stack:** Node.js 24, JavaScript ESM, TypeScript, `node:test`, GitHub Actions, Playwright, Vercel Deployment Checks e REST API, Supabase PostgreSQL readbacks.

---

## Regras de execução

- Trabalhar somente no worktree `codex/fail-closed-release`.
- Usar `PATH=/opt/homebrew/opt/node@24/bin:$PATH` em todos os gates locais.
- Aplicar @test-driven-development: todo comportamento novo começa com teste vermelho.
- Aplicar @surgical-coding: preservar a fila existente e alterar apenas contratos necessários.
- Aplicar @verification-before-completion antes de cada commit e do fechamento.
- Não criar secrets, alterar variável remota, configurar Deployment Check, mergear, promover, fazer rollback real ou executar falha controlada sem confirmação nominal do Thiago.
- Nunca executar código de pull request não confiável com secrets.
- Não incluir token, URL credenciada ou payload sensível em logs, artefatos ou issues.

## Dependências entre tarefas

- As tarefas 1 e 2 definem o contrato consumido pelas tarefas 3 e 4.
- A tarefa 5 depende dos helpers da tarefa 3.
- A tarefa 6 depende do workflow da tarefa 5.
- A tarefa 7 pode começar depois da tarefa 3, mas sua execução remota só ocorre após a tarefa 5.
- A tarefa 8 é o gate final local. A tarefa 9 é ativação remota separada e condicionada à confirmação nominal.

### Task 1: Caracterizar a máquina de estados fail-closed

**Files:**

- Modify: `tests/fixtures/serial-merge-queue-cases.jsonl`
- Modify: `tests/merge-queue/post-merge-gate.test.mjs`
- Modify: `tests/merge-queue/rollback.test.mjs`
- Modify: `tests/merge-queue/queue-state.test.mjs`
- Modify: `tests/merge-queue/helpers.mjs`

**Step 1: Adicionar fixtures de cada fase**

Adicionar snapshots explícitos para:

```js
{
  production: {
    previousDeployment: { id: 'dep_previous', sha: 'trusted-sha', status: 'success' },
    stagedDeployment: { id: 'dep_candidate', sha: 'merge-sha', status: 'success' },
    stagedChecks: { status: 'success', sha: 'merge-sha' },
    promotion: { status: 'pending', sha: 'merge-sha' },
    publicReadback: { status: 'pending', sha: 'merge-sha' },
    rollback: null,
  },
}
```

Cobrir também stage falho, promoção falha, readback público falho, rollback pendente, rollback verde e rollback falho.

**Step 2: Escrever testes vermelhos de decisão**

Os testes devem exigir:

```js
assert.equal(evaluateSnapshot(config, stagedPending).decision, 'VERIFY_STAGE');
assert.equal(evaluateSnapshot(config, stagedFailed).decision, 'INCIDENT');
assert.equal(evaluateSnapshot(config, stagedGreen).decision, 'AWAIT_PROMOTION');
assert.equal(evaluateSnapshot(config, publicPending).decision, 'VERIFY_PUBLIC');
assert.equal(evaluateSnapshot(config, publicFailed).decision, 'ROLLBACK_DEPLOYMENT');
assert.equal(evaluateSnapshot(config, rollbackPending).decision, 'VERIFY_ROLLBACK');
assert.equal(evaluateSnapshot(config, rollbackGreen).decision, 'INCIDENT');
assert.equal(evaluateSnapshot(config, rollbackFailed).decision, 'INCIDENT_CRITICAL');
assert.equal(evaluateSnapshot(config, publicGreen).decision, 'RELEASE');
```

Também provar que o segundo PR permanece `WAIT` em todas as fases anteriores a `RELEASE`.

**Step 3: Rodar os testes focados e confirmar RED**

Run:

```bash
env PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test \
  tests/merge-queue/post-merge-gate.test.mjs \
  tests/merge-queue/rollback.test.mjs \
  tests/merge-queue/queue-state.test.mjs
```

Expected: FAIL porque as novas decisões e evidências ainda não existem.

**Step 4: Commit dos testes vermelhos**

```bash
git add tests/fixtures/serial-merge-queue-cases.jsonl tests/merge-queue
git commit -m "test: especificar release fail-closed"
```

### Task 2: Implementar as transições no motor

**Files:**

- Modify: `scripts/merge-queue/engine.mjs`
- Modify: `.github/serial-merge-queue.json`
- Test: `tests/merge-queue/post-merge-gate.test.mjs`
- Test: `tests/merge-queue/rollback.test.mjs`
- Test: `tests/merge-queue/queue-state.test.mjs`

**Step 1: Separar sinais de stage, promoção, público e rollback**

Normalizar as seções abaixo sem aceitar `missing` como sucesso:

```js
const release = {
  stagedDeployment: signal(snapshot.production?.stagedDeployment),
  stagedChecks: signal(snapshot.production?.stagedChecks),
  promotion: signal(snapshot.production?.promotion),
  publicReadback: signal(snapshot.production?.publicReadback),
  rollback: signal(snapshot.production?.rollback),
};
```

**Step 2: Implementar a precedência fail-closed**

Aplicar esta ordem:

```text
rollback failure -> INCIDENT_CRITICAL
rollback pending -> VERIFY_ROLLBACK
rollback success -> INCIDENT
public failure -> ROLLBACK_DEPLOYMENT
public pending -> VERIFY_PUBLIC
promotion failure -> INCIDENT
promotion pending -> AWAIT_PROMOTION
stage failure -> INCIDENT
stage pending -> VERIFY_STAGE
all green -> RELEASE
```

Falha de stage não executa rollback porque o domínio público ainda deve apontar para `previousDeployment`.

**Step 3: Gerar mutations mínimas por decisão**

- `INCIDENT`: `NOTIFY`, manter labels `active` e `postMerge`.
- `INCIDENT_CRITICAL`: `NOTIFY` com severidade crítica e lock preservado.
- `ROLLBACK_DEPLOYMENT`: `INSTANT_ROLLBACK`, `NOTIFY` e persistência de contexto.
- `VERIFY_*` e `AWAIT_PROMOTION`: nenhuma mutation que libere a fila.
- `RELEASE`: remover labels operacionais e liberar exatamente um slot.

**Step 4: Rodar os testes focados e confirmar GREEN**

Run: o mesmo comando da tarefa 1.

Expected: PASS.

**Step 5: Rodar a suíte completa da fila**

```bash
env PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test tests/merge-queue/*.test.mjs
```

Expected: todos os testes da fila passam.

**Step 6: Commit**

```bash
git add scripts/merge-queue/engine.mjs .github/serial-merge-queue.json tests/merge-queue tests/fixtures/serial-merge-queue-cases.jsonl
git commit -m "feat: fechar estados do release em falha"
```

### Task 3: Provar identidade do deployment e restauração na Vercel

**Files:**

- Modify: `scripts/merge-queue/adapters.mjs`
- Modify: `scripts/merge-queue/coordinator.mjs`
- Modify: `tests/merge-queue/live-path.test.mjs`
- Modify: `tests/merge-queue/rollback.test.mjs`
- Create: `tests/merge-queue/deployment-proof.test.mjs`

**Step 1: Escrever testes vermelhos para o adapter**

Exigir estes comportamentos:

```js
await vercel.deploymentForSha(expectedSha, { target: 'production' });
await vercel.currentProductionForDomain('puxaficha.com.br');
await vercel.assertDeployment({ id, sha: expectedSha, readyState: 'READY' });
await vercel.instantRollback(previousDeploymentId);
```

Os testes devem rejeitar:

- deployment de outro SHA;
- deployment sem `target: production`;
- estado diferente de `READY`;
- URL que não seja HTTPS e host Vercel esperado;
- deployment anterior que não corresponda ao snapshot persistido;
- resposta de rollback sem deployment identificável.

**Step 2: Confirmar RED**

```bash
env PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test \
  tests/merge-queue/live-path.test.mjs \
  tests/merge-queue/deployment-proof.test.mjs \
  tests/merge-queue/rollback.test.mjs
```

Expected: FAIL nos novos métodos e invariantes.

**Step 3: Implementar consultas Vercel fail-closed**

Retornar somente dados necessários e sanitizados:

```js
{
  id: deployment.uid,
  sha: deployment.meta?.githubCommitSha,
  url: `https://${deployment.url}`,
  readyState: deployment.readyState,
  target: deployment.target,
  createdAt: deployment.createdAt,
}
```

Separar deployment candidato por SHA do deployment atualmente ligado ao domínio. Não usar `main.sha` como aproximação do alias público.

**Step 4: Persistir o rollback target antes do merge**

O contexto do owner deve registrar, antes de `MERGE_PR`:

```js
{
  previousMainSha,
  previousDeploymentId,
  previousDeploymentSha,
  previousDeploymentUrl,
}
```

O dispatch pós-merge recebe somente esses campos validados. O coordenador recusa iniciar release se não houver deployment anterior `READY` correspondente ao SHA público comprovado.

**Step 5: Implementar rollback instantâneo idempotente**

`INSTANT_ROLLBACK` chama a API apenas para `previousDeploymentId`, persiste o resultado e nunca usa o deployment candidato como fallback. Repetições devem observar o mesmo target e não alternar aliases.

**Step 6: Confirmar GREEN e rodar a suíte da fila**

Run: comandos dos passos 2 e tarefa 2, passo 5.

Expected: PASS.

**Step 7: Commit**

```bash
git add scripts/merge-queue/adapters.mjs scripts/merge-queue/coordinator.mjs tests/merge-queue
git commit -m "feat: provar deployments e alvo de rollback"
```

### Task 4: Criar helpers read-only para stage e fechamento público

**Files:**

- Create: `scripts/merge-queue/deployment-proof.mjs`
- Create: `scripts/merge-queue/run-release-smokes.mjs`
- Create: `tests/merge-queue/deployment-proof-cli.test.mjs`
- Modify: `scripts/smoke-lancamento.ts`
- Modify: `tests/smoke-lancamento.test.ts`
- Modify: `tests/visual/pesquisas-production-smoke.playwright.config.ts`
- Modify: `tests/a11y-production-workflow.test.ts`
- Modify: `package.json`

**Step 1: Escrever testes vermelhos da prova HTTP**

Testar com servidor HTTP local que o helper:

```js
await proveDeployment({
  baseUrl,
  expectedSha,
  expectedRef: 'main',
  expectedEnvironment: 'production',
  fetchImpl,
});
```

recusa status não 200, JSON inválido, `ok !== true`, SHA divergente, ref divergente, ambiente divergente, redirect para host inesperado e timeout.

**Step 2: Confirmar RED**

```bash
env PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test tests/merge-queue/deployment-proof-cli.test.mjs
```

Expected: FAIL porque os helpers ainda não existem.

**Step 3: Implementar `deployment-proof.mjs`**

O CLI recebe `PF_BASE_URL` e `PF_EXPECTED_DEPLOY_SHA`, faz readback de `/api/deployment-info`, usa timeout com `AbortSignal.timeout`, não imprime payload completo e termina non-zero em qualquer divergência.

Antes do runner, remover os atalhos que forçam `https://puxaficha.com.br`: `smoke-lancamento.ts`, `test:search-smoke` e o config de pesquisas devem aceitar a URL herdada. A validação permite somente HTTPS no domínio canônico ou em host `*.vercel.app`, e rejeita qualquer outro host.

**Step 4: Implementar `run-release-smokes.mjs`**

Executar sequencialmente, herdando a URL alvo:

```js
[
  ['deployment-info', ['node', 'scripts/merge-queue/deployment-proof.mjs']],
  ['launch', ['npx', 'tsx', 'scripts/smoke-lancamento.ts']],
  ['search', ['npm', 'run', 'test:search-smoke']],
  ['a11y', ['npm', 'run', 'test:a11y']],
  ['pesquisas', ['npm', 'run', 'test:pesquisas:production-smoke']],
]
```

Usar `spawn` sem shell, falhar no primeiro comando non-zero e registrar apenas nome, duração e exit code. O runner não acessa Supabase nem executa migrations.

**Step 5: Adicionar scripts npm**

```json
{
  "release:prove-deployment": "node scripts/merge-queue/deployment-proof.mjs",
  "release:smoke": "node scripts/merge-queue/run-release-smokes.mjs"
}
```

**Step 6: Confirmar GREEN**

Run: teste focado e `npm run release:prove-deployment` contra um fixture local controlado pelo teste.

Expected: PASS.

**Step 7: Commit**

```bash
git add scripts/merge-queue/deployment-proof.mjs scripts/merge-queue/run-release-smokes.mjs tests/merge-queue/deployment-proof-cli.test.mjs package.json
git commit -m "feat: unificar provas de stage e produção"
```

### Task 5: Separar stage, promoção, fechamento e recuperação no GitHub Actions

**Files:**

- Create: `.github/workflows/staged-production-release.yml`
- Modify: `.github/workflows/serial-merge-queue.yml`
- Modify: `.github/workflows/serial-merge-queue-watchdog.yml`
- Modify: `.github/serial-merge-queue.json`
- Modify: `tests/merge-queue/workflow-security.test.mjs`
- Modify: `tests/merge-queue/post-merge-gate.test.mjs`
- Create: `tests/merge-queue/staged-production-workflow.test.mjs`

**Step 1: Escrever testes vermelhos do contrato YAML**

Exigir:

- trigger exclusivo `repository_dispatch: serial-merge-queue-post-merge`;
- checkout de `refs/heads/main` com credenciais não persistidas;
- Node 24;
- `concurrency.cancel-in-progress: false`;
- validação do `EXPECTED_SHA`, `TRUSTED_SHA`, owner PR e deployment anterior;
- job único `Vercel - puxa-ficha: staged-release` para o Deployment Check;
- URL de stage obtida da Vercel e nunca igual a `https://puxaficha.com.br`;
- `PF_BASE_URL` e `PF_EXPECTED_DEPLOY_SHA` passados ao runner;
- ação `vercel/repository-dispatch/actions/status` pinada por SHA completo;
- job `Production release closure` somente depois do stage;
- job `Production rollback recovery` com `if: failure()` limitado a falha pós-promoção;
- nenhum `SUPABASE_SERVICE_ROLE_KEY` ou comando de migration;
- status de sucesso da fila somente após fechamento público;
- issue deduplicada e lock preservado em falha;
- nenhum `cancel-in-progress: true`.

**Step 2: Confirmar RED**

```bash
env PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test \
  tests/merge-queue/staged-production-workflow.test.mjs \
  tests/merge-queue/workflow-security.test.mjs \
  tests/merge-queue/post-merge-gate.test.mjs
```

Expected: FAIL porque o workflow separado ainda não existe.

**Step 3: Criar o job de stage**

O job deve:

1. validar o dispatch contra GitHub e o contexto persistido;
2. consultar o deployment Vercel de produção pelo SHA exato;
3. provar `READY`, `target=production` e URL imutável;
4. instalar dependências e browsers em checkout confiável;
5. executar `npm run release:smoke` contra a URL imutável;
6. publicar exatamente um status Vercel chamado `Vercel - puxa-ficha: staged-release`.

Se qualquer passo falhar, o status fica vermelho e o alias público não deve se mover.

**Step 4: Criar fechamento público**

Depois do stage verde, aguardar o domínio público responder com `EXPECTED_SHA` e executar novamente `npm run release:smoke` com `PF_BASE_URL=https://puxaficha.com.br`. Publicar `Production release closure` apenas ao final.

**Step 5: Criar recuperação automática**

Em falha do fechamento público:

1. validar novamente owner, lock e `previousDeploymentId`;
2. chamar rollback instantâneo;
3. aguardar o SHA anterior no domínio público;
4. executar smoke público crítico;
5. publicar `Production rollback recovery` com resultado;
6. abrir ou atualizar incidente deduplicado;
7. nunca remover o lock.

Falha do próprio rollback publica estado crítico e encerra non-zero.

**Step 6: Remover o caminho pós-merge duplicado**

Retirar de `.github/workflows/serial-merge-queue.yml` os jobs que testam diretamente o domínio público antes do stage. Manter somente reconciliação, emissão segura do dispatch e recovery administrativo que não duplique promoção.

**Step 7: Confirmar GREEN**

Run: comando do passo 2 e toda a suíte `tests/merge-queue/*.test.mjs`.

Expected: PASS.

**Step 8: Commit**

```bash
git add .github/workflows .github/serial-merge-queue.json tests/merge-queue
git commit -m "feat: bloquear produção até o stage verde"
```

### Task 6: Fixar a fronteira de migrations e Supabase

**Files:**

- Modify: `.github/merge-queue/irreversible-change-manifest.json`
- Modify: `.github/serial-merge-queue.json`
- Modify: `tests/merge-queue/irreversible-change.test.mjs`
- Modify: `tests/merge-queue/workflow-security.test.mjs`
- Create: `tests/merge-queue/database-rollback-boundary.test.mjs`

**Step 1: Escrever testes vermelhos**

Exigir que PR com `supabase/migrations/**`:

- precise de forward, readback e rollback específicos no manifesto;
- seja bloqueado quando qualquer artefato faltar ou não estiver validado;
- nunca gere mutation de rollback genérico de banco;
- nunca disponibilize service role ao workflow de smoke;
- mantenha aplicação e verificação de migration nos workflows especializados já existentes.

**Step 2: Confirmar RED**

```bash
env PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test \
  tests/merge-queue/irreversible-change.test.mjs \
  tests/merge-queue/database-rollback-boundary.test.mjs \
  tests/merge-queue/workflow-security.test.mjs
```

**Step 3: Implementar o menor contrato necessário**

Adicionar a exigência declarativa `databaseRollbackMode: migration-specific` e validar que o manifesto identifica os três artefatos. Não criar executor SQL novo.

**Step 4: Confirmar GREEN e commit**

```bash
git add .github/merge-queue .github/serial-merge-queue.json tests/merge-queue
git commit -m "fix: impedir rollback genérico de banco"
```

### Task 7: Criar e executar a auditoria única de efeitos persistentes

**Files:**

- Create: `scripts/audit/audit-release-integrity.mjs`
- Create: `tests/audit-release-integrity.test.mjs`
- Create: `docs/operations/release-integrity-audit-2026-08-31.md`

**Step 1: Escrever testes vermelhos do agregador**

O agregador deve classificar cada prova como `pass`, `fail` ou `unavailable` e terminar non-zero se houver `fail`. Ausência de credencial ou retenção de logs vira `unavailable`, nunca `pass`.

**Step 2: Confirmar RED**

```bash
env PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test tests/audit-release-integrity.test.mjs
```

**Step 3: Implementar auditoria read-only**

Compor, sem escrita remota:

- `/api/deployment-info` e smoke público atual;
- presença das correções históricas conhecidas no SHA atual;
- zero PRs e issues abertos no momento da leitura;
- runs e checks do SHA público;
- deployment Vercel e logs de runtime disponíveis;
- ledger de migrations contra `supabase/migrations` usando o readback canônico do projeto;
- invariantes de dados cobertas pelos readbacks existentes;
- Sentry, se houver credencial e superfície disponível.

O relatório deve conter timestamp, fonte, SHA, comando, resultado e limitação. Não armazenar segredos nem payload bruto.

**Step 4: Rodar localmente e corrigir qualquer `fail`**

```bash
env PATH=/opt/homebrew/opt/node@24/bin:$PATH node scripts/audit/audit-release-integrity.mjs \
  --output docs/operations/release-integrity-audit-2026-08-31.md
```

Se houver falha, abrir uma nova tarefa TDD dentro deste plano antes de prosseguir. `unavailable` permanece explicitamente registrado com a razão e a próxima prova possível.

**Step 5: Confirmar teste e commit**

```bash
git add scripts/audit/audit-release-integrity.mjs tests/audit-release-integrity.test.mjs docs/operations/release-integrity-audit-2026-08-31.md
git commit -m "audit: provar integridade dos releases anteriores"
```

### Task 8: Atualizar runbook e executar gates locais completos

**Files:**

- Modify: `docs/operations/serial-merge-queue.md`
- Modify: `docs/operations/serial-merge-queue-adversarial-review.md`
- Create: `docs/operations/fail-closed-release-activation.md`
- Modify: `README.md` somente se ele já apontar para runbooks operacionais.

**Step 1: Documentar operação e recovery**

O runbook deve incluir:

- máquina de estados e dono do lock;
- nomes exatos dos checks;
- como identificar o SHA candidato, público anterior e restaurado;
- diferença entre stage falho, fechamento público falho e rollback falho;
- procedimento de incidente sem liberar a fila;
- fronteira de migrations;
- lista das ações remotas ainda não autorizadas.

**Step 2: Rodar testes focados**

```bash
env PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test tests/merge-queue/*.test.mjs
```

Expected: PASS.

**Step 3: Rodar gates estáticos**

```bash
env PATH=/opt/homebrew/opt/node@24/bin:$PATH npm run lint
env PATH=/opt/homebrew/opt/node@24/bin:$PATH npm run typecheck
env PATH=/opt/homebrew/opt/node@24/bin:$PATH npm run check:scripts
git diff --check
```

Expected: todos passam.

**Step 4: Rodar suíte completa**

```bash
env PATH=/opt/homebrew/opt/node@24/bin:$PATH npm test
```

Expected: zero falhas. O baseline anterior à implementação foi 4.190 pass, 0 fail, 4 skipped.

**Step 5: Rodar build**

```bash
env PATH=/opt/homebrew/opt/node@24/bin:$PATH npm run build
```

Expected: build de produção concluído sem erro.

**Step 6: Revisar o diff como crítico e verificador**

Conferir:

- nenhum secret ou identificador sensível no diff;
- nenhum caminho libera lock antes de `Production release closure`;
- stage falho não muda o domínio público;
- readback público falho sempre chama rollback;
- rollback falho mantém incidente crítico;
- nenhum rollback SQL genérico;
- ações de terceiros pinadas por SHA completo.

**Step 7: Commit**

```bash
git add docs/operations README.md
git commit -m "docs: operar release fail-closed"
```

### Task 9: Preparar PR e ativação remota com confirmação nominal

**Files:**

- No new source files expected.

**Step 1: Verificar branch final**

```bash
git status --short
git log --oneline origin/main..HEAD
git diff --check origin/main...HEAD
```

Expected: árvore limpa e somente commits deste plano.

**Step 2: Revisar PR localmente**

Aplicar @requesting-code-review e corrigir findings antes de push.

**Step 3: Fazer push e abrir o PR verificado**

O pedido de correção autoriza preparar e publicar o PR. Não mergear nem ativar produção nesta etapa, pois o merge dispara efeitos externos de deploy.

**Step 4: Solicitar confirmação nominal antes do merge e de cada mutação de produção**

Solicitar autorização para:

1. mergear o PR e iniciar o deploy associado;
2. criar ou atualizar `MERGE_QUEUE_GH_TOKEN` e `VERCEL_TOKEN`;
3. configurar `Vercel - puxa-ficha: staged-release` como Deployment Check obrigatório;
4. definir `SERIAL_MERGE_QUEUE_ENABLED=true`;
5. executar um release controlado sem mudança funcional;
6. executar uma falha deliberada em produção para provar bloqueio e rollback.

**Step 5: Provar ativação real**

Registrar evidência de:

- deployment candidato criado sem alias público;
- stage verde promovendo somente o SHA esperado;
- fechamento público verde;
- falha deliberada impedindo promoção ou acionando rollback conforme a fase;
- domínio público restaurado ao SHA anterior;
- fila ainda bloqueada durante incidente;
- issue deduplicada criada ou atualizada;
- zero alteração no Supabase causada pelo workflow de smoke.

Somente depois dessas provas o sistema pode ser declarado ativo.
