# Gates: verificacao adversarial integrada

Scope: validar comportamento, seguranca, regressao e ausencia de ativacao prematura.

- [ ] G1: Revisao adversarial nao encontra caminho que libere o proximo PR antes de sucesso ou restauracao.
  EVIDENCE: pending
- [ ] G2: Todos os checks da raiz estao medidos e com evidencia.
  CHECK: node /Users/thiagosalvador/.claude/skills/unlazy/scripts/gate-check.mjs --status GATES.md
  EXPECT: /0 unmet|12\/12/
  EVIDENCE: pending
- [ ] G3: Git diff contem apenas a automacao, testes e documentacao relacionados.
  CHECK: git diff --name-only origin/main...HEAD
  EXPECT: /serial-merge-queue|merge-queue/
  EVIDENCE: pending
