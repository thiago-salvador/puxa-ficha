# Gates: cobertura de pesquisas para governos em 19 UFs

Scope: pesquisar as 19 UFs ainda vazias, publicar somente rodadas recentes com evidencia publica qualificada e manter vazias as UFs que nao fecharem todos os criterios.

- [x] G0: o eval cobre outcome, policy, routing, custo e os modos de falha exigidos
  CHECK: python3 /Users/thiagosalvador/.claude/skills/eval/scripts/eval_lint.py docs/operations/pesquisas-governadores-cobertura-19-ufs-eval.md && node -e "console.log('EVAL_19_UFS_PASS')"
  EXPECT: EVAL_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=439212e4dfaaf037055abe83349fce0c857f05739f935c0fc0c279cbf41126ba; output-bytes=22

- [x] G1: as 19 UFs foram pesquisadas e cada uma termina publicada ou com ausencia objetiva e rastreavel
  CHECK: node --conditions react-server --import tsx --test tests/pesquisas-governadores-cobertura.test.ts && node -e "console.log('COBERTURA_19_UFS_PASS')"
  EXPECT: COBERTURA_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=2bbe02c15a1a43f6e9d2460fa2467c417ff4793bdb277a129520ce34395a08db; output-bytes=1515

- [x] G2: somente fonte aprovada, resultado publico completo, metodologia suficiente e rodada atual entram no catalogo
  CHECK: npm run audit:pesquisas:gate && npm run test:pesquisas:dados && node -e "console.log('FONTES_19_UFS_PASS')"
  EXPECT: FONTES_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=25d4a56e1b8a3028787df0491b6f6b9fbf8d1ca6cd20dbb8c0d68cc354fe346e; output-bytes=3207

- [x] G3: isolamento por UF, fonte condicional, alias literal, zero real e ausencia explicita permanecem fail-closed
  CHECK: npm run test:pesquisas:identidade && npm run test:pesquisas:selecao && node -e "console.log('POLICY_19_UFS_PASS')"
  EXPECT: POLICY_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=808a5cb8249fc5e228af9bc781b2f20ce7e8465386e535e6ed1c26181e94a3f7; output-bytes=3899

- [x] G4: uma nova UF publicada e duas vazias passam em desktop e celular com screenshots reais
  CHECK: npm run test:visual:pesquisas && node -e "console.log('VISUAL_19_UFS_PASS')"
  EXPECT: VISUAL_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=9658582865eb832715e12f92c37061a2110a60ff1a20ffb5ab9e084b84d2a35a; output-bytes=4876

- [x] G5: o gate canonico de pesquisas permanece integralmente verde no diff final
  CHECK: npm run verify:pesquisas && node -e "console.log('VERIFY_19_UFS_PASS')"
  EXPECT: VERIFY_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=69b990f2fa6ac39530d5cf48636437b8bc4dfdb973e023e22271c26065ccda96; output-bytes=20672

- [x] G6: o diff contem somente catalogos, scorecard, inventario, documentacao, auditor e testes necessarios
  CHECK: node scripts/audit/verify-pesquisas-governadores-scope.mjs && node -e "console.log('SCOPE_19_UFS_PASS')"
  EXPECT: SCOPE_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=10d3362b8db14d49401aa51181dfd2fea86c7790c42f5f8d1feb776f077c1825; output-bytes=66

- [x] G7: branch, autoria, commit, push e PR exclusivo estao comprovados sem merge, deploy ou escrita em producao
  CHECK: test "$(git branch --show-current)" = "codex/pesquisas-cobertura-19-ufs" && test "$(git config user.name)" = "Thiago Salvador" && test "$(git config user.email)" = "contato.thiagosalvador@gmail.com" && gh pr view --json state,isDraft,headRefName,baseRefName,mergeStateStatus,url >/dev/null && node -e "console.log('PR_19_UFS_PASS')"
  EXPECT: PR_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=1ea3079d66e32283b0dc8609fb6546524e7c76d1060580a1f8165addeb449020; output-bytes=15
