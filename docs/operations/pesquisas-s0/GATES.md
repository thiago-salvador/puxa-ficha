# Gates: S0 local da coleta de pesquisas

OWNS: scripts/lib/pesquisas-monitoramento-rede.ts, scripts/lib/pesquisas-monitoramento-adapters.ts, scripts/lib/pesquisas-monitoramento-pesqele.ts, scripts/lib/pesquisas-monitoramento-tse.ts, scripts/lib/pesquisas-monitoramento-poderdata-pdf.ts, scripts/lib/pesquisas-monitoramento-descoberta.ts, scripts/lib/pesquisas-monitoramento-entrada.ts, scripts/lib/pesquisas-monitoramento-identidades.ts, scripts/lib/pesquisas-monitoramento-realtime-cenarios.ts, scripts/lib/pesquisas-monitoramento.ts, scripts/pesquisas-monitoramento.ts, scripts/pesquisas-descoberta.ts, scripts/pesquisas-atualizacao-agendada/cli.ts, scripts/pesquisas-atualizacao-agendada/model.ts, .github/workflows/pesquisas-monitoramento.yml, package.json, tests/pesquisas-s0.test.ts, tests/pesquisas-pesqele.test.ts, tests/pesquisas-descoberta.test.ts, tests/pesquisas-entrada.test.ts, tests/pesquisas-poderdata-atual.test.ts, tests/pesquisas-realtime-cenarios.test.ts, tests/pesquisas-atualizacao-agendada.test.ts, tests/pesquisas-monitoramento-workflow.test.ts, tests/fixtures/pesquisas-monitoramento/**, docs/operations/pesquisas-s0/**

Scope: corrigir e verificar coleta, PesqEle, cenários completos e consolidação. Ler a íntegra do PoderData com pdftotext já disponível localmente; preparar poppler-utils no job correspondente do runner. Publicação da branch e diagnóstico remoto foram autorizados na conversa. Catálogos, frequência e produção permanecem fora dessas alterações. Prova local, prova no runner e ativação continuam gates separados.

Ampliação conforme objetivo aprovado: descoberta em listagens das fontes já aprovadas, inventário BR+27 UFs, identidade por metadados canônicos já aprovados no checkout e aliases escopados na proposta. Aplicação testada somente em cópias temporárias. URLs novas não validadas ou falha de descoberta impedem promoção. Cadastro de pesquisa nova e ativação em produção ainda exigem seus próprios gates.

Ampliação de setembro: entrada de registro novo na matriz, inserção explicitamente declarada no manifesto, novos datasets estaduais em cópias temporárias, leitura da rodada com 13 presidenciáveis, múltiplos cenários estimulados e espontâneos e preservação de notas de agrupamento. A ativação em produção continua fora do escopo autorizado.

- [x] L1: Os incidentes de robots, redação da amostra/campo e consolidação bloqueada têm regressões determinísticas aprovadas
  CHECK: node --conditions react-server --import tsx --test tests/pesquisas-s0.test.ts
  EXPECT: /# fail 0|ℹ fail 0/
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=a43e74f14e52b1302300e48b21ab03fde665e51c42307c414a99a7a2600ee07f; output-bytes=2874

- [x] L2: Os contratos existentes de monitoramento, rede, isolamento e atualização agendada permanecem aprovados
  CHECK: npm run verify:pesquisas:monitoramento && npm run test:pesquisas:atualizacao-agendada
  EXPECT: /# fail 0|ℹ fail 0/
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=d777c2519bc8b4407e85649fab4a3e0dcd3c3818742acbd31127dad6e74c6bae; output-bytes=10454

- [x] L3: O eval do S0 obedece ao formato e às dimensões exigidas
  CHECK: python3 /Users/thiagosalvador/.claude/skills/eval/scripts/eval_lint.py docs/operations/pesquisas-s0/EVAL.md
  EXPECT: /^PASS\s*$/m
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=c26de83abdc9496cd1301470918ec39ecca1cf389ef0ae1c6504da1800d1c431; output-bytes=5

- [x] L4: O ledger contém oráculos executáveis sem alerta estrutural
  CHECK: node /Users/thiagosalvador/.claude/skills/unlazy/scripts/gate-lint.mjs --strict docs/operations/pesquisas-s0/GATES.md
  EXPECT: LINT OK
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8

Rodar com Node 24, cwd na raiz do checkout e PATH estável. L1/L2 não comprovam captura ao vivo. A evidência de rede real será registrada separadamente; erro externo nunca será marcado como sucesso.

- [x] L5: Consulta PesqEle e cenários completos preservam todos os resultados e rejeitam conflitos de registro, sessão e escopo
  CHECK: node --conditions react-server --import tsx --test tests/pesquisas-pesqele.test.ts
  EXPECT: /# fail 0|ℹ fail 0/
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=2e99504f3d9d23a7d772a78a286471fe1d8d663812625079e669b18eb72149e9; output-bytes=1874

- [x] L6: Descoberta encontra URL nova sem edição do catálogo e conserva BR e 27 UFs sem confundir ausência de link com ausência de pesquisa
  CHECK: node --conditions react-server --import tsx --test tests/pesquisas-descoberta.test.ts
  EXPECT: /# fail 0|ℹ fail 0/
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=887ffa387936df8faec074667d194588a34a858779ba0b5133d611493993ee9c; output-bytes=499

- [x] L7: Novos registros e UFs preservam 13 candidatos, zero publicado, cenários e histórico; inserção exige manifesto e registro, passa pelo parser público e não duplica registros
  CHECK: node --conditions react-server --import tsx --test tests/pesquisas-entrada.test.ts tests/pesquisas-poderdata-atual.test.ts tests/pesquisas-realtime-cenarios.test.ts
  EXPECT: /# fail 0|ℹ fail 0/
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=c0295270e7802f5b73ae9e9ce277bf5e714ac5409995679cb98ff5554d4a94f6; output-bytes=1421
