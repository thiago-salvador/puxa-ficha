# Gates: monitoramento automatizado de pesquisas eleitorais

Scope: descobrir e validar evidencias de fontes publicas aprovadas, produzindo somente propostas revisaveis em dry-run, sem alterar catalogos, banco, GitHub ou producao.

- [x] G0: o eval da automacao cobre outcome, policy, custo e routing com golden set e graders deterministas
  CHECK: python3 /Users/thiagosalvador/.claude/skills/eval/scripts/eval_lint.py docs/operations/pesquisas-monitoramento-automatizado-eval.md && node -e "console.log('EVAL_MONITORAMENTO_PASS')"
  EXPECT: EVAL_MONITORAMENTO_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=4672039cfedcd17a79a015c869067e0433578cd36833b448636dd4b880ecbfa9; output-bytes=29

- [x] G1: a referencia resolve 100 por cento do golden set hermetico, incluindo os dez modos de falha obrigatorios
  CHECK: npm run test:pesquisas:monitoramento
  EXPECT: MONITORAMENTO_GOLDEN_100_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=03322ee287cd3084e9e7b861a24be581e7d8c73d9e5a2f5f7b40137e9ae5daa1; output-bytes=1792

- [x] G2: somente fontes aprovadas e publicas chegam aos adaptadores, e conteudo externo permanece dado inerte
  CHECK: npm run audit:pesquisas:monitoramento
  EXPECT: MONITORAMENTO_POLICY_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=08a3c1df869f5f0c007a71b4017322cb4ade2bc62aec770b67aa2c2a8c0c8a7e; output-bytes=170

- [x] G3: o dry-run gera proposta, diff estruturado e resumo sem modificar nenhum catalogo publicado
  CHECK: npm run test:pesquisas:monitoramento:isolamento
  EXPECT: MONITORAMENTO_ISOLAMENTO_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=ca40fe3648e8cdcadbd1fddee30c4c05ec697ead668a559d98126fc2f0bd7d65; output-bytes=467

- [x] G4: novo, alterado, inalterado, vencido, conflitante, fonte indisponivel e identidade nao resolvida sao classificacoes alcancaveis e fail-closed
  CHECK: npm run test:pesquisas:monitoramento
  EXPECT: MONITORAMENTO_CLASSIFICACOES_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=3c3e36af8622485551bc4b0eb4e37b7eea5eb4522d1fd969fc34617697f9a020; output-bytes=1793

- [x] G5: a coleta aplica timeout, retry limitado, rate limit, robots e logs sem segredos
  CHECK: npm run test:pesquisas:monitoramento:rede
  EXPECT: MONITORAMENTO_REDE_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=eb23a9cb2e2c0a7bed8142bc1a3db41f5ea32aa81f4d34fbf0f6a3cb26d28842; output-bytes=1495

- [x] G6: o workflow possui somente workflow_dispatch, filtros de fonte ou UF, resumo e artefato com retencao definida
  CHECK: npm run test:pesquisas:monitoramento:workflow
  EXPECT: MONITORAMENTO_WORKFLOW_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=70ee1f2d668c82b607f2408ef9a0be29d9f70b4daafa6d191910bea72307d300; output-bytes=469

- [x] G7: uma coleta manual controlada observa a pagina publica aprovada do PoderData e valida robots, registro, amostra, campo e hash
  CHECK: npm run monitor:pesquisas:manual -- --source=poderdata-aya-nacional-2026 --out=/private/tmp/pf-monitoramento-manual-gate
  EXPECT: MONITORAMENTO_LIVE_SOURCE_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=c72f3022f9f5f5c60f59202b42cabc9e6c8ad6d560d0b40e1cb0f89249ec238c; output-bytes=695

- [x] G8: o gate canonico de pesquisas permanece integralmente verde
  CHECK: npm run verify:pesquisas
  EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=dd25580362e384dbcf9fa694b2aba0287162243d104fe6f2c29e238bb2c0b2ae; output-bytes=20336

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
