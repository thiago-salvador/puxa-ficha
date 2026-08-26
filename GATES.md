# Gates: monitoramento das fontes eleitorais aprovadas

Scope: cobrir em dry-run todas as fontes aprovadas e efetivamente usadas nos catálogos presidencial e estadual, sem publicar nem alterar dados versionados.

- [x] G0: o eval e este ledger definem outcomes verificáveis para automação, política, routing e custo
  CHECK: python3 /Users/thiagosalvador/.codex/skills/eval/scripts/eval_lint.py docs/operations/pesquisas-monitoramento-automatizado-eval.md && node /Users/thiagosalvador/.codex/skills/unlazy/scripts/gate-lint.mjs GATES.md && node -e "console.log('MONITOR_EVAL_LEDGER_PASS')"
  EXPECT: MONITOR_EVAL_LEDGER_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=5adb1602005f15a495d2d6af2d4f39711bf59a5dc70978f5a1a504dc0c9b29b3; output-bytes=38

- [x] G1: toda fonte aprovada e usada possui um adaptador explícito e nenhuma fonte condicional ou excluída possui adaptador
  CHECK: npm run audit:pesquisas:monitoramento && node -e "console.log('MONITOR_ADAPTER_COVERAGE_PASS')"
  EXPECT: MONITOR_ADAPTER_COVERAGE_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=03405418cd7da857c1d7ea01275556987463fdf3b69fb55ee9e76aed9aabe6fb; output-bytes=200

- [x] G2: fixtures sanitizadas e golden set provam os quatro adaptadores e todos os modos de falha obrigatórios sem rede
  CHECK: npm run test:pesquisas:monitoramento && node -e "console.log('MONITOR_GOLDEN_PASS')"
  EXPECT: MONITOR_GOLDEN_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=265d8952f99c3d0c1955f3bf54aae93275bfdbfae8b55590875526d730733885; output-bytes=2210

- [x] G3: allowlist, robots, timeout, rate limit, limite de resposta, redirects e retry controlado falham fechados
  CHECK: npm run test:pesquisas:monitoramento:rede && npm run audit:pesquisas:monitoramento && node -e "console.log('MONITOR_NETWORK_POLICY_PASS')"
  EXPECT: MONITOR_NETWORK_POLICY_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=255665cdabf4ba097e421327a504240a0020379c59fe19121a1753b2b9329ef5; output-bytes=1689

- [x] G4: toda proposta cruza o TSE e preserva metadados completos, evidência pública, horário e SHA-256
  CHECK: npm run test:pesquisas:monitoramento:tse && npm run test:pesquisas:monitoramento && node -e "console.log('MONITOR_TSE_EVIDENCE_PASS')"
  EXPECT: MONITOR_TSE_EVIDENCE_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=25c3a693d8f9ebe654dd49178e7c52603ce5b72f53d2d99fca1aae893cd59e19; output-bytes=3005

- [x] G5: o dry-run consolidado escreve somente proposal.json, diff.json e summary.md e não altera catálogos ou produção
  CHECK: npm run test:pesquisas:monitoramento:isolamento && npm run audit:pesquisas:monitoramento && node -e "console.log('MONITOR_ISOLATION_PASS')"
  EXPECT: MONITOR_ISOLATION_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=6d9c02dcee2e5909570026514efecab3fb5deb6b91960ce85d1efaf23e365e34; output-bytes=663

- [x] G6: o workflow manual aceita uma fonte, uma UF ou todas as combinações aprovadas, consolida artefato e resumo, mantém contents read e não possui cron nem secrets
  CHECK: npm run test:pesquisas:monitoramento:workflow && node -e "console.log('MONITOR_WORKFLOW_PASS')"
  EXPECT: MONITOR_WORKFLOW_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=b55b2719b37d4c92757446e45b1e46b901bd975f9c1788d55bae217c4bcdf1cc; output-bytes=490

- [x] G7: um dry-run real por adaptador está registrado com estado comprovado ou bloqueio objetivo
  CHECK: node scripts/audit/verify-pesquisas-monitoramento-live-proof.mjs && node -e "console.log('MONITOR_LIVE_PROOF_PASS')"
  EXPECT: MONITOR_LIVE_PROOF_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=cb745a3734eb80cdebd1f913171960708d0cc9acccf3cdcc7291c4ff2a7a54c9; output-bytes=83

- [x] G8: todos os gates específicos de monitoramento e o escopo estreito passam no diff final
  CHECK: npm run verify:pesquisas:monitoramento && npm run audit:pesquisas:monitoramento:scope && node -e "console.log('MONITOR_SCOPE_PASS')"
  EXPECT: MONITOR_SCOPE_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=73ad46ca3aae0a4f4b18cbee6a95bd88c24076ee2908c497938a61537d7b6955; output-bytes=5249

- [x] G9: o gate canônico de pesquisas passa integralmente no diff final
  CHECK: npm run verify:pesquisas && node -e "console.log('MONITOR_VERIFY_PESQUISAS_PASS')"
  EXPECT: MONITOR_VERIFY_PESQUISAS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=212532f68f13a9d3beae80f916e813c70ca9f30fbbc7268f24719accc9257042; output-bytes=20677

- [ ] G10: branch, autoria, commit, push e PR exclusivo estão comprovados sem merge, cron ou publicação
  CHECK: test "$(git branch --show-current)" = "codex/pesquisas-monitoramento-fontes-estaduais" && test "$(git config user.name)" = "Thiago Salvador" && test "$(git config user.email)" = "contato.thiagosalvador@gmail.com" && gh pr view --json state,headRefName,baseRefName,url --jq 'select(.state == "OPEN" and .headRefName == "codex/pesquisas-monitoramento-fontes-estaduais" and .baseRefName == "main") | "MONITOR_PR_PASS"'
  EXPECT: MONITOR_PR_PASS
  EVIDENCE: pending
