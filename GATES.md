# Gates: cobertura de pesquisas para governos em 19 UFs

Scope: pesquisar as 19 UFs ainda vazias, publicar somente rodadas recentes com evidencia publica qualificada e manter vazias as UFs que nao fecharem todos os criterios.

- [x] G0: o eval cobre outcome, policy, routing, custo e os modos de falha exigidos
  CHECK: python3 /Users/thiagosalvador/.claude/skills/eval/scripts/eval_lint.py docs/operations/pesquisas-governadores-cobertura-19-ufs-eval.md && node -e "console.log('EVAL_19_UFS_PASS')"
  EXPECT: EVAL_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=439212e4dfaaf037055abe83349fce0c857f05739f935c0fc0c279cbf41126ba; output-bytes=22

- [x] G1: as 19 UFs foram pesquisadas e cada uma termina publicada ou com ausencia objetiva e rastreavel
  CHECK: node --conditions react-server --import tsx --test tests/pesquisas-governadores-cobertura.test.ts && node -e "console.log('COBERTURA_19_UFS_PASS')"
  EXPECT: COBERTURA_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=6517ac0036a0bc0d7629d07c92114fffba2ce665980b0897e0e58c8e421eedae; output-bytes=1513

- [x] G2: somente fonte aprovada, resultado publico completo, metodologia suficiente e rodada atual entram no catalogo
  CHECK: npm run audit:pesquisas:gate && npm run test:pesquisas:dados && node -e "console.log('FONTES_19_UFS_PASS')"
  EXPECT: FONTES_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=83ecd1385f35b5b9c42cf713381149f6766b1bf78bf9d1a9b2507fbc0b3f6644; output-bytes=3214

- [x] G3: isolamento por UF, fonte condicional, alias literal, zero real e ausencia explicita permanecem fail-closed
  CHECK: npm run test:pesquisas:identidade && npm run test:pesquisas:selecao && node -e "console.log('POLICY_19_UFS_PASS')"
  EXPECT: POLICY_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=9c75b28f04afaa0e96c1c44825b088647bb619b4710a391360074a7cd7ad89f1; output-bytes=3904

- [x] G4: uma nova UF publicada e duas vazias passam em desktop e celular com screenshots reais
  CHECK: npm run test:visual:pesquisas && node -e "console.log('VISUAL_19_UFS_PASS')"
  EXPECT: VISUAL_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=8dbec8eeb539183bde1b26c63d6bd4b0c50522c0fe3b27c2139dabd74f24eae6; output-bytes=4831

- [x] G5: o gate canonico de pesquisas permanece integralmente verde no diff final
  CHECK: npm run verify:pesquisas && node -e "console.log('VERIFY_19_UFS_PASS')"
  EXPECT: VERIFY_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=34fc8cb81851bf7502d1f470ed7202c19d22b785506e6fe910db0b5749d733ff; output-bytes=20617

- [x] G6: o diff contem somente catalogos, scorecard, inventario, documentacao, auditor e testes necessarios
  CHECK: node scripts/audit/verify-pesquisas-governadores-scope.mjs && node -e "console.log('SCOPE_19_UFS_PASS')"
  EXPECT: SCOPE_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=10d3362b8db14d49401aa51181dfd2fea86c7790c42f5f8d1feb776f077c1825; output-bytes=66

- [x] G7: branch, autoria, commit, push e PR exclusivo estao comprovados sem merge, deploy ou escrita em producao
  CHECK: test "$(git branch --show-current)" = "codex/pesquisas-cobertura-19-ufs" && test "$(git config user.name)" = "Thiago Salvador" && test "$(git config user.email)" = "contato.thiagosalvador@gmail.com" && gh pr view --json state,isDraft,headRefName,baseRefName,mergeStateStatus,url >/dev/null && node -e "console.log('PR_19_UFS_PASS')"
  EXPECT: PR_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=1ea3079d66e32283b0dc8609fb6546524e7c76d1060580a1f8165addeb449020; output-bytes=15
