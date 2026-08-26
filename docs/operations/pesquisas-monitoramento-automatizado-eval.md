# Atualização agendada de pesquisas eleitorais

## Eval: atualização agendada de pesquisas eleitorais

Tipo: automacao

| # | Critério pass/fail | Grader | Dimensão |
|---|---|---|---|
| 1 | O workflow mantém `workflow_dispatch` e possui um cron diário único, habilitado somente no commit final. | code: `npm run test:pesquisas:atualizacao-agendada` | outcome |
| 2 | A matriz calculada contém exatamente todas as combinações de fonte e geografia aprovadas e usadas nos catálogos, sem fonte condicional ou excluída. | code: testes de matriz em `npm run test:pesquisas:atualizacao-agendada` | outcome |
| 3 | A consolidação começa somente depois que todos os adaptadores terminam e exige um artefato íntegro para cada item da matriz. | code: testes de workflow e consolidação em `npm run test:pesquisas:atualizacao-agendada` | outcome |
| 4 | Rodada sem mudança termina sem criar branch, commit, push ou PR. | code: fixture `sem-mudanca` em `npm run test:pesquisas:atualizacao-agendada` | outcome |
| 5 | Uma mudança totalmente válida altera somente catálogos e inventários permitidos e prepara exatamente um draft PR. | code: fixture `mudanca-valida` e teste de allowlist em `npm run test:pesquisas:atualizacao-agendada` | outcome |
| 6 | Fonte indisponível, conflito, dado vencido, identidade ambígua ou metadado ausente bloqueia a promoção e aparece no resumo. | code: fixtures fail-closed em `npm run test:pesquisas:atualizacao-agendada` | policy |
| 7 | Falha em `npm run verify:pesquisas` acontece antes de qualquer push e impede branch remota e PR. | code: fixture `verify-falhou` e teste de ordem em `npm run test:pesquisas:atualizacao-agendada` | policy |
| 8 | Um draft de atualização já aberto encerra a rodada sem sobrescrever branch, sem force-push e sem duplicar PR. | code: fixture `draft-existente` em `npm run test:pesquisas:atualizacao-agendada` | policy |
| 9 | Nenhum caminho do workflow executa merge, deploy, revalidação de produção, Supabase ou escrita fora da allowlist. | code: auditoria estática em `npm run test:pesquisas:atualizacao-agendada` | policy |
| 10 | `contents: write` e `pull-requests: write` existem somente no job de promoção; os demais jobs usam `contents: read`. | code: teste de permissões em `npm run test:pesquisas:atualizacao-agendada` | policy |
| 11 | Checkout não persiste credenciais e a coleta não recebe secrets nem token de escrita. | code: teste de credenciais em `npm run test:pesquisas:atualizacao-agendada` | policy |
| 12 | A branch promovida segue `automation/pesquisas-refresh-AAAA-MM-DD` e o PR é draft com fontes, registros TSE, diff por candidato e instruções de revisão. | code: testes de promoção e corpo do PR em `npm run test:pesquisas:atualizacao-agendada` | outcome |
| 13 | Fixtures e dry-run local cobrem referência positiva e todos os bloqueios obrigatórios sem rede. | code: `npm run test:pesquisas:atualizacao-agendada` | routing |
| 14 | O diff não adiciona dependência, não toca runtime público, banco ou produção e fica dentro do escopo aprovado. | code: `npm run audit:pesquisas:atualizacao-agendada:scope` | custo |
| 15 | `npm run verify:pesquisas:atualizacao-agendada` e `npm run verify:pesquisas` passam no estado final. | code: G6 e G7 de `GATES.md` | outcome |
| 16 | O PR de implementação está aberto contra `main`, com head `codex/pesquisas-atualizacao-agendada`, sem merge e sem execução remota com escrita. | code: inspeção via `gh pr view` e `gh run list` após o push | policy |

Gate: Done somente com 100% PASS registrado e evidência atual por critério.

Custo esperado: zero dependência nova, uma coleta por alvo aprovado, artefatos com retenção de 14 dias e no máximo uma tentativa de promoção por rodada. Golden set: `tests/fixtures/pesquisas-monitoramento-golden.jsonl` e `tests/fixtures/pesquisas-atualizacao-agendada/cases.jsonl`.

### Casos obrigatórios do golden set de promoção

- nenhuma mudança;
- mudança válida;
- fonte indisponível;
- conflito com o TSE;
- dado vencido;
- identidade ambígua;
- metadado ausente;
- falha no verificador canônico;
- draft existente;
- tentativa proibida de arquivo fora da allowlist.

A reference solution usa somente fixtures locais, não acessa rede e precisa passar 100% dos graders. Alterar matriz, consolidação, allowlist ou promoção exige repetir o golden set.
