## Eval: atualização e completude dos dados públicos

Tipo: automacao

| # | Critério (pass/fail) | Grader | Dimensão |
|---|---|---|---|
| 1 | O registro versionado cobre todas as famílias de dados públicas identificadas no código e no banco, sem `source_id` duplicado, e cada entrada declara autoridade, SLA, modo de atualização, prova de atualização e política de vencimento. | code: `npm run test:data-freshness:registry` | outcome |
| 2 | O comparador contabiliza integralmente Presidente, Vice-Presidente, Governador e Vice-Governador e classifica, sem sobras silenciosas, inclusão, retirada, substituição, mudança de situação, revisão de identidade e ausência de vínculo com ficha. | code: `npm run test:data-freshness:candidaturas` | outcome |
| 3 | Indisponibilidade ou resposta inválida das duas superfícies oficiais do TSE produz `source_error`, saída não zero e nunca o estado `sem_mudanca`. | code: `npm run test:data-freshness:fail-closed` | policy |
| 4 | O auditor de freshness classifica cada fonte como `fresh`, `stale`, `source_error` ou `review_required`; alegações negativas ficam proibidas quando a fonte está vencida ou falhou. | code: `npm run test:data-freshness:registry` | policy |
| 5 | A automação agendada é somente leitura: `permissions: contents: read`, checkout sem credencial persistida, snapshot do banco com `default_transaction_read_only=on` e nenhuma operação de escrita no banco, commit, push, PR, issue, deploy ou publicação. | code: `npm run test:data-freshness:workflow` | policy |
| 6 | Toda rodada publica `source.json`, `universe.json`, `diff.json` e `summary.md`, inclusive em falha de fonte, e o resumo apresenta contagens calculadas a partir dos JSONs. | code: `npm run test:data-freshness:artifacts` | outcome |
| 7 | O golden set contém ao menos 20 casos derivados de falhas ou mudanças reais do projeto e uma solução de referência que passa 100% dos graders. | code: `npm run test:data-freshness:golden` | outcome |
| 8 | Os comandos de verificação da entrega passam sem warnings de TypeScript, lint ou build e o diff não introduz dependência nova. | code: `npm run verify:data-freshness` | policy |
| 9 | A execução fica restrita a uma worktree, sem commit, push, PR, deploy, escrita no Supabase ou instalação de dependência. | code: `node scripts/audit/verify-data-freshness-scope.mjs` | custo |
| 10 | O roteamento usa scripts, testes e GitHub Actions existentes, com fixtures offline para o gate determinístico e rede oficial apenas no job recorrente. | code: `npm run test:data-freshness:workflow` | routing |

Gate: Done somente com 100% PASS registrado, evidência por critério e nenhuma alteração remota.

Custo esperado: uma worktree, zero dependências novas, uma suíte direcionada e os gates globais já existentes. Golden set: `tests/fixtures/data-freshness/cases.jsonl`.
