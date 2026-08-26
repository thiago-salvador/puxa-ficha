## Eval: monitoramento das fontes eleitorais aprovadas

Tipo: automacao

| # | Critério pass/fail | Grader | Dimensão |
|---|---|---|---|
| 1 | A lista calculada de fontes `aprovado` e usadas nos catálogos coincide exatamente com o registro de adaptadores. | code: `npm run audit:pesquisas:monitoramento` | outcome |
| 2 | Cada um dos quatro adaptadores transforma sua fixture real sanitizada em evidência completa e a reference solution passa 100% do golden set. | code: `npm run test:pesquisas:monitoramento` | outcome |
| 3 | Toda evidência contém instituto, registro TSE, cargo, UF, turno, cenário, campo, amostra, margem, resultados, URL pública, horário observado e SHA-256. | code: testes de schema e TSE em `npm run test:pesquisas:monitoramento` | outcome |
| 4 | Cada proposta é confrontada com registro, cargo, geografia, campo, amostra, margem e instituto do dataset oficial do TSE antes de ficar elegível. | code: `npm run test:pesquisas:monitoramento:tse` | outcome |
| 5 | O run consolidado escreve somente `proposal.json`, `diff.json` e `summary.md`, sem alterar catálogos antes ou depois. | code: `npm run test:pesquisas:monitoramento:isolamento` | policy |
| 6 | Fonte condicional ou excluída, domínio fora da allowlist, HTML inesperado, layout alterado, conflito, timeout e alias ambíguo nunca ficam elegíveis. | code: golden set e `npm run audit:pesquisas:monitoramento` | policy |
| 7 | O cliente respeita robots.txt, HTTPS, timeout, rate limit, limite de resposta, redirects e no máximo três tentativas. | code: `npm run test:pesquisas:monitoramento:rede` | policy |
| 8 | O workflow contém somente `workflow_dispatch`, `contents: read`, nenhuma credencial persistida ou secret, seleção por fonte ou UF e modo para todas as combinações. | code: `npm run test:pesquisas:monitoramento:workflow` | policy |
| 9 | Um dry-run local real por adaptador registra estado `comprovado` ou bloqueio objetivo, sem contornar robots, paywall ou autenticação. | code: `node scripts/audit/verify-pesquisas-monitoramento-live-proof.mjs` | routing |
| 10 | O monitor não importa Supabase, não executa Git ou GitHub e não contém caminho de publicação. | code: `npm run audit:pesquisas:monitoramento` | policy |
| 11 | A seleção de uma fonte, uma UF e todas as combinações gera um único conjunto consolidado de três artefatos. | code: testes de CLI em `npm run test:pesquisas:monitoramento` e workflow | outcome |
| 12 | Nenhuma dependência nova é adicionada, cada URL recebe no máximo três tentativas e o workflow mantém timeout de 15 minutos. | code: scope audit e testes de rede/workflow | custo |
| 13 | `npm run verify:pesquisas:monitoramento`, `npm run verify:pesquisas` e o scope audit passam no diff final. | code: G8 e G9 de `GATES.md` | outcome |

Gate: Done somente com 100% PASS registrado e evidência atual por critério.

Custo esperado: zero dependência nova, uma coleta sequencial por URL, no máximo três tentativas por URL e uma única obtenção do dataset TSE por execução. Golden set: `tests/fixtures/pesquisas-monitoramento-golden.jsonl`.

### Casos obrigatórios do golden set

- sucesso PoderData nacional;
- sucesso Datafolha nacional;
- sucesso Datafolha estadual;
- sucesso Real Time Big Data estadual por formato de veículo sanitizado;
- zero publicado preservado como zero;
- conflito com o TSE;
- fonte condicional;
- timeout;
- layout alterado ou HTML inesperado;
- alias ambíguo;
- inalterado e vencido para regressão das classificações existentes.

A reference solution usa somente fixtures locais e precisa passar todos os graders sem rede. Alterar o parser sem repetir o golden set invalida a prova.
