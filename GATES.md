# Gates: monitoramento automatizado de pesquisas eleitorais

Scope: descobrir e validar evidencias de fontes publicas aprovadas, produzindo somente propostas revisaveis em dry-run, sem alterar catalogos, banco, GitHub ou producao.

- [x] G0: o eval da automacao cobre outcome, policy, custo e routing com golden set e graders deterministas
  CHECK: python3 /Users/thiagosalvador/.claude/skills/eval/scripts/eval_lint.py docs/operations/pesquisas-monitoramento-automatizado-eval.md && node -e "console.log('EVAL_MONITORAMENTO_PASS')"
  EXPECT: EVAL_MONITORAMENTO_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=4672039cfedcd17a79a015c869067e0433578cd36833b448636dd4b880ecbfa9; output-bytes=29

- [x] G1: a referencia resolve 100 por cento do golden set hermetico, incluindo os dez modos de falha obrigatorios
  CHECK: npm run test:pesquisas:monitoramento
  EXPECT: MONITORAMENTO_GOLDEN_100_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=a1265332b8d21a511f5f6e6175f1daa791147c41115b4565c523f3efecd255a0; output-bytes=1792

- [x] G2: somente fontes aprovadas e publicas chegam aos adaptadores, e conteudo externo permanece dado inerte
  CHECK: npm run audit:pesquisas:monitoramento
  EXPECT: MONITORAMENTO_POLICY_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=08a3c1df869f5f0c007a71b4017322cb4ade2bc62aec770b67aa2c2a8c0c8a7e; output-bytes=170

- [x] G3: o dry-run gera proposta, diff estruturado e resumo sem modificar nenhum catalogo publicado
  CHECK: npm run test:pesquisas:monitoramento:isolamento
  EXPECT: MONITORAMENTO_ISOLAMENTO_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=213c26e7e0b8855a1745cae1e1f9575cc3e6ad2cd2957f5ac12dc56b1a22543e; output-bytes=469

- [x] G4: novo, alterado, inalterado, vencido, conflitante, fonte indisponivel e identidade nao resolvida sao classificacoes alcancaveis e fail-closed
  CHECK: npm run test:pesquisas:monitoramento
  EXPECT: MONITORAMENTO_CLASSIFICACOES_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=5af78462a77f7c19e7975a44460b6cb7bb5f5649e1a081a0c00adb5ddea30af2; output-bytes=1790

- [x] G5: a coleta aplica timeout, retry limitado, rate limit, robots e logs sem segredos
  CHECK: npm run test:pesquisas:monitoramento:rede
  EXPECT: MONITORAMENTO_REDE_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=f5c37b36d7f1e9ed596fe64cc557c6ed8f1cc157161724405cb655436cf35712; output-bytes=1496

- [x] G6: o workflow possui somente workflow_dispatch, filtros de fonte ou UF, resumo e artefato com retencao definida
  CHECK: npm run test:pesquisas:monitoramento:workflow
  EXPECT: MONITORAMENTO_WORKFLOW_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=c20d9201cf13c8e551f446031f165bbdbb618610a1a8146f369b04ae059a1aeb; output-bytes=469

- [x] G7: uma coleta manual controlada observa a pagina publica aprovada do PoderData e valida robots, registro, amostra, campo e hash
  CHECK: npm run monitor:pesquisas:manual -- --source=poderdata-aya-nacional-2026 --out=/private/tmp/pf-monitoramento-manual-gate
  EXPECT: MONITORAMENTO_LIVE_SOURCE_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=c72f3022f9f5f5c60f59202b42cabc9e6c8ad6d560d0b40e1cb0f89249ec238c; output-bytes=695

- [x] G8: o gate canonico de pesquisas permanece integralmente verde
  CHECK: npm run verify:pesquisas
  EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=fc1b093416ae97487c6ebe49c982ca8f6779ecbb337412888570751b626ef1c4; output-bytes=20351

- [x] G9: lint, typecheck e auditorias de seguranca aplicaveis passam no diff final
  CHECK: npm run lint && npm run typecheck && npm run audit:public-security-surface:gate && npm run audit:route-guards && node -e "console.log('MONITORAMENTO_SECURITY_PASS')"
  EXPECT: MONITORAMENTO_SECURITY_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=487e8ebdce9d6c4f3c3aef087c1cf96c5b36e8e399c337a89167b68c88ec2dfd; output-bytes=3077

- [x] G10: o diff contem somente infraestrutura de monitoramento, testes, fixtures, workflow manual, documentacao, eval e ledger
  CHECK: npm run audit:pesquisas:monitoramento:scope
  EXPECT: MONITORAMENTO_SCOPE_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=cb785c2bbcf5b0db04b5b4c504ddca7166b88d84f1b5a58d4d6778d60c45e67d; output-bytes=168

- [x] G11: o PR tem autoria do Thiago, branch exata, nenhum cron, merge ou efeito em producao
  EVIDENCE: PR #104 aberto em https://github.com/thiago-salvador/puxa-ficha/pull/104; branch codex/pesquisas-monitoramento-automatizado; commits f34025b e 19edbb1 com Thiago Salvador <contato.thiagosalvador@gmail.com>; workflow somente workflow_dispatch; PR aberto e nao mergeado; nenhuma escrita em Supabase ou producao.
