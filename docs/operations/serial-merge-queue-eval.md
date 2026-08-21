## Eval: fila serial de PR, merge, deploy e rollback

Tipo: automacao

| # | Critério (pass/fail) | Grader | Dimensão |
|---|---|---|---|
| 1 | Com 10 PRs elegíveis e nenhum lock, exatamente o PR com menor `createdAt` recebe o slot ativo; empate usa o menor número. | code: `node --test tests/merge-queue/queue-state.test.mjs` | outcome |
| 2 | Enquanto existir slot ativo em qualquer fase, eventos de outros PRs produzem zero operações mutantes para esses PRs. | code: `node --test tests/merge-queue/queue-state.test.mjs tests/merge-queue/dry-run.test.mjs` | outcome |
| 3 | O merge só é proposto quando o SHA atual do PR é o SHA validado, a branch está atualizada com a `main` e todos os checks configurados terminaram em estado aceito. | code: `node --test tests/merge-queue/pre-merge-failure.test.mjs` | outcome |
| 4 | Check vermelho, conflito, timeout ou check ausente mantém o PR ativo, não muda a `main`, não seleciona o próximo e cria uma única notificação por assinatura de falha. | code: `node --test tests/merge-queue/pre-merge-failure.test.mjs` | outcome |
| 5 | Depois do merge, o mesmo slot continua ativo até CI da `main`, deployment Vercel associado ao SHA e smoke da URL de produção passarem. | code: `node --test tests/merge-queue/post-merge-gate.test.mjs` | outcome |
| 6 | Falha pós-merge transfere o mesmo slot para recuperação, restaura código e deployment anterior, verifica ambos e só então permite selecionar o próximo PR. | code: `node --test tests/merge-queue/rollback.test.mjs` | outcome |
| 7 | PR que altera migration ou efeito externo sem manifesto reversível válido é bloqueado antes do merge e gera feedback explícito; nenhum rollback é alegado. | code: `node --test tests/merge-queue/irreversible-change.test.mjs` | policy |
| 8 | Crash, permissão negada ou erro não tratado no coordenador é observado por workflow independente e gera incidente atribuído a `thiago-salvador`. | code: `node --test tests/merge-queue/watchdog.test.mjs` | outcome |
| 9 | Nenhum job com permissão de escrita faz checkout ou executa código vindo do PR; actions de terceiros estão pinadas por SHA e permissões são mínimas. | code: `node --test tests/merge-queue/workflow-security.test.mjs` | policy |
| 10 | O modo dry-run percorre todos os estados e produz `remoteWrites == 0`. | code: `node scripts/merge-queue/simulate.mjs tests/fixtures/merge-queue-ten-prs.json --json \| jq -e '.remoteWrites == 0'` | policy |
| 11 | A referência do golden set passa 100% dos casos e cada perturbação real conhecida é rejeitada. | code: `node --test tests/merge-queue/golden-set.test.mjs` | routing |
| 12 | Lint, typecheck, testes, build e suite específica passam no mesmo checkout sem reduzir checks existentes. | code: `npm run lint && npm run typecheck && npm test && npm run build && node --test tests/merge-queue/*.test.mjs` | policy |
| 13 | Uma execução sem mudança de estado usa no máximo uma listagem de PRs, uma leitura do slot e uma leitura agregada de checks; polling respeita timeout configurado. | code: `node --test tests/merge-queue/cost.test.mjs` | custo |
| 14 | O deployment do SHA mergeado permanece staged até CI, ledger, CodeQL e smokes do deployment passarem; somente o release gate verde permite promoção ao domínio público. | code: `node --test tests/merge-queue/post-merge-gate.test.mjs` | outcome |
| 15 | Ausência de token GitHub do bot, credenciais Vercel ou configuração de hold de produção termina em `BLOCK`, mantém o slot e não tenta merge, promoção ou rollback parcial. | code: `node --test tests/merge-queue/irreversible-change.test.mjs tests/merge-queue/workflow-security.test.mjs` | policy |

Gate: Done só com 100% PASS registrado, evidência por critério, gate-check da raiz sem pendências e nenhuma ativação remota anterior à confirmação explícita.

Custo esperado: uma execução do coordenador por evento relevante; no caminho sem mudança, até 3 leituras de API; no caminho de espera, polling limitado pelo timeout configurado; zero chamadas de LLM.

Golden set: `tests/fixtures/serial-merge-queue-cases.jsonl`, com 20 a 50 casos derivados de PRs, checks e falhas reais deste repositório e uma referência que passa 100%.
