# Plan: fila serial de PR, merge, deploy e rollback

Depth: tree 4   Mode: orchestrated
Budget note: subsistema de CI/CD com estado persistente, integracao GitHub/Vercel, rollback, notificacao e simulacao de falhas; estimativa de 3 a 5 horas com verificacao.

## Contract

- Interfaces: configuracao declarativa em `.github/serial-merge-queue.json`; motor testavel sem rede em `scripts/merge-queue/`; adapters de GitHub e Vercel separados; workflows apenas orquestram o motor.
- Estado: labels persistentes identificam exatamente um slot ativo; o PR mais antigo, por `createdAt` e numero como desempate, e escolhido quando nao existe slot ativo; o lock atravessa merge, verificacao e rollback.
- Falhas: qualquer estado diferente de sucesso explicito e fail-closed; o incidente e deduplicado por assinatura; o proximo PR nunca e selecionado enquanto o slot ativo nao estiver verificado ou restaurado.
- Rollback: codigo volta por commit/PR de revert auditavel; Vercel volta para o deployment anterior comprovadamente READY; migrations e efeitos externos so entram com contrato reversivel verificavel, caso contrario o PR e bloqueado antes do merge.
- Seguranca: nenhum codigo do PR roda em job privilegiado; `GITHUB_TOKEN` com menor permissao; actions de terceiros pinadas por SHA; dry-run nao escreve estado remoto.
- Notificacao: incidente GitHub atribuido a `thiago-salvador`, com Inbox/email dependente das preferencias da conta; watchdog separado cobre crash do coordenador.
- Ativacao: arquivos podem ser preparados, testados e publicados em PR draft; merge do PR de infraestrutura, mudancas remotas e processamento dos PRs existentes exigem confirmacao explicita posterior.

## Implementation contract after discovery

- CLI: `node scripts/merge-queue/coordinator.mjs reconcile --config .github/serial-merge-queue.json [--dry-run]`; simulacao separada em `simulate.mjs`; JSON estruturado em stdout e exit diferente de zero apenas para erro do coordenador, nao para um PR corretamente bloqueado.
- Auth: operacoes GitHub que precisam gerar novos eventos usam `MERGE_QUEUE_GH_TOKEN`; `GITHUB_TOKEN` fica restrito ao watchdog e leituras ou escritas que nao dependem de eventos subsequentes. Vercel usa `VERCEL_TOKEN`, `VERCEL_ORG_ID` e `VERCEL_PROJECT_ID`. Segredo ausente bloqueia, nunca degrada.
- Labels: `merge-queue/active`, `pre-merge`, `post-merge`, `rollback`, `blocked` e `rollback-pr`; duas labels `active` ou fases contraditorias produzem incidente e zero merge.
- Pre-merge: correlacionar o SHA atual; atualizar com `main`; exigir `verify`, `Rotas e acessibilidade (build local)`, cobertura, CodeQL, Vercel Preview e qualquer check presente, salvo allowlist explicita. Resultado antigo, ausente, skipped ou neutral nao fica verde por inferencia.
- Post-merge: manter o lock, correlacionar `merge_commit_sha`, CI, CodeQL, ledger, replay condicional, deployment Vercel e smokes. A producao deve ficar retida por deployment check ou status `Serial release gate` ate o deployment staged e os checks passarem; depois da promocao, confirmar `/api/deployment-info` e smokes publicos.
- Recovery: capturar `main_before_sha` e deployment anterior; falha antes de promover preserva producao e abre revert; falha depois de promover faz Instant Rollback, verifica o SHA anterior, conclui o revert e promove o deployment de recuperacao para reativar auto-alias.
- Irreversibilidade: qualquer migration, SQL de producao, email, cron, storage, DNS, billing, credencial ou escrita externa sem manifesto e grader de reversibilidade fica bloqueado. Nenhum SQL vindo do PR e executado pelo workflow privilegiado.
- Notification: incidente GitHub deduplicado e atribuido a `thiago-salvador`; watchdog por `workflow_run` cobre crash do coordenador. Falha de notificacao continua sendo falha operacional.
- Ownership: leaf 1.2.1 e dono exclusivo de `scripts/merge-queue/**`, `tests/merge-queue/**` e `tests/fixtures/serial-merge-queue-*`; leaf 1.2.2 e dono exclusivo de `.github/serial-merge-queue.json`, `.github/workflows/serial-merge-queue*.yml` e `docs/operations/serial-merge-queue.md`.

## Tree

- 1 Fila serial de entrega
  - 1.1 Descoberta e contrato operacional .......... gates/node-1.1.md
    - 1.1.1 GitHub, checks e estado da fila ........ gates/leaf-1.1.1.md
    - 1.1.2 Vercel, producao, banco e rollback ..... gates/leaf-1.1.2.md
  - 1.2 Implementacao e prova ...................... gates/node-1.2.md
    - 1.2.1 Motor, golden set e testes ............. gates/leaf-1.2.1.md
    - 1.2.2 Workflows, watchdog e operacao ......... gates/leaf-1.2.2.md
  - 1.3 Integracao adversarial ..................... gates/node-1.3.md
    - 1.3.1 Seguranca e modos de falha ............. gates/leaf-1.3.1.md
    - 1.3.2 Suite completa e dry-run ............... gates/leaf-1.3.2.md

## Status log

- 2026-08-21 plano escrito, contrato inicial fixado e ativacao remota bloqueada
- 2026-08-21 descoberta GitHub e deploy verificada, contrato de implementacao fixado antes do fan-out
- 2026-08-21 leaves 1.2.1 e 1.2.2 verificados, motor e workflows integrados
- 2026-08-21 revisao adversarial encontrou quatro blockers de recovery e uma fronteira de tokens; correcoes e regressions adicionadas
- 2026-08-21 re-review fechou proveniencia de contexto, CAS de base/head, recovery dispatch, isolamento por runner e draft ativo; testes locais e actionlint passam
- 2026-08-21 fechamento sobre main atual: 104 testes da fila, 3449 testes do projeto, lint, typecheck, actionlint e dry-run passam; build segue bloqueado por erro preexistente da rota delete-data e ativacao aguarda prova live do hold Vercel
