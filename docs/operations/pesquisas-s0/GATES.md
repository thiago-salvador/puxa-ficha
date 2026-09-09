# Gates: S0 local da coleta de pesquisas

OWNS: scripts/lib/pesquisas-monitoramento-rede.ts, scripts/lib/pesquisas-monitoramento-adapters.ts, scripts/lib/pesquisas-monitoramento-pesqele.ts, scripts/lib/pesquisas-monitoramento-tse.ts, scripts/lib/pesquisas-monitoramento-poderdata-pdf.ts, scripts/lib/pesquisas-monitoramento-descoberta.ts, scripts/lib/pesquisas-monitoramento-entrada.ts, scripts/lib/pesquisas-monitoramento-identidades.ts, scripts/lib/pesquisas-monitoramento-realtime-cenarios.ts, scripts/lib/pesquisas-monitoramento.ts, scripts/pesquisas-monitoramento.ts, scripts/pesquisas-descoberta.ts, scripts/pesquisas-atualizacao-agendada/cli.ts, scripts/pesquisas-atualizacao-agendada/model.ts, .github/workflows/pesquisas-monitoramento.yml, package.json, tests/pesquisas-s0.test.ts, tests/pesquisas-pesqele.test.ts, tests/pesquisas-descoberta.test.ts, tests/pesquisas-entrada.test.ts, tests/pesquisas-poderdata-atual.test.ts, tests/pesquisas-realtime-cenarios.test.ts, tests/pesquisas-atualizacao-agendada.test.ts, tests/pesquisas-monitoramento-workflow.test.ts, tests/fixtures/pesquisas-monitoramento/**, docs/operations/pesquisas-s0/**

Scope: corrigir e verificar coleta, PesqEle, cenários completos e consolidação. Ler a íntegra do PoderData com pdftotext já disponível localmente; preparar poppler-utils no job correspondente do runner. Publicação da branch e diagnóstico remoto foram autorizados na conversa. Catálogos, frequência e produção permanecem fora dessas alterações. Prova local, prova no runner e ativação continuam gates separados.

Ampliação conforme objetivo aprovado: descoberta em listagens das fontes já aprovadas, inventário BR+27 UFs, identidade por metadados canônicos já aprovados no checkout e aliases escopados na proposta. Aplicação testada somente em cópias temporárias. URLs novas não validadas ou falha de descoberta impedem promoção. Cadastro de pesquisa nova e ativação em produção ainda exigem seus próprios gates.

Ampliação de setembro: entrada de registro novo na matriz, inserção explicitamente declarada no manifesto, novos datasets estaduais em cópias temporárias, leitura da rodada com 13 presidenciáveis, múltiplos cenários estimulados e espontâneos e preservação de notas de agrupamento. A ativação em produção continua fora do escopo autorizado.

- [x] L1: Os incidentes de robots, redação da amostra/campo e consolidação bloqueada têm regressões determinísticas aprovadas
  CHECK: node --conditions react-server --import tsx --test tests/pesquisas-s0.test.ts
  EXPECT: /# fail 0|ℹ fail 0/
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=2dfc7fd59f37286064d12c2fdab708aa26408551d77948ed7f842906b5462e44; output-bytes=2145

- [x] L2: Os contratos existentes de monitoramento, rede, isolamento e atualização agendada permanecem aprovados
  CHECK: npm run verify:pesquisas:monitoramento && npm run test:pesquisas:atualizacao-agendada
  EXPECT: /# fail 0|ℹ fail 0/
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=1ab0489634310eac55a07b3c004220969b6140c49fb4cec4676a89e1cddf264b; output-bytes=9722

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
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=79c2bd3f2659252839a4fb9054a8cb88fd3c53a8c75e6bfcfa3c0a8e304f9457; output-bytes=1875

- [x] L6: Descoberta encontra URL nova sem edição do catálogo e conserva BR e 27 UFs sem confundir ausência de link com ausência de pesquisa
  CHECK: node --conditions react-server --import tsx --test tests/pesquisas-descoberta.test.ts
  EXPECT: /# fail 0|ℹ fail 0/
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=fc73b1d98f4213382934bf8eb2e0e60a66b3a1a0fd4100db0eaacd31b5930844; output-bytes=501

- [x] L7: Novos registros e UFs preservam 13 candidatos, zero publicado, cenários e histórico; inserção exige manifesto e registro, passa pelo parser público e não duplica registros
  CHECK: node --conditions react-server --import tsx --test tests/pesquisas-entrada.test.ts tests/pesquisas-poderdata-atual.test.ts tests/pesquisas-realtime-cenarios.test.ts
  EXPECT: /# fail 0|ℹ fail 0/
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/private/tmp/pf-pesquisas-s0; path=9bcc7defaf68/25 entries; EXPECT=matched; output-sha256=bd9ce68f20e29de6fa188686d9a437448c4f12264a7c790ce3baff9a30275466; output-bytes=1097
