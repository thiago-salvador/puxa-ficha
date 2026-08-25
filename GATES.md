# Gates: cobertura de pesquisas para governos em 21 UFs

Scope: ampliar a cobertura estadual somente quando registro, resultado, metodologia, recencia, identidade e scorecard passarem integralmente, mantendo vazio todo caso sem prova suficiente.

- [x] G0: o eval cobre outcome, policy, custo e routing com criterios binarios e graders verificaveis
  CHECK: python3 /Users/thiagosalvador/.claude/skills/eval/scripts/eval_lint.py docs/operations/pesquisas-governadores-cobertura-21-ufs-eval.md && node -e "console.log('eval-cobertura-ok')"
  EXPECT: eval-cobertura-ok
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha/.codex/worktrees/pesquisas-governadores-cobertura-21-ufs; path=8e956bdc6e1c/24 entries; EXPECT=matched; output-sha256=6eb78340dfa6d7c2234c5cc8d0f0ee23cae990a49a928eb4059f1eee8fc77763; output-bytes=23

- [x] G1: o inventario final classifica exatamente as 21 UFs solicitadas e registra uma razao objetiva para cada UF nao publicada
  CHECK: node --conditions react-server --import tsx --test tests/pesquisas-governadores-cobertura.test.ts
  EXPECT: cobertura estadual verificada
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha/.codex/worktrees/pesquisas-governadores-cobertura-21-ufs; path=8e956bdc6e1c/24 entries; EXPECT=matched; output-sha256=e7181d1f197a2a078640bc06e24c0ec64ca81eaf6109e2e2c0cec468c8e7e18d; output-bytes=1241

- [x] G2: toda pesquisa publicada usa fonte preferencial aprovada, registro TSE compativel, resultado publico, metodologia suficiente e captura verificavel
  CHECK: node --conditions react-server --import tsx scripts/audit/audit-pesquisas-eleitorais.ts
  EXPECT: contrato server-only, fail-closed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha/.codex/worktrees/pesquisas-governadores-cobertura-21-ufs; path=8e956bdc6e1c/24 entries; EXPECT=matched; output-sha256=63971cff74bc15eeede68fbd0064728ee103c9d2a0b788f453c3bb8698150aaf; output-bytes=138

- [x] G3: cada alias publicado resolve literalmente para candidatura de Governador da mesma UF e nenhum resultado cruza estados
  CHECK: npm run test:pesquisas:identidade && npm run test:pesquisas:selecao
  EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha/.codex/worktrees/pesquisas-governadores-cobertura-21-ufs; path=8e956bdc6e1c/24 entries; EXPECT=matched; output-sha256=a5d7267a5371352d1da096e55bf9e4f1b53395aa4f8898d11f9ae3d5e268f10b; output-bytes=3872

- [x] G4: fontes condicionais nao vazam, percentual ausente nunca vira zero, zero publicado e preservado e UFs sem fonte aprovada permanecem vazias
  CHECK: npm run test:pesquisas:dados && npm run test:pesquisas:selecao && npm run test:pesquisas:ui
  EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha/.codex/worktrees/pesquisas-governadores-cobertura-21-ufs; path=8e956bdc6e1c/24 entries; EXPECT=matched; output-sha256=4945d374d5283385f4c4459e263d528b12a853f5f3e729fef2b673d7029f8d64; output-bytes=8688

- [x] G5: o gate canonico completo de pesquisas passa sobre os arquivos finais
  CHECK: npm run verify:pesquisas
  EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha/.codex/worktrees/pesquisas-governadores-cobertura-21-ufs; path=8e956bdc6e1c/24 entries; EXPECT=matched; output-sha256=7edb99ddba4dcc1d88d58fb3a43273950f99de51973b56e96f2f9e3dfae9a63a; output-bytes=21760

- [x] G6: uma nova UF preenchida e duas UFs vazias renderizam corretamente em desktop e celular, sem percentual inventado nem overflow
  CHECK: npm run test:visual:pesquisas && node -e "console.log('visual-cobertura-ok')"
  EXPECT: visual-cobertura-ok
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha/.codex/worktrees/pesquisas-governadores-cobertura-21-ufs; path=8e956bdc6e1c/24 entries; EXPECT=matched; output-sha256=a386579e8f89097f0e1d13c9edb3a1d5f4bcdbcd160641a44e331cffdbf855e6; output-bytes=6241

- [x] G7: as contagens finais de UFs e perfis publicados sao calculadas dos catalogos finais e coincidem com o inventario
  CHECK: node --conditions react-server --import tsx --test tests/pesquisas-governadores-cobertura.test.ts
  EXPECT: contagens finais verificadas
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha/.codex/worktrees/pesquisas-governadores-cobertura-21-ufs; path=8e956bdc6e1c/24 entries; EXPECT=matched; output-sha256=72ebe74427edf333a552331689f5a0ea8d09ddbd4b4403cee99a580099654d76; output-bytes=1242

- [x] G8: o diff permanece restrito a dados, scorecard, inventario, auditor, testes, eval e ledger, sem design, migration, banco ou dependencia nova
  CHECK: node scripts/audit/verify-pesquisas-governadores-scope.mjs
  EXPECT: escopo do PR verificado
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha/.codex/worktrees/pesquisas-governadores-cobertura-21-ufs; path=8e956bdc6e1c/24 entries; EXPECT=matched; output-sha256=c639ed46ece0db00fb1b03f24ce0507ab4d9e28b506e9326cef6bde9afdaa8c0; output-bytes=48

- [ ] G9: o PR foi aberto na branch solicitada, com autoria do Thiago, fontes, limitacoes e provas no corpo, sem merge ou deploy
  EVIDENCE: pending
