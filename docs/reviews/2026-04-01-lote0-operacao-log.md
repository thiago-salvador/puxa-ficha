# Lote 0 - Log de Operacao

Data: 2026-04-01

## Objetivo da rodada

Avancar o Lote 0 dos candidatos `curated`, mantendo o site em `fail-closed`, e reduzir contradicoes reais entre:

- banco
- mock curado
- regras de auditoria
- superficie publica

Tambem foi reforcada a regra editorial de temporalidade:

- dado mais recente e confirmado deve aparecer como atual
- dado antigo deve permanecer como historico
- quando so existe dado antigo, a UI deve explicitar a recencia do dado

## Arquivos alterados

### UI e apresentacao

- `src/components/ProfileOverview.tsx`

### Dados curados locais

- `src/data/mock.ts`

### Artefatos atualizados pela execucao

- `scripts/audit-factual-report.json`
- `scripts/audit-factual-summary.md`
- `scripts/audit-factual-queue.json`
- `scripts/audit-factual-state.json`
- `scripts/audit-factual-history.json`

## O que foi feito

### 1. Corrigido o card de trocas de partido

Em `src/components/ProfileOverview.tsx`:

- foi criado um tratamento para `filiacao inicial`
- entradas como `Sem filiacao partidaria -> PT` ou `Sem filiacao partidaria -> Republicanos` deixaram de contar como `troca`
- o texto do resumo passou a suportar saidas como `PT desde 1980`, em vez de inflar o contador com uma troca inexistente

Impacto:

- evita falsa leitura editorial na home/ficha
- separa melhor filiacao inicial de mudanca partidaria real

### 2. Sincronizados dados estruturados que ja existiam no mock curado

Foi usado o script:

```bash
npx tsx scripts/sync-curated-structured-from-mock.ts --slug lula --slug tarcisio --slug tarcisio-gov-sp --slug romeu-zema --slug eduardo-leite --slug aldo-rebelo --slug ratinho-junior
```

Dados sincronizados:

- `historico_politico`
- `mudancas_partido`
- `patrimonio`
- `financiamento`

Slugs beneficiados nesta leva:

- `lula`
- `tarcisio`
- `tarcisio-gov-sp`
- `romeu-zema`
- `eduardo-leite`
- `aldo-rebelo`
- `ratinho-junior`

### 3. Completadas timelines/historicos de curados com baixo risco

Em `src/data/mock.ts` foram adicionados ou corrigidos:

- `lula`
  - ancora de filiacao inicial para o `PT`
- `tarcisio`
  - ancora de filiacao inicial para `REPUBLICANOS`
- `tarcisio-gov-sp`
  - patrimonio `2022`
  - financiamento `2022`
  - ancora de filiacao inicial para `REPUBLICANOS`
- `romeu-zema`
  - historico politico
  - ancora de filiacao inicial para `NOVO`
- `ratinho-junior`
  - historico politico
  - mudanca para `PSD`
- `eduardo-leite`
  - historico politico
- `aldo-rebelo`
  - historico politico
- `haddad-gov-sp`
  - ancora de filiacao inicial para `PT`

### 4. Corrigido erro factual real no caso Flavio Bolsonaro

Foi encontrado no banco um patrimonio `2022` com `fonte = "mock_curado"` para `flavio-bolsonaro`, sem base oficial equivalente no fluxo atual.

Problema:

- esse row fazia o audit reprovar o candidato por recencia
- tambem contaminava a leitura editorial de patrimonio
- havia um `ponto_atencao` curado misturando `rachadinha` com `crescimento patrimonial` derivado desse dado

Acao executada no banco:

- delete do row de patrimonio `2022` com `fonte = "mock_curado"`
- ajuste do `ponto_atencao` "Caso das rachadinhas" para remover a frase sobre crescimento patrimonial

Resultado:

- `flavio-bolsonaro` deixou de reprovar no `crosscheck_patrimonio_recencia`
- o caso passou a refletir apenas o que esta confirmado no banco atual

## Comandos executados

Verificacao local:

```bash
npm run check:scripts
npm run lint -- src/components/ProfileOverview.tsx src/data/mock.ts
```

Sincronizacao:

```bash
set -a && source .env.local >/dev/null 2>&1 && set +a && npx tsx scripts/sync-curated-structured-from-mock.ts --slug lula --slug tarcisio --slug tarcisio-gov-sp --slug romeu-zema --slug eduardo-leite --slug aldo-rebelo --slug ratinho-junior
set -a && source .env.local >/dev/null 2>&1 && set +a && npx tsx scripts/sync-curated-structured-from-mock.ts --slug haddad-gov-sp
```

Auditoria factual full:

```bash
set -a && source .env.local >/dev/null 2>&1 && set +a && npx tsx scripts/audit-factual.ts
```

## Resultado medido

Estado anterior desta rodada:

- `3/144` auditados

Estado apos a rodada:

- `12/144` auditados
- `132/144` reprovados
- `575` itens na fila de revisao manual

Slugs auditados ao fim desta rodada:

- `lula`
- `romeu-zema`
- `flavio-bolsonaro`
- `tarcisio`
- `ratinho-junior`
- `ciro-gomes`
- `ronaldo-caiado`
- `eduardo-leite`
- `aldo-rebelo`
- `tarcisio-gov-sp`
- `haddad-gov-sp`
- `guilherme-derrite`

## Estado editorial real

O ganho desta rodada foi real, mas limitado:

- a infraestrutura continua correta para `fail-closed`
- a auditoria factual full agora identifica `12` candidatos suficientemente fechados na regua atual
- os demais `132` continuam bloqueados principalmente por:
  - `historico_politico`
  - `mudancas_partido`
  - `crosscheck_cargo_historico`
  - `crosscheck_partido_timeline`
  - recencia de patrimonio/financiamento em parte da base

Importante:

- **nao** foi executado `scripts/set-publicavel-from-audit.ts` nesta rodada
- portanto, a base **nao** foi reaberta para publicacao progressiva
- o site permanece mais seguro fechado do que parcialmente aberto com dados incompletos

## Validacao temporal implementada

Esta rodada seguiu a regra:

- dado atual confirmado fica no bloco atual
- dado antigo permanece como historico
- quando so existe dado antigo, a UI passa a tratar isso explicitamente como dado historico/ultimo dado disponivel

Essa capacidade ja esta suportada na UI e no data layer por:

- `src/components/DataFreshnessNotice.tsx`
- `src/components/CandidatoProfile.tsx`
- `src/components/CandidatoProfileSections.tsx`
- `src/lib/api.ts`
- `src/lib/types.ts`

Em termos editoriais, isso significa:

- nao confundir `2022` com `2026`
- nao promover dado velho para a camada de "atual"
- manter no site o que existe de historico, mas com indicador de recencia

## O que ainda falta

Para o site estar pronto para ir ao ar no criterio `144/144`, ainda faltam:

1. Fechar mais candidatos `curated` com bloqueio simples.
2. Corrigir a base `mirrored` por lotes.
3. Reabrir publicacao apenas quando o gate binario refletir candidatos realmente fechados.

Praticamente, o proximo foco natural e:

- continuar pelos `curated` com `1-3` blockers
- manter correcao imediata de qualquer erro factual encontrado no banco
- so depois considerar reabrir `publicavel`

## Referencias para validacao externa

Arquivos para conferencia:

- `scripts/audit-factual-report.json`
- `scripts/audit-factual-summary.md`
- `scripts/audit-factual-queue.json`
- `src/components/ProfileOverview.tsx`
- `src/data/mock.ts`

Se voce quiser validar em outro lugar, este arquivo representa o log consolidado desta rodada, sem depender do historico do chat.
