## Eval: destravar coleta existente antes de expandir
Tipo: automacao

| # | Critério (pass/fail) | Grader | Dimensão |
|---|---|---|---|
| S01 | Robots 403/404 permite consultar somente recurso já autorizado; 503/rede/Disallow impedem a consulta; 429 mantém controle de rate limit; 403 do conteúdo continua erro. | code: `node --conditions react-server --import tsx --test tests/pesquisas-s0.test.ts` | outcome |
| S02 | Redações reais de AM e BR extraem amostra e campo esperados; texto sem amostra, datas inválidas ou contexto insuficiente é rejeitado. | code: testes S0 sobre fixtures derivadas das páginas com proveniência | outcome |
| S03 | CLI consolidate retorna exit 1 para blocked depois de persistir diagnóstico; upload de diagnóstico continua executável; no_changes sai zero sem operação; alteração elegível produz diff e é idempotente. | code: testes S0 com subprocesso CLI e `npm run test:pesquisas:atualizacao-agendada` | outcome |
| S04 | Captura local real reconcilia ao menos um alvo com registro TSE e conserva URL, hash e datas; inalterado é válido sem inventar proposta. | code: `npm run monitor:pesquisas:manual -- --source=real-time-big-data-estaduais-2026 --uf=AM --out=.artifacts/pesquisas-s0/live-am`; readback independente de proposal.json | outcome |
| S05 | O runner remoto comprova coleta e reconciliação; proposta só é criada se há mudança material e autorização aplicável. Falha de outro alvo não pode ser escondida para fabricar sucesso global. | code: readback GitHub Actions de jobs e artefatos do SHA corrigido; status permanece PENDENTE antes da execução remota autorizada | outcome |
| S06 | Consultas ficam nas origens e documentos públicos aprovados. Fontes condicionais, catálogos reais e frequência não mudam. Push e diagnóstico usam a autorização da conversa; merge, ativação e envio externo não decorrem dos testes. | code: diff e testes de isolamento/rede; revisão das permissões e variáveis | policy |
| S07 | Testes existentes do monitor e atualização agendada passam; fixtures positivas e negativas mantêm veredito esperado. | code: `npm run verify:pesquisas:monitoramento` e `npm run test:pesquisas:atualizacao-agendada` | outcome |
| S08 | Descoberta usa três listagens aprovadas; coleta usa matriz explícita e limites de bytes, tempo e paralelismo. Repetição de captura exige mudança ou hipótese nova; retries de rede não aumentam. | code: contagem de fontes e tentativas nos logs; parâmetros do cliente e max-parallel do workflow | custo |
| S09 | Todos os duelos publicados em listas são preservados; títulos, quantidade declarada, soma, nomes e categorias são validados; identidade não resolvida em qualquer turno bloqueia proposta. | code: `tests/pesquisas-pesqele.test.ts` e readback da coleta AM com sete cenários e 32 respostas | outcome |
| S10 | PDF usa a coluna correspondente ao término do campo, reconcilia primeiro turno com a coluna Total independente, ignora recortes demográficos, preserva perguntas e rejeita registro ou metadados divergentes. | code: `tests/pesquisas-pesqele.test.ts` e readback PoderData com cinco cenários; hash e páginas do PDF na evidência | outcome |
| S11 | Descoberta identifica URL nova sem editar catálogo, deduplica e conserva 28 geografias. Falha de listagem não comprova ausência de pesquisa; título não fornece percentuais nem valida cargo ou UF. | code: `tests/pesquisas-descoberta.test.ts` e artefato discovery.json | outcome |
| S12 | Identidade usa nome completo, partido, cargo e UF de metadados canônicos aprovados; referência sem partido exige nome completo único na mesma publicação. Proposta contém prova e aliases por cenário. Aplicação em cópia é idempotente e aceita pelo parser público. | code: `tests/pesquisas-pesqele.test.ts` e `tests/pesquisas-atualizacao-agendada.test.ts` | outcome |

Gate: S0 operacional só com 100% PASS em S01 a S12. GATES.md certifica somente correção e regressão local. Prova remota pendente impede afirmar S0 completo. PDF presidencial passou no GitHub; a nova descoberta e resolução documentada de identidade exigem execução no SHA correspondente. Isso não encerra os critérios mais amplos de OBJETIVO-FINAL.md.

Custo esperado: uma sessão local de até duas horas; dependências e verificações dentro desse limite; até duas capturas por alvo antes de fallback orientado por evidência.

Golden set: `tests/fixtures/pesquisas-monitoramento-golden.jsonl`, ampliado por fixtures S0 derivadas de robots 403 e das redações reais de Folha/R7. Soluções de referência existentes precisam passar, mais casos novos com controle negativo e subprocesso CLI.

Sequência aprovada na conversa: S0 diagnosticar/corrigir, provar coleta real, provar proposta somente quando existir mudança; depois descoberta e frequência. O planejamento anterior continua referência para a ampliação, não substitui a prova de S0. Não há LLM-judge nem novos subagentes neste escopo.
