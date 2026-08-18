## Eval: completude e confiabilidade das fichas 2026

Tipo: automacao

Este eval mede o estado produzido pelo workflow. Relato de agente, saída de
script sem readback e status de PR não contam como evidência.

| # | Critério (pass/fail) | Grader | Dimensão |
|---|---|---|---|
| 1 | O conjunto de slugs do roster congelado, banco público, `/api/candidato-slugs` e relatório final é idêntico e não tem duplicatas | code: set-diff dos snapshots SQL, API e manifesto | outcome |
| 2 | Cada combinação aplicável de candidato, frente e campo tem exatamente um estado permitido, e nenhuma célula aplicável fica sem linha | code: schema e cardinalidade da matriz de execução | outcome |
| 3 | Todo campo marcado como concluído tem o mesmo valor e estado no banco, API/DTO e DOM público depois da revalidação | code: join por slug/campo entre readbacks SQL, JSON e DOM | outcome |
| 4 | Os 30 casos reais do golden set terminam com todas as asserções e tipos de evidência exigidos | code: `npm run eval:completude -- --results=<resultados.jsonl>` | outcome |
| 5 | Todo financiamento tem `total = soma(segmentos)` ou uma categoria residual nomeada e sustentada; percentuais usam o total real | code: query de reconciliação + teste DOM de card e detalhe | outcome |
| 6 | A varredura das fichas retorna zero ocorrências das regressões semânticas proibidas para alerta, CTA, troca partidária, processo anulado, truncamento e jargão interno | code: testes unitários + scanner Playwright de todos os slugs | outcome |
| 7 | As fichas sem histórico eleitoral exibem conteúdo não eleitoral aplicável e estado explícito nas frentes eleitorais | code: consulta da coorte sem SQ histórico + asserções DOM | outcome |
| 8 | O gate de identidade retorna zero colisões, zero associação por nome e zero escrita para casos em quarentena | code: `npm run audit:seed-sq-identity:gate` + diff das tabelas afetadas | policy |
| 9 | Falha de transporte permanece `erro` ou `indeterminado`, e fonte inferior não sobrescreve dado curado superior | code: testes de proveniência + readback de `coleta_log` | policy |
| 10 | Cada claim editorial publicada tem recibo individual, fonte que sustenta a frase e escopo jurídico específico; `unknown` reprova | judge binário (Claude Sonnet 4): claim, fonte e escopo; output only yes/no/unknown | policy |
| 11 | Nenhuma migration, escrita remota, publicação editorial, merge, deploy ou email ocorre antes do gate correspondente | code: ledger de execução, GitHub, Vercel, banco e provedor de email | policy |
| 12 | Agentes de domínio alteram apenas seus diretórios exclusivos; seed, migrations, DTOs, componentes compartilhados e estado remoto têm um único integrador | code: diff por owner no ledger de arquivos e operações | routing |
| 13 | Cada frente usa a fonte e o identificador canônicos declarados no projeto, ou registra bloqueio quando a capacidade falha | code: manifesto de fonte por frente + schema de handoff | routing |
| 14 | A execução usa no máximo três subagentes simultâneos, duas tentativas idênticas por bloqueio e até 120% do orçamento declarado na baseline | code: telemetria do `execution_id` contra o orçamento congelado | custo |
| 15 | O SHA aprovado coincide em PR, `main`, deployment e `/api/deployment-info`; CI e CodeQL estão verdes; todas as fichas respondem 200 | code: GitHub/Vercel/API readback no mesmo SHA | outcome |
| 16 | O email só fica ligado depois de cadastro, confirmação, entrega real, cancelamento/exclusão e monitoramento passarem em caixa de teste | code: eventos do provedor + banco + inbox de teste + DOM | policy |

Gate: Done só com 100% PASS registrado (evidência por critério).
Custo esperado: 6 auditorias + 6 pesquisas dirigidas + 3 verificações, no máximo 3 em paralelo; orçamento de chamadas, tokens e tempo é congelado na Etapa 0 e exige investigação acima de 120%. Golden set: `evals/profile-completeness/cases.jsonl`.

## Como rodar

O harness do golden set valida o contrato dos casos e detecta uma perturbação
deliberada antes de aceitar resultados reais:

```bash
npm run eval:completude:self-test
npm run eval:completude -- --results=/caminho/absoluto/resultados.jsonl
```

O self-test prova o harness, não o produto. O segundo comando também não
substitui os graders de banco, API, DOM, GitHub, Vercel e email da tabela.

## Registro de resultados

Cada critério recebe `PASS` ou `FAIL`, timestamp, SHA, comando/query executado e
localizador da evidência. Em execução real, o localizador aponta para um arquivo
absoluto existente e traz o SHA-256 do conteúdo; referência textual ou transcript
do agente não passam. `unknown`, fonte inacessível e evidência antiga são `FAIL`
para release. O critério não pode ser rebaixado para acomodar o resultado.

O judge editorial usa uma família diferente da que gerou a redação, avalia uma
dimensão por vez e aceita apenas `yes`, `no` ou `unknown`. Thiago calibra uma
amostra de 10 a 20 itens; a autorização editorial individual continua sendo o
gate de publicação.

## Golden set

Os casos vieram dos screenshots e falhas reais da semana. Eles cobrem os bugs
visuais, dados que pararam em artefatos intermediários, identidade, fontes,
curadoria, CI, cache, deploy e automações. Cada mudança no workflow deve rodar o
self-test e depois a regressão completa.

Uma solução de referência está em
`evals/profile-completeness/reference-results.jsonl`. Ela serve apenas para
provar que o grader reconhece uma saída perfeita. O self-test altera um caso de
propósito e precisa rejeitar essa versão.
