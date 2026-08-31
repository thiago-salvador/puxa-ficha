# Revisão adversarial da fila serial de merge

## Re-review de 2026-08-31

### Veredito atual

**IMPLEMENTAÇÃO LOCAL APROVADA PARA PR, ATIVAÇÃO REMOTA AINDA BLOQUEADA.** A
arquitetura antiga, que misturava reconciliação, promoção pública e recovery no
mesmo workflow, foi substituída por um release staged fail-closed. A config
continua `enabled: false` e a variável remota deve permanecer ausente ou falsa.

Correções verificadas nesta revisão:

- o hold não depende mais de commit status: auto-assignment fica desligado e a
  promoção usa explicitamente o deployment ID testado;
- o dispatch leva `git.sha`, ambiente e projeto exigidos pela integração da
  Vercel e é rejeitado se qualquer identidade divergir;
- o candidato `READY` é provado em URL `.vercel.app` antes da promoção;
- o domínio público precisa continuar no predecessor durante o stage;
- o smoke completo roda no stage e é repetido no domínio público;
- `Production release closure` é a única prova que libera o slot;
- falha pública aciona rollback pelo deployment ID e SHA capturados, nunca por
  ordenação temporal;
- `Production rollback recovery` prova o SHA restaurado e repete os smokes;
- stage falho, fechamento público falho e rollback falho têm caminhos e
  incidentes distintos, todos preservando o lock;
- migrations agora são classificadas separadamente de outros paths sensíveis e
  exigem artifacts forward, readback, compensação e readback pós-compensação;
- nenhum rollback SQL genérico foi introduzido;
- actions de terceiros usadas no release estão pinadas por SHA completo;
- retries do mesmo commit status preservam somente o estado mais recente, sem
  deixar uma falha histórica bloquear um retry verde;
- cancelamento de stage ou fechamento público entra nos mesmos caminhos de
  incidente e recovery, exceto o `skipped` esperado com a fila desligada;
- o release não recebe `CRON_SECRET` e não aciona o runtime smoke privado que
  grava e remove short link no Supabase;
- a auditoria histórica read-only encontrou zero falha confirmada nas onze
  superfícies consultadas. Três provas diretas ficaram `unavailable`: conexão
  SQL de produção do Supabase, readbacks SQL diretos e API do Sentry com o token
  disponível.

O gate externo que falta não é correção de código. É a ativação controlada:

1. publicar o PR mantendo os dois locks desligados;
2. configurar credenciais mínimas;
3. desligar a atribuição automática de domínios na Vercel;
4. ativar config e variável em mudança isolada;
5. provar um release verde real;
6. provar uma falha deliberada, Instant Rollback e promoção explícita de
   recovery.

Até essas provas, o estado correto é "implementado, não ativado". O procedimento
nominal está em `docs/operations/fail-closed-release-activation.md`.

## Registro histórico de 2026-08-21

Data: 2026-08-21. Escopo: todo o pacote local da fila serial, sem escrita remota.

### Veredito daquele snapshot

**NÃO HABILITAR AINDA.** Os 104 testes específicos da fila, os 3.449 testes não ignorados do repositório e os dois workflows passam localmente sobre a `main` atual. Os blockers locais encontrados pela revisão foram corrigidos. Falta a prova externa do hold real da Vercel no projeto e ambiente exatos, portanto `enabled` e `SERIAL_MERGE_QUEUE_ENABLED` devem permanecer falsos.

Re-review após o primeiro ciclo de correções:

- Resolvido: manifesto autoafirmado não contorna mais a exigência de aprovação nomeada.
- Resolvido: o caminho live captura `currentDeployment` e bloqueia antes do merge se o baseline obrigatório estiver ausente.
- Resolvido: falha da notificação não impede mais as outras tentativas de rollback.
- Resolvido parcialmente: PR já mergeado com label stale não é mergeado de novo.
- Resolvido: contexto aceita somente actor/app allowlisted e schema estrito; rollback explícito vence a inferência por `mergedAt`; os smokes e o publisher privilegiado usam runners separados.
- Resolvido: merge normal relê base, head e label ativa imediatamente antes da mutação; owner ativo convertido em draft bloqueia; o dispatch de recovery agora possui consumidor em jobs isolados; os timeouts declarativos sem implementação foram removidos.
- Resolvido: o programa `jq` do recovery é executado em teste real; o merge do PR de rollback relê base, head, label do revert e lock do owner; APIs críticas paginam; o watchdog agrega runs; `main` e owner são relidos antes e depois da promoção.
- Ainda bloqueante para ativação: o hold remoto da Vercel não foi provado no projeto e ambiente reais.

## Passo 1, concorrência e máquina de estados

### RESOLVIDO, proveniência do estado persistido

- Local: `scripts/merge-queue/adapters.mjs:76-90`, `scripts/merge-queue/adapters.mjs:121-146`, `scripts/merge-queue/engine.mjs:342-369`.
- `queueContext()` agora aceita somente actor/app allowlisted e schema fechado. Comentários de contributor e estado malformado são ignorados.
- Sonda com comentário válido do actor confiável seguido de comentário forjado preservou somente `previousMainSha`, `previousDeploymentId` e `headSha` confiáveis.

Correção mínima:

- Manter a allowlist mínima e preferir GitHub App dedicada sobre token pessoal quando a automação for ativada.
- O rollback agora revalida deployment id contra o SHA anterior na API Vercel antes da mutação.

Teste mínimo:

- Os testes cobrem comentário de contributor, campo desconhecido, schema inválido e contexto válido do actor confiável.

### RESOLVIDO NO MERGE NORMAL, compare-and-swap da base e releitura do lock

- Local: `scripts/merge-queue/coordinator.mjs:70-82`, `scripts/merge-queue/adapters.mjs:221-239`.
- O merge normal agora relê base, PR/head e label ativa antes de persistir `merge-started` e chamar a API de merge.
- Teste comportamental intercala erro 409 de base stale e comprova zero chamada de merge, owner bloqueado e incidente.

Correção mínima:

- Antes do merge, reler labels ativas, PR, head SHA e main SHA. Abortar se qualquer valor divergir do snapshot aprovado.
- Garantir que o head continua atualizado com a base relida. A API de merge deve ser o último passo depois dessa validação, sem outra mutação no meio.

Teste mínimo:

- Adapter concorrente altera `main` entre snapshot e merge. Resultado observado: `BLOCK`, zero chamada de merge.
- Adapter adiciona segundo owner no mesmo intervalo. Resultado esperado: incidente e zero merge.

### RESOLVIDO, crash depois do merge antes da persistência final

- Local: `scripts/merge-queue/coordinator.mjs:65-82`, `scripts/merge-queue/engine.mjs:279-320`, `scripts/merge-queue/engine.mjs:458-474`.
- O contexto `merge-started` agora é persistido antes do merge e `mergedAt + mergeSha` impede um segundo merge. A sonda de retomada manteve o PR seguinte em `WAIT` e não produziu `MERGE` novamente.
- A fase explícita `rollback` agora prevalece sobre a inferência por `mergedAt`; sonda com rollback PR verde produziu somente `MERGE_ROLLBACK_PR`.

Correção mínima:

- Tornar cada side effect idempotente e reconciliável por estado remoto. PR com `merged=true` deve transicionar a `post-merge` usando `merge_commit_sha` da API, mesmo sem comentário.
- Reemitir status e dispatch ausentes de modo idempotente. Nunca tentar mergear PR já mergeado.

Teste mínimo:

- Fault injection depois de cada side effect de `MERGE_PR`. Uma nova reconciliação deve chegar ao mesmo estado `post-merge`, sem segundo merge e sem liberar o próximo PR.
- Fase explícita `rollback` ou `blocked` deve prevalecer sobre a inferência por `mergedAt`.

### RESOLVIDO, PR ativo convertido em draft bloqueia

- O owner ativo passa pela revalidação de draft antes do merge.
- Teste comportamental com `draft=true`, `active/pre-merge` e checks verdes produz `BLOCK` com `active-pr-is-draft`.

Correção mínima e teste:

- Revalidar draft, state, base e exclusões também para owner ativo antes de qualquer merge.
- Testar `ready -> active -> converted_to_draft`; resultado esperado `BLOCK/WAIT`, zero merge. Adicionar `converted_to_draft` aos gatilhos.

## Passo 2, fronteira de confiança e secrets

### RESOLVIDO, PR de fork não executa código do PR com tokens de escrita

- Os smokes agora rodam em job sem secrets e fazem checkout do `trustedSha` anterior ao merge. O publisher privilegiado usa runner novo e não faz checkout.
- Workflows, config e `scripts/merge-queue/**` entraram no gate de mudanças sensíveis.
- Sondas e testes estruturais confirmaram isolamento entre o job que executa código do repositório e os jobs que recebem tokens de escrita.

### RESOLVIDO PARA AUTOMERGE, migration sem aprovação nomeada

- `requireNamedRemoteWriteApproval=true` agora força `named-remote-write-approval-required`, inclusive diante de manifesto autoafirmado.
- Sonda com `rollback.reference="does-not-exist"` e `verification.checks=["trust me"]` retornou `valid=false` e não chegou ao merge automático.
- Risco residual separado: a enumeração de arquivos continua sem paginação, portanto um arquivo sensível depois da primeira página ainda pode escapar da classificação.

## Passo 3, deploy, rollback e correlação de SHA

### RESOLVIDO, captura e validação do deployment anterior

- O snapshot live agora popula `currentDeployment`, bloqueia antes do merge se o baseline obrigatório estiver ausente e revalida id, SHA anterior e estado antes do Instant Rollback.

### RESOLVIDO, falha da notificação não aborta rollback

- `NOTIFY` ficou por último e o executor tenta todas as mutações de recovery antes de devolver `AggregateError`.
- Sonda com indisponibilidade de Issues confirmou tentativa de Instant Rollback e criação do revert, sem resultado `RELEASE`.

### RESOLVIDO, consumidor de recovery executa o filtro de checks

- Local: `.github/workflows/serial-merge-queue.yml:427-440`.
- O consumidor e seus jobs isolados agora existem, e os sete checks internos skipped/in progress são excluídos para evitar auto-deadlock.
- O filtro usa a forma válida `all(stream; predicate)` e um teste extrai e executa o programa `jq` real com checks internos skipped. O recovery prossegue somente quando os checks externos requeridos estão verdes.

Correção mínima e teste:

- Reescrever o gerador, por exemplo `all([... ][]; . as $required | any($checks[]; ...))`.
- O teste deve executar o programa `jq` extraído do workflow, com os sete jobs internos skipped/in progress, dois checks requeridos verdes, um check externo falho e um requerido ausente.
- Integração deve percorrer falha pós-merge até `RECOVERED`, incluindo checks, deployment, promoção, readback e smokes do SHA restaurado.

### RESOLVIDO, merge do PR de rollback revalida base e locks

- Local: `scripts/merge-queue/coordinator.mjs:140-146`, `scripts/merge-queue/engine.mjs:431-436`.
- `MERGE_ROLLBACK_PR` carrega `expectedBaseSha`, relê base, head e label do revert, e confirma `active + rollback` no owner original antes da mutação. Testes com base alterada e lock removido produzem zero merge.

Correção mínima e teste:

- Aplicar ao rollback a mesma releitura de base, head, estado e lock, incluindo base esperada na mutação.
- Intercalar avanço de `main` e remoção do lock após snapshot. Em ambos os casos, esperar zero merge, owner preservado e incidente.

### HIGH, hold da Vercel e apenas uma declaração local

- Local: `scripts/merge-queue/adapters.mjs:332-346`, `.github/workflows/serial-merge-queue.yml:264-271`, `docs/operations/serial-merge-queue.md:70-89`.
- O preflight verifica apenas se a config diz que o hold e obrigatorio. Não consulta Vercel para provar que Deployment Checks bloqueiam aliases. A única deteccao real ocorre depois do merge, quando o workflow nota que produção já serve o SHA. Nesse ponto o código já entrou no ar, contrariando a promessa de impedir merge sem hold.

Correção mínima e teste:

- Preflight remoto read-only antes de qualquer merge, com prova da regra ativa no projeto/ambiente exatos, ou usar deploy explicito `--skip-domain` sob controle do coordenador.
- Teste controlado com hold ausente deve produzir zero merge. Teste com hold ativo deve provar que o dominio permanece no baseline enquanto o gaté está pending.

### RESOLVIDO, `main` e owner são relidos durante o gate

- Local: `.github/workflows/serial-merge-queue.yml:100-123`, `.github/workflows/serial-merge-queue.yml:124-308`, `scripts/merge-queue/engine.mjs:342-347`.
- O job valida `main`, PR mergeado e labels no início, imediatamente antes de abrir o release gate e novamente depois do readback público. Divergência falha o gate e preserva o lock.

Correção mínima e teste:

- Revalidar `main`, owner e merge SHA antes de abrir o release gaté, depois da promoção e antes de liberar o slot. Divergencia deve iniciar incidente/recovery definido.
- Fault injection que avanca `main` durante polling deve impedir promoção e manter lock.

### RISCO RESIDUAL, recovery de migration não tem produtor de readback de banco

- Local: `scripts/merge-queue/engine.mjs:419-440`, `scripts/merge-queue/adapters.mjs:93-108`, `scripts/merge-queue/adapters.mjs:151-169`.
- Para migration, `RECOVERED` exige `dbReadback`, mas nenhum adapter live consulta ou popula essa evidência. Mesmo um revert de código verde fica em `recovery-evidence-pending` indefinidamente.

Correção mínima e teste:

- Implementar grader read-only específico do manifesto e do SHA restaurado, com identidade, cardinalidade e fonte. Ausência continua fail-closed.
- Integração de migration deve demonstrar apply, falha, compensação, readback e estado final equivalente em ambiente descartável.

## Passo 4, notificação, timeouts e cobertura dos testes

### RESOLVIDO, watchdog agrega runs na mesma assinatura

- Local: `.github/workflows/serial-merge-queue-watchdog.yml:26-64`.
- O marcador é estável por classe de falha, a busca usa paginação do `gh` e ocorrências novas atualizam a issue existente com o run mais recente.

Correção mínima e teste:

- Usar assinatura estável de falha como chave do incidente e guardar run ids como ocorrencias. Paginar a busca ou usar label/chave consultavel.
- Dois runs diferentes com a mesma falha devem atualizar um único incidente; repetição do mesmo evento também deve ser idempotente.

### MEDIUM, checks pending não possuem deadline operacional

- Os campos declarativos sem implementação foram removidos. Ainda assim, check ou slot `pending` pode esperar para sempre sem transicionar para falha nem notificar.

Correção mínima e teste:

- Persistir timestamps de entrada de fase em superfície confiável e avaliar deadlines em cada reconciliação.
- Golden cases no limite e depois do limite devem produzir respectivamente `WAIT` e `BLOCK/ROLLBACK + NOTIFY`, sem liberar o próximo.

### MEDIUM, modo disabled ainda consome rede no workflow

- Local: `.github/workflows/serial-merge-queue.yml:42-71`, `scripts/merge-queue/coordinator.mjs:123-137`.
- O metodo `reconcile()` e inerte quando disabled, mas o workflow já fez checkout e setup de Node. O teste unitario prova apenas ausência de adapters, não ausência de rede/Actions.

Correção mínima e teste:

- Gate barato anterior ao checkout, baseado em variável/config confiável, ou desabilitar gatilhos até a ativação explícita.
- Teste de workflow deve provar que `enabled=false` pula checkout, setup e coordinator.

### RESOLVIDO, APIs críticas percorrem páginas

- Local: `scripts/merge-queue/adapters.mjs:61-74`, `scripts/merge-queue/adapters.mjs:121-129`, `scripts/merge-queue/adapters.mjs:151-169`, `scripts/merge-queue/adapters.mjs:213-230`.
- Check runs, statuses, arquivos, comentários, PRs e issues percorrem páginas com limite defensivo e falham fechado ao excedê-lo. Um teste coloca migration sensível na página 2 e confirma sua presença no snapshot.

Correção mínima e teste:

- Paginar até EOF com limite defensivo e falhar fechado em truncamento/erro.
- Fixtures com item decisivo na página 2 devem ser detectadas.

## Evidencia positiva preservada

- `actionlint` passou nos dois workflows.
- `node --test tests/merge-queue/*.test.mjs` passou: 104/104.
- `npm test` registrou 3.449 passes, zero falha e quatro skips sobre a `main` atual.
- O `pull_request_target` não faz checkout direto do head do PR e não interpola campos do evento diretamente no shell.
- Duas labels `active` observadas no mesmo snapshot geram erro fail-closed.
- Check/deployment/readback de outro SHA não libera o slot no motor puro.
- Dry-run com snapshot injeta zero mutations; config disabled retorna antes dos adapters.
- Recovery completo, quando sintetizado no snapshot, não remove `active`; o PR seguinte permanece `WAIT`.

Esses passes não compensam os blockers. Vários testes atuais validam funções puras ou presença de strings e não exercitam falhas parciais, proveniência, paginação nem integração entre dispatch e consumidor.

## Gate de re-review

Revisar novamente somente depois de:

1. Todos os CRITICAL e HIGH terem teste comportamental vermelho antes da correção e verde depois.
2. Fault injection cobrir cada intervalo entre merge, persistência, labels, status, dispatch, notificação, rollback e revert.
3. Um ensaio controlado provar hold real, SHA exato e recovery sem liberar o segundo PR.
4. A ativacao continuar separada e depender de autorizacao explicita nomeando merge, deploy e rollback automaticos.
