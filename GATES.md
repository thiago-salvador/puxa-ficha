# Gates: programas de governo presidenciais de 2026

Scope: publicar somente programas presidenciais de 2026 com fonte TSE, resumo por IA revisado, texto integral acessível e carregamento sob demanda.

- [x] G0: o ledger declara oráculos executáveis e semanticamente específicos
  CHECK: node /Users/thiagosalvador/.claude/skills/unlazy/scripts/gate-lint.mjs GATES.md
  EXPECT: LINT OK
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha-wt-programa-governo-2026; path=7de86363e2b4/25 entries; EXPECT=matched; output-sha256=2c557a6113db4c377941a81dddd5af21c7a575967db82d8350da20817bb50659; output-bytes=151

- [x] G1: o eval cobre outcome, policy, custo e routing com graders definidos antes do código
  CHECK: python3 /Users/thiagosalvador/.claude/skills/eval/scripts/eval_lint.py docs/operations/programas-governo-presidencia-eval.md && node -e "console.log('PROGRAMAS_EVAL_PASS')"
  EXPECT: PROGRAMAS_EVAL_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha-wt-programa-governo-2026; path=7de86363e2b4/25 entries; EXPECT=matched; output-sha256=389f4dc1d991e8309cabafba619eee2350d14f5199c1f48b33fe8bb8357ba90a; output-bytes=25

- [x] G2: o schema e o registro oficial preservam identidade TSE, estados fail-closed, hashes e evidências
  CHECK: npm run test:programas-governo:schema
  EXPECT: PROGRAMAS_SCHEMA_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha-wt-programa-governo-2026; path=7de86363e2b4/25 entries; EXPECT=matched; output-sha256=5cd202298d56d2cbd49d24b82c6fffe24f3a285b15d99a07d38f27ece7df7817; output-bytes=602

- [x] G3: a extração preserva páginas e texto, rejeita fonte não oficial e não deixa arquivos temporários no repositório
  CHECK: npm run test:programas-governo:extracao
  EXPECT: PROGRAMAS_EXTRACAO_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha-wt-programa-governo-2026; path=7de86363e2b4/25 entries; EXPECT=matched; output-sha256=a285799de321faf96007992fa1e4384e7036a623c68084019ca964ebc41363e1; output-bytes=606

- [x] G4: o lote editorial cobre a coorte presidencial, não publica pendências e respeita limites de resumo, evidência e custo
  CHECK: npm run audit:programas-governo
  EXPECT: PROGRAMAS_DADOS_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha-wt-programa-governo-2026; path=7de86363e2b4/25 entries; EXPECT=matched; output-sha256=96d177bb14832d5f3ad4a9bcdb73dcaa759e215958d24ce0a972cf04a6fc489e; output-bytes=214

- [x] G5: a rota entrega conteúdo somente aprovado, limita antes da leitura e não vaza metadados internos
  CHECK: npm run test:programas-governo:route
  EXPECT: PROGRAMAS_ROUTE_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha-wt-programa-governo-2026; path=7de86363e2b4/25 entries; EXPECT=matched; output-sha256=1c2079b019b00ab3906d2536318b5d9a05033bbc0d57b865ffa20a1cfb55099c; output-bytes=1257

- [x] G6: a Visão geral e a aba Programa obedecem elegibilidade, estados, busca, semântica e carregamento sob demanda
  CHECK: npm run test:programas-governo:ui
  EXPECT: PROGRAMAS_UI_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha-wt-programa-governo-2026; path=7de86363e2b4/25 entries; EXPECT=matched; output-sha256=a49449cab6d61199a23ec813c7295ab4b33c5535032ff9b1570937e7a4706c9c; output-bytes=1549

- [x] G7: a rota real passa por desktop, mobile, teclado, busca, Axe, screenshots e ausência de overflow
  CHECK: npm run test:visual:programas-governo
  EXPECT: PROGRAMAS_VISUAL_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha-wt-programa-governo-2026; path=7de86363e2b4/25 entries; EXPECT=matched; output-sha256=333185ba1fe22bde344aa0da08a32ec01bd553e6b6254fe2e45d5da4ab23efa5; output-bytes=3877

- [x] G8: guardas de rota e superfície pública continuam fechados para abuso e dados internos
  CHECK: npm run audit:route-guards && npm run audit:public-security-surface:gate && node -e "console.log('PROGRAMAS_SECURITY_PASS')"
  EXPECT: PROGRAMAS_SECURITY_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha-wt-programa-governo-2026; path=7de86363e2b4/25 entries; EXPECT=matched; output-sha256=5edf4d34b9e2f4aae72c6b1b12d57f84c1d88903d7e4c356eea09ad623662996; output-bytes=2958

- [x] G9: lint, typecheck, build e diff mecânico passam no estado final
  CHECK: npm run lint && npm run typecheck && npm run build && git diff --check && node -e "console.log('PROGRAMAS_QUALITY_PASS')"
  EXPECT: PROGRAMAS_QUALITY_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha-wt-programa-governo-2026; path=7de86363e2b4/25 entries; EXPECT=matched; output-sha256=f3d86c5a85a2705f566e620bebf013665cbd1a2b8d1726cd9691621b990b32c6; output-bytes=3094

- [x] G10: o diff fica restrito ao piloto presidencial e não inclui banco, deploy, governadores ou ações remotas
  CHECK: npm run audit:programas-governo:scope
  EXPECT: PROGRAMAS_SCOPE_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha-wt-programa-governo-2026; path=7de86363e2b4/25 entries; EXPECT=matched; output-sha256=ae280978ff856b98fafef8e523e0985eeef7ef57ea364ddadd401bc1d9361a28; output-bytes=162

- [x] G11: todos os resumos publicados passaram por judge de família diferente e revisão humana sobre evidências e PDF oficial
  EVIDENCE: Thiago Salvador aprovou os 13 resumos e o fallback temporário para o pacote oficial do TSE em 2026-08-26; cada registro foi promovido com hashes coincidentes de fonte e texto extraído, e a auditoria pós-revisão confirmou 13 aprovados e 179 claims com verdict yes.
