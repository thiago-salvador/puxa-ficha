# Integridade das mudanças partidárias, plano de implementação

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** impedir que linhas despublicadas ou candidaturas sem identidade eleitoral forte contaminem o quiz e a timeline partidária, com detecção semanal das regressões estruturais.

**Architecture:** manter a leitura pública fail-closed em `src/lib/api.ts`; concentrar a derivação TSE em função pura testável no módulo existente de consistência; persistir por reconciliação limitada às linhas automáticas; ampliar o snapshot semanal com mudanças visíveis e partidos de trajetória visíveis/despublicados. Curadoria, banco, backlog conhecido, merge e deploy ficam fora do lote.

**Tech Stack:** TypeScript, Node.js 24, node:test, Supabase/PostgreSQL, GitHub Actions.

---

### Task 1: fechar o vazamento do quiz

**Files:**
- Modify: `tests/historico-guard-homonimo.test.ts`
- Modify: `src/lib/api.ts`

1. Adicionar teste estático que localiza `quiz-mudancas-partido` e exige `.is("despublicado_em", null)` antes de `abortSignal`.
2. Rodar `node --import tsx --test tests/historico-guard-homonimo.test.ts` e confirmar RED.
3. Adicionar o filtro à query e o sufixo semântico `quiz-mudancas-despublicado-v1` à chave do cache do quiz.
4. Rodar novamente o teste e confirmar GREEN.
5. Varrer todos os consumidores das tabelas com despublicação em `src/lib/api.ts`; registrar que `historico_politico`, `mudancas_partido` e `patrimonio` filtram diretamente, `financiamento_publico` filtra na view e `pontos_atencao` usa `visivel`.

### Task 2: derivar somente de identidades fortes e linhas visíveis

**Files:**
- Modify: `scripts/lib/party-timeline-consistency.ts`
- Modify: `scripts/lib/ingest-tse-historico.ts`
- Modify: `tests/party-timeline-consistency.test.ts`
- Modify: `tests/historico-guard-homonimo.test.ts`

1. Escrever testes para uma função pura que aceite candidaturas com `match_method` e visibilidade, rejeite `name-unique`/`name-uf`, rejeite ano com partidos conflitantes e produza cadeia canônica para anos não ambíguos.
2. Rodar os dois arquivos de teste e confirmar RED.
3. Implementar o menor derivador puro que retorne `mudancas` e `conflitos` nominais, usando somente `cpf` ou `sq-preloaded` e linhas de histórico visíveis.
4. No ingest, consultar as linhas visíveis correspondentes após o upsert, excluir apenas `mudancas_partido` cujo contexto é `Mudança observada entre eleições TSE`, recriar o conjunto derivado e preservar toda linha de curadoria.
5. Reportar conflitos de mesmo ano em `errors`/log sem emitir transição para o par.
6. Rodar os testes novamente e confirmar GREEN.

### Task 3: ampliar o gate semanal de integridade

**Files:**
- Modify: `scripts/audit/superficie-snapshot.sql`
- Modify: `scripts/audit/audit-superficie.ts`
- Modify: `tests/audit-superficie.test.ts`
- Modify: `.github/workflows/data-quality.yml`
- Modify: `Settings/EXPECTED_BEHAVIOR.md`
- Modify: `Settings/AUTOMATIONS_AND_ENVIRONMENTS.md`

1. Criar fixtures que reproduzem Bocalom `PSDB->PV` mais `PV->PSDB` em 2004, cadeia quebrada terminando em `PV->DEM` e partido presente apenas em trajetória despublicada.
2. Rodar `node --import tsx --test tests/audit-superficie.test.ts` e confirmar RED.
3. Incluir no snapshot as mudanças partidárias visíveis, partidos do histórico visível/despublicado e o estado público da ficha.
4. Adicionar regras nominais: reversão no mesmo ano e cadeia quebrada são falhas; partido sustentado somente por linha despublicada é aviso. Achados de fichas não públicas ficam nominais no backlog e não tornam o job permanentemente vermelho.
5. Rodar o teste novamente e confirmar GREEN.
6. Atualizar o contrato canônico e a descrição do job semanal para refletir R8-R10.

### Task 4: verificação e entrega

**Files:**
- Modify: `logs/execucao.jsonl`

1. Rodar os testes focados das Tasks 1 a 3.
2. Rodar `npm run lint`, `npm run typecheck`, `npm run check:scripts`, `npm run check:dead-code`, `npm test`, `npm run build` e `npm run settings:check` com Node 24.15.0.
3. Rodar `npm run audit:superficie -- --from-snapshot=<fixture>` para provar o exit 1 e a identificação nominal nos casos reais sem acessar o banco.
4. Inspecionar o diff e repetir a varredura dos consumidores.
5. Acrescentar uma linha válida ao ledger com `"quem":"codex"` e `"passo":"ONDA-G-SITE-MUDANCAS"`.
6. Conferir autoria Git, commitar como Thiago Salvador, publicar `codex/site-mudancas-integridade` e abrir PR contra `main`, sem merge.
