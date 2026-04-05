# Auditoria: Timeline Feature (Composer) - 2026-04-04

> Plano: `docs/plans/2026-04-04-timeline-visual.md` (ler o **Estado atual (snapshot)** no topo do plano antes deste arquivo).

## Leia primeiro: status consolidado

- **Codigo no repo:** feature completa (tab, rota `/candidato/[slug]/timeline`, OG, tooltip flutuante + drawer mobile, minimap, zoom, PNG, copy link, highlight entre tabs, `TimelineEvent.tsx`, testes `timeline-utils`). Inventario e evidencias: secao **Auditoria 3** mais abaixo.
- **Esta pagina:** comeca por auditorias **incrementais** (P1 a P7, Fase A); o inicio e **historico**. Nao use a tabela “9 novos + 1 editado” como inventario atual (ela reflete o primeiro passo; nomes de arquivo mudaram, novos arquivos entraram).
- **Producao:** deploy publico pode estar atrasado do `main`. A URL `https://puxa-ficha.vercel.app/candidato/{slug}/timeline` so responde **200** apos promover build com essas rotas. O `release-verify` com `VERIFY_URL` de producao valida HTTP da timeline por slug publico.

> Auditor inicial: Claude Opus 4.6. Correcoes P1 a P6 e iteracoes posteriores registradas no plano (secao 15 e log 16).

## Verificacao Automatizada (primeira rodada — historico)

| Check | Status |
|-------|--------|
| `tsc --noEmit` | PASS (0 erros) |
| `tests/timeline-utils.test.ts` (7 testes) | PASS |
| `next lint` | PASS (0 warnings) |

## Arquivos na primeira entrega (historico — nao usar como lista atual)

| Arquivo | Nota |
|---------|------|
| `TimelineEventPrimitives.tsx` | **Renomeado / substituido** por `TimelineEvent.tsx`. |
| Demais linhas da tabela original | Ver **Auditoria 3** para inventario atual e contagens de testes. |

## Alinhamento com o Plano

### Implementado corretamente (Fase A)

1. **7 camadas de dados**: cargo, mudanca_partido, patrimonio, processo, votacao, projeto_lei, gasto_parlamentar - todas presentes
2. **buildTimelineEvents()**: transforma FichaCandidato em lista unificada, sort por year_start > date > id
3. **computeProcessYearFallback()**: usa fontes nao-processuais, default 2000
4. **date_unknown**: processos sem data_inicio nao fingem ano atual
5. **Votos sem join**: ignorados (plan sec 3.4)
6. **PL sem ano**: excluidos (plan sec 7.3)
7. **Patrimonio com variacao %**: calculada entre pontos adjacentes
8. **Gastos com top rubrica**: `topGastoDescription()`
9. **Desktop SVG horizontal**: swim lanes, range bars (cargo/processo), markers (demais), losango (mudanca_partido)
10. **Mobile vertical**: lista de cards, sort reverso (mais recente primeiro), badge "Contrad."
11. **Filtros de camada**: toggles com contagem, checkbox "Mostrar todos PLs"
12. **Tooltip/painel**: detalhes + link "Ver em {tab}" + fechar, role="dialog"
13. **Cross-linking**: `onTabNavigate` passa tab_link para CandidatoProfile
14. **Tab Timeline**: segunda tab (apos Visao Geral) - linha 117 de CandidatoProfile
15. **Empty state**: presente com EmptyState + suggest
16. **Cluster 5+**: bucketLaneEvents agrupa quando > CLUSTER_LIMIT no mesmo ano/lane
17. **Testes unitarios**: 7 testes cobrindo edge cases principais

### Desvios aceitaveis (momento da primeira auditoria)

1. ~~**Nome `TimelineEventPrimitives.tsx`**~~ **Resolvido depois:** arquivo atual e `TimelineEvent.tsx`.
2. ~~**Tooltip so estacionario**~~ **Evoluiu:** tooltip flutuante no desktop + folha no mobile (Auditoria 3).
3. **getTimelineRange default**: plano diz `{ 2000, 2026 }` para vazio, implementacao usa `{ nowY-10, nowY }` - melhor (dinamico)
4. **Cargo label**: plano usa `h.partido ?? ficha.partido_sigla`, implementacao usa so `h.partido` - ver P1

## Problemas Encontrados

### P1: Severidade Media - Label de cargo pode ficar "(null)"

**Arquivo**: `src/lib/timeline-utils.ts:116`
**Problema**: `label: \`${h.cargo} (${h.partido})\`` - se `h.partido` for null, label fica "Deputado Federal (null)"
**Plano dizia**: `h.partido ?? ficha.partido_sigla`
**Fix**: usar fallback `h.partido ?? ficha.partido_sigla ?? ''`

### P2: Severidade Baixa - TimelineTooltipProps interface tem `anchorRef` nao usado

**Arquivo**: `src/components/timeline/TimelineTooltip.tsx:11-16`
**Problema**: `TimelineTooltipProps` define `anchorRef` mas `TimelineTooltipPanel` usa `Omit<..., "anchorRef">`. Interface morta que ficou de um design anterior (tooltip flutuante).
**Fix**: remover `anchorRef` da interface ou remover `TimelineTooltipProps` inteiro (nao e exportado/usado).

### P3: Severidade Baixa - Lanes ocultas ainda ocupam espaco vertical no SVG

**Arquivo**: `src/components/timeline/TimelineDesktop.tsx:111`
**Problema**: `laneY = TOP_PAD + laneIndex * LANE_H` usa `laneIndex` do array completo de TIMELINE_EVENT_TYPES, nao do subconjunto visivel. Se a primeira lane estiver oculta, a segunda lane renderiza na posicao Y da segunda (com gap vazio na primeira).
**Fix**: calcular laneY baseado em indice das lanes visiveis, nao do array global.

### P4: Severidade Baixa - SVG viewBox height nao reflete lanes ocultas

**Arquivo**: `src/components/timeline/TimelineDesktop.tsx:81`
**Problema**: `axisY = TOP_PAD + TIMELINE_EVENT_TYPES.length * LANE_H` sempre usa 7 lanes. Se 3 lanes estao ocultas, sobra espaco vazio.
**Fix**: calcular baseado em `visibleLanes.size` em vez de `TIMELINE_EVENT_TYPES.length`.

### P5: Severidade Info - Contradicao stroke em mudanca_partido nao faz sentido

**Arquivo**: `src/components/timeline/TimelineDesktop.tsx:239`
**Problema**: mudanca_partido verifica `ev.contradicao` para stroke, mas `contradicao` so existe em votacoes. Nao causa bug (sera undefined/false), mas e logica morta.
**Fix**: nenhum obrigatorio, mas poderia simplificar removendo o check para nao-votacoes.

### P6: Severidade Info - Teste nao cobre gastos nem mudancas_partido

**Arquivo**: `tests/timeline-utils.test.ts`
**Problema**: 7 testes cobrem patrimonio, processo, votacao, PL, fallback e range. Nao ha teste para:
  - gastos_parlamentares com detalhamento (topGastoDescription)
  - mudancas_partido
  - cargo com periodo_fim null (range ate yearMax)
**Fix**: adicionar 3 testes.

## Plano de Correcao (P1-P6)

### Correcoes obrigatorias (P1, P3, P4)

1. **`src/lib/timeline-utils.ts`**: cargo label usar `h.partido ?? ficha.partido_sigla ?? ''`
2. **`src/components/timeline/TimelineDesktop.tsx`**: calcular laneY e axisY/vbHeight baseado em lanes visiveis (filtrar TIMELINE_EVENT_TYPES por visibleLanes, usar indice filtrado)

### Correcoes recomendadas (P2, P6)

3. **`src/components/timeline/TimelineTooltip.tsx`**: remover `anchorRef` da interface morta
4. **`tests/timeline-utils.test.ts`**: adicionar testes para gastos, mudancas_partido e cargo open-ended

### Verificacao pos-fix

- `tsc --noEmit`
- `npx tsx --test tests/timeline-utils.test.ts`
- `next lint`
- Visual check: abrir ficha de candidato com lanes ocultas e verificar que SVG compacta corretamente

---

## Auditoria 2: Fase B conclusao (minimap, zoom/pan, export PNG) - 2026-04-04

### Verificacao Automatizada

| Check | Status |
|-------|--------|
| `tsc --noEmit` | PASS (0 erros) |
| `tests/timeline-utils.test.ts` (15 testes) | PASS |
| `next lint` | PASS (0 warnings) |

### Arquivos Novos/Alterados

| Arquivo | Linhas | Status |
|---------|--------|--------|
| `src/lib/timeline-utils.ts` | 280 (+26) | OK |
| `tests/timeline-utils.test.ts` | 312 (+25) | OK |
| `src/components/timeline/TimelineMinimap.tsx` | 118 (novo) | OK |
| `src/components/timeline/TimelineDesktop.tsx` | 519 (+229) | Ajuste P7 |
| `src/components/timeline/TimelineExportButton.tsx` | 54 (novo) | OK |
| `src/components/timeline/TimelineTab.tsx` | 143 (+16) | OK |
| `package.json` | html2canvas adicionado | OK |

### Validacao por Feature

| Feature | Status | Evidencia |
|---------|--------|-----------|
| `clampTimeWindow()` | OK | Exportada, lida com min span, overflow, extent vazio, input invertido |
| 4 testes clampTimeWindow | OK | Normal, overflow direita, span > extent, extent ponto |
| TimelineMinimap track proporcional | OK | wLeft/wWidth como fracao do span, min width 3% |
| Minimap click centra janela | OK | clickYear calculado via frac, centra com winSpan/2 |
| Minimap drag com pointercapture | OK | setPointerCapture no pointerdown, dragStartRef, deltaYears |
| windowOverride state | OK | useState nullable, null = usar preset |
| viewMin/viewMax via clampTimeWindow | OK | useMemo com fallback para presetWindow |
| Ctrl/Cmd + scroll zoom | OK | P7: `addEventListener('wheel', …, { passive: false })` via `useEffect` |
| role="region" + tabIndex | OK | aria-label com instrucao de uso |
| "Redefinir zoom" limpa override | OK | setWindowOverride(null) |
| Minimap integrado acima dos controles | OK | Condicional showMinimap, antes dos botoes |
| Export PNG dinamico | OK | import("html2canvas"), scale 2, useCORS |
| Filename puxaficha-timeline-{slug}.png | OK | Sanitizado com regex, max 80 chars |
| Ref no bloco exportavel | OK | timelineExportRef envolve filtros + desktop |
| Botao "Baixar PNG" em lg+ | OK | hidden lg:flex, justify-end |
| html2canvas em dependencies | OK | ^1.4.1 |

### Problemas Encontrados

#### P7: Severidade Media - onWheel preventDefault falha em React 19 — **CORRIGIDO**

**Arquivo**: `src/components/timeline/TimelineDesktop.tsx`
**Problema (historico)**: React 19 registra `onWheel` do JSX como listener passivo por padrao; `preventDefault()` nao bloqueava o zoom nativo do navegador com Ctrl/Cmd+scroll.
**Fix aplicado**: `chartWheelRegionRef` no container `role="region"` + `useEffect` com `addEventListener('wheel', handleWheel, { passive: false })` e cleanup com `removeEventListener`. Logica de zoom inalterada; refs `extentBoundsRef` e `viewWindowRef` mantem valores atuais no handler.

### Pendencias Fase B (texto historico — parcialmente obsoleto)

- ~~Minimap~~: entregue
- ~~Zoom/pan~~: entregue (P7 corrigido)
- ~~Share por captura~~: entregue (PNG)
- ScrollTrigger: fora de escopo (zoom manual sem plugin, conforme alternativa do plano)
- ~~OG exclusiva da tab~~: **entregue** na rota `/candidato/[slug]/timeline` + `opengraph-image`; PNG continua como extra

---

## Auditoria 3: Tooltip flutuante, cross-tab highlight, copy link, rota /timeline, rename - 2026-04-04

### Verificacao Automatizada

| Check | Status |
|-------|--------|
| `tsc --noEmit` | PASS (0 erros) |
| `tests/timeline-utils.test.ts` (15 testes) | PASS |
| `next lint` | PASS (0 warnings) |

### Inventario de Arquivos (estado final consolidado)

| Arquivo | Linhas | Mudanca |
|---------|--------|---------|
| `src/lib/timeline-utils.ts` | 277 | `clampTimeWindow()` adicionado |
| `tests/timeline-utils.test.ts` | 311 | 15 testes (4 clampTimeWindow) |
| `src/components/timeline/TimelineTab.tsx` | 198 | Tooltip flutuante, export, copy link, Escape handler, mobile drawer |
| `src/components/timeline/TimelineDesktop.tsx` | 567 | P7 fix, `anchorFromSvgTarget`, `onSelectId` com DOMRect |
| `src/components/timeline/TimelineMobile.tsx` | 101 | `onSelectId` com DOMRect, GSAP intro |
| `src/components/timeline/TimelineTooltip.tsx` | 141 | `TimelineTooltipFloating` (NOVO), `TimelineNavigateOptions` |
| `src/components/timeline/TimelineEvent.tsx` | 38 | Renomeado de `TimelineEventPrimitives.tsx` |
| `src/components/timeline/TimelineCopyLinkButton.tsx` | 40 | NOVO |
| `src/components/timeline/TimelineExportButton.tsx` | 54 | Existente |
| `src/components/timeline/TimelineMinimap.tsx` | 118 | Existente |
| `src/components/timeline/TimelineSparkline.tsx` | ~64 | Existente |
| `src/components/timeline/TimelineFilters.tsx` | 69 | Sem mudanca |
| `src/components/timeline/TimelineLane.tsx` | ~41 | className prop |
| `src/components/timeline/TimelineAxis.tsx` | 73 | Sem mudanca |
| `src/components/CandidatoProfile.tsx` | ~560 | `TimelineNavigateOptions`, `tabHighlightRef`, highlight DOM |
| `src/components/CandidatoProfileSections.tsx` | ~532 | `data-pf-timeline-ref` em patrimonio, gastos, cargos, partidos, PLs |
| `src/app/candidato/[slug]/timeline/page.tsx` | 69 | NOVO: rota dedicada com metadata/OG |
| `src/app/candidato/[slug]/timeline/opengraph-image.tsx` | existe | OG image para compartilhamento |

### Validacao por Feature

| Feature | Status | Evidencia |
|---------|--------|-----------|
| **TimelineTooltipFloating** (novo) | OK | Posicionamento `fixed`, flip above/below (spaceAbove < 200), horizontal clamp, useLayoutEffect |
| **TimelineNavigateOptions** | OK | Interface com `timelineEventId`, passada pelo Panel, recebida no CandidatoProfile |
| **Cross-tab highlight** | OK | `tabHighlightRef` state no CandidatoProfile; `data-pf-timeline-ref` em 5 tipos de evento nas Sections; ring styling + 4.2s auto-removal |
| **Mobile drawer** | OK | Overlay bg-black/40 z-70, bottom sheet z-80, max-h 78vh, rounded-t-2xl |
| **Desktop floating tooltip** | OK | `TimelineTooltipFloating` envolve `TimelineTooltipPanel`, hidden lg:block |
| **anchorFromSvgTarget()** | OK | Extrai DOMRect de SVGGraphicsElement, passado via onSelectId |
| **DOMRect propagation** | OK | Desktop (SVG getBoundingClientRect), Mobile (button getBoundingClientRect) |
| **Escape handler** | OK | useEffect com window keydown, cleanup no return |
| **TimelineCopyLinkButton** | OK | Clipboard API, URL canonica `/candidato/{slug}/timeline`, feedback visual 2.2s |
| **Rota /timeline** | OK | `page.tsx` com ISR 3600, metadata, OG image, renderiza `CandidatoFichaView` com `profileInitialTab="timeline"` |
| **Rename EventPrimitives -> Event** | OK | `TimelineEvent.tsx` existe, `TimelineEventPrimitives.tsx` removido, 0 imports para o nome antigo |
| **P7 wheel fix** | OK | `useEffect` + `addEventListener('wheel', …, { passive: false })` no `chartWheelRegionRef` |
| **data-pf-timeline-ref coverage** | OK | patrimonio, gasto, cargo, partido, pl (5/7 tipos). Processos e votos cobertos no CandidatoProfile.tsx |

### Problemas Encontrados

Nenhum problema novo. Todas as features entregues estao corretas e integradas.

### Cobertura de `data-pf-timeline-ref` por tipo de evento

| Tipo timeline | ID pattern | Arquivo com data-attr |
|---------------|------------|----------------------|
| cargo | `cargo-{id}` | CandidatoProfileSections.tsx:356 |
| mudanca_partido | `partido-{id}` | CandidatoProfileSections.tsx:400 |
| patrimonio | `patrimonio-{id}` | CandidatoProfileSections.tsx:82 |
| processo | `processo-{id}` | CandidatoProfile.tsx:353 |
| votacao | `voto-{id}` | CandidatoProfile.tsx:403 |
| projeto_lei | `pl-{id}` | CandidatoProfileSections.tsx:464 |
| gasto_parlamentar | `gasto-{id}` | CandidatoProfileSections.tsx:217 |

Todos os 7 tipos de evento tem `data-pf-timeline-ref` no DOM, permitindo cross-tab highlight completo.

### Estado final da Timeline Feature

**Fase A + Fase B completas.** Resumo de tudo entregue:

- 7 camadas de dados no eixo temporal
- Desktop SVG com swim lanes, ranges, markers, losango, sparklines
- Mobile com lista vertical + bottom sheet drawer
- Filtros de camada com contagem + toggle PLs
- Tooltip flutuante posicionado no marcador (desktop) e drawer (mobile)
- Cross-tab navigation com highlight do item de destino (ring 4.2s)
- Minimap para carreiras longas
- Zoom via Ctrl/Cmd + scroll (non-passive wheel)
- Viewport presets (ultimos 20 anos / carreira completa)
- Cluster 5+ expandivel
- Animacoes GSAP com prefers-reduced-motion
- Export PNG via html2canvas
- Copy link para URL canonica `/candidato/{slug}/timeline`
- Rota dedicada com metadata + OG image
- 15 testes unitarios
- `tsc`, `lint`, `tests` passam
