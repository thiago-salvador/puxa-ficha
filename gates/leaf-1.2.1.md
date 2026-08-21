# Gates: motor e golden set

Scope: implementar o motor deterministico da fila, fixtures reais e testes unitarios sem rede.

- [x] G1: Selecao FIFO e lock unico passam para 1, 2 e 10 PRs.
  CHECK: node --test tests/merge-queue/queue-state.test.mjs
  EXPECT: /pass/
  EVIDENCE: 6 testes passaram, 0 falharam, incluindo duas active e fases contraditorias.
- [x] G2: Transicoes pre-merge, pos-merge, falha e rollback sao totais e fail-closed.
  CHECK: node --test tests/merge-queue/pre-merge-failure.test.mjs tests/merge-queue/post-merge-gate.test.mjs tests/merge-queue/rollback.test.mjs
  EXPECT: /pass/
  EVIDENCE: 27 testes passaram, 0 falharam, cobrindo pre-merge, pos-merge e recovery.
- [x] G3: Golden set com 20 ou mais casos reais passa 100% na referencia.
  CHECK: node --test tests/merge-queue/golden-set.test.mjs
  EXPECT: /pass [2-9][0-9]/
  EVIDENCE: 33 casos G01-G33 passaram; runner registrou 34/34 testes PASS, 0 FAIL.
- [x] G4: Dry-run nao produz operacoes mutantes.
  CHECK: node --test tests/merge-queue/dry-run.test.mjs
  EXPECT: /pass/
  EVIDENCE: 2 testes passaram; adapters mutantes tiveram 0 chamadas e config disabled nao tocou tokens ou rede.
- [x] G5: Nenhum placeholder ou TODO permanece nos arquivos do motor.
  CHECK: if rg -n "TODO|FIXME|placeholder|not implemented" scripts/merge-queue tests/merge-queue; then exit 1; else echo 'placeholder scan clean'; fi
  EXPECT: placeholder scan clean
  EVIDENCE: busca exata terminou com exit 0 e nenhuma ocorrencia.
