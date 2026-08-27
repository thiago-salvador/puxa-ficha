# Gates: atualização e completude dos dados

Scope: provar cobertura, comparação de candidaturas, freshness, automação somente leitura e integração sem mudança remota

- [x] G0: o eval e este ledger têm critérios executáveis e não vagos
  CHECK: python3 /Users/thiagosalvador/.codex/skills/eval/scripts/eval_lint.py docs/operations/data-freshness-workflow/EVAL.md && node /Users/thiagosalvador/.claude/skills/unlazy/scripts/gate-lint.mjs docs/operations/data-freshness-workflow/GATES.md
  EXPECT: LINT OK
  CWD: ../../..
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/.codex/worktrees/data-freshness-workflow/puxa-ficha; path=b5c44ec16543/25 entries; EXPECT=matched; output-sha256=178547e637a291eaca7147ff40784b50de282fb44983a6fe93643d440f8a14a2; output-bytes=13

- [x] G1: o registro de fontes cobre o inventário e aplica a política de vencimento
  CHECK: npm run test:data-freshness:registry && echo "data freshness registry passed"
  EXPECT: data freshness registry passed
  CWD: ../../..
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/.codex/worktrees/data-freshness-workflow/puxa-ficha; path=b5c44ec16543/25 entries; EXPECT=matched; output-sha256=1c4d2ae156259650032bc5ed425cc0333aabb7edabb49971ec0aff8a4b8a1d24; output-bytes=509

- [x] G2: o comparador de candidaturas passa o golden set e falha fechado
  CHECK: npm run test:data-freshness:candidaturas && npm run test:data-freshness:fail-closed && npm run test:data-freshness:golden && echo "data freshness golden passed"
  EXPECT: data freshness golden passed
  CWD: ../../..
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/.codex/worktrees/data-freshness-workflow/puxa-ficha; path=b5c44ec16543/25 entries; EXPECT=matched; output-sha256=c8dd9951ec4e80bbddf43d817091b84017c1182ceca7b89120f31877f7db41aa; output-bytes=2431

- [x] G3: os artefatos são coerentes e o workflow permanece somente leitura
  CHECK: npm run test:data-freshness:artifacts && npm run test:data-freshness:workflow && echo "data freshness workflow passed"
  EXPECT: data freshness workflow passed
  CWD: ../../..
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/.codex/worktrees/data-freshness-workflow/puxa-ficha; path=b5c44ec16543/25 entries; EXPECT=matched; output-sha256=526bed27d3d606e1aeb9445a2d4b3589b467d09bc035559b55820b354ec03042; output-bytes=898

- [x] G4: o escopo contém somente os arquivos autorizados e nenhuma dependência nova
  CHECK: node scripts/audit/verify-data-freshness-scope.mjs && echo "data freshness scope passed"
  EXPECT: data freshness scope passed
  CWD: ../../..
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/.codex/worktrees/data-freshness-workflow/puxa-ficha; path=b5c44ec16543/25 entries; EXPECT=matched; output-sha256=9521438f0d1cd229b406443db4eb9195e755f5ac3a12c3b02f29f28a4bd3935a; output-bytes=54

- [x] G5: a verificação direcionada passa integralmente
  CHECK: npm run verify:data-freshness && echo "data freshness verification passed"
  EXPECT: data freshness verification passed
  CWD: ../../..
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/.codex/worktrees/data-freshness-workflow/puxa-ficha; path=b5c44ec16543/25 entries; EXPECT=matched; output-sha256=eeaccbe98fb98d951bef259e5538bfd04027ad5820462b5506db338f3e2261e1; output-bytes=7318

- [x] G6: os gates globais do projeto continuam verdes
  CHECK: npm test && npm run lint -- --max-warnings=0 && npm run typecheck && npm run build && git diff --check && echo "data freshness global verification passed"
  EXPECT: data freshness global verification passed
  CWD: ../../..
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/.codex/worktrees/data-freshness-workflow/puxa-ficha; path=b5c44ec16543/25 entries; EXPECT=matched; output-sha256=3bf4ed2bd56ea1b870e4c3fe2af3326c70645c138628ffccaf96e26f3181385e; output-bytes=382254
