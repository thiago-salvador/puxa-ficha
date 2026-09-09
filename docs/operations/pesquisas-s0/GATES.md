# Gates: S0 local da coleta de pesquisas

OWNS: scripts/lib/pesquisas-monitoramento-rede.ts, scripts/lib/pesquisas-monitoramento-adapters.ts, scripts/pesquisas-atualizacao-agendada/cli.ts, package.json, tests/pesquisas-s0.test.ts, tests/fixtures/pesquisas-monitoramento/**, docs/operations/pesquisas-s0/**

Scope: corrigir e verificar o S0 local, sem alterar catálogos, frequência, credenciais ou estado remoto. Prova no runner e ativação continuam gates operacionais separados, pendentes até haver execução remota autorizada.

- [x] L1: Os incidentes de robots, redação da amostra/campo e consolidação bloqueada têm regressões determinísticas aprovadas
  CHECK: node --conditions react-server --import tsx --test tests/pesquisas-s0.test.ts
  EXPECT: /# fail 0|ℹ fail 0/
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=f26ac12a19b45d051167e19ac20896e7156c3b5aad9406dc55eb9cc45a527352; output-bytes=1830

- [x] L2: Os contratos existentes de monitoramento, rede, isolamento e atualização agendada permanecem aprovados
  CHECK: npm run verify:pesquisas:monitoramento && npm run test:pesquisas:atualizacao-agendada
  EXPECT: /# fail 0|ℹ fail 0/
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=c39937c018d3c0e61faff0c027f1c0837936a0ef058616cdb4d5f1984f3852e0; output-bytes=7097

- [x] L3: O eval do S0 obedece ao formato e às dimensões exigidas
  CHECK: python3 /Users/thiagosalvador/.claude/skills/eval/scripts/eval_lint.py docs/operations/pesquisas-s0/EVAL.md
  EXPECT: /^PASS\s*$/m
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=c26de83abdc9496cd1301470918ec39ecca1cf389ef0ae1c6504da1800d1c431; output-bytes=5

- [x] L4: O ledger contém oráculos executáveis sem alerta estrutural
  CHECK: node /Users/thiagosalvador/.claude/skills/unlazy/scripts/gate-lint.mjs --strict docs/operations/pesquisas-s0/GATES.md
  EXPECT: LINT OK
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8

Rodar com Node 24, cwd na raiz do checkout e PATH estável. L1/L2 não comprovam captura ao vivo. A evidência de rede real será registrada separadamente; erro externo nunca será marcado como sucesso.
