# Auditoria Factual — Playbook de Revisão Manual

Guia operacional para revisão humana de itens na fila de auditoria factual do Puxa Ficha.

## Limites da Fase 1

- resultado `100% auditado` em uma coorte curada significa consistencia entre snapshot, banco/mock e assertions curadas
- isso nao significa validacao factual independente de cada assertion
- a validacao humana das assertions P0 e P1 continua sendo obrigatoria na Fase 2a

## Coortes Prioritarias

- `presidenciaveis`: coorte critica e obrigatoria
- `governadores-prioritarios`: coorte critica de maior exposicao estadual
- `alto-trafego`: rotulo de compatibilidade para a coorte editorial de alto trafego estimado

Observacao:

- enquanto nao houver analytics confiaveis plugados ao processo, `alto-trafego` deve ser tratado como estimativa editorial curada
- quando analytics estiverem disponiveis, a lista deve ser recalibrada periodicamente com dados reais de acesso

## Quando usar este playbook

- Ao revisar itens com `resultado: fail` ou `resultado: warning` no `scripts/audit-factual-report.json`
- Ao revisar coortes específicas em `scripts/audit-factual-<coorte>-report.json`
- Ao revisar qualquer campo P0 antes de publicar um candidato
- Ao receber alert de falha crítica de campo P0 no pipeline
- Ao consumir a fila operacional em `scripts/audit-factual-queue.json`

## Estrutura da Fila

Cada item de revisão tem:

| Campo | Descrição |
|---|---|
| `candidato_slug` | Identificador único do candidato |
| `campo` | Nome do campo com divergência |
| `valor_publicado` | O que o site está mostrando hoje |
| `valor_esperado` | O que a auditoria identificou como correto |
| `fonte` | Fonte de verdade consultada |
| `severidade` | S0 / S1 / S2 |
| `status` | aberto / em_revisao / resolvido / descartado |
| `responsavel` | Quem está resolvendo |
| `prazo` | Deadline conforme SLA |

## SLAs por Severidade

| Severidade | Prazo | Motivo |
|---|---|---|
| S0 | Mesmo dia | Erro em partido, cargo, estado, patrimônio, processo ou identidade |
| S1 | Antes do próximo deploy editorial | Erro factual relevante em histórico, biografia, formação, situação |
| S2 | Backlog normal | Erro menor de apresentação, rótulo ou texto derivado |

## Gate de Publicação

- `fail` em campo P0 → **bloqueia publicação** do candidato
- `warning` em campo P1 → não bloqueia deploy, mas abre item S1 na fila
- equivalência semântica por sigla/nome do mesmo partido não bloqueia publicação
- divergência entre `partido_sigla` e `partido_atual` dentro do mesmo snapshot deve virar revisão manual

## Processo de Revisão por Campo

### partido_sigla / partido_atual

1. Acesse a página oficial do candidato no TSE ou na Câmara/Senado
2. Verifique o partido atual de filiação
3. Compare com o valor publicado
4. Se divergir: corrija no cadastro curado (`data/candidatos.json` ou Supabase) com nota da fonte
5. Marque item como `resolvido` com link para a fonte usada

Observação:
- se a auditoria apontar `partido_atual = PT` e `partido_sigla = PT`, isso não é erro factual de partido; é dívida de normalização do campo. Corrigir quando a camada canônica estabilizar, mas não tratar como troca de partido.

Fontes aceitas:
- TSE: `https://www.tse.jus.br/partidos/partidos-registrados-no-tse/consulta-de-filiacao-partidaria`
- Câmara: `https://www.camara.leg.br/deputados/[id]`
- Senado: `https://www25.senado.leg.br/web/senadores/senador/-/perfil/[id]`

### cargo_atual

1. Verifique se o candidato tem mandato ativo via API oficial
   - Câmara: campo `ultimoStatus.situacaoNaLegislatura` — deve conter "exerc"
   - Senado: campo `IdentificacaoParlamentar.InExercicio` — deve ser "S"
2. Se tem mandato ativo mas `cargo_atual` está null: é bug de pipeline (abrir issue)
3. Se não tem mandato ativo mas `cargo_atual` está preenchido: corrigir para null

Caso especial monitorado:

- `geraldo-alckmin` pode aparecer com `cargo_atual = "Vice-Presidente da Republica"` e `cargo_disputado = "Governador"`
- isso e um caso atipico, mas factualmente valido
- nao tratar essa combinacao como erro automatico; revisar apenas partido, cargo e contexto da assertion

### estado

1. Verificar UF no cadastro eleitoral oficial
2. Estado deve ser a UF onde o candidato disputa (para governadores) ou o estado de origem do mandato (para presidentes, aceitar null)

### patrimônio / financiamento

1. Acesse o portal do TSE: `https://www.tse.jus.br/eleicoes/eleicoes-anteriores`
2. Busque a declaração mais recente do candidato
3. Verifique se o valor e o ano correspondem ao publicado
4. Se o candidato nunca declarou: registrar como "sem declaração encontrada" (não como zero)
5. Se há declaração mais recente disponível: atualizar o dado e registrar a fonte

### total_processos

1. Verificar na base curada se os registros batem com o count publicado
2. Qualquer divergência acima de 1 processo requer verificação manual na fonte primária
3. Registrar URL da fonte primária ao resolver

### foto_url

1. Verificar se a URL retorna status 200
2. Verificar visualmente se a foto corresponde ao candidato correto (não apenas que carrega)
3. Se a foto for de outra pessoa: S0, corrigir imediatamente
4. Se a URL estiver quebrada: substituir pela próxima fonte da hierarquia (Wikipedia → Wikidata → Câmara/Senado → partido)

Observação:
- caminho raiz do próprio site, como `/candidates/nome.jpg`, é aceitável na auditoria de snapshot; a validação de carregamento real fica para a etapa de verificação pública.

## Campos P2 (Editoriais)

Campos como `biografia_curta`, `pontos_atencao` e `resumos_interpretativos` exigem revisão humana **sempre que forem alterados automaticamente**.

Critérios de aprovação:
- Sem afirmações não verificadas
- Sem linguagem tendenciosa não declarada
- Sem dados que dependam de fontes não citadas
- Tom consistente com o padrão editorial do produto

Ao aprovar: registrar `last_reviewed_by` e `last_reviewed_at` no registro.

## Metadados de Proveniência

Ao editar qualquer campo sensível manualmente, registrar:

```json
{
  "last_edited_by": "human",
  "last_edited_source": "editor:thiago",
  "last_reviewed_by": "Thiago Salvador",
  "last_reviewed_at": "2026-03-31T00:00:00Z"
}
```

Ao editar automaticamente via script de ingestão, registrar:

```json
{
  "last_edited_by": "automation",
  "last_edited_source": "ingest-wikipedia",
  "last_reviewed_by": null,
  "last_reviewed_at": null
}
```

Campos com `last_edited_by: automation` e `last_reviewed_by: null` **devem aparecer na fila de revisão** se forem P0 ou P1.

## Estado Persistente

Arquivos persistentes mantidos pela auditoria:

- `scripts/audit-factual-state.json`
  - estado mais recente por candidato, com status, coortes, falhas e provenance
- `scripts/audit-factual-history.json`
  - histórico resumido de execuções por coorte
- `scripts/audit-factual-runs/`
  - snapshots versionados de cada relatório, usados para diff entre rodadas

## Escalonamento

Se um item de revisão não puder ser resolvido pelo revisor:

- S0: escalar imediatamente para o responsável de produto (Thiago)
- S1: mencionar na próxima daily ou sync de editorial
- S2: deixar em backlog com nota explicando o bloqueio

## Registro de Resolução

Ao marcar um item como `resolvido`:

1. Registrar a fonte usada para validar
2. Registrar o valor corrigido (se houve correção)
3. Atualizar `auditoria_status` do candidato no banco
4. Rodar `npx tsx scripts/audit-factual.ts --slug [candidato]` para confirmar que o item sumiu da fila

## Comandos Úteis

```bash
# Auditar todos os candidatos (Fase 2, pós-pipeline fix)
npx tsx scripts/audit-factual.ts

# Auditar apenas presidenciáveis
npx tsx scripts/audit-factual.ts --cohort presidenciaveis --output-prefix presidenciaveis

# Auditar governadores prioritários
npx tsx scripts/audit-factual.ts --cohort governadores-prioritarios --output-prefix governadores-prioritarios

# Auditar a coorte editorial de alto trafego estimado
npx tsx scripts/audit-factual.ts --cohort alto-trafego --output-prefix alto-trafego

# Auditar candidato específico
npx tsx scripts/audit-factual.ts --slug nikolas-ferreira

# Aplicar assertions curadas no banco
npx tsx scripts/sync-audit-assertions.ts --cohort governadores-prioritarios

# Aplicar assertions curadas no mock/fallback
npx tsx scripts/sync-mock-from-assertions.ts --cohort governadores-prioritarios

# Dry-run sem banco (Fase 1, útil para validar a infra)
npx tsx scripts/audit-factual.ts --dry-run

# Ver relatório gerado
cat scripts/audit-factual-report.json | jq '.resumo'
cat scripts/audit-factual-report.json | jq '.candidatos[] | select(.tem_falha_critica) | .slug'

# Ver fila operacional de revisão
cat scripts/audit-factual-queue.json | jq '.[:10]'

# Ver resumo editorial em Markdown
cat scripts/audit-factual-summary.md

# Gate factual dos presidenciáveis
npx tsx scripts/check-audit-gate.ts --report scripts/audit-factual-presidenciaveis-report.json --max-blocked 0 --min-assertions 13

# Diff da última rodada de governadores prioritários
npx tsx scripts/audit-factual-diff.ts --scope governadores-prioritarios --output-prefix governadores-prioritarios
```
