# Gates: monitoramento automatizado de pesquisas eleitorais

Scope: descobrir e validar evidencias de fontes publicas aprovadas, produzindo somente propostas revisaveis em dry-run, sem alterar catalogos, banco, GitHub ou producao.

- [x] G0: o eval da automacao cobre outcome, policy, custo e routing com golden set e graders deterministas
  CHECK: python3 /Users/thiagosalvador/.claude/skills/eval/scripts/eval_lint.py docs/operations/pesquisas-monitoramento-automatizado-eval.md && node -e "console.log('EVAL_MONITORAMENTO_PASS')"
  EXPECT: EVAL_MONITORAMENTO_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=4672039cfedcd17a79a015c869067e0433578cd36833b448636dd4b880ecbfa9; output-bytes=29

- [x] G1: a referencia resolve 100 por cento do golden set hermetico, incluindo os dez modos de falha obrigatorios
  CHECK: npm run test:pesquisas:monitoramento
  EXPECT: MONITORAMENTO_GOLDEN_100_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=2cd910a1a4742d2697c7802b24f16e3ad9eb10c276d0ab26b606afb46ea33c09; output-bytes=1792

- [x] G2: somente fontes aprovadas e publicas chegam aos adaptadores, e conteudo externo permanece dado inerte
  CHECK: npm run audit:pesquisas:monitoramento
  EXPECT: MONITORAMENTO_POLICY_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=08a3c1df869f5f0c007a71b4017322cb4ade2bc62aec770b67aa2c2a8c0c8a7e; output-bytes=170

- [x] G3: o dry-run gera proposta, diff estruturado e resumo sem modificar nenhum catalogo publicado
  CHECK: npm run test:pesquisas:monitoramento:isolamento
  EXPECT: MONITORAMENTO_ISOLAMENTO_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=dbe28fb6d5cfa30340c14ec18e80935825b0ca1b12b283c5ef9a4d8eca8b8d3b; output-bytes=470

- [x] G4: novo, alterado, inalterado, vencido, conflitante, fonte indisponivel e identidade nao resolvida sao classificacoes alcancaveis e fail-closed
  CHECK: npm run test:pesquisas:monitoramento
  EXPECT: MONITORAMENTO_CLASSIFICACOES_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=3aa3fcc2f1713476ce0255efc6359164d24d5218cf427b28222be832b119ad9c; output-bytes=1791

- [x] G5: a coleta aplica timeout, retry limitado, rate limit, robots e logs sem segredos
  CHECK: npm run test:pesquisas:monitoramento:rede
  EXPECT: MONITORAMENTO_REDE_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=9e2a64cf61c4fda171e22784583eb77844a80c4c476292a5e990528460517bac; output-bytes=1492

- [x] G6: o workflow possui somente workflow_dispatch, filtros de fonte ou UF, resumo e artefato com retencao definida
  CHECK: npm run test:pesquisas:monitoramento:workflow
  EXPECT: MONITORAMENTO_WORKFLOW_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=8939cde28d0a2ce70be0f841574e2d36b9619df31d860dc054edc36632e7e60c; output-bytes=468

- [x] G7: uma coleta manual controlada observa a pagina publica aprovada do PoderData e valida robots, registro, amostra, campo e hash
  CHECK: npm run monitor:pesquisas:manual -- --source=poderdata-aya-nacional-2026 --out=/private/tmp/pf-monitoramento-manual-gate
  EXPECT: MONITORAMENTO_LIVE_SOURCE_PASS
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=c72f3022f9f5f5c60f59202b42cabc9e6c8ad6d560d0b40e1cb0f89249ec238c; output-bytes=695

- [x] G8: o gate canonico de pesquisas permanece integralmente verde
  CHECK: npm run verify:pesquisas
  EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha; path=5be2df5db96c/28 entries; EXPECT=matched; output-sha256=cd6a22601a20c0a85fca93bbd93bc7e4886f6b0a7afee51457eadd15a76a80fc; output-bytes=20350

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
