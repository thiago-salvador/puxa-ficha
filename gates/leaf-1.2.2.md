# Gates: workflows e operacao

Scope: implementar coordenador, watchdog, configuracao e runbook sem ativar a main.

- [x] G1: Workflows chamam o motor com concorrencia serial e cancel-in-progress falso.
  CHECK: node --test tests/merge-queue/workflow-security.test.mjs
  EXPECT: /pass/
  EVIDENCE: PASS em 2026-08-21; 4 subtests do workflow, incluindo concurrency, default branch confiavel, secrets e dispatch pos-merge.
- [x] G2: Watchdog independente detecta conclusao falha do coordenador.
  CHECK: node --test tests/merge-queue/watchdog.test.mjs
  EXPECT: /pass/
  EVIDENCE: PASS em 2026-08-21; 3 subtests cobrem conclusao nao-success, payload como dado, dedup por run id e assignee.
- [x] G3: Runbook documenta ativacao, pausa, recuperacao, observabilidade e limites de migration.
  EVIDENCE: docs/operations/serial-merge-queue.md, secoes 45-232 cobrem secrets, hold Vercel, incidentes, rollback, recovery manual, migrations, dry-run, ativacao e pausa.
- [x] G4: Configuracao declara checks pre e pos merge, smoke e politicas de timeout.
  EVIDENCE: .github/serial-merge-queue.json:30 declara checks, :87 timeouts, :97 producao staged/smokes/promocao/readback e :172 release gate.
- [x] G5: Nenhuma mudanca remota e executada por testes ou dry-run.
  EVIDENCE: node --test tests/merge-queue/dry-run.test.mjs PASS; prova writes=[] e config disabled retorna antes de adapters/tokens/rede. Nenhum comando remoto mutavel foi executado neste leaf.
