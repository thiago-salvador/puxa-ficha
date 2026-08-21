# Gates: fila serial de PR, merge, deploy e rollback

Scope: entregar uma automacao fail-closed que processa um PR por vez ate producao verificada, com rollback e notificacao antes de liberar o proximo.

- [x] G1: O eval da automacao e mensuravel, cobre outcome, policy, custo e routing, e passa no linter oficial da skill.
  CHECK: python3 /Users/thiagosalvador/.claude/skills/eval/scripts/eval_lint.py docs/operations/serial-merge-queue-eval.md
  EXPECT: /PASS|OK/
  EVIDENCE: eval_lint.py retornou PASS em 2026-08-21

- [x] G2: O golden set tem ao menos 20 casos derivados de estados e falhas reais do repositorio, inclui referencia que passa 100% e roda sem rede.
  CHECK: node --test tests/merge-queue/golden-set.test.mjs
  EXPECT: /pass [2-9][0-9]/
  EVIDENCE: # todo 0 | # duration_ms 55.24725

- [x] G3: Com 10 PRs elegiveis, somente o mais antigo recebe o lock ativo; nenhum concorrente avanca enquanto esse lock existir.
  CHECK: node --test tests/merge-queue/queue-state.test.mjs
  EXPECT: /pass/
  EVIDENCE: # todo 0 | # duration_ms 47.253833

- [x] G4: Falha, timeout, conflito ou check nao verde no PR mantem a main intacta, preserva o lock no mesmo PR e produz incidente sem duplicar spam.
  CHECK: node --test tests/merge-queue/pre-merge-failure.test.mjs
  EXPECT: /pass/
  EVIDENCE: # todo 0 | # duration_ms 48.281166

- [x] G5: O merge so ocorre no SHA validado e o proximo PR permanece bloqueado ate CI de main, deploy Vercel e smoke de producao passarem.
  CHECK: node --test tests/merge-queue/post-merge-gate.test.mjs
  EXPECT: /pass/
  EVIDENCE: # todo 0 | # duration_ms 48.177334

- [x] G6: Falha depois do merge inicia recuperacao do mesmo slot, reverte codigo e producao, verifica o estado restaurado e so entao libera a fila.
  CHECK: node --test tests/merge-queue/rollback.test.mjs
  EXPECT: /pass/
  EVIDENCE: # todo 0 | # duration_ms 46.924083

- [x] G7: PR com migration ou outro efeito externo sem contrato reversivel e bloqueado antes do merge e notificado, nunca recebe rollback ficticio.
  CHECK: node --test tests/merge-queue/irreversible-change.test.mjs
  EXPECT: /pass/
  EVIDENCE: # todo 0 | # duration_ms 43.807417

- [x] G8: Uma falha do proprio coordenador e detectada por watchdog independente e gera incidente atribuivel ao Thiago.
  CHECK: node --test tests/merge-queue/watchdog.test.mjs
  EXPECT: /pass/
  EVIDENCE: # todo 0 | # duration_ms 43.507625

- [x] G9: Workflows usam permissoes minimas, actions pinadas por SHA, nenhum checkout de codigo nao confiavel em contexto privilegiado e YAML valido.
  CHECK: node --test tests/merge-queue/workflow-security.test.mjs
  EXPECT: /pass/
  EVIDENCE: # todo 0 | # duration_ms 45.108042

- [ ] G10: A suite completa, lint, typecheck e build do projeto passam sem regressao.
  CHECK: npm run lint && npm run typecheck && npm test && npm run build && node --test tests/merge-queue/*.test.mjs
  EXPECT: /pass/
  EVIDENCE: lint, typecheck e 3449 testes passam sobre a main atual; build Webpack falha em export preexistente createDeleteDataHandler de src/app/api/alerts/delete-data/route.ts, arquivo sem diff neste branch; build Turbopack nao aceita o symlink externo de node_modules do worktree

- [x] G11: O sistema possui modo dry-run que prova a ordem e as transicoes sem merge, deploy, comentario ou alteracao de labels.
  CHECK: node --test tests/merge-queue/dry-run.test.mjs
  EXPECT: /pass/
  EVIDENCE: # todo 0 | # duration_ms 43.637583

- [x] G12: A ativacao permanece fail-closed: nenhuma configuracao remota, merge ou deploy de producao e executado antes da confirmacao explicita para ativar o PR de infraestrutura.
  EVIDENCE: config enabled=false, jobs exigem SERIAL_MERGE_QUEUE_ENABLED=true e nenhuma mutation remota de ativacao foi executada
