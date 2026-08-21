# Gates: integracao e dry-run

Scope: rodar a suite do projeto e uma simulacao completa de dez PRs com falhas e recuperacao.

- [ ] G1: Lint, typecheck, testes e build existentes passam.
  CHECK: npm run lint && npm run typecheck && npm test && npm run build
  EXPECT: /built|passed|PASS|✓/
  EVIDENCE: lint e typecheck passam; npm test passa com 3433 testes e zero falhas; build Webpack encontra falha preexistente em createDeleteDataHandler de src/app/api/alerts/delete-data/route.ts, arquivo sem diff; Turbopack rejeita o symlink externo de node_modules do worktree
- [x] G2: Suite da fila passa integralmente.
  CHECK: node --test tests/merge-queue/*.test.mjs
  EXPECT: /fail 0/
  EVIDENCE: # tests 104 | # pass 104 | # fail 0
- [x] G3: Simulacao de 10 PRs mostra ordem FIFO, bloqueio, merge, falha pos-merge, rollback e retomada.
  CHECK: node scripts/merge-queue/simulate.mjs tests/fixtures/merge-queue-ten-prs.json
  EXPECT: /SIMULATION PASS/
  EVIDENCE: SIMULATION PASS decision=MERGE owner=43 remoteWrites=0
- [x] G4: Nenhuma operacao remota e produzida no modo dry-run.
  CHECK: node scripts/merge-queue/simulate.mjs tests/fixtures/merge-queue-ten-prs.json --json | jq -e '.remoteWrites == 0'
  EXPECT: 'true'
  EVIDENCE: {"decision":"MERGE","owner":43,"remoteWrites":0}
