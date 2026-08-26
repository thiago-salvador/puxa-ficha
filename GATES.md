# Gates: atualização agendada de pesquisas eleitorais

OWNS: .github/workflows/pesquisas-monitoramento.yml, GATES.md, docs/operations/pesquisas-monitoramento-automatizado-eval.md, package.json, scripts/pesquisas-atualizacao-agendada/**, scripts/audit/verify-pesquisas-atualizacao-agendada-scope.mjs, tests/pesquisas-atualizacao-agendada.test.ts, tests/pesquisas-monitoramento-workflow.test.ts, tests/fixtures/pesquisas-atualizacao-agendada/**

Scope: executar diariamente a coleta aprovada e preparar, sem merge ou publicação, um único draft PR somente quando toda mudança passar pelos gates.

- [x] G0: o eval e este ledger definem outcomes verificáveis de automação, política, routing e custo
  CHECK: python3 "${CODEX_HOME:-$HOME/.codex}/skills/eval/scripts/eval_lint.py" docs/operations/pesquisas-monitoramento-automatizado-eval.md && node "${CODEX_HOME:-$HOME/.codex}/skills/unlazy/scripts/gate-lint.mjs" GATES.md && node -e "console.log('SCHEDULED_EVAL_LEDGER_PASS')"
  EXPECT: SCHEDULED_EVAL_LEDGER_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=e66251be9113/28 entries; EXPECT=matched; output-sha256=9425e83c6536f3d7438db34356642fd681eeb1ddbd8988a2c9ab61b4740c57f1; output-bytes=40

- [x] G1: workflow diário preserva dispatch, usa matriz completa, consolida após todos os adaptadores e isola permissões de escrita
  CHECK: npm run test:pesquisas:monitoramento:workflow && node -e "console.log('SCHEDULED_WORKFLOW_PASS')"
  EXPECT: SCHEDULED_WORKFLOW_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=e66251be9113/28 entries; EXPECT=matched; output-sha256=9ad4edf0a03deebfd81868c002b73ef66e1b1948b1f344739477595446885e29; output-bytes=1487

- [x] G2: golden set de promoção passa para no-change, mudança válida e todos os bloqueios fail-closed
  CHECK: npm run test:pesquisas:atualizacao-agendada && node -e "console.log('SCHEDULED_GOLDEN_PASS')"
  EXPECT: SCHEDULED_GOLDEN_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=e66251be9113/28 entries; EXPECT=matched; output-sha256=9db4112ffb764c26f4bf8f89f1b74d0eb36cbf43ef905baa6f8c6a74c7c9b2a4; output-bytes=4031

- [x] G3: falha do verificador e draft existente impedem push e duplicação
  CHECK: npm run test:pesquisas:atualizacao-agendada && node -e "console.log('SCHEDULED_GUARDS_PASS')"
  EXPECT: SCHEDULED_GUARDS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=e66251be9113/28 entries; EXPECT=matched; output-sha256=8c8b7e257c4cadbf495d6b94e5cd8924d1bcbd87b9cef578395e5c724707a552; output-bytes=4027

- [x] G4: nenhum caminho executa merge, deploy, Supabase, revalidação de produção ou force-push
  CHECK: npm run test:pesquisas:atualizacao-agendada && node -e "console.log('SCHEDULED_POLICY_PASS')"
  EXPECT: SCHEDULED_POLICY_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=e66251be9113/28 entries; EXPECT=matched; output-sha256=c10a14f25c15d6ed100c1b89311bd6d2c033aef3681031384419fea4ffc4aa7c; output-bytes=4027

- [x] G5: o diff final altera somente o workflow, testes, fixtures, documentação e scripts permitidos
  CHECK: npm run audit:pesquisas:atualizacao-agendada:scope && node -e "console.log('SCHEDULED_SCOPE_PASS')"
  EXPECT: SCHEDULED_SCOPE_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=e66251be9113/28 entries; EXPECT=matched; output-sha256=57d6a64b0c16d232968158c2222b7cf42234573903dd2b2c6bbf88a0532521f5; output-bytes=247

- [x] G6: todos os gates específicos da atualização agendada passam no estado final
  CHECK: npm run verify:pesquisas:atualizacao-agendada && node -e "console.log('SCHEDULED_VERIFY_PASS')"
  EXPECT: SCHEDULED_VERIFY_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=e66251be9113/28 entries; EXPECT=matched; output-sha256=391c2c82a5fe8808bc78ff26342d2d2daeda4898a52d3086ba14907f9b60d2e4; output-bytes=6144

- [x] G7: o gate canônico de pesquisas passa integralmente no diff final
  CHECK: npm run verify:pesquisas && node -e "console.log('SCHEDULED_VERIFY_PESQUISAS_PASS')"
  EXPECT: SCHEDULED_VERIFY_PESQUISAS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=e66251be9113/28 entries; EXPECT=matched; output-sha256=25633413605d36dcbb9e326a10e4f4282abb1341feff1ba3f6f998d463208eb8; output-bytes=20681

- [x] G8: autoria e branch local correspondem exatamente ao contrato do PR
  CHECK: test "$(git branch --show-current)" = "codex/pesquisas-atualizacao-agendada" && test "$(git config user.name)" = "Thiago Salvador" && test "$(git config user.email)" = "contato.thiagosalvador@gmail.com" && node -e "console.log('SCHEDULED_AUTHORSHIP_PASS')"
  EXPECT: SCHEDULED_AUTHORSHIP_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=e66251be9113/28 entries; EXPECT=matched; output-sha256=06cbda863b00115d87b6a3b01a9cea73ed50b5d758be8174289ac843c187f807; output-bytes=26
