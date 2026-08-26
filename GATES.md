# Gates: programas de governo presidenciais de 2026

Scope: publicar somente programas presidenciais de 2026 com fonte TSE, resumo por IA revisado, texto integral acessível e carregamento sob demanda.

- [ ] G0: o ledger declara oráculos executáveis e semanticamente específicos
  CHECK: node /Users/thiagosalvador/.claude/skills/unlazy/scripts/gate-lint.mjs GATES.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: o eval cobre outcome, policy, custo e routing com graders definidos antes do código
  CHECK: python3 /Users/thiagosalvador/.claude/skills/eval/scripts/eval_lint.py docs/operations/programas-governo-presidencia-eval.md && node -e "console.log('PROGRAMAS_EVAL_PASS')"
  EXPECT: PROGRAMAS_EVAL_PASS
  EVIDENCE: pending

- [ ] G2: o schema e o registro oficial preservam identidade TSE, estados fail-closed, hashes e evidências
  CHECK: npm run test:programas-governo:schema
  EXPECT: PROGRAMAS_SCHEMA_PASS
  EVIDENCE: pending

- [ ] G3: a extração preserva páginas e texto, rejeita fonte não oficial e não deixa arquivos temporários no repositório
  CHECK: npm run test:programas-governo:extracao
  EXPECT: PROGRAMAS_EXTRACAO_PASS
  EVIDENCE: pending

- [ ] G4: o lote editorial cobre a coorte presidencial, não publica pendências e respeita limites de resumo, evidência e custo
  CHECK: npm run audit:programas-governo
  EXPECT: PROGRAMAS_DADOS_PASS
  EVIDENCE: pending

- [ ] G5: a rota entrega conteúdo somente aprovado, limita antes da leitura e não vaza metadados internos
  CHECK: npm run test:programas-governo:route
  EXPECT: PROGRAMAS_ROUTE_PASS
  EVIDENCE: pending

- [ ] G6: a Visão geral e a aba Programa obedecem elegibilidade, estados, busca, semântica e carregamento sob demanda
  CHECK: npm run test:programas-governo:ui
  EXPECT: PROGRAMAS_UI_PASS
  EVIDENCE: pending

- [ ] G7: a rota real passa por desktop, mobile, teclado, busca, Axe, screenshots e ausência de overflow
  CHECK: npm run test:visual:programas-governo
  EXPECT: PROGRAMAS_VISUAL_PASS
  EVIDENCE: pending

- [ ] G8: guardas de rota e superfície pública continuam fechados para abuso e dados internos
  CHECK: npm run audit:route-guards && npm run audit:public-security-surface:gate && node -e "console.log('PROGRAMAS_SECURITY_PASS')"
  EXPECT: PROGRAMAS_SECURITY_PASS
  EVIDENCE: pending

- [ ] G9: lint, typecheck, build e diff mecânico passam no estado final
  CHECK: npm run lint && npm run typecheck && npm run build && git diff --check && node -e "console.log('PROGRAMAS_QUALITY_PASS')"
  EXPECT: PROGRAMAS_QUALITY_PASS
  EVIDENCE: pending

- [ ] G10: o diff fica restrito ao piloto presidencial e não inclui banco, deploy, governadores ou ações remotas
  CHECK: npm run audit:programas-governo:scope
  EXPECT: PROGRAMAS_SCOPE_PASS
  EVIDENCE: pending

- [x] G11: todos os resumos publicados passaram por judge de família diferente e revisão humana sobre evidências e PDF oficial
  EVIDENCE: Thiago Salvador aprovou os 13 resumos e o fallback temporário para o pacote oficial do TSE em 2026-08-26; cada registro foi promovido com hashes coincidentes de fonte e texto extraído, e a auditoria pós-revisão confirmou 13 aprovados e 179 claims com verdict yes.
