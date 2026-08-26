# Gates: cobertura de pesquisas para governos em 19 UFs

Scope: pesquisar as 19 UFs ainda vazias, publicar somente rodadas recentes com evidencia publica qualificada e manter vazias as UFs que nao fecharem todos os criterios.

- [x] G0: o eval cobre outcome, policy, routing, custo e os modos de falha exigidos
  CHECK: python3 /Users/thiagosalvador/.claude/skills/eval/scripts/eval_lint.py docs/operations/pesquisas-governadores-cobertura-19-ufs-eval.md && node -e "console.log('EVAL_19_UFS_PASS')"
  EXPECT: EVAL_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=439212e4dfaaf037055abe83349fce0c857f05739f935c0fc0c279cbf41126ba; output-bytes=22

- [x] G1: as 19 UFs foram pesquisadas e cada uma termina publicada ou com ausencia objetiva e rastreavel
  CHECK: node --conditions react-server --import tsx --test tests/pesquisas-governadores-cobertura.test.ts && node -e "console.log('COBERTURA_19_UFS_PASS')"
  EXPECT: COBERTURA_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=60e24cf1691cfa335e01f27908780db9441e69b121497b997d0cf0e038e1fad8; output-bytes=1264

- [x] G2: somente fonte aprovada, resultado publico completo, metodologia suficiente e rodada atual entram no catalogo
  CHECK: npm run audit:pesquisas:gate && npm run test:pesquisas:dados && node -e "console.log('FONTES_19_UFS_PASS')"
  EXPECT: FONTES_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=29a64719c5376489b202adb3c263b2883cca93c970b4cb8112d404ed6452903b; output-bytes=3211

- [x] G3: isolamento por UF, fonte condicional, alias literal, zero real e ausencia explicita permanecem fail-closed
  CHECK: npm run test:pesquisas:identidade && npm run test:pesquisas:selecao && node -e "console.log('POLICY_19_UFS_PASS')"
  EXPECT: POLICY_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=0508b8a59b8db7a386a8dff0d5daff7899f55c7a75687769858c74de002f3a68; output-bytes=3889

- [x] G4: uma nova UF publicada e duas vazias passam em desktop e celular com screenshots reais
  CHECK: npm run test:visual:pesquisas && node -e "console.log('VISUAL_19_UFS_PASS')"
  EXPECT: VISUAL_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=52de773148c75a04e35ffd98dec07999db1a2de0a9598c03c8aecd3e14b39d67; output-bytes=4831

- [x] G5: o gate canonico de pesquisas permanece integralmente verde no diff final
  CHECK: npm run verify:pesquisas && node -e "console.log('VERIFY_19_UFS_PASS')"
  EXPECT: VERIFY_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=44ef43c45199160925e28327abb10fa5265ac2158ca49acd4f203121b8e5daca; output-bytes=20351

- [x] G6: o diff contem somente catalogos, scorecard, inventario, documentacao, auditor e testes necessarios
  CHECK: node scripts/audit/verify-pesquisas-governadores-scope.mjs && node -e "console.log('SCOPE_19_UFS_PASS')"
  EXPECT: SCOPE_19_UFS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=7cb69c67c37b377a15942a0dadf8330dec4f1667e6b59afbfff97d1c75610152; output-bytes=65

- [ ] G7: branch, autoria, commit, push e PR exclusivo estao comprovados sem merge, deploy ou escrita em producao
  CHECK: test "$(git branch --show-current)" = "codex/pesquisas-cobertura-19-ufs" && test "$(git config user.name)" = "Thiago Salvador" && test "$(git config user.email)" = "contato.thiagosalvador@gmail.com" && gh pr view --json state,isDraft,headRefName,baseRefName,mergeStateStatus,url >/dev/null && node -e "console.log('PR_19_UFS_PASS')"
  EXPECT: PR_19_UFS_PASS
