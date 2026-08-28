# Gates: polimento ponta a ponta da ficha de candidatos

OWNS: GATES.md, docs/operations/ficha-candidatos-ux-eval.md, playwright.candidato-ficha-ux.config.ts, src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx, src/components/CandidateSitesCard.tsx, src/components/CandidatoProfile.tsx, src/components/DeferredCandidateClientWidgets.tsx, src/components/DeferredCandidatoProfileClient.tsx, src/components/ProfileOverview.tsx, src/components/ProfileTabs.tsx, src/components/ProgramaGovernoSection.tsx, src/components/ShareButtons.tsx, src/components/SocialCardModal.tsx, src/components/alerts/FollowCandidateButton.tsx, tests/candidato-profile-ux.test.tsx, tests/cards-dinheiro-layout.test.tsx, tests/visual/candidato-ficha-ux.spec.ts

Scope: entregar as quatro ondas aprovadas de polimento da ficha com navegação mobile compacta, estados claros, leitor progressivo, hero reorganizado, cards consistentes e microestados acessíveis.

- [x] G0: o eval e o ledger cobrem todos os outcomes aprovados sem placeholder
  CHECK: python3 "/Users/thiagosalvador/.codex/skills/eval/scripts/eval_lint.py" docs/operations/ficha-candidatos-ux-eval.md && npx --yes node@24 "/Users/thiagosalvador/.codex/skills/unlazy/scripts/gate-lint.mjs" GATES.md && npx --yes node@24 -e "console.log('FICHA_UX_LEDGER_PASS')"
  EXPECT: FICHA_UX_LEDGER_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=34a0c52bb5af/37 entries; EXPECT=matched; output-sha256=51d9222bd20e140a7e12ce481c6d3729a99bb95a1851751ac4dcf6c29eff6566; output-bytes=34

- [x] G1: navegação mobile, leitor progressivo, cards e microestados passam nos testes focados
  CHECK: npx --yes node@24 --import tsx --test tests/candidato-profile-ux.test.tsx tests/candidato-profile-tabs.test.ts tests/programa-governo-ui.test.tsx tests/candidate-sites-card.test.tsx tests/cards-dinheiro-layout.test.tsx && npx --yes node@24 -e "console.log('FICHA_UX_FOCUSED_PASS')"
  EXPECT: FICHA_UX_FOCUSED_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=34a0c52bb5af/37 entries; EXPECT=matched; output-sha256=45f756902fbccdcd7e7c2e159fd15802a4b5a3cdf35106bae53cbf0080b559bb; output-bytes=5483

- [x] G2: a implementação mantém tipos e lint sem erro
  CHECK: npx --yes node@24 "/Users/thiagosalvador/.local/bin/npm" run typecheck && npx --yes node@24 "/Users/thiagosalvador/.local/bin/npm" run lint && npx --yes node@24 -e "console.log('FICHA_UX_STATIC_PASS')"
  EXPECT: FICHA_UX_STATIC_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=34a0c52bb5af/37 entries; EXPECT=matched; output-sha256=bfb022026755c5baef56600d1cac9f1388272f2b70f5cfae5ea9efeb6d6c8bc8; output-bytes=136

- [x] G3: a aplicação gera o build de produção
  CHECK: VERCEL=0 npx --yes node@24 "/Users/thiagosalvador/.local/bin/npm" run build && npx --yes node@24 -e "console.log('FICHA_UX_BUILD_PASS')"
  EXPECT: FICHA_UX_BUILD_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=34a0c52bb5af/37 entries; EXPECT=matched; output-sha256=3dc1a1ae66510fd6b9afbcd2d1a38585942779cca301b6d2620392b921ff28c5; output-bytes=2917

- [x] G4: a ficha real passa em desktop e mobile sem overflow, com alvos de toque, grid consistente, leitor progressivo e zero violação Axe
  CHECK: npx --yes node@24 node_modules/playwright/cli.js test -c playwright.candidato-ficha-ux.config.ts && npx --yes node@24 -e "console.log('FICHA_UX_VISUAL_PASS')"
  EXPECT: FICHA_UX_VISUAL_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=34a0c52bb5af/37 entries; EXPECT=matched; output-sha256=0fc91d45e5cf01e89d0d3c01890bc3dad8864d9a1a0cda913ad5294a6befa04c; output-bytes=1871

- [x] G5: o diff final está íntegro e limitado aos arquivos declarados em OWNS
  CHECK: git diff --check && npx --yes node@24 -e "const{execFileSync}=require('child_process');const allowed=new Set(['GATES.md','docs/operations/ficha-candidatos-ux-eval.md','playwright.candidato-ficha-ux.config.ts','src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx','src/components/CandidateSitesCard.tsx','src/components/CandidatoProfile.tsx','src/components/DeferredCandidateClientWidgets.tsx','src/components/DeferredCandidatoProfileClient.tsx','src/components/ProfileOverview.tsx','src/components/ProfileTabs.tsx','src/components/ProgramaGovernoSection.tsx','src/components/ShareButtons.tsx','src/components/SocialCardModal.tsx','src/components/alerts/FollowCandidateButton.tsx','tests/candidato-profile-ux.test.tsx','tests/cards-dinheiro-layout.test.tsx','tests/visual/candidato-ficha-ux.spec.ts']);const files=execFileSync('git',['diff','--name-only']).toString().trim().split(/\n/).filter(Boolean);const extra=files.filter(f=>!allowed.has(f));if(extra.length){console.error(extra.join('\n'));process.exit(1)}console.log('FICHA_UX_SCOPE_PASS')"
  EXPECT: FICHA_UX_SCOPE_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=34a0c52bb5af/37 entries; EXPECT=matched; output-sha256=a80db62752c384adf678f58522264da28690b1e2cc726a7fb19dbe211126aeb8; output-bytes=20
