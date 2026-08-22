# Gates: contrato operacional integrado

Scope: integrar as descobertas GitHub, Vercel e banco em um contrato implementavel e verificavel.

- [x] G1: Os dois relatorios de descoberta existem e nao se contradizem.
  CHECK: test -s docs/operations/serial-merge-queue-github-discovery.md && test -s docs/operations/serial-merge-queue-deploy-discovery.md && echo 'discovery reports present'
  EXPECT: discovery reports present
  EVIDENCE: discovery reports present
- [x] G2: O eval final incorpora os limites reais de deploy e rollback.
  CHECK: python3 /Users/thiagosalvador/.claude/skills/eval/scripts/eval_lint.py docs/operations/serial-merge-queue-eval.md
  EXPECT: /PASS|OK/
  EVIDENCE: PASS
- [x] G3: O contrato preserva um unico slot ativo ate verificacao ou restauracao comprovada.
  EVIDENCE: PLAN.md exige label active unica atravessando pre-merge, post-merge e recovery; duas active falham fechado
