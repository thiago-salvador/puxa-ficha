# Gates: atualização agendada de pesquisas eleitorais

OWNS: .github/workflows/pesquisas-monitoramento.yml, GATES.md, docs/operations/pesquisas-monitoramento-automatizado-eval.md, package.json, scripts/pesquisas-atualizacao-agendada/**, scripts/audit/verify-pesquisas-atualizacao-agendada-scope.mjs, tests/pesquisas-atualizacao-agendada.test.ts, tests/pesquisas-monitoramento-workflow.test.ts, tests/fixtures/pesquisas-atualizacao-agendada/**

Scope: executar diariamente a coleta aprovada e preparar, sem merge ou publicação, um único draft PR somente quando toda mudança passar pelos gates.

- [x] G0: o eval e este ledger definem outcomes verificáveis de automação, política, routing e custo
  CHECK: python3 /Users/thiagosalvador/.codex/skills/eval/scripts/eval_lint.py docs/operations/pesquisas-monitoramento-automatizado-eval.md && node /Users/thiagosalvador/.codex/skills/unlazy/scripts/gate-lint.mjs GATES.md && node -e "console.log('SCHEDULED_EVAL_LEDGER_PASS')"
  EXPECT: SCHEDULED_EVAL_LEDGER_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=9425e83c6536f3d7438db34356642fd681eeb1ddbd8988a2c9ab61b4740c57f1; output-bytes=40

- [x] G1: workflow diário preserva dispatch, usa matriz completa, consolida após todos os adaptadores e isola permissões de escrita
  CHECK: npm run test:pesquisas:monitoramento:workflow && node -e "console.log('SCHEDULED_WORKFLOW_PASS')"
  EXPECT: SCHEDULED_WORKFLOW_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=fe5d688c14fc6e4182cc05a85f72a92ccd933ad82f9a900e595c48c265259191; output-bytes=1492

- [x] G2: golden set de promoção passa para no-change, mudança válida e todos os bloqueios fail-closed
  CHECK: npm run test:pesquisas:atualizacao-agendada && node -e "console.log('SCHEDULED_GOLDEN_PASS')"
  EXPECT: SCHEDULED_GOLDEN_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=409e9e933d915a402a3b0f330954b908b4032ef5d342308b5d28b472de39c675; output-bytes=3427

- [x] G3: falha do verificador e draft existente impedem push e duplicação
  CHECK: npm run test:pesquisas:atualizacao-agendada && node -e "console.log('SCHEDULED_GUARDS_PASS')"
  EXPECT: SCHEDULED_GUARDS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=62cc1930bbaff98552d79b25e240a1fc0ab89b5a8f74e7100b4a821ae55d0a91; output-bytes=3426

- [x] G4: nenhum caminho executa merge, deploy, Supabase, revalidação de produção ou force-push
  CHECK: npm run test:pesquisas:atualizacao-agendada && node -e "console.log('SCHEDULED_POLICY_PASS')"
  EXPECT: SCHEDULED_POLICY_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=c44cba36dfcb9a165ace4f81c1ae355e9c50761606cb555bcdcd8160da319265; output-bytes=3426

- [x] G5: o diff final altera somente o workflow, testes, fixtures, documentação e scripts permitidos
  CHECK: npm run audit:pesquisas:atualizacao-agendada:scope && node -e "console.log('SCHEDULED_SCOPE_PASS')"
  EXPECT: SCHEDULED_SCOPE_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=fedebbfa216c4ee9fa1a42d8f497471332570243515aa4cb9811047586658597; output-bytes=225

- [x] G6: todos os gates específicos da atualização agendada passam no estado final
  CHECK: npm run verify:pesquisas:atualizacao-agendada && node -e "console.log('SCHEDULED_VERIFY_PASS')"
  EXPECT: SCHEDULED_VERIFY_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=bffa784913df5a97e302f487c3f082d9ea63cfa463cfd33b74b1ce7e0e829cd1; output-bytes=5517

- [x] G7: o gate canônico de pesquisas passa integralmente no diff final
  CHECK: npm run verify:pesquisas && node -e "console.log('SCHEDULED_VERIFY_PESQUISAS_PASS')"
  EXPECT: SCHEDULED_VERIFY_PESQUISAS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=6db8b6166c3e2cc25c9d87e872d6414c7746e729da8814f00a1d80801ed586ef; output-bytes=20674

- [x] G8: autoria e branch local correspondem exatamente ao contrato do PR
  CHECK: test "$(git branch --show-current)" = "codex/pesquisas-atualizacao-agendada" && test "$(git config user.name)" = "Thiago Salvador" && test "$(git config user.email)" = "contato.thiagosalvador@gmail.com" && node -e "console.log('SCHEDULED_AUTHORSHIP_PASS')"
  EXPECT: SCHEDULED_AUTHORSHIP_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=06cbda863b00115d87b6a3b01a9cea73ed50b5d758be8174289ac843c187f807; output-bytes=26
