# Gates: implementacao integrada

Scope: provar que motor, workflows, configuracao e operacao compoem o mesmo contrato.

- [x] G1: Todos os testes especificos da fila passam juntos.
  CHECK: node --test tests/merge-queue/*.test.mjs
  EXPECT: /fail 0/
  EVIDENCE: # todo 0 | # duration_ms 3.96325
- [x] G2: Nomes de labels, estados, checks e incidentes coincidem entre motor, workflow, config e docs.
  EVIDENCE: config, coordinator, workflow e runbook usam as seis labels merge-queue e o contexto Serial release gate; rg e jq conferidos pelo parent
- [x] G3: O workflow fica inerte ate existir configuracao explicita de enabled e confirmacao de ativacao.
  CHECK: node --test tests/merge-queue/dry-run.test.mjs
  EXPECT: /pass/
  EVIDENCE: # todo 0 | # duration_ms 48.208333
