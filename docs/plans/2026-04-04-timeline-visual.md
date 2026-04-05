# Timeline Visual do Candidato

## Estado atual (snapshot) — 2026-04-04

**No repositorio, a timeline esta entregue como produto (Fase A + Fase B + refinamentos):**

- Tab **Timeline** na ficha (`CandidatoProfile`), segunda posicao apos Visao Geral.
- **Rota dedicada** `/candidato/[slug]/timeline` (SSG, ISR 1h), **canonical** e **OG** em `.../timeline/opengraph-image`.
- **Sitemap** inclui URLs `/candidato/{slug}/timeline`.
- Desktop: swim lanes, clusters, minimap, zoom (Ctrl/Cmd + scroll, nao passivo), preset 20 anos / carreira completa, **dois cliques** no SVG para janela de ~5 anos, sparklines, export **PNG** (`html2canvas`), animacao de entrada (GSAP + `prefers-reduced-motion`).
- **Tooltip:** painel **flutuante** no desktop (ancora no marcador) e **folha inferior** no mobile; **Esc** fecha; **Ver em {tab}** com `timelineEventId` e **highlight** (`data-pf-timeline-ref`) na tab de destino.
- **Copiar link** para URL canonica da timeline (`SITE_ORIGIN`).
- Modulo `src/lib/timeline-utils.ts` + `tests/timeline-utils.test.ts` (suite em evolucao).
- Arquivo de visual por tipo: `src/components/timeline/TimelineEvent.tsx` (cores, `voteAbbrev`, etc.).

**Producao (Vercel / dominio publico):** o codigo acima so aparece para usuarios **apos deploy** da branch que contem essas rotas. Enquanto o deploy publico estiver atrasado do `main` local, `https://…/candidato/{slug}/timeline` pode responder **404** mesmo com tudo no repo. Validar com `VERIFY_URL` apontando para producao em `npm run audit:release-verify` (inclui checagem HTTP da rota `/timeline` por slug publico).

**Fora do escopo atual do produto (continua valido o PRD abaixo):** lane de **financiamento** na timeline; **pontos de atencao** sem data factual estruturada.

---

### Como ler este documento

| Parte | Papel |
|-------|--------|
| Secoes 1 a 15 | **PRD / especificacao** (intencao, dados, UX, fases originais, riscos). Algumas linhas historicas citam “fora do v1” referindo-se ao plano *antes* da Fase B; o bloco **Estado atual** acima manda. |
| Secao 16 — Log de execucao | **Changelog / auditoria interna** (ordem cronologica). Nao substitui o snapshot do topo. |
| `docs/audit-timeline-2026-04-04.md` | **Auditorias pontuais**; o topo desse arquivo aponta para a revisao consolidada. |

> Prioridade: alta (revelador de padroes, diferencial editorial)  
> Data do plano: 2026-04-04 (revisoes de doc: mesma data)

## Visao geral

**Esta feature nao e MVP experimental.** O lancamento publico da tab Timeline deve cumprir a promessa editorial do documento: **todas as camadas centrais** da secao 1 (cargos, mudanca de partido, patrimonio, processos, votacoes, projetos de lei, gastos), com filtros, tooltip util e cross-link para as tabs da ficha. O que fica de fora do v1 esta explicitado (financiamento como lane, pontos de atencao sem data, etc.), nao uma meia timeline para validar hipotese.

Linha do tempo unificada que cruza no mesmo eixo temporal: cargos, mudancas de partido, patrimonio declarado, processos, votacoes polemicas, projetos de lei e gastos parlamentares. Hoje esses dados estao espalhados em 7 tabs separadas na ficha do candidato. A timeline os sobrepoem visualmente, revelando padroes que ficam invisiveis quando fragmentados.

Exemplos de padroes que a timeline revela:

- "Mudou de partido 6 meses antes de votacao X"
- "Patrimonio dobrou entre 2018 e 2022, periodo em que presidiu comissao Y"
- "Abriu empresa no ano em que deixou o cargo"
- "Votou contra reforma trabalhista mas propôs PL flexibilizando CLT no ano seguinte"
- "Processo criminal aberto, prescreveu durante mandato seguinte"

---

## 1. Dados disponiveis por camada temporal

Cada camada puxa de uma tabela/type existente. Todas ja estao carregadas na `FichaCandidato`.

### 1.1 Cargos politicos (ranges)

- **Fonte**: `historico[]` em `FichaCandidato` (dados vindos da tabela `historico_politico` no Supabase)
- **Campos temporais**: `periodo_inicio: number` (ano), `periodo_fim: number | null` (null = atual)
- **Display**: barra horizontal com label "Deputado Federal (PT, 2003-2010)"
- **Cor**: neutra (cinza/preto)
- **Tipo visual**: range bar

### 1.2 Mudancas de partido (pontos)

- **Fonte**: `mudancas_partido[]`
- **Campos temporais**: `data_mudanca: string | null`, `ano: number`
- **Display**: marcador pontual com label "PSB → PL"
- **Cor**: amarelo/laranja (sinal de atencao)
- **Tipo visual**: marker/pin
- **Contexto**: campo `contexto` ("janela partidaria", "fusao", etc.)

### 1.3 Patrimonio declarado (pontos com valor)

- **Fonte**: `patrimonio[]`
- **Campos temporais**: `ano_eleicao: number`
- **Display**: ponto com valor formatado (R$ 2,3M) + variacao percentual vs anterior
- **Cor**: verde (crescimento) ou neutro
- **Tipo visual**: ponto com label de valor, opcionalmente conectado por linha mostrando evolucao
- **Grafico secundario**: mini sparkline de evolucao patrimonial embutida na timeline

### 1.4 Processos judiciais (ranges ou pontos)

- **Fonte**: `processos[]`
- **Campos temporais**: `data_inicio: string | null`, `data_decisao: string | null`
- **Display**: barra de duracao se tem inicio e decisao, ou ponto se so tem inicio
- **Cor**: vermelho (alta gravidade), laranja (media), cinza (baixa/encerrado)
- **Tipo visual**: range bar (colorida por gravidade) ou marker
- **Label**: tipo + tribunal + status ("Criminal, STF, em andamento")

### 1.5 Votacoes-chave (pontos)

- **Fonte**: `votos[]` (VotoCandidato com join para VotacaoChave)
- **Campos temporais**: `votacao.data_votacao: string` (date)
- **Display**: ponto com icone de voto + titulo da votacao
- **Valores de `v.voto` no TypeScript** (espelhar literalmente em codigo): `'sim' | 'não' | 'abstenção' | 'ausente' | 'obstrução'` (com acentos, como em `VotoCandidato`)
- **Cor**: por voto (verde = sim, vermelho = nao, cinza = abstencao/ausente/obstrucao)
- **Tipo visual**: marker com icone
- **Destaque especial**: contradicoes (`contradicao: true`) com borda/badge diferenciado

### 1.6 Projetos de lei (pontos)

- **Fonte**: `projetos_lei[]`
- **Campos temporais**: `ano: number | null`
- **Display**: ponto com tipo + tema ("PL, trabalho")
- **Cor**: azul (destaque) ou cinza (normal)
- **Tipo visual**: marker, agrupado por ano se muitos no mesmo periodo
- **Filtro**: mostrar so os de destaque (`destaque: true`) por default, expandir todos sob demanda

### 1.7 Gastos parlamentares (pontos com valor por ano)

- **Fonte**: `gastos_parlamentares[]`
- **Campos temporais**: `ano: number`
- **Display**: ponto com total gasto no ano + top categoria
- **Cor**: neutra
- **Tipo visual**: ponto com label de valor
- **Agrupamento**: um marcador por ano (nao por gasto individual)

### 1.8 Pontos de atencao (pontos, quando tem data)

- **Fonte**: `pontos_atencao[]`
- **Campos temporais**: `created_at` (nao ideal, e data de insercao, nao do fato). Muitos nao tem data do fato vinculada.
- **Decisao**: NAO incluir na timeline por default. So incluir se/quando tiver campo `data_fato` ou cross-reference com processo/votacao que tem data.
- **Fase futura**: adicionar campo `data_referencia` em `pontos_atencao` para vinculacao temporal.

### 1.9 Financiamento de campanha (fase futura)

- **Fonte**: `financiamento[]` em `FichaCandidato` (`ano_eleicao`, totais por rubrica)
- **Por que fora do v1**: escopo editorial ja amplo com 1.1 a 1.7; financiamento como lane exige desenho proprio (totais por `ano_eleicao`, comparavel ao patrimonio).
- **Decisao**: tratar como **iteracao futura** (pontos por ano de eleicao, semelhante a patrimonio). Ate la, o pitch do diferencial deve citar "financiamento" apenas se essa lane existir na UI, ou alinhar a "patrimonio + processos + dinheiro (CEAP/patrimonio)" ao que a timeline mostra.

---

## 2. Design visual

### 2.1 Layout

```
Eixo horizontal = tempo (anos)
Camadas verticais empilhadas (swim lanes):

  ┌──────────────────────────────────────────────────────────┐
  │ CARGOS       ████████████████░░░░████████████            │
  │ PARTIDO      ·····PT·····│·PSB··│····PL·····             │
  │ PATRIMONIO   ·  R$200k   ·  R$1.2M  ·  R$3.5M  ·       │
  │ PROCESSOS    ·····▬▬▬▬▬▬▬▬▬▬▬▬·····▬▬▬▬▬▬▬▬▬▬           │
  │ VOTACOES     ·   ✓   ✗   ·  ✓  ·  ✗  ·  ○  ·           │
  │ PROJETOS     ·  ●  ●  ·  ●  ·  ●●  ·  ●  ·             │
  │ GASTOS       ·  R$890k  ·  R$1.1M  ·  R$1.3M  ·        │
  └──────────────────────────────────────────────────────────┘
       2003  2006  2010  2014  2018  2022  2026
```

### 2.2 Interatividade

- **Hover/tap**: tooltip com detalhes do evento (datas exatas, valores, contexto)
- **Zoom**: pinch to zoom no mobile, scroll wheel no desktop, ou controles +/- para expandir faixa de anos
- **Filtro por camada**: toggles para ligar/desligar cada camada (cargos, partido, patrimonio, etc.)
- **Snap to event**: clicar num evento centraliza e expande detalhes
- **Link cruzado**: clicar num evento leva para a tab correspondente na ficha (ex: clicar em processo → tab Justica)

### 2.3 Responsividade

**Desktop (>1024px)**:

- Timeline horizontal completa
- Swim lanes empilhadas verticalmente
- Tooltip on hover

**Tablet (768-1024px)**:

- Timeline horizontal, swim lanes compactadas
- Tooltip on tap

**Mobile (<768px)**:

- Timeline VERTICAL (eixo temporal de cima pra baixo)
- Cada evento como card expandivel
- Swim lanes como filtros (chips no topo)
- Scroll natural do documento

### 2.4 Cores e tipografia

Usar sistema de cores ja existente no projeto (CSS variables):

- `--foreground` para texto
- `--border` para linhas
- `--secondary` para backgrounds neutros
- Cores semanticas: vermelho para processos graves, amarelo para atencao, verde para patrimonio positivo, azul para legislacao
- Fonte: `Inter` para labels, `Anton` para valores de destaque (mesmo padrao do site)

---

## 3. Integracao com a ficha existente

### 3.1 Onde entra

A timeline sera uma **nova tab** no `CandidatoProfile.tsx`, chamada "Timeline", posicionada como segunda tab (depois de "Visao Geral").

```typescript
// Novo tab definition
{ id: "timeline", label: "Timeline", dataCount: totalEventos },
```

Ordem atualizada das tabs:

1. Visao Geral
2. **Timeline** (nova)
3. Dinheiro
4. Justica
5. Votos
6. Trajetoria
7. Legislacao
8. Alertas

### 3.2 Dados

Nenhuma query nova necessaria. A `FichaCandidato` ja carrega TODOS os dados que a timeline precisa:

- `ficha.historico`
- `ficha.mudancas_partido`
- `ficha.patrimonio`
- `ficha.processos`
- `ficha.votos`
- `ficha.projetos_lei`
- `ficha.gastos_parlamentares`
- `ficha.financiamento` (ja na ficha; **lane da timeline opcional**, ver secao 1.9)

A timeline e uma **visualizacao diferente dos mesmos dados**, nao uma fonte nova.

### 3.3 Transformacao para eventos

Criar funcao que transforma `FichaCandidato` em lista unificada de eventos temporais:

```typescript
export type TimelineEventType =
  | "cargo"
  | "mudanca_partido"
  | "patrimonio"
  | "processo"
  | "votacao"
  | "projeto_lei"
  | "gasto_parlamentar"

export interface TimelineEvent {
  id: string
  type: TimelineEventType
  label: string                    // titulo curto
  description?: string             // detalhe para tooltip
  year_start: number               // ano de inicio (obrigatorio, para posicionar)
  year_end?: number                // ano de fim (para ranges)
  date?: string                    // data exata se disponivel (para posicao precisa dentro do ano)
  value?: number                   // valor monetario se aplicavel
  value_formatted?: string         // valor formatado (R$ 2,3M)
  severity?: "alta" | "media" | "baixa"  // para processos (espelha Processo.gravidade; "critica" existe em PontoAtencao, nao em Processo)
  date_unknown?: boolean             // processo (ou outro) sem data confiavel: nao fingir ano atual
  vote?: "sim" | "não" | "abstenção" | "ausente" | "obstrução"  // igual a VotoCandidato["voto"] em src/lib/types.ts
  contradicao?: boolean            // para votacoes
  destaque?: boolean               // para projetos de lei
  partido_anterior?: string        // para mudancas
  partido_novo?: string            // para mudancas
  contexto?: string                // contexto adicional
  tab_link?: string                // id da tab na ficha para cross-link
}

export interface TimelineRange {
  year_min: number
  year_max: number
}
```

### 3.4 Funcao de transformacao

```typescript
// src/lib/timeline-utils.ts

export function buildTimelineEvents(ficha: FichaCandidato): TimelineEvent[] {
  const events: TimelineEvent[] = []

  // Cargos → ranges
  for (const h of ficha.historico ?? []) {
    events.push({
      id: `cargo-${h.id}`,
      type: "cargo",
      label: `${h.cargo} (${h.partido ?? ficha.partido_sigla})`,
      description: h.observacoes ?? undefined,
      year_start: h.periodo_inicio,
      year_end: h.periodo_fim ?? undefined,
      tab_link: "trajetoria",
    })
  }

  // Mudancas de partido → pontos
  for (const m of ficha.mudancas_partido ?? []) {
    events.push({
      id: `partido-${m.id}`,
      type: "mudanca_partido",
      label: `${m.partido_anterior} → ${m.partido_novo}`,
      description: m.contexto ?? undefined,
      year_start: m.ano,
      date: m.data_mudanca ?? undefined,
      partido_anterior: m.partido_anterior,
      partido_novo: m.partido_novo,
      contexto: m.contexto ?? undefined,
      tab_link: "trajetoria",
    })
  }

  // Patrimonio → pontos com valor
  for (const p of ficha.patrimonio ?? []) {
    events.push({
      id: `patrimonio-${p.id}`,
      type: "patrimonio",
      label: `Patrimonio declarado`,
      value: p.valor_total,
      value_formatted: formatBRL(p.valor_total),
      year_start: p.ano_eleicao,
      tab_link: "dinheiro",
    })
  }

  // Processos → ranges ou pontos
  // Sem data_inicio: NUNCA usar ano corrente como fallback (misleading). Duas passagens ou pre-scan:
  // yearFallback = min(periodo_inicio dos cargos, ano_eleicao patrimonio, ...) ou constante editorial (ex.: 1990).
  for (const proc of ficha.processos ?? []) {
    const startDate = proc.data_inicio ? new Date(proc.data_inicio) : null
    const endDate = proc.data_decisao ? new Date(proc.data_decisao) : null
    const hasStart = Boolean(startDate && !Number.isNaN(startDate.getTime()))
    events.push({
      id: `processo-${proc.id}`,
      type: "processo",
      label: `${proc.tipo} (${proc.tribunal})`,
      description: proc.descricao,
      year_start: hasStart ? startDate!.getFullYear() : computeProcessYearFallback(ficha),
      year_end: endDate && !Number.isNaN(endDate.getTime()) ? endDate.getFullYear() : undefined,
      date: proc.data_inicio ?? undefined,
      date_unknown: !hasStart,
      severity: proc.gravidade,
      tab_link: "justica",
    })
  }
  // `computeProcessYearFallback(ficha)` = min dos anos ja conhecidos (cargos, patrimonio, mudancas, votos, PL, gastos); se nenhum, usar default editorial (ex.: 2000). Sempre com `date_unknown: true` na UI quando !hasStart.

  // Votacoes → pontos
  for (const v of ficha.votos ?? []) {
    if (!v.votacao) continue
    const voteDate = new Date(v.votacao.data_votacao)
    events.push({
      id: `voto-${v.id}`,
      type: "votacao",
      label: v.votacao.titulo,
      description: v.votacao.impacto_popular,
      year_start: voteDate.getFullYear(),
      date: v.votacao.data_votacao,
      vote: v.voto,
      contradicao: v.contradicao,
      tab_link: "votos",
    })
  }

  // Projetos de lei → pontos
  for (const pl of ficha.projetos_lei ?? []) {
    if (!pl.ano) continue
    events.push({
      id: `pl-${pl.id}`,
      type: "projeto_lei",
      label: `${pl.tipo} ${pl.numero ?? ""}/${pl.ano}`,
      description: pl.ementa ?? undefined,
      year_start: pl.ano,
      destaque: pl.destaque,
      tab_link: "legislacao",
    })
  }

  // Gastos parlamentares → pontos com valor
  for (const g of ficha.gastos_parlamentares ?? []) {
    events.push({
      id: `gasto-${g.id}`,
      type: "gasto_parlamentar",
      label: `Gastos parlamentares ${g.ano}`,
      value: g.total_gasto,
      value_formatted: formatBRL(g.total_gasto),
      year_start: g.ano,
      tab_link: "dinheiro",
    })
  }

  // Ordenar por year_start, depois por date se existir
  events.sort((a, b) => {
    if (a.year_start !== b.year_start) return a.year_start - b.year_start
    if (a.date && b.date) return a.date.localeCompare(b.date)
    return 0
  })

  return events
}

export function getTimelineRange(events: TimelineEvent[]): TimelineRange {
  if (events.length === 0) return { year_min: 2000, year_max: 2026 }
  const years = events.flatMap(e => [e.year_start, ...(e.year_end ? [e.year_end] : [])])
  return {
    year_min: Math.min(...years),
    year_max: Math.max(...years, new Date().getFullYear()),
  }
}
```

---

## 4. Arquitetura tecnica

### 4.1 Renderizacao

**Opcoes avaliadas**:


| Opcao             | Pros                                  | Contras                                      |
| ----------------- | ------------------------------------- | -------------------------------------------- |
| SVG puro (custom) | Controle total, sem dependencia, leve | Mais trabalho, zoom/pan manual               |
| Canvas (custom)   | Performance com muitos eventos        | Nao e acessivel, texto renderizado           |
| D3.js             | Maduro, flexivel, zoom nativo         | Bundle pesado (~100kb), curva de aprendizado |
| visx (Airbnb)     | React-native, composable, leve        | Menos features que D3                        |
| Recharts          | Simples para graficos basicos         | Nao e timeline, forcar seria gambiarra       |
| CSS puro + HTML   | Acessivel, leve, semantico            | Zoom/pan via JS manual, limitado visualmente |


**Decisao recomendada**: **SVG puro com GSAP para animacoes**. Motivos:

1. GSAP ja esta no projeto (core; zero dependencia nova para tweens basicos)
2. SVG e acessivel (`<title>`, `aria-label`, foco em elementos interativos)
3. Controle total sobre visual (alinhado com design editorial do site)
4. Quantidade de eventos por candidato e baixa (tipicamente 20-80), nao precisa de virtualizacao
5. Zoom/pan (Fase 3): preferir `**ScrollTrigger`** (incluido no pacote `gsap` npm) ou transform manual no container. **Nao assumir `Draggable`**: e plugin separado e pode exigir licenca Club GreenSock; o repo hoje so usa core GSAP (`timeline` etc.). Validar licenca antes de depender de Draggable.

**Para mobile (vertical)**: usar HTML/CSS puro (lista de cards com marcadores), nao SVG. Mais natural para scroll vertical.

### 4.2 Componentes

```
src/components/timeline/
  TimelineTab.tsx           → Container principal (switch desktop/mobile)
  TimelineDesktop.tsx       → SVG horizontal com swim lanes
  TimelineMobile.tsx        → Lista vertical de cards
  TimelineEvent.tsx         → Renderizacao de um evento (icone, label, tooltip)
  TimelineTooltip.tsx       → Tooltip com detalhes do evento
  TimelineFilters.tsx       → Toggles de camadas + range de anos
  TimelineLane.tsx          → Uma swim lane (cargos, processos, etc.)
  TimelineAxis.tsx          → Eixo temporal (anos)
```

### 4.3 Props do componente principal

```typescript
interface TimelineTabProps {
  ficha: FichaCandidato
  onTabNavigate: (tabId: string) => void  // callback para cross-link com tabs
}
```

### 4.4 State

```typescript
interface TimelineState {
  // Filtros de camada
  visibleLanes: Set<TimelineEventType>  // quais camadas estao visiveis

  // Range visivel
  yearRange: { min: number; max: number }  // zoom: faixa de anos visivel

  // Evento selecionado
  selectedEventId: string | null  // para tooltip/destaque

  // Mobile: filtro ativo
  activeMobileFilter: TimelineEventType | "all"
}

// Estado inicial: todas as camadas visiveis, range completo, nenhum selecionado
```

### 4.5 Acessibilidade

- Evitar `role="img"` no SVG inteiro se houver eventos interativos: pode agrupar demais e prejudicar leitura dos sub-elementos. Preferir **elementos focaveis** (`<button>` / `<a>`) por evento no desktop, ou lista semantica no mobile; SVG pode usar `aria-hidden` quando for puramente decorativo ao lado de controles HTML equivalentes.
- Se usar um SVG unico nao interativo: `role="img"` + `aria-label="Timeline politica de {nome_urna}"` e ok; entao duplicar acoes em camada HTML fora do SVG para teclado.
- Cada marco com `<title>` ou nome acessivel associado ao controle focavel
- Navegacao por teclado: Tab entre eventos, Enter para abrir tooltip
- Cores nunca como unico indicador: icones + labels + patterns para processos (hachura para grave)
- `prefers-reduced-motion`: desabilitar animacoes GSAP, transicoes instantaneas
- Contraste: todos os textos sobre fundo colorido com ratio minimo 4.5:1

### 4.6 Performance

- **Lazy rendering**: a tab Timeline so monta o SVG quando ativada (ja e o padrao das tabs existentes)
- **Memo**: `React.memo` no `TimelineDesktop` com comparacao de `ficha.id` (evita re-render quando muda tab e volta)
- **Eventos**: tipicamente 20-80 por candidato. Nao precisa de virtualizacao.
- **SVG size**: estimado ~15-50kb de markup SVG por candidato. Nao e problema.

---

## 5. Detalhamento visual por tipo de evento

### 5.1 Cargos (range bars)

```
Representacao SVG:
  ┌─────────────────────────┐
  │ Deputado Federal (PT)   │  ← rect com border-radius, label dentro
  └─────────────────────────┘
  2003                    2010

Cor: --foreground com opacity 0.15 (fundo) + --foreground (texto)
Altura: 28px
Se periodo_fim = null: barra se estende ate o ano atual com borda tracejada no final
```

### 5.2 Mudancas de partido (markers)

```
Representacao SVG:
        │
        ◆  PSB → PL
        │

Cor: amber-500 (atencao)
Icone: losango (diferencia de outros pontos)
Tooltip: contexto ("janela partidaria"), data exata se disponivel
```

### 5.3 Patrimonio (pontos com valor)

```
Representacao SVG:
   R$200k ─── R$1.2M ─── R$3.5M
     ●          ●           ●
   2014       2018        2022
              (+500%)     (+192%)

Cor: emerald-600 (se cresceu), neutral (se estavel), red (se diminuiu? raro)
Linha conectando pontos: sparkline de evolucao
Variacao percentual entre pontos adjacentes
```

### 5.4 Processos (range bars coloridas)

```
Representacao SVG:
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  Criminal, STF, em andamento
  2015                  2026

Cor por gravidade (alinhar a `Processo.gravidade`: alta | media | baixa):
  alta: red-600/red-500 (hachura diagonal para acessibilidade)
  media: amber-500
  baixa: neutral-400

Barra tracejada se em andamento (sem data_decisao)
Barra solida se encerrado
Badge de status: "condenado" (vermelho), "absolvido" (verde), "prescrito" (cinza)
```

### 5.5 Votacoes (markers com icone)

```
Representacao SVG:
   ✓ Reforma Trabalhista    ✗ PEC do Teto    ○ Marco Temporal

Icones (mapear os literais de `v.voto`):
  sim: checkmark verde
  não: X vermelho
  abstenção: circulo vazio cinza
  ausente: circulo tracejado cinza
  obstrução: circulo com barra cinza escuro

Contradicao: borda amarela pulsante (GSAP) + badge "Contradicao"
```

### 5.6 Projetos de lei (markers)

```
Representacao SVG:
   ● PL 1234/2019 (trabalho)

Cor:
  destaque: blue-600 (preenchido)
  normal: blue-300 (outline)

Agrupamento: se > 3 PLs no mesmo ano, colapsar em "7 projetos" com expand
```

### 5.7 Gastos parlamentares (markers com valor)

```
Representacao SVG:
   R$890k    R$1.1M    R$1.3M
     ●         ●         ●
   2019      2020      2021

Cor: neutral-500
Linha conectando pontos: tendencia de gastos
Top categoria no tooltip: "Divulgacao (42%), Passagens (23%)"
```

---

## 6. Interacoes detalhadas

### 6.1 Tooltip

Ao hover (desktop) ou tap (mobile):

```
┌──────────────────────────────────────┐
│ ● Criminal, STF                      │
│                                      │
│ Lavagem de dinheiro e corrupcao      │
│ passiva em conexao com...            │
│                                      │
│ Inicio: 15/03/2015                   │
│ Status: em andamento                 │
│ Gravidade: alta                      │
│                                      │
│ [Ver na tab Justica →]               │
└──────────────────────────────────────┘
```

- Posicao: acima do evento (desktop), drawer de baixo (mobile)
- Fecha: click fora, Esc, ou tap em outro evento
- Link "Ver na tab X" chama `onTabNavigate(tabId)` e faz scroll

### 6.2 Zoom e pan

Comportamento completo abaixo = **Fase B**. No **v1**, pode-se usar apenas scroll horizontal nativo no container da timeline (sem wheel zoom) para nao bloquear o lancamento.

**Desktop**:

- Scroll wheel: zoom in/out no eixo temporal
- Click + drag: pan horizontal
- Botoes +/- no canto (fallback para trackpad sem scroll)
- Double-click: zoom to fit em 5 anos ao redor do ponto clicado
- Botao "Ver tudo": reset para range completo

**Mobile**:

- Layout vertical, nao precisa de zoom/pan
- Scroll nativo do documento
- Filtros por tipo de evento no topo

### 6.3 Filtros de camada

Toggle buttons no topo da timeline:

```
[■ Cargos] [■ Partido] [■ Patrimonio] [□ Processos] [■ Votacoes] [□ PLs] [□ Gastos]
```

- Default: todas ligadas
- Click: toggle visibilidade
- Estado persiste enquanto a tab estiver aberta (nao entre candidatos)
- Cada toggle tem icone + label + contagem: "Processos (3)"

### 6.4 Cross-linking com tabs

Cada evento tem `tab_link` que aponta para a tab correspondente. Ao clicar "Ver na tab X":

1. Muda `activeTab` para o tab indicado
2. Faz scroll suave ate a secao correspondente
3. Se possivel, destaca o item especifico (ex: processo especifico na tab Justica)

---

## 7. Empty states e edge cases

### 7.1 Candidato sem historico

Se `buildTimelineEvents()` retorna 0 eventos:

- Mostrar `EmptyState` padrao: "Sem dados temporais disponiveis para montar a timeline"
- Sugerir navegacao para tabs que tem dados

### 7.2 Candidato com apenas 1 tipo de evento

Timeline funciona mas perde valor visual. Considerar:

- Se so tem cargos: timeline basica, mas ainda util para ver duracao
- Mostrar hint: "Dados parciais. Confira as tabs individuais para mais detalhes."

### 7.3 Eventos sem data precisa

- `periodo_inicio` e obrigatorio em cargos: ok
- `data_mudanca` pode ser null em mudancas: usar `ano` como fallback (posicionar no meio do ano)
- `data_inicio` pode ser null em processos: **nao** usar ano corrente como posicao factual; usar fallback derivado do restante da ficha (min dos anos conhecidos) ou ano editorial minimo, com `date_unknown: true` e badge "data desconhecida" / "posicao aproximada"
- `ano` pode ser null em projetos de lei: excluir da timeline (sem posicao temporal, nao faz sentido)

### 7.4 Muitos eventos sobrepostos

Se > 5 eventos no mesmo ano na mesma lane:

- Agrupar em cluster: "5 projetos de lei em 2019" com expand on click
- Evitar sobreposicao de labels (collision detection simples: verificar overlap de bounding boxes)

### 7.5 Range temporal muito amplo

Candidatos com 30+ anos de carreira (ex: Lula, Sarney):

- Default zoom: ultimos 20 anos (Fase B, quando houver zoom/pan)
- Botao "Ver carreira completa" para expandir (Fase B)
- Mini-map no topo mostrando range total com indicador de viewport visivel (Fase B)

No v1, o eixo pode mostrar a carreira inteira com scroll horizontal no container ou compressao visual; evitar prometer mini-map/zoom antes da Fase B.

---

## 8. Fases de implementacao

### Fase A: Lancamento (v1 da feature)

Uma unica entrega no ar: a tab Timeline como produto, nao como versao reduzida para validar hipotese.

**Escopo**:

- `timeline-utils.ts` com `buildTimelineEvents()`, `computeProcessYearFallback`, types e **testes unitarios**
- `TimelineTab.tsx` (container desktop/mobile)
- **Desktop**: SVG horizontal com **todas** as swim lanes: cargos (ranges), mudanca de partido (marcadores), patrimonio (pontos), processos (ranges/pontos), votacoes (marcadores), projetos de lei (marcadores; default `destaque` colapsavel conforme secao 1.6), gastos por ano (marcadores)
- **Mobile**: lista vertical de cards ordenados por data, filtros por tipo (chips)
- **Filtros de camada** (toggles com contagem)
- **Tooltip rico** (hover/tap) com link "Ver na tab X"
- **Cross-linking** com `onTabNavigate` / `setActiveTab` em `CandidatoProfile.tsx`
- Contradicoes em votacoes destacadas; agrupamento basico quando > 5 eventos no mesmo ano na mesma lane (cluster expandivel)
- Tab "Timeline" como segunda tab (apos Visao Geral), como na secao 3.1

**Fora do v1 original** (ainda valido como limite de produto): lane de financiamento (secao 1.9), pontos de atencao sem data factual. **Nota:** zoom/pan, minimap, sparkline, share PNG e animacoes foram entregues na Fase B (ver log secao 16); o texto antigo do PRD nao foi apagado para preservar historico de decisao.

**Criterio de done**: v1 validada em 3+ fichas com dados heterogeneos (cargos + partidos + patrimonio + processos + votos + PL + gastos quando existirem). Mock: slugs `lula`, `flavio-bolsonaro`, `ciro-gomes`. Supabase: tres candidatos com cobertura mista. Mobile funcional. **Acessibilidade**: foco/teclado nos eventos interativos (ver secao 4.5). Testes em `buildTimelineEvents` (votacao sem join, processo sem data, PL sem ano, ordenacao).

### Fase B: Incrementos (pos-lancamento)

Melhorias que nao bloqueiam o lancamento da tab.

**Escopo**:

- Zoom/pan no eixo temporal (desktop; ScrollTrigger ou implementacao manual)
- Mini-map para carreiras longas (alinhar a secao 7.5)
- Sparkline de patrimonio / tendencia de gastos no proprio SVG
- Animacao de entrada (GSAP stagger) com `prefers-reduced-motion`
- Share: screenshot (html2canvas) ou OG image dedicada

---

## 9. Riscos e mitigacoes


| Risco                                                   | Mitigacao                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| SVG complexo demais, difícil de manter                  | Componentizar cada lane e tipo de evento; funcoes puras para calculo de posicao                              |
| Mobile com muitos eventos fica scroll infinito          | Colapsar por decada, expandir on demand; limitar a 50 eventos visiveis                                       |
| Eventos sem data precisa ficam mal posicionados         | Badge "data aproximada", posicionar no meio do ano, tooltip explica                                          |
| Overlap de labels em anos com muitos eventos            | Collision detection basico; agrupar em clusters                                                              |
| GSAP scroll interactions conflitam com scroll da pagina | Conter zoom/pan dentro do container SVG, nao capturar scroll global                                          |
| Dados de processos incompletos (sem data_inicio)        | Fallback de ano a partir do restante da ficha + `date_unknown` + badge; nunca implicar "aconteceu neste ano" |
| Timeline vazia para candidatos novos                    | Empty state informativo, sugerir tabs                                                                        |


---

## 10. Metricas de sucesso

Metas **aspiracionais**; exigem instrumentacao (Vercel Analytics, eventos custom, etc.) que nao faz parte do escopo tecnico deste plano ate ser definida no produto.

- **Adocao**: % de visitantes da ficha que abrem a tab Timeline
- **Tempo na tab**: tempo medio gasto na timeline vs outras tabs
- **Interacao**: cliques em tooltip, uso de filtros, cross-links para outras tabs
- **Discovery**: cliques na timeline que levam a tabs que o usuario nao visitaria sozinho (processos, votacoes)

---

## 11. Dependencias

### Bloqueantes para lancamento (v1 / Fase A)

- Nenhuma dependencia de dados nova (tudo ja carregado na `FichaCandidato`)
- Breakpoint mobile (768px sugerido, alinhar com Navbar existente)
- Verificar cobertura de `data_votacao` nas votacoes-chave existentes
- Verificar cobertura de `data_mudanca` nas mudancas de partido

### Bloqueantes para Fase B (incrementos)

- Validar performance de zoom/pan (ScrollTrigger ou implementacao manual) em SVG com 50+ elementos
- Confirmar disponibilidade/licenca se optar por GSAP Draggable (nao assumir como incluso)
- Testar html2canvas ou alternativa para share de timeline

---

## 12. Estimativa de arquivos

### Fase A (lancamento v1): ~12 arquivos (inclui testes)

```
src/lib/timeline-utils.ts                    (novo, types + buildTimelineEvents + computeProcessYearFallback)
src/components/timeline/TimelineTab.tsx       (novo, container principal)
src/components/timeline/TimelineDesktop.tsx   (novo, SVG horizontal, todas as lanes)
src/components/timeline/TimelineMobile.tsx    (novo, lista vertical)
src/components/timeline/TimelineTooltip.tsx   (novo, tooltip + link para tab)
src/components/timeline/TimelineFilters.tsx   (novo, toggles de camada)
src/components/timeline/TimelineLane.tsx      (novo, swim lane individual)
src/components/timeline/TimelineEvent.tsx     (novo, renderizacao de evento)
src/components/timeline/TimelineAxis.tsx      (novo, eixo temporal)
src/components/CandidatoProfile.tsx           (editar, tab + cross-link)
tests/timeline-utils.test.ts                  (novo, buildTimelineEvents + edge cases)
```

### Fase B (incrementos): ~3 arquivos adicionais

```
src/components/timeline/TimelineMinimap.tsx    (novo)
src/components/timeline/TimelineSparkline.tsx  (novo, evolucao patrimonial)
src/components/timeline/TimelineDesktop.tsx    (editar, zoom/pan)
```

---

## 13. Sequencia SDD recomendada

Feature cabe em `/sdd-research` > `/sdd-implement` (~12 arquivos na Fase A, concerns acoplados). **Nao lancar tab ao publico com subset de camadas**; ordem abaixo e de implementacao interna, nao de release incremental.

```
/sdd-research (ja feito: este documento e o PRD)
    |
    v
/sdd-implement (Fase A completa antes do merge):
    1. timeline-utils.ts + tests/timeline-utils.test.ts
    2. TimelineAxis + TimelineLane + TimelineEvent (primitivas)
    3. TimelineDesktop (todas as lanes) + TimelineFilters + TimelineTooltip
    4. TimelineMobile + TimelineTab (container)
    5. CandidatoProfile.tsx (tab + cross-link)
    6. Smoke test visual com 3+ candidatos e revisao a11y
```

Fase B pode ser issue(s) separada(s) apos o lancamento da v1.

Nao precisa de `/sdd-break` se uma pessoa/branch segue a sequencia acima; use `/sdd-break` apenas se paralelizar lanes entre pessoas.

---

## 14. Referencia visual

Timelines editoriais que servem de inspiracao (nao copiar, adaptar ao tom do PuxaFicha):

- **ProPublica "Represent"**: timeline de votos de congressistas americanos
- **The Guardian "Political timeline"**: eventos politicos com swim lanes
- **Politifact "On the record"**: declaracoes vs votos ao longo do tempo
- **Wikipedia infobox "Political career"**: simples mas eficaz

O diferencial do PuxaFicha: nao e so cargos e votos; e **patrimonio + processos + (futuro) financiamento e demais camadas de dinheiro** no mesmo eixo. Ate a lane de financiamento existir na UI, comunicar o diferencial com base no que a timeline ja mostra (ver secao 1.9).

---

## 15. Auditoria externa pos-implementacao

**Documento**: `[docs/audit-timeline-2026-04-04.md](../audit-timeline-2026-04-04.md)` (revisao independente apos Fase A).

**Posicao do time**: concordamos com os **6 findings** (P1 a P6). Resumo:


| ID  | Severidade | Tema                                                               | Acao                                                                                   |
| --- | ---------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| P1  | Media      | Label de cargo sem fallback se `partido` vazio/null                | Ajustar `buildTimelineEvents` (alinhar ao plano: `partido` + fallback `partido_sigla`) |
| P2  | Baixa      | Interface com `anchorRef` morto                                    | Substituir por `TimelineTooltipPanelProps` (sem `anchorRef`)                           |
| P3  | Baixa      | `laneY` usa indice no array global de tipos, nao so lanes visiveis | Compactar SVG quando filtros ocultam camadas                                           |
| P4  | Baixa      | `viewBox` / `axisY` fixos em 7 lanes                               | Derivar altura de `visibleLanes.size`                                                  |
| P5  | Info       | `ev.contradicao` em `mudanca_partido` (sempre falso)               | Remover ramo morto no losango                                                          |
| P6  | Info       | Testes sem gastos / mudanca / cargo aberto                         | Estender `tests/timeline-utils.test.ts`                                                |


**Checks citados na auditoria** (`tsc`, `timeline-utils` tests, `next lint`): tratados como gate apos cada correcao.

---

## 16. Log de execucao (auditoria)

Entradas em ordem cronologica. Cada passo indica **o que**, **onde** e **como** foi feito para revisao posterior.

### 2026-04-04 — Sessao de implementacao (agente Cursor)

1. **Objetivo**: executar a **Fase A** do plano (tab Timeline v1 com todas as camadas centrais, filtros, tooltip, cross-link), sem a **Fase B** (zoom/pan GSAP, minimap, sparkline, share, animacoes stagger).
2. `**src/lib/timeline-utils.ts` (novo)**
  - **O que**: tipos `TimelineEvent`, `TimelineEventType`, `TimelineVote`, helpers `TIMELANE_LABELS`, `TIMELINE_TAB_LABELS`, `TIMELINE_EVENT_TYPES`, `buildTimelineEvents`, `computeProcessYearFallback`, `getTimelineRange`, `countEventsByType`.  
  - **Como**: `buildTimelineEvents` percorre `FichaCandidato` na ordem do plano; votos sem `votacao` join sao ignorados; PL sem `ano` ignorados; processos sem `data_inicio` usam `computeProcessYearFallback` (somente fontes nao-processuais) + `date_unknown: true`; valores de voto com acentos iguais a `types.ts`; gastos com texto de maior rubrica em `description`; patrimonio com variacao percentual opcional em `description`.  
  - **Por que**: alinhar ao plano revisado e a auditoria de tipos.
3. `**tests/timeline-utils.test.ts` (novo)**
  - **O que**: testes com `node:test` + `fichaStub()` minimo.  
  - **Cobertura**: fallback de processo, fallback 2000, voto sem join, PL sem ano, `date_unknown`, ordenacao patrimonio, `getTimelineRange`.  
  - **Como**: `npm test` (inclui suite global do repo).
4. `**src/components/timeline/TimelineAxis.tsx` (novo)**
  - **O que**: eixo horizontal de anos no SVG (ticks espacados por amplitude temporal).  
  - **Como**: `useMemo` para lista de ticks; linha base + labels.
5. `**src/components/timeline/TimelineLane.tsx` (novo)**
  - **O que**: rotulo da swim lane a esquerda + linha divisoria; `chartRight` numerico para `x2` da linha (evita `x2="100%"` invalido no SVG).
6. `**src/components/timeline/TimelineEventPrimitives.tsx` (novo)**
  - **O que**: `voteAbbrev`, `processSeverityFill`, `laneMarkerColor`.  
  - **Nota**: substitui o nome de arquivo `TimelineEvent.tsx` do plano para nao colidir com o tipo `TimelineEvent`; responsabilidade e a mesma (icone/cores por tipo).
7. `**src/components/timeline/TimelineTooltip.tsx` (novo)**
  - **O que**: painel com detalhes + botao "Ver em {tab}" + Fechar.  
  - **Como**: `TimelineTooltipPanel` (sem posicionamento flutuante ao cursor: painel fixo abaixo da visualizacao quando ha evento selecionado, mais simples e auditavel).
8. `**src/components/timeline/TimelineFilters.tsx` (novo)**
  - **O que**: toggles por `TimelineEventType` com contagem total da ficha; checkbox "Mostrar todos os projetos de lei" quando ha PLs.  
  - **Como**: PLs sem destaque filtrados no `TimelineTab` ate marcar o checkbox.
9. `**src/components/timeline/TimelineDesktop.tsx` (novo)**
  - **O que**: SVG `viewBox` fixo, scroll horizontal no container; uma lane por tipo visivel; barras para `cargo` e `processo`; marcadores para demais tipos; losango para `mudanca_partido`.  
  - **Cluster**: se mais de 5 eventos no mesmo `(tipo, ano)`, mostra retangulo `N+` que expande ao clique (estado local `expandedClusters`).  
  - **A11y**: `aria-label` na timeline; elementos interativos com `role="button"`, `tabIndex={0}`, Enter/Espaco.  
  - **Nao feito (Fase B)**: zoom por wheel, minimap, sparkline embutida.
10. `**src/components/timeline/TimelineMobile.tsx` (novo)**
  - **O que**: lista de botoes (cards) ordenada do ano mais recente para o mais antigo; mesmo `selectedId` que desktop.  
    - **Breakpoint**: tab container usa `lg:` como no plano (~1024px).
11. `**src/components/timeline/TimelineTab.tsx` (novo)**
  - **O que**: estado `visibleLanes`, `showAllProjects`, `selectedId`; filtra `events`; composicao Filters + Desktop/Mobile + painel de detalhe; empty state com `suggest` opcional.  
    - **Como**: `SectionLabel` / `SectionTitle` alinhados ao restante da ficha.
12. `**src/components/CandidatoProfile.tsx` (editado)**
  - **O que**: `buildTimelineEvents(ficha)` uma vez por render; tab `timeline` em segundo lugar; `dataCount` = numero de eventos brutos; bloco `activeTab === "timeline"` com `TimelineTab` e `suggestFor("timeline")`.
13. **Verificacao**
  - `npm run lint` — sem erros.  
    - `npm run build` (Next 15 Turbopack) — sucesso, 175 paginas estaticas.  
    - `npm test` — todas as suites, inclusive `timeline-utils`.

### Pendencias explicitas (Fase B ou follow-up) — historico

- ~~Zoom/pan, minimap, sparkline, animacao stagger, share (html2canvas)~~: entregue.  
- ~~OG dedicada da rota `/timeline` + metadata~~: entregue (`timeline/page.tsx`, `timeline/opengraph-image.tsx`).  
- ~~Arquivo `TimelineEvent.tsx`~~: entregue (substitui `TimelineEventPrimitives.tsx`).  
- ~~Tooltip flutuante (desktop)~~: entregue (`TimelineTooltipFloating`); mobile em folha inferior.  
- ~~`ProfileOverview` CTA para tab Timeline~~: entregue.  
- **Iteracoes opcionais restantes:** tooltip rigidamente colado ao cursor (hoje ancora no marcador + fallback); lane financiamento; pontos de atencao com data.

### 2026-04-04 — Correcoes pos-auditoria (agente Cursor)

**Referencia**: secao 15 deste plano + `[docs/audit-timeline-2026-04-04.md](../audit-timeline-2026-04-04.md)`.

1. `**src/lib/timeline-utils.ts`** — **P1**: label de cargo com partido efetivo `h.partido?.trim() || ficha.partido_sigla` (cobre string vazia/espacos, alem de null/undefined do `??` original do plano); se ainda vazio, so `h.cargo` (sem parenteses vazios).
2. `**src/components/timeline/TimelineTooltip.tsx`** — **P2**: interface renomeada para `TimelineTooltipPanelProps` (sem `anchorRef`); componente tipado diretamente.
3. `**src/components/timeline/TimelineDesktop.tsx`** — **P3/P4**: `visibleLaneTypes = TIMELINE_EVENT_TYPES.filter(t => visibleLanes.has(t))`; `laneY` e `axisY` / `vbHeight` usam `visibleLaneTypes.length`. **P5**: losango `mudanca_partido` sem `ev.contradicao`; apenas `strokeWidth` por selecao.
4. `**tests/timeline-utils.test.ts`** — **P6**: testes para (a) cargo com `partido` vazio + fallback `partido_sigla`, (b) mudanca de partido, (c) gastos com `detalhamento` e texto de maior rubrica, (d) cargo com `periodo_fim: null` e `year_end` indefinido no evento.
5. **Verificacao** (executado apos o pacote): `npm run lint` OK; `npm test` OK (suite `timeline-utils` com **11** testes, era 7 antes de P6); `npm run build` OK (175 rotas).

### 2026-04-04 — Fase B parcial + hardening (agente Cursor)

1. `**TimelineSparkline.tsx` (novo)**
  - Mini polyline SVG para patrimonio e gastos no desktop, alinhada ao viewport (anos visiveis).
2. `**TimelineDesktop.tsx`**
  - Viewport **Ultimos 20 anos** vs **carreira completa** quando amplitude > 20 anos; barras e marcadores recortados ao intervalo visivel; sparklines nas lanes de patrimonio e gastos.  
  - **Reset ao trocar candidato**: `resetViewportKey` (slug) via `useEffect` + `eventsRef` (evita setState durante render e nao reseta ao mudar so filtros).
3. `**TimelineTab.tsx`**
  - Passa `resetViewportKey={ficha.slug}` para `TimelineDesktop`.
4. `**ProfileOverview.tsx**`
  - Card com CTA **Abrir Timeline** quando `buildTimelineEvents(ficha).length > 0`, chamando `onNavigateTab("timeline")`.
5. ~~**Pendente na Fase B**~~: minimap, zoom e share entregues na entrada **Fase B conclusao** abaixo. ~~OG dedicada~~: entregue na rota `/timeline` (ver log posterior e estado atual no topo do doc).
6. **Verificacao** (rodada desta sessao): `npm run lint` OK; `npm test` OK (**32** testes no agregado do repo); `npm run build` OK (175 paginas estaticas, Next 15.5.14 Turbopack).

### 2026-04-04 — Animacao de entrada timeline (Fase B, agente Cursor)

**Prioridade escolhida**: animacao de entrada antes de minimap/zoom (escopo fechado, alinhado ao GSAP do projeto e a acessibilidade).

1. `**TimelineDesktop.tsx`** — `useLayoutEffect` + `gsap.context` + `gsap.fromTo` em grupos `.js-timeline-intro-item` (eixo + uma camada por lane visivel): `autoAlpha` + `y` leve, stagger curto, `ease: power2.out`. Dispara ao mudar `resetViewportKey` (candidato) ou `viewportMode` (ultimos 20 / carreira completa). Cleanup com `ctx.revert()`.
2. `**usePrefersReducedMotion()**` — quando reduzido, o efeito nao roda; timeline permanece estatica (mesmo padrao de `Navbar`, `BrazilMap`).
3. `**TimelineLane.tsx**` — prop opcional `className` no `<g>` raiz para marcar alvos de animacao.
4. `**TimelineMobile.tsx**` — prop `introKey` (slug); `useLayoutEffect` com stagger nos `li` da lista (`:scope > li`), mesma regra de movimento reduzido.
5. `**TimelineTab.tsx**` — passa `introKey={ficha.slug}` ao mobile.
6. **Verificacao**: `npm run lint`, `npm test`, `npm run build` OK apos as mudancas.

### 2026-04-04 — Fase B conclusao: minimap, zoom/pan, export PNG (agente Cursor)

**Objetivo**: fechar o escopo de Fase B do plano (secao 8): minimap, zoom no eixo, share por captura.

1. `**src/lib/timeline-utils.ts`** — `clampTimeWindow()` para manter `[viewMin, viewMax]` dentro de `[extentMin, extentMax]` com span minimo coerente.
2. `**tests/timeline-utils.test.ts**` — quatro testes para `clampTimeWindow`.
3. `**TimelineMinimap.tsx` (novo)** — trilha proporcional a carreira inteira; retangulo = janela visivel; clique na trilha centraliza a janela no ano; arrastar o retangulo faz pan; `pointercapture` + ref de drag para primeiro `pointermove` confiavel.
4. `**TimelineDesktop.tsx`** — estado `windowOverride` opcional sobre os presets (ultimos 20 / carreira completa); derivacao de `viewMin`/`viewMax` via `clampTimeWindow`; **Ctrl ou Cmd + rolagem** na regiao do grafico (`role="region"`, `tabIndex={0}`) para zoom (sem roubar rolagem da pagina quando a modificadora nao esta pressionada); botoes **Redefinir zoom**, presets limpam override; minimap acoplado acima dos controles.
5. `**TimelineExportButton.tsx` (novo)** — import dinamico de `**html2canvas`**; gera PNG dos filtros + desktop timeline; nome de arquivo `puxaficha-timeline-{slug}.png`.
6. `**package.json**` — dependencia `html2canvas`.
7. `**TimelineTab.tsx**` — `ref` no bloco exportavel (filtros + desktop dentro de card com borda); botao **Baixar PNG** visivel em `lg+` acima do card.
8. **Fora de escopo desta entrega (na epoca)**: ScrollTrigger (zoom manual sem plugin). **Atualizacao posterior:** OG e rota dedicada `/timeline` foram adicionados; PNG continua como opcao de compartilhamento visual.
9. **Verificacao**: `npm test` (inclui novos testes de `clampTimeWindow`); `npm run lint` OK; `npx tsc -p tsconfig.json --noEmit` OK. Build Next completo pode falhar em paginas nao relacionadas conforme ambiente (ex.: prerender com dados).

### 2026-04-04 — P7: wheel nao-passivo (auditoria Claude)

**Problema**: `onWheel` no React 19 tende a listener **passivo**; `preventDefault()` nao impede zoom nativo do browser junto com o zoom da timeline.

**Fix**: em `TimelineDesktop.tsx`, remover `onWheel` do JSX; `ref` no `role="region"`; `useEffect` registra `wheel` com `{ passive: false }` e remove no cleanup. Ver `docs/audit-timeline-2026-04-04.md` (P7).