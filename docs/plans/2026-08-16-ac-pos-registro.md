# AC pós-registro Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Materializar os bens oficiais de 2026 dos seis candidatos ao Governo do Acre e substituir o snapshot nacional de chapas de 12/08 pelo pacote oficial pós-prazo de 15/08, preservando estados públicos honestos.

**Architecture:** As duas frentes seguem os precedentes já mergeados. Patrimônio espelha o PR #203 com gerador fail-closed, migration cumulativa, allowlist, prova PostgreSQL 17 e quatro trincos do replay. Chapas preserva o schema público existente e troca o snapshot por uma migration de dados idempotente gerada do `consulta_cand_2026.zip`, com o arquivo anterior mantido apenas como base de comparação durante a geração.

**Tech Stack:** Node.js 24.15.0, npm 10.9.8, TypeScript 6, Node test runner, PostgreSQL 17 em Docker, Next.js 16 e Playwright.

---

## Restrições e escolhas

- Base: `origin/main` em worktree isolada, branch `codex/onda-g-ac-pos-registro`.
- Sem escrita em Supabase, merge, deploy ou cache remoto. O teto desta execução é commit, push e PR.
- Fonte: somente os ZIPs oficiais do TSE. Nome, totais e contagens do prompt são gabarito, não fonte.
- Não reutilizar a migration `20260813040100`: migration cumulativa nova preserva histórico e rollback.
- Não reclassificar Leonardo Avalanche. Ausência do ZIP pós-prazo mantém `rechecagem_em_curso`.
- Alternativa descartada: patch manual do JSON/SQL. Ela não prova varredura integral, privacidade nem desaparecimentos entre snapshots.
- Alternativa descartada: atualizar só a copy. O dado oficial novo deve dirigir a proveniência, e o card não pode mascarar snapshot antigo.

## Critérios de aceitação

1. O ZIP de bens tem Last-Modified e SHA-256 medidos; cinco SQs fecham em 25/27/2/5/7 bens e Dr. Luisinho fecha em zero.
2. `patrimonio` recebe cinco linhas 2026; `patrimonio_ausencia_oficial` recebe Dr. Luisinho em 2026 e 2020, sem coexistência contraditória.
3. O snapshot de chapas deriva do ZIP de 15/08, não contém CPF, título ou e-mail, lista todos os desaparecimentos e não inclui Leonardo.
4. Situação oficial pós-prazo aparece como “registrada, aguardando julgamento”; deferimento continua reservado ao julgamento.
5. Todos os caches, testes e proveniências deixam de pinar `20260812`.
6. Os quatro trincos do checklist de migration têm valores medidos e os gates locais completos passam.

### Task 1: Congelar as fontes oficiais e os testes vermelhos

**Files:**
- Create: `tests/patrimonio-onda-g-ac-2026-migration.test.ts`
- Modify: `tests/chapas-2026-tse-snapshot.test.ts`
- Modify: `tests/candidatura-proveniencia.test.ts`

**Steps:**
1. Medir Last-Modified, SHA-256, geração interna, linhas por SQ e somas dos dois ZIPs oficiais.
2. Escrever o teste de patrimônio exigindo cinco writes em `patrimonio`, duas ausências oficiais do Dr. Luisinho, exclusividade e o harness F1-Fn.
3. Alterar os testes de chapas para exigir o novo nome/data/hash, situação pós-prazo e exclusão explícita de Leonardo.
4. Rodar os três arquivos e confirmar falha pelos artefatos ainda inexistentes ou pelo pin de 12/08.

### Task 2: Gerar e provar o patrimônio do Acre

**Files:**
- Create: `scripts/gerar-backfill-patrimonio-onda-g-ac-2026.ts`
- Create: `supabase/migrations/20260816010000_backfill_patrimonio_onda_g_ac_2026.sql`
- Create: `scripts/audit/allowlist-patrimonio-onda-g-ac-20260816.json`
- Create: `scripts/audit/provar-migration-patrimonio-onda-g-ac-2026.sh`

**Steps:**
1. Adaptar o gerador do PR #203 para baixar/validar o ZIP oficial e varrer os seis SQs.
2. Gerar cinco upserts idempotentes de `patrimonio` e duas inserções fail-closed de `patrimonio_ausencia_oficial` para 2026 e 2020.
3. Fazer a migration abortar em identidade parcial, coexistência patrimônio/ausência ou payload diferente.
4. Criar allowlist exata e harness PostgreSQL 17 cobrindo aplicação, replay, coorte parcial, ausência, contradição e rollback lógico.
5. Rodar o teste vermelho novamente e confirmar verde.

### Task 3: Regenerar o snapshot nacional de chapas

**Files:**
- Create: `scripts/gerar-chapas-2026-pos-registro.ts`
- Create: `data/chapas-2026-tse-20260815.json`
- Create: `supabase/migrations/20260816011000_chapas_2026_tse_pos_registro.sql`
- Create: `supabase/rollback/20260816011000_chapas_2026_tse_pos_registro.rollback.sql`
- Create: `supabase/readback/20260816011000_chapas_2026_tse_pos_registro.readback.sql`
- Create: `scripts/audit/allowlist-chapas-tse-pos-registro-20260816.json`

**Steps:**
1. Reusar o parser CSV local, identificar Presidente/Governador e agrupar titular/vice por chapa oficial.
2. Reconciliar identidades contra o snapshot de 12/08 por SQ; qualquer caso novo ou ambíguo falha fechado.
3. Preservar a `privacy_note`, validar ausência de campos sensíveis e emitir relatório determinístico de adições/desaparecimentos.
4. Gerar migration cumulativa que substitui somente o snapshot anterior quando o payload esperado estiver intacto.
5. Gerar rollback e readback exatos, ambos com ledger e guards de cardinalidade.
6. Rodar o teste de snapshot e confirmar verde.

### Task 4: Atualizar consumidores e copy pública por TDD

**Files:**
- Modify: `src/lib/candidatura-proveniencia.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx`
- Modify: `tests/candidatura-proveniencia.test.ts`
- Modify: `tests/chapas-2026-tse-snapshot.test.ts`

**Steps:**
1. Confirmar o teste vermelho para o código oficial de situação pós-prazo.
2. Mapear a situação oficial a `registro_tse_pendente`, mantendo `#NE` como situação não informada e ausência de chapa como declaração editorial/rechecagem.
3. Trocar todos os busts de cache e o selo SSR para a data nova.
4. Rodar os testes de unidade e de contrato público.

### Task 5: Registrar allowlists e os quatro trincos medidos

**Files:**
- Modify: `scripts/audit/recortes.json`
- Modify: `scripts/audit/lib/migrations-classificacao.ts`
- Modify: `scripts/audit/falhas-replay-linear.json`
- Modify: `scripts/audit/schema-replay-substituicoes.json`
- Modify: `tests/migrations-classificacao.test.ts`
- Modify: `tests/candidatos-publico-view-contrato.test.ts`

**Steps:**
1. Registrar os dois recortes e classes de migration.
2. Rodar replay linear e schema gate, capturar `aplicadas_esperadas`, `schemaReplayTamanho` e `schema_dump_sha256` medidos.
3. Atualizar `POSTERIORES` com comentários de escopo das duas migrations.
4. Rodar allowlist e testes de classificação.

### Task 6: Provar comportamento local e superfície renderizada

**Files:**
- Create: `QA/2026-08-16-ac-pos-registro.md`

**Steps:**
1. Rodar os dois harnesses PostgreSQL 17 e o replay completo.
2. Rodar testes focados, `npm test`, typecheck app, typecheck scripts, lint, knip, settings check e build.
3. Subir a aplicação local com fixtures e inspecionar via Playwright um candidato com chapa pós-prazo e Leonardo/ausência, sem marcador interno TSE.
4. Registrar comandos, contagens, hashes e limitações no recibo QA.

### Task 7: Fechar ledger, autoria e PR

**Files:**
- Modify: `../puxafichatemporario/logs/execucao.jsonl`
- Create: `../puxafichatemporario/entregas/ONDA-G/AC/RELATORIO-POS-REGISTRO.md`

**Steps:**
1. Revalidar `origin/main`, revisar o diff e repetir gates afetados se houver concorrência.
2. Confirmar `git config user.name` e `user.email` como Thiago Salvador.
3. Commitar com Thiago como autor principal, push da branch e abrir PR sem merge.
4. Acrescentar uma única linha `quem=codex, passo=ONDA-G-AC-POS-REGISTRO` ao ledger e escrever o relatório curto com PR, SHA, provas e pendências externas.
