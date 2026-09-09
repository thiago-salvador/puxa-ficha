## Eval: destravar coleta existente antes de expandir
Tipo: automacao

| # | Critério (pass/fail) | Grader | Dimensão |
|---|---|---|---|
| S01 | Robots 403/404 permite consultar somente recurso já autorizado; 503/rede/Disallow impedem a consulta; 429 mantém controle de rate limit; 403 do conteúdo continua erro. | code: `node --conditions react-server --import tsx --test tests/pesquisas-s0.test.ts` | outcome |
| S02 | Redações reais de AM e BR extraem amostra e campo esperados; texto sem amostra, datas inválidas ou contexto insuficiente é rejeitado. | code: testes S0 sobre fixtures derivadas das páginas com proveniência | outcome |
| S03 | CLI consolidate retorna exit 1 para blocked depois de persistir diagnóstico; upload de diagnóstico continua executável; no_changes sai zero sem operação; alteração elegível produz diff e é idempotente. | code: testes S0 com subprocesso CLI e `npm run test:pesquisas:atualizacao-agendada` | outcome |
| S04 | Captura local real reconcilia ao menos um alvo com registro TSE e conserva URL, hash e datas; inalterado é válido sem inventar proposta. | code: `npm run monitor:pesquisas:manual -- --source=real-time-big-data-estaduais-2026 --uf=AM --out=.artifacts/pesquisas-s0/live-am`; readback independente de proposal.json | outcome |
| S05 | O runner remoto comprova coleta e reconciliação; proposta só é criada se há mudança material e autorização aplicável. Falha de outro alvo não pode ser escondida para fabricar sucesso global. | code: readback GitHub Actions de jobs e artefatos do SHA corrigido; status permanece PENDENTE antes da execução remota autorizada | outcome |
| S06 | Catálogos, origem autorizada, fontes condicionais, política do conteúdo e frequência não mudam; nenhum push, merge, deploy, ativação ou envio externo decorre dos testes locais. | code: diff e testes de isolamento/rede; revisão das permissões e variáveis | policy |
| S07 | Testes existentes do monitor e atualização agendada passam; fixtures positivas e negativas mantêm veredito esperado. | code: `npm run verify:pesquisas:monitoramento` e `npm run test:pesquisas:atualizacao-agendada` | outcome |
| S08 | Diagnóstico limitado a AM, BR e registro TSE; uma repetição para falha transitória e interrupção após duas tentativas iguais sem evidência nova. | code: contagem de tentativas nos logs locais e durações registradas; não aumentar retries do coletor | custo |

Gate: S0 operacional só com 100% PASS em S01 a S08. L1 a L4 de GATES.md certificam somente a correção e regressão local. S04 ou S05 sem prova permanecem PENDENTES/BLOQUEADOS e impedem afirmar S0 completo.

Custo esperado: uma sessão local de até duas horas; dependências e verificações dentro desse limite; até duas capturas por alvo antes de fallback orientado por evidência.

Golden set: `tests/fixtures/pesquisas-monitoramento-golden.jsonl`, ampliado por fixtures S0 derivadas de robots 403 e das redações reais de Folha/R7. Soluções de referência existentes precisam passar, mais casos novos com controle negativo e subprocesso CLI.

Sequência aprovada na conversa: S0 diagnosticar/corrigir, provar coleta real, provar proposta somente quando existir mudança; depois descoberta e frequência. O planejamento anterior continua referência para a ampliação, não substitui a prova de S0. Não há LLM-judge nem novos subagentes neste escopo.
