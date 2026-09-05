# Master Review Remediation Implementation Plan

> For Claude: use executing-plans to implement this plan task by task.

**Goal:** corrigir os achados do review sem perder dados, proveniência ou entregas anteriores; distinguir correção local de resolução em produção.

**Architecture:** preservar o fluxo fonte/identidade/persistência/DTO/cache/ficha. Reforçar limites de publicação e autenticação, reaproveitando mecanismos existentes; nenhuma exclusão histórica para esconder dados.

**Tech Stack:** Node 24, Next.js, TypeScript, Supabase/PostgreSQL 17, Playwright/WebKit, GitHub Actions.

## Base e autorização

- Base: origin/main 0430436b9d79da1d2fb0c08a5bd7eacc8208e30e, PR #262 mergeada.
- Sessão consultada: 01a069df-ae3c-74d1-8a23-c51d6431abd2, "Validar sessão com Claude". Preservar as entregas de julgamento, sanções, profissão e os 188 campos de 138 fichas; não reexecutar suas escritas.
- Branch temporária: codex/master-review-remediation, worktree ignorado e isolado. Não alterar o checkout canônico nem outros worktrees.
- Pedido cobre implementação e provas locais. Aplicação de migration em produção, expurgo real, deploy e mudanças de conta exigem autorização que nomeie o ato. Não executar emails reais.
- Não aceitar risco nem inventar prazo de retenção como forma de fechar um item.

## Procedimento por item

1. Revalidar contra a base atual, chamadores e testes. Se já corrigido, guardar a evidência sem refazer.
2. Para comportamento, escrever regressão e observar a falha esperada; não confundir erro de harness com RED.
3. Implementar mudança mínima e observar GREEN. Incluir controles negativos e preservação dos casos válidos.
4. Integrar contratos/migrations/docs afetados e executar gates do domínio.
5. Registrar implementação, prova, pendência externa e critério de fechamento individual. Não transformar "preparado" em "aplicado".

## Lote A: fronteira de publicação (worker publication)

- MR-01: src/lib/api.ts, public-profile-dto.ts/public-attention-point.ts se necessário, fetch-gastos-votos-in-batch.ts, migration 20260905220000, rollback/readbacks e testes PG17.
- Aceitação: registros despublicados invisíveis para anon/API/comparador, dados válidos visíveis, linhas históricas intactas, rollback comprovado localmente. Produção permanece pendente até aplicação autorizada e readback atual.
- Pai integra scripts/audit/lib/migrations-classificacao.ts, recortes e contagens contratuais; workers não disputam esses arquivos.

## Lote B: segurança de alertas (worker security)

- MR-07: request-rate-limit.ts e consumidores; limite compartilhado em produção com teste de dois processos/instâncias e falha segura, sem depender silenciosamente de Map por instância.
- MR-12: api/webhooks/resend/route.ts e testes, leitura limitada antes da autenticação, assinatura válida preservada, excesso rejeitado.
- MR-19: api/alerts/subscribe, acesso e helpers; pedido não autenticado não invalida sessão ativa, recuperação só após posse do email, follow preservado.
- MR-06: verificar fluxo já existente e preparar validação do expurgo de não confirmados segundo prazo já documentado. Não ligar flag nem deletar registros em produção.
- Migration eventualmente necessária: 20260905220100, com rollback/readback; integrar com o pai.

## Lote C: qualidade e operação (worker quality)

- MR-02: revalidar lint no merge atual; corrigir somente se persistir.
- MR-03: package-lock.json, resolver qs compatível; audit completo/produção e instalação limpa.
- MR-04: .github/workflows/ci.yml, specs críticos de regressão contínua; não substituir execução por grep do nome.
- MR-08: cron-freshness, revalidate-public-cache e published-consistency; recibo de execução e watchdog com testes de sucesso, ausência e falha. Entrega de alerta externo permanece prova separada.
- MR-09: .gitignore cobre configuração local opencode sem excluir evidência histórica.
- MR-10: eslint type-aware focado em promises; corrigir violações reais, sem supressão geral.
- MR-14/15: Settings/AUTOMATIONS_AND_ENVIRONMENTS.md e docs/RUNBOOK-DR.md, inventários coerentes com workflows e bypass.

## Lote D: UI, rastreabilidade e decisões (pai)

- MR-05: reproduzir os dois estados WebKit, colher console/rede e corrigir causa, não aumentar timeout cegamente; exigir axe 34/34 no mesmo ambiente.
- MR-11: caracterizar e separar responsabilidades em CandidatoProfileSections.tsx e api.ts só após publicação integrada; preservar exports e contratos.
- MR-13: manter candidate_changes/coleta_log; preparar diagnóstico/arquivamento verificável, sem escolher prazo nem apagar por conta própria.
- MR-16: CloudflareWebAnalytics.tsx e tests/cloudflare-web-analytics.test.ts; fixar bytes/versão com integridade ou identificar decisão de fornecedor necessária. Preservar consentimento/política vigente.
- MR-17: medir imagem efetivamente selecionada em 360/768/1024/1440; evitar variante maior desnecessária, sem redesenhar hero.
- MR-18: run-generator-qwen.mjs e testes de runner; exigir modelo explícito antes de spawn e impedir override silencioso, sem invocar modelo pago. Manter caminho histórico utilizável com configuração válida.
- MR-20: definir o menor fallback offline sem cache de dados eleitorais. Se a promessa de instalação não incluir offline, registrar a decisão necessária em vez de inventar funcionalidade.

## Critério integrado

- Node24; lint, typecheck, testes unitários completos, build, settings:check, check:dead-code e audit de dependências.
- Provas PG17 de schema/rollback e controles adversariais; migrations antigas e retidas preservadas.
- UI real e screenshots integrais dos tamanhos necessários, axe, fluxos afetados, ausência de regressão de conteúdo da PR262.
- Passar crítico independente sobre diff e verificador sobre os critérios; repetir falhas corrigidas na mesma sessão.
- Manifesto por MR com status confirmado: já resolvido na base, corrigido localmente, verificado em produção ou pendente de autorização/decisão. Não declarar todos resolvidos enquanto houver estado pendente.

## Estado factual por achado

Snapshot de implementação em 05/09/2026. Resultados locais não são provas de
produção. Os logs de comandos posteriores prevalecem sobre esta fotografia.
Não houve reingestão das correções preservadas da PR #262.

| MR | Estado neste ponto | Evidência e condição de fechamento |
|---|---|---|
| 01 | Implementado e provado localmente | RLS restrictive nas três tabelas, filtros de aplicação e controles negativos PG17. Aplicação autorizada, ledger, readback anônimo e cache público ainda precisam ser medidos em produção. |
| 02 | Já corrigido na base atual | Import apontado pelo review não permanece; lint global reexecutado com sucesso pelo integrador. |
| 03 | Corrigido localmente | Lock `qs 6.16.0`; instalação limpa e audit sem vulnerabilidades medidos pelo integrador. |
| 04 | Corrigido e provado localmente | CI inclui quiz/interações/offline; build de fixture isolado, recorte final 58/58 Playwright, zero skips e retries. Não equivale a CI remoto nem a uma comparação visual com baseline Linux aprovado. |
| 05 | Causa reproduzida e corrigida localmente | Regressão com chunks JavaScript retidos reproduziu botão SSR habilitado antes de hidratar, sem handler para abrir o menu. Guarda de hidratação mantém o botão desabilitado até ficar interativo. Após rebuild normal, integrador mediu 34 casos axe e dois offline: 36/36, sem retries. |
| 06 | Operação destrutiva pendente | Política existente e opt-ins preservados; o número 17 pertence ao review, não é contagem atual. Recontar antes de qualquer autorização de expurgo de não confirmados. |
| 07 | Implementado e provado localmente | RPC compartilhada, hash de IP, falha segura e concorrência PG17. Migration, configuração do ambiente e readback remoto pendentes. |
| 08 | Implementado e provado localmente | Recibos privados, roster obrigatório de quatro crons e validação de idades; watchdog 22/22. PG17 valida privilégios, upsert, rollback e readback que reprova grant público. Falta observar execução real após release. |
| 09 | Já corrigido na base atual | `git check-ignore .opencode/opencode.jsonc` confirma exclusão da configuração gerada. |
| 10 | Corrigido localmente | Regras type-aware de promises em todo `src/`, callbacks tratados e controle negativo do próprio ESLint passou. |
| 11 | Refatoração local verificada | Extrações das abas e frescor; comparação AST contra HEAD encontrou 36 declarações idênticas. 434 testes em 40 arquivos passaram, além de lint focal e TypeScript. |
| 12 | Implementado e provado localmente | Corpo do webhook limitado antes de processar assinatura. Worker de segurança mediu RED/GREEN para excesso, assinatura e stream; pacote de segurança com 220 testes em 13 arquivos passou. |
| 13 | Decisão de política pendente | Preservar integralmente `candidate_changes` e `coleta_log`. Nenhuma janela, destino de arquivo ou descarte foi aprovado. |
| 14 | Corrigido e provado localmente | Workflow de proveniência dos Destaques documentado como duas leituras sem escrita; teste compara todos os agendamentos com o inventário. |
| 15 | Corrigido e provado localmente | Bypass do release protegido incluído no DR e protegido por teste. Existência do secret na conta continua sendo verificação operacional separada. |
| 16 | Decisão de conta pendente | Beacon manual preservado. Fornecedor não oferece pinning/SRI seguro para embed manual; avaliar configuração automática somente após confirmar elegibilidade da conta, sem alterar DNS ou proxy implicitamente. |
| 17 | Implementado e provado localmente | Quatro breakpoints passaram em browser. Em 768px, variante de 828px transferiu 49.142 bytes contra 166.292 do original; demais medições registradas pelo integrador. |
| 18 | Corrigido e provado localmente | Qwen exige modelo explícito e proíbe override nos argumentos extras; 23 testes de runner e 22 de batch passaram. Nenhum modelo pago foi chamado. |
| 19 | Implementado e provado localmente | Subscribe não autenticado preserva sessão verificada; teste passou após reproduzir rotação indevida. Recuperação inválida responde sem revelar cadastro. Incluído no pacote de segurança de 220 testes, sem email real. |
| 20 | Implementado e provado localmente | Quatro testes em VM e dois browsers, Chromium/WebKit, passaram sem retries. Prova usa o worker real, servidor HTTP fechado/reaberto, resposta 503 sem cache, CacheStorage vazio e link de retorno online. Produção continua pendente de release. |

[confidence: high para execução direta; medium para resultados recebidos dos workers, identificados no texto, source: testes locais e handoffs dos workers desta sessão em 2026-09-05] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Integração e limites da prova

- Replay linear PG17: 349 aplicadas + 105 falhas históricas preservadas = 454.
- Schema PG17: 97 aplicadas, zero falhas; hash `97a2bbea08c1d4f87e5723b94203bca0e43937f303805793b4002585d5da15f8`.
- Gate de escrita auditada, allowlists por recorte e 68 contratos de classificação/escrita/cota passaram. A cota tem recorte próprio; recibos não são proveniência eleitoral.
- Driver atômico do pacote usa a convenção da PR #262: identidade de checkout/projeto, digest do predecessor, lock e SQL mais ledger na mesma transação. PG17 provou dry-run, rollback, digest divergente e falha intermediária sem persistência parcial.
- A suíte final teve 4.681 testes: 4.671 pass, zero fail, 10 skips, em 111,978s. Inclui as regressões adicionais do compositor e do CI offline. Quatro provas PG17 da remediação, condicionais na suíte geral, rodaram separadamente: 4/4 pass e zero skips. Os outros seis skips são quatro contratos do repositório operacional ausente e duas provas PG17 históricas fora da remediação.
- Build normal, lint global, TypeScript sem cache incremental, TypeScript de scripts, spellcheck de 166 arquivos, gate canônico de código morto e audit de dependências passaram. O full knip tem categorias adicionais fora do gate; não foi declarado integralmente verde.
- Parser do compositor distingue strings comuns/identificadores de strings `E'...'`, preserva aspas duplicadas e dollar quotes, rejeita transações internas e metacomandos; a transação fixa `standard_conforming_strings=on`. Os controles negativos reproduziram as falhas antes da correção.
- `settings:check` encontrou quatro skips pela ausência do repositório operacional `Status`; isso não é validação completa dos Settings.

[confidence: high, source: logs /tmp/pf-remediation-full-tests-complete.log, /tmp/pf-remediation-ui-complete.log, /tmp/pf-remediation-a11y-complete.log, /tmp/pf-remediation-build-public-final.log, /tmp/pf-remediation-pg17-complete.log, /tmp/pf-remediation-linear.log, /tmp/pf-remediation-schema.log, /tmp/pf-remediation-env-verified.log e /tmp/pf-transaction-backslash-green.log] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

O procedimento e as autorizações ainda necessárias ficam em
[runbook de remediação](../master-review-remediation-runbook.md).
