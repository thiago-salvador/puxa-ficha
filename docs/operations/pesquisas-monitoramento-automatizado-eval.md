## Eval: monitoramento automatizado de pesquisas eleitorais

Tipo: automacao

| # | Criterio pass/fail | Grader | Dimensao |
|---|---|---|---|
| 1 | A reference solution classifica corretamente todos os casos do golden set e passa 100 por cento dos graders. | code: `npm run test:pesquisas:monitoramento` | outcome |
| 2 | Cada evidencia candidata inclui URL publica, instituto, registro TSE, campo, cenario, amostra, margem, resultados, horario observado e SHA-256. | code: teste de schema em `tests/pesquisas-monitoramento-golden.test.ts` | outcome |
| 3 | O run produz `proposal.json`, `diff.json` e `summary.md`, e nenhum arquivo de catalogo muda antes ou depois do processo. | code: `npm run test:pesquisas:monitoramento:isolamento` | outcome |
| 4 | Os estados novo, alterado, inalterado, vencido, conflitante, fonte indisponivel e identidade nao resolvida aparecem no golden set e sao decididos sem fallback aberto. | code: `npm run test:pesquisas:monitoramento` | outcome |
| 5 | Fonte condicional, origem fora da allowlist, alias ambiguo, registro insuficiente, timeout e HTML inesperado nunca ficam promoviveis. | code: `npm run audit:pesquisas:monitoramento` e golden set | policy |
| 6 | O coletor nao importa Supabase, nao recebe secrets, nao executa git ou GitHub e nao expoe API de publicacao. | code: `npm run audit:pesquisas:monitoramento` | policy |
| 7 | O workflow contem apenas `workflow_dispatch`, permissao `contents: read`, filtros de fonte ou UF, resumo e artefato com retencao explicita. | code: `npm run test:pesquisas:monitoramento:workflow` | policy |
| 8 | O cliente de rede respeita robots, limita tentativas e concorrencia, aplica timeout e redige URLs sensiveis nos logs. | code: `npm run test:pesquisas:monitoramento:rede` | policy |
| 9 | Um run controlado observa a pagina publica aprovada do PoderData sem autenticar, contornar paywall ou acessar rota bloqueada. | code: `npm run monitor:pesquisas:manual -- --source=poderdata-aya-nacional-2026 --out=.artifacts/pesquisas-monitoramento-manual` | routing |
| 10 | Nenhuma dependencia e adicionada, e um diagnostico limita o run a uma fonte ou UF. | code: scope audit e testes da CLI | custo |
| 11 | O gate `verify:pesquisas`, lint, typecheck e auditorias de seguranca aplicaveis passam sobre o diff final. | code: comandos G8 e G9 de `GATES.md` | outcome |

Gate: Done somente com 100% PASS registrado e evidencia atual por criterio.

Custo esperado: zero dependencia nova, no maximo tres tentativas por URL, concorrencia padrao um e uma unica pagina publica no teste manual. Golden set: `tests/fixtures/pesquisas-monitoramento-golden.jsonl`.

## Casos obrigatorios do golden set

- Publicacao nova valida baseada em rodada aprovada existente.
- Fonte condicional existente no scorecard.
- Conflito entre registro e divulgacao.
- Alias ambiguo derivado das regras literais atuais.
- Mudanca retroativa em evidencia ja observada.
- Percentual zero realmente publicado.
- Timeout de fonte.
- HTML inesperado.
- Evidencia inalterada.
- Evidencia vencida pela politica de recencia.

O runner resolve cada caso sem rede e compara a saida exata com `reference_solution`. Se a referencia nao passar todos os casos, o eval esta quebrado e a entrega permanece bloqueada.
