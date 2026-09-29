"use client"

// cspell:words variacao representacoes representacao etica

import { useLayoutEffect, useRef } from "react"
import Link from "next/link"
import type {
  GastoExecutivo,
  FichaCandidato,
  Financiamento,
  GastoParlamentar,
  HistoricoPolitico,
  Patrimonio,
  Processo,
  VotoCandidato,
} from "@/lib/types"
import { buildDoadorReverseHref } from "@/lib/doador-reverse-shared"
import {
  resolvePatrimonioEleicoes,
  type PatrimonioEleicaoPublico,
} from "@/lib/public-profile-dto"
import {
  formatHistoricoCargoTituloPublico,
  formatHistoricoObservacaoPublica,
  formatHistoricoPeriodoDisplay,
} from "@/lib/historico-display"
import { prepareHistoricoPoliticoPublicDisplayList } from "@/lib/trajetoria-public-display"
import { formatFinanciamentoPleitoPublicLabelForRow } from "@/lib/financiamento-pleito-public-label"
import { FormattedNumber } from "./FormattedNumber"
import { PatrimonioChart } from "./BarChart"
import { DonutChart } from "./DonutChart"
import { ChevronRight } from "lucide-react"
import { ContradictionsHighlight } from "@/components/ContradictionsHighlight"
import { PatrimonioEvolucaoAlerta } from "@/components/PatrimonioEvolucaoAlerta"
import { isContradictionAttentionCategory } from "@/lib/attention-points"
import { MetaBadge } from "./MetaBadge"
import { ProcessoPublicGroupSurface } from "./ProcessoPublicSurface"
import { OverviewCountBadge } from "./OverviewCountBadge"
import {
  getRepresentacoesEticaAprovadas,
  representacaoTitulo,
  type RepresentacaoEticaAprovada,
} from "@/lib/representacoes-etica"
import { FASE_REPRESENTACAO_LABEL } from "@/lib/representacoes-etica-fase"
import {
  contarProcessosJustica,
  PROCESSO_DISCIPLINAR_AVISO,
  recorteProcessosJustica,
} from "@/lib/processos-justica-total"
import { formatDate } from "@/lib/utils"
import {
  FINANCING_COLOR_BY_KEY,
  fixedCopy,
  formatFinancingLabel,
  formatPatrimonioEleicaoEstadoLabel,
  formatProcessStatusLabel,
  formatProcessSummaryLabel,
  formatProcessTypeLabel,
  formatPublicLabel,
  formatVoteBadgeLabel,
  formatVoteNote,
} from "@/lib/ui-labels"
import { financiamentoPleitoSubtitulo } from "@/lib/financiamento-pleito-display"
import { buildFinancingComposition } from "@/lib/financiamento-display"
import {
  groupProcessosForDisplay,
  isProcessStatusNeutral,
  isTerminalProcessStatus,
  processoBorderColor,
  processoFonteLabel,
  processStatusRepeatsDescription,
  urlPublicaDoProcesso,
} from "@/lib/processos-display"
import {
  groupGastosExecutivoPorOrgao,
  pickOrgaoMaisRecente,
} from "@/lib/gastos-executivo-display"
import { buildCandidateSiteLinks } from "@/lib/candidate-sites"
import { validarDataDeVerificacao } from "@/lib/verificacao-campos"
import { CandidateSitesCard } from "./CandidateSitesCard"
import {
  estadoValorPatrimonio,
  patrimonioMaisRecenteSemEscolhaArbitraria,
  patrimonioPorAnoSemAmbiguidade,
  patrimonioTemValorComparavel,
  patrimonioValorEstadoLabel,
  variacaoPatrimonialPct,
} from "@/lib/patrimonio-contexto"

/* ─── Pure helpers ──────────────────────────────────── */

type FinancingSegment = { label: string; value: number; color: string }

type PatrimonioSummary = {
  sorted: Patrimonio[]
  latest: Patrimonio | null
  earliest: Patrimonio | null
  growthPct: number | null
  latestYear: number | null
  latestCount: number
}

function getPatrimonioSummary(patrimonio: Patrimonio[]): PatrimonioSummary {
  const sorted = patrimonioPorAnoSemAmbiguidade(patrimonio)
  const latestContext = patrimonioMaisRecenteSemEscolhaArbitraria(patrimonio)
  const latest = latestContext.patrimonio
  const earliest = sorted.length > 1 ? sorted[0] : null
  const growthPct = latest && earliest ? variacaoPatrimonialPct(earliest, latest) : null
  return { sorted, latest, earliest, growthPct, latestYear: latestContext.ano, latestCount: latestContext.quantidade }
}

function getLatestFinancing(financiamento: Financiamento[]): Financiamento | null {
  if (financiamento.length === 0) return null
  return [...financiamento].sort((a, b) => b.ano_eleicao - a.ano_eleicao)[0]
}

function getLatestSpending(gastos: GastoParlamentar[]): GastoParlamentar | null {
  if (gastos.length === 0) return null
  return [...gastos].sort((a, b) => b.ano - a.ano)[0]
}

function getFinancingSegments(latestFin: Financiamento | null): FinancingSegment[] {
  if (!latestFin) return []
  const composition = buildFinancingComposition(latestFin)
  if (!composition.chartIsSafe) return []
  return composition.segments.map(({ key, value }) => ({
    label: formatFinancingLabel(key),
    value,
    color: FINANCING_COLOR_BY_KEY[key],
  })).filter((segment) => segment.value > 0)
}

function hasOverviewData(ficha: FichaCandidato): boolean {
  return (
    buildCandidateSiteLinks({
      sites: ficha.sites_candidato?.sites,
    }).length > 0 ||
    (ficha.patrimonio?.length ?? 0) > 0 ||
    resolvePatrimonioEleicoes(ficha).length > 0 ||
    (ficha.financiamento?.length ?? 0) > 0 ||
    (ficha.processos?.length ?? 0) > 0 ||
    (ficha.votos?.length ?? 0) > 0 ||
    (ficha.historico?.length ?? 0) > 0 ||
    (ficha.pontos_atencao?.length ?? 0) > 0 ||
    (ficha.projetos_lei?.length ?? 0) > 0 ||
    (ficha.legislacao_mandato_executivo?.length ?? 0) > 0 ||
    (ficha.gastos_parlamentares?.length ?? 0) > 0 ||
    (ficha.gastos_executivo?.length ?? 0) > 0
  )
}

function formatCareerTeaserObservation(observacoes: string | null | undefined): string | null {
  const formatted = formatHistoricoObservacaoPublica(observacoes)
  if (!formatted) return null

  const trimmed = formatted.trim()
  if (/^ELEITO \(TSE \d{4}\)$/i.test(trimmed)) return null

  return trimmed
}

/** Valor do teaser; zero degenerado vira rótulo, nunca "R$ 0" sem contexto. */
function PatrimonioTeaserValor({
  patrimonio,
  as: Tag = "p",
  className = "",
}: {
  patrimonio: Patrimonio
  as?: "p" | "span"
  className?: string
}) {
  const estado = estadoValorPatrimonio(patrimonio)
  const rotulo = patrimonioValorEstadoLabel(estado)
  return (
    <Tag
      data-pf-patrimonio-valor-estado={estado}
      className={`font-heading text-[length:var(--text-heading-sm)] leading-none tracking-tight text-foreground ${className}`.trim()}
    >
      {estado === "valor_nao_informado" ? rotulo : <FormattedNumber value={patrimonio.valor_total} />}
      {estado !== "valor_informado" && estado !== "valor_nao_informado" && rotulo && (
        <span className="mt-1 block font-sans text-[length:var(--text-caption)] font-medium tracking-normal text-muted-foreground">
          {rotulo}
        </span>
      )}
    </Tag>
  )
}

function getPatrimonioGrowthIndicator(
  growthPct: number | null,
): { arrow: string; color: string } | null {
  if (growthPct === null) return null
  if (growthPct > 0) return { arrow: "↑", color: "text-green-700" }
  if (growthPct < 0) return { arrow: "↓", color: "text-red-600" }
  return { arrow: "", color: "text-muted-foreground" }
}

function getVotoBadgeClassName(voto: VotoCandidato["voto"]): string {
  if (voto === "sim") return "bg-foreground text-background"
  return "bg-secondary text-foreground"
}

/* ─── Card shell ──────────────────────────────────── */

function TeaserCard({
  title,
  linkLabel,
  onNavigate,
  children,
  className,
  moneyCardKind,
  badge,
}: {
  title: string
  linkLabel: string
  onNavigate: () => void
  children: React.ReactNode
  className?: string
  moneyCardKind?: "patrimonio" | "financiamento" | "gasto"
  /** Contagem ao lado do título (ex.: total de processos). */
  badge?: number
}) {
  return (
    <div
      data-pf-money-overview-card={moneyCardKind}
      className={`flex min-h-[220px] flex-col rounded-[12px] border border-border/50 bg-card px-5 py-4 ${className ?? ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-[length:var(--text-body-sm)] font-semibold text-foreground">
          {title}
          {badge != null && <OverviewCountBadge value={badge} />}
        </h2>
        <button
          type="button"
          onClick={onNavigate}
          className="inline-flex min-h-11 items-center gap-0.5 rounded-[8px] px-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {linkLabel} <ChevronRight className="size-3" />
        </button>
      </div>
      <div className="min-h-0 flex-1" data-pf-money-overview-content={moneyCardKind}>{children}</div>
    </div>
  )
}

/* ─── Subcomponents (one teaser per section) ──────────────────────────────────── */

function EmptyOverviewState() {
  return (
    <div className="rounded-[12px] border border-border/50 bg-card px-8 py-16 text-center">
      <h2 className="font-heading text-[length:var(--text-heading)] uppercase tracking-tight text-foreground">Perfil em construção</h2>
      <p className="mt-2 text-[15px] text-muted-foreground">Estamos coletando dados públicos sobre este candidato.</p>
    </div>
  )
}

const OVERVIEW_COLUMNS_GAP_PX = 24

type OverviewColumnSlot = "left" | "right" | "auto"

function OverviewColumnItem({ slot, children }: { slot: OverviewColumnSlot; children: React.ReactNode }) {
  return (
    <div
      // `[&>*]:grow`: quando o item estica para alinhar o rodapé das colunas,
      // a caixa do card cresce junto e o conteúdo continua no topo.
      className="flex min-w-0 w-full flex-col empty:hidden [&>*]:grow"
      data-pf-profile-overview-item=""
      data-pf-profile-overview-slot={slot}
    >
      {children}
    </div>
  )
}

/**
 * Ordem de leitura intercalada (E1, D1, E2, D2...): no mobile vira uma coluna
 * nessa ordem, que também é a ordem do DOM e do leitor de tela. Os itens
 * "auto" (suplentes e afins) vão para o fim.
 */
function interleaveOverviewColumns(
  left: React.ReactNode[],
  right: React.ReactNode[],
  auto: React.ReactNode[],
): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const rows = Math.max(left.length, right.length)
  for (let index = 0; index < rows; index += 1) {
    if (index < left.length) {
      out.push(<OverviewColumnItem key={`left-${index}`} slot="left">{left[index]}</OverviewColumnItem>)
    }
    if (index < right.length) {
      out.push(<OverviewColumnItem key={`right-${index}`} slot="right">{right[index]}</OverviewColumnItem>)
    }
  }
  auto.forEach((node, index) => {
    out.push(<OverviewColumnItem key={`auto-${index}`} slot="auto">{node}</OverviewColumnItem>)
  })
  return out
}

/**
 * Grade da visão geral em md+: duas colunas fixas (cada card sabe a sua), sem
 * espaço vazio. Depois de posicionar, o último card da coluna mais baixa
 * estica até o rodapé da outra. A altura natural é medida sem o esticamento
 * guardado, e o valor só é escrito quando muda, para o ResizeObserver não
 * entrar em ciclo.
 */
function OverviewColumns({
  left,
  right,
  auto,
}: {
  left: React.ReactNode[]
  right: React.ReactNode[]
  auto: React.ReactNode[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const desktopQuery = window.matchMedia("(min-width: 768px)")
    let animationFrame = 0

    const setStyle = (item: HTMLElement, key: "minHeight" | "transform" | "width" | "position" | "inset", value: string) => {
      if (item.style[key] !== value) item.style[key] = value
    }

    const resetItem = (item: HTMLElement) => {
      setStyle(item, "position", "")
      setStyle(item, "inset", "")
      setStyle(item, "width", "")
      setStyle(item, "transform", "")
      setStyle(item, "minHeight", "")
      delete item.dataset.pfProfileOverviewColumn
      delete item.dataset.pfProfileOverviewStretched
    }

    const layout = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        const items = Array.from(
          container.querySelectorAll<HTMLElement>(":scope > [data-pf-profile-overview-item]"),
        )

        if (!desktopQuery.matches) {
          items.forEach(resetItem)
          if (container.style.height !== "") container.style.height = ""
          container.dataset.pfProfileOverviewLayout = "single-column"
          return
        }

        const visibleItems = items.filter((item) => !item.matches(":empty"))
        const columnWidth = (container.clientWidth - OVERVIEW_COLUMNS_GAP_PX) / 2

        for (const item of items) {
          if (!visibleItems.includes(item)) resetItem(item)
        }

        // Altura natural: o esticamento anterior sai antes da medida. A troca
        // acontece dentro do mesmo frame, então nunca chega a ser pintada.
        const naturalHeights = new Map<HTMLElement, number>()
        for (const item of visibleItems) {
          setStyle(item, "position", "absolute")
          setStyle(item, "inset", "0 auto auto 0")
          setStyle(item, "width", `${columnWidth}px`)
          const previousMinHeight = item.style.minHeight
          if (previousMinHeight) item.style.minHeight = ""
          naturalHeights.set(item, item.getBoundingClientRect().height)
          if (previousMinHeight) item.style.minHeight = previousMinHeight
        }

        const columns: HTMLElement[][] = [[], []]
        const heights = [0, 0]
        const place = (item: HTMLElement, column: 0 | 1) => {
          columns[column].push(item)
          heights[column] += (heights[column] > 0 ? OVERVIEW_COLUMNS_GAP_PX : 0) + (naturalHeights.get(item) ?? 0)
        }
        for (const item of visibleItems) {
          const slot = item.dataset.pfProfileOverviewSlot
          if (slot === "left") place(item, 0)
          else if (slot === "right") place(item, 1)
        }
        for (const item of visibleItems) {
          if (item.dataset.pfProfileOverviewSlot === "auto") place(item, heights[0] <= heights[1] ? 0 : 1)
        }

        const tallest = Math.max(heights[0], heights[1])
        const shorter: 0 | 1 = heights[0] <= heights[1] ? 0 : 1
        const stretchTarget = columns[shorter][columns[shorter].length - 1] ?? null
        const stretchBy = tallest - heights[shorter]

        columns.forEach((columnItems, column) => {
          let y = 0
          for (const item of columnItems) {
            const x = column * (columnWidth + OVERVIEW_COLUMNS_GAP_PX)
            setStyle(item, "transform", `translate3d(${x}px, ${y}px, 0)`)
            item.dataset.pfProfileOverviewColumn = String(column + 1)
            const natural = naturalHeights.get(item) ?? 0
            const stretched = item === stretchTarget && stretchBy > 0.5
            const minHeight = stretched ? `${Math.round((natural + stretchBy) * 100) / 100}px` : ""
            setStyle(item, "minHeight", minHeight)
            if (stretched) item.dataset.pfProfileOverviewStretched = ""
            else delete item.dataset.pfProfileOverviewStretched
            y += (stretched ? natural + stretchBy : natural) + OVERVIEW_COLUMNS_GAP_PX
          }
        })

        const containerHeight = `${Math.max(0, tallest)}px`
        if (container.style.height !== containerHeight) container.style.height = containerHeight
        container.dataset.pfProfileOverviewLayout = "columns"
      })
    }

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(layout)
    observer?.observe(container)
    container
      .querySelectorAll<HTMLElement>(":scope > [data-pf-profile-overview-item]")
      .forEach((item) => observer?.observe(item))
    desktopQuery.addEventListener("change", layout)
    layout()

    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer?.disconnect()
      desktopQuery.removeEventListener("change", layout)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      data-pf-profile-overview-grid=""
      data-pf-profile-overview-columns=""
      className="relative grid grid-cols-1 items-start gap-6 md:grid-cols-2"
    >
      {interleaveOverviewColumns(left, right, auto)}
    </div>
  )
}

function PatrimonioTeaser({
  patrimonio,
  summary,
  eleicoes,
  onNavigate,
}: {
  patrimonio: Patrimonio[]
  summary: PatrimonioSummary
  eleicoes: PatrimonioEleicaoPublico[]
  onNavigate: () => void
}) {
  const { latest, earliest, growthPct, latestYear, latestCount } = summary
  if (!latest) {
    if (latestYear != null && latestCount > 1) {
      return (
        <TeaserCard
          title="Patrimônio declarado"
          linkLabel="DETALHES"
          onNavigate={onNavigate}
          moneyCardKind="patrimonio"
        >
          <p className="font-heading text-[length:var(--text-heading-sm)] leading-none tracking-tight text-foreground">
            {latestCount} declarações
          </p>
          <p className="mt-2 text-[length:var(--text-caption)] font-medium leading-snug text-muted-foreground">
            Candidaturas distintas em {latestYear}. Os valores são exibidos separadamente nos detalhes.
          </p>
        </TeaserCard>
      )
    }
    // Sem patrimônio publicado: a eleição ainda assim existe e não pode sumir
    // da visão geral (ausência não é ficha limpa nem ano oculto).
    const semDado = eleicoes
      .filter((eleicao) => eleicao.estado !== "publicado")
      .sort((a, b) => b.ano - a.ano)
    if (semDado.length === 0) return null
    return (
      <TeaserCard
        title="Patrimônio declarado"
        linkLabel="DETALHES"
        onNavigate={onNavigate}
        moneyCardKind="patrimonio"
      >
        <div className="space-y-2" data-pf-patrimonio-eleicoes-sem-dado={semDado.length}>
          {semDado.slice(0, 4).map((eleicao) => (
            <div
              key={eleicao.ano}
              data-pf-patrimonio-eleicao={eleicao.ano}
              data-pf-patrimonio-eleicao-estado={eleicao.estado}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="shrink-0 text-[length:var(--text-caption)] font-bold tabular-nums text-foreground">
                {eleicao.ano}
              </span>
              <span className="min-w-0 flex-1 text-right text-[length:var(--text-caption)] font-medium leading-snug text-muted-foreground">
                {formatPatrimonioEleicaoEstadoLabel(eleicao.estado)}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[length:var(--text-eyebrow)] font-medium leading-snug text-muted-foreground">
          Eleições disputadas sem dado de patrimônio publicado.
        </p>
      </TeaserCard>
    )
  }

  if (patrimonio.length === 1) {
    // Mesma ordem de leitura do card de financiamento (contexto, escopo, valor):
    // o número cai na mesma altura nos dois cards da linha, em vez de abrir o
    // card com um valor sem referência e jogar o contexto para baixo dele.
    return (
      <TeaserCard
        title="Patrimônio declarado"
        linkLabel="DETALHES"
        onNavigate={onNavigate}
        moneyCardKind="patrimonio"
      >
        <p className="text-[length:var(--text-caption)] font-semibold leading-snug text-foreground">
          Declarado em {latest.ano_eleicao}
        </p>
        <p className="mt-1 text-[length:var(--text-eyebrow)] font-medium leading-snug text-muted-foreground">
          Registro único disponível.
        </p>
        <PatrimonioTeaserValor patrimonio={latest} className="mt-2" />
      </TeaserCard>
    )
  }

  const indicator = getPatrimonioGrowthIndicator(growthPct)
  const serieComparavel = summary.sorted.filter((p) => patrimonioTemValorComparavel(p))

  return (
    <TeaserCard
      title="Evolução patrimonial"
      linkLabel="DETALHES"
      onNavigate={onNavigate}
      moneyCardKind="patrimonio"
    >
      <div className="mb-3 flex items-baseline gap-3">
        <PatrimonioTeaserValor patrimonio={latest} as="span" />
        {indicator && earliest && growthPct !== null && (
          <span className={`text-[length:var(--text-caption)] font-bold ${indicator.color}`}>
            {indicator.arrow} {Math.abs(Math.round(growthPct))}% desde {earliest.ano_eleicao}
          </span>
        )}
      </div>
      {serieComparavel.length > 1 && (
        <PatrimonioChart
          data={serieComparavel.map((p) => ({ id: p.id, ano: p.ano_eleicao, valor: p.valor_total }))}
        />
      )}
      <PatrimonioEvolucaoAlerta patrimonio={serieComparavel} className="mt-4 rounded-[12px] px-3 py-3 sm:px-3" />
    </TeaserCard>
  )
}

function FinancingTeaserDoadores({ doadores }: { doadores: Financiamento["maiores_doadores"] }) {
  if (doadores.length === 0) return null
  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      <p className="mb-1.5 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        Maiores doadores
      </p>
      <div className="space-y-1">
        {doadores.slice(0, 3).map((d, i) => (
          <div key={`${d.nome}-${i}`} className="flex items-baseline justify-between gap-2">
            <Link
              href={buildDoadorReverseHref(d.nome)}
              className="block min-w-0 truncate py-0.5 text-[length:var(--text-caption)] font-medium leading-5 text-foreground underline-offset-2 hover:underline"
            >
              {d.nome}
            </Link>
            <span className="shrink-0 text-[length:var(--text-caption)] font-bold tabular-nums text-foreground">
              <FormattedNumber value={d.valor} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FinancingTeaserSegments({
  segments,
  total,
}: {
  segments: FinancingSegment[]
  total: number
}) {
  if (segments.length === 0) return null
  // Uma origem só rende um anel 100% cinza rotulado "Total", com o valor que
  // já está no título do card: o donut só informa quando há proporção.
  const showDonut = segments.length >= 2
  return (
    <div
      className={
        showDonut
          ? "mt-3 grid grid-cols-1 items-center gap-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-5"
          : "mt-3"
      }
    >
      {showDonut ? (
        <div className="flex justify-center sm:justify-start">
          <DonutChart
            segments={segments}
            centerLabel="Total"
            size={112}
            strokeWidth={16}
            showLegend={false}
          />
        </div>
      ) : null}
      <div className="min-w-0 space-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-start gap-2">
            <div className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="min-w-0 flex-1 text-[length:var(--text-eyebrow)] font-medium leading-snug text-muted-foreground">
              {s.label} ({Math.round((s.value / total) * 100)}%)
            </span>
            <span className="shrink-0 text-[length:var(--text-eyebrow)] font-bold tabular-nums text-foreground">
              <FormattedNumber value={s.value} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FinancingTeaser({
  latestFin,
  pleitoLabel,
  segments,
  onNavigate,
}: {
  latestFin: Financiamento | null
  pleitoLabel: string | null
  segments: FinancingSegment[]
  onNavigate: () => void
}) {
  if (!latestFin) return null
  return (
    <TeaserCard
      title="Financiamento de campanha"
      linkLabel="DETALHES"
      onNavigate={onNavigate}
      moneyCardKind="financiamento"
    >
      <p className="text-[length:var(--text-caption)] font-semibold leading-snug text-foreground">{pleitoLabel}</p>
      <p className="mt-1 text-[length:var(--text-eyebrow)] font-medium leading-snug text-muted-foreground">
        {financiamentoPleitoSubtitulo()}
      </p>
      <p className="mt-2 font-heading text-[length:var(--text-heading-sm)] leading-none tracking-tight text-foreground">
        <FormattedNumber value={latestFin.total_arrecadado} />
      </p>
      <FinancingTeaserSegments segments={segments} total={latestFin.total_arrecadado} />
      <FinancingTeaserDoadores doadores={latestFin.maiores_doadores} />
    </TeaserCard>
  )
}

const PROCESSES_TEASER_MAX_ITEMS = 3

function DisciplinaryProcessTeaserItem({ item }: { item: RepresentacaoEticaAprovada }) {
  return (
    <div
      data-pf-processo-disciplinar-overview={item.id}
      className="rounded-lg border border-border/50 border-l-[3px] border-l-[#d4d4d4] px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <MetaBadge tone="muted">
          {item.casa === "senado" ? "Disciplinar · Senado" : "Disciplinar · Câmara"}
        </MetaBadge>
        <span className="min-w-0 text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground">
          {item.casa === "senado"
            ? formatProcessStatusLabel(item.situacao_oficial.descricao)
            : FASE_REPRESENTACAO_LABEL[item.fase]}
        </span>
      </div>
      <p className="mt-1 text-[length:var(--text-caption)] font-medium leading-snug text-foreground">
        {representacaoTitulo(item)} ·{" "}
        {item.casa === "senado"
          ? "Conselho de Ética e Decoro Parlamentar"
          : "Conselho de Ética da Câmara dos Deputados"}
      </p>
      <p className="mt-1 text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground">
        Último andamento em {formatDate(item.ultimo_andamento_em)}
      </p>
    </div>
  )
}

function ProcessesTeaser({
  processos,
  disciplinares,
  onNavigate,
}: {
  processos: Processo[]
  /** Processos disciplinares do Conselho de Ética, já ordenados pelo último andamento. */
  disciplinares: RepresentacaoEticaAprovada[]
  onNavigate: () => void
}) {
  if (processos.length === 0 && disciplinares.length === 0) return null
  const contagem = contarProcessosJustica({ judiciais: processos.length, disciplinares })
  const recorte = recorteProcessosJustica(contagem)
  const processGroups = groupProcessosForDisplay(processos).slice(0, PROCESSES_TEASER_MAX_ITEMS)
  const disciplinaresVisiveis = disciplinares.slice(0, Math.max(0, PROCESSES_TEASER_MAX_ITEMS - processGroups.length))
  return (
    <TeaserCard title="Processos" linkLabel="TODOS" onNavigate={onNavigate} badge={contagem.total}>
      {recorte && (
        <p
          data-pf-processos-overview-recorte=""
          className="mb-3 text-[length:var(--text-caption)] font-medium leading-snug text-muted-foreground"
        >
          <span className="font-semibold text-foreground">{recorte}</span> {PROCESSO_DISCIPLINAR_AVISO}
        </p>
      )}
      <div className="space-y-2">
        {processGroups.map((processGroup) => {
          const p = processGroup[0]
          const href = urlPublicaDoProcesso(p)
          const independentStatuses = [...new Set(
            processGroup
              .filter((item) => !processStatusRepeatsDescription(item))
              .map((item) => item.status),
          )]
          return (
          <ProcessoPublicGroupSurface
            key={processGroup.map((item) => item.id).join(":")}
            processos={processGroup}
            className="rounded-lg border border-border/50 border-l-[3px] px-3 py-2"
            style={{ borderLeftColor: processoBorderColor(p) }}
          >
            {/*
              `flex-wrap`: a pílula tem largura fixa (`shrink-0` no MetaBadge) e o
              rótulo de situação ("Comunicação processual publicada; mérito não
              inferido") ficava com ~30px no mobile, quebrando sílaba a sílaba.
              Quando não cabe ao lado, o rótulo desce para a linha seguinte.
            */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <MetaBadge tone={
                !isTerminalProcessStatus(p.status) &&
                !isProcessStatusNeutral(p.status) &&
                p.tipo === "criminal"
                  ? "critical"
                  : "muted"
              }>
                {isTerminalProcessStatus(p.status)
                  ? "Histórico judicial"
                  : isProcessStatusNeutral(p.status)
                    ? "Comunicação processual"
                    : formatProcessTypeLabel(p.tipo)}
              </MetaBadge>
              {independentStatuses.length === 1 && (
                <span className="min-w-0 text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground">
                  {formatProcessStatusLabel(independentStatuses[0])}
                </span>
              )}
              {processGroup.some((item) => item.fonte_nivel === "em_confirmacao") && (
                <MetaBadge tone="caution" data-pf-processo-fonte-em-confirmacao>
                  Fonte oficial em confirmação
                </MetaBadge>
              )}
            </div>
            <p className="mt-1 text-[length:var(--text-caption)] font-medium leading-snug text-foreground">
              {formatProcessSummaryLabel(p.descricao) || formatProcessTypeLabel(p.tipo)}
            </p>
            {processGroup.length > 1 ? (
              <span className="mt-1 inline-flex text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground">
                {processGroup.length} processos relacionados
                {independentStatuses.length > 1
                  ? `, ${independentStatuses.length} situações processuais`
                  : ""}
              </span>
            ) : href ? (
              <span className="mt-1 inline-flex text-[length:var(--text-eyebrow)] font-bold text-foreground underline underline-offset-2">
                {processoFonteLabel({ ...p, url_fonte: href })}
              </span>
            ) : null}
          </ProcessoPublicGroupSurface>
          )
        })}
        {disciplinaresVisiveis.map((item) => (
          <DisciplinaryProcessTeaserItem key={item.id} item={item} />
        ))}
      </div>
      <button
        type="button"
        onClick={onNavigate}
        data-pf-processos-overview-ver-todos={contagem.total}
        className="mt-3 inline-flex min-h-11 items-center gap-1 self-start rounded-[8px] border border-border px-3 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {contagem.total === 1 ? "Ver o processo" : `Ver todos os ${contagem.total} processos`}
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </button>
    </TeaserCard>
  )
}

function VotesTeaser({
  votos,
  contradicoes,
  onNavigate,
}: {
  votos: VotoCandidato[]
  contradicoes: VotoCandidato[]
  onNavigate: () => void
}) {
  if (votos.length === 0) return null
  return (
    <TeaserCard title={fixedCopy.keyVotes} linkLabel="TODAS" onNavigate={onNavigate}>
      {contradicoes.length > 0 && (
        <div className="mb-3">
          <MetaBadge tone="caution">
            {contradicoes.length} {contradicoes.length === 1 ? "Contradição" : fixedCopy.contradictions}
          </MetaBadge>
        </div>
      )}
      <div className="space-y-2">
        {votos.slice(0, 4).map((v) => (
          <div key={v.id} className="flex items-start gap-2.5">
            <span
              title={formatVoteNote(v.voto) || undefined}
              className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-wide ${getVotoBadgeClassName(v.voto)}`}
            >
              {formatVoteBadgeLabel(v.voto)}
            </span>
            <p className="min-w-0 flex-1 line-clamp-1 text-[length:var(--text-body-sm)] font-medium leading-snug text-foreground">
              {v.votacao?.titulo}
            </p>
          </div>
        ))}
      </div>
    </TeaserCard>
  )
}


function ExecutiveSpendingTeaser({
  gastosExecutivo,
  onNavigate,
}: {
  gastosExecutivo: GastoExecutivo[]
  onNavigate: () => void
}) {
  // Regra do Thiago (16/08): o resumo dos gastos institucionais aparece na
  // Visão Geral como o da cota parlamentar. Enquadramento é inegociável:
  // gasto do ÓRGÃO, nunca da pessoa. E como na aba Dinheiro, total é sempre
  // POR ÓRGÃO: nunca somar valores de órgãos diferentes numa cifra só.
  const orgaos = groupGastosExecutivoPorOrgao(gastosExecutivo)
  const orgao = pickOrgaoMaisRecente(orgaos)
  if (!orgao) return null
  const outrosOrgaos = orgaos.length - 1

  return (
    <TeaserCard
      title="Gastos da estrutura de governo"
      linkLabel="DETALHES"
      onNavigate={onNavigate}
      moneyCardKind="gasto"
    >
      <p className="text-[length:var(--text-caption)] font-medium text-muted-foreground">{orgao.nome}</p>
      <p
        data-pf-gastos-executivo-total-mandato
        className="mt-2 font-heading text-[length:var(--text-heading-sm)] leading-none tracking-tight text-foreground"
      >
        <FormattedNumber value={orgao.totalMandato} />
      </p>
      <p className="mt-0.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">Total no mandato</p>
      <p
        data-pf-gastos-executivo-total-ano={orgao.anoCorrente ?? ""}
        data-pf-gastos-executivo-total-ano-estado={orgao.totalAnoCorrente == null ? "vazio" : "publicado"}
        className={
          orgao.totalAnoCorrente == null
            ? "mt-3 text-[15px] text-muted-foreground"
            : "mt-3 text-[15px] font-bold tabular-nums text-foreground"
        }
      >
        {orgao.totalAnoCorrente == null ? "Sem dado neste recorte" : <FormattedNumber value={orgao.totalAnoCorrente} />}
      </p>
      <p className="mt-0.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">
        {orgao.anoCorrente == null ? "Total no recorte" : `Total em ${orgao.anoCorrente}`}
      </p>
      {orgao.ultimoMesComMovimento && (
        <>
          <p
            data-pf-gastos-executivo-ultimo-mes={orgao.ultimoMesComMovimento.mes_extrato}
            className="mt-3 text-[15px] font-bold tabular-nums text-foreground"
          >
            <FormattedNumber value={orgao.ultimoMesComMovimento.valor_total} />
          </p>
          <p className="mt-0.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">
            Último mês com movimento: {formatMesExtratoCurto(orgao.ultimoMesComMovimento.mes_extrato)}
          </p>
        </>
      )}
      {outrosOrgaos > 0 && (
        <p className="mt-2 text-[length:var(--text-caption)] font-medium text-muted-foreground">
          +{outrosOrgaos} {outrosOrgaos === 1 ? "outro órgão detalhado" : "outros órgãos detalhados"} na aba
          Dinheiro.
        </p>
      )}
    </TeaserCard>
  )
}

function formatMesExtratoCurto(mesExtrato: string): string {
  const [ano, mes] = mesExtrato.split("-")
  return `${mes}/${ano}`
}

function ParliamentarySpendingTeaser({
  topGastos,
  onNavigate,
}: {
  topGastos: GastoParlamentar | null
  onNavigate: () => void
}) {
  if (!topGastos) return null
  const sortedDet = [...(topGastos.detalhamento ?? [])].sort((a, b) => b.valor - a.valor)
  const maxVal = sortedDet[0]?.valor ?? 1
  const shades = ["#0a0a0a", "#404040", "#737373"]

  return (
    <TeaserCard
      title="Cota parlamentar"
      linkLabel="DETALHES"
      onNavigate={onNavigate}
      moneyCardKind="gasto"
    >
      <p className="font-heading text-[length:var(--text-heading-sm)] leading-none tracking-tight text-foreground">
        <FormattedNumber value={topGastos.total_gasto} />
      </p>
      <p className="mt-0.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">
        Ano do registro: {topGastos.ano} (mais recente com dados CEAP na ficha)
      </p>
      {sortedDet.length > 0 && (
        <div className="mt-3 space-y-2.5">
          {sortedDet.slice(0, 3).map((d, i) => (
            <div key={d.categoria}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[length:var(--text-caption)] font-medium text-foreground">
                  {formatPublicLabel(d.categoria)}
                </span>
                <span className="shrink-0 text-[length:var(--text-caption)] font-bold tabular-nums text-foreground">
                  <FormattedNumber value={d.valor} />
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max((d.valor / maxVal) * 100, 2)}%`,
                    backgroundColor: shades[i] ?? "#a3a3a3",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </TeaserCard>
  )
}

function CareerTeaser({
  historico,
  historicoOrdenado,
  onNavigate,
}: {
  historico: HistoricoPolitico[]
  historicoOrdenado: HistoricoPolitico[]
  onNavigate: () => void
}) {
  if (historico.length === 0) return null
  return (
    <TeaserCard title={fixedCopy.politicalCareer} linkLabel="COMPLETA" onNavigate={onNavigate}>
      <div className="space-y-2.5">
        {historicoOrdenado.slice(0, 3).map((h) => {
          const observation = formatCareerTeaserObservation(h.observacoes)
          return (
            <div key={h.id} className="flex items-start gap-2.5">
              <div className="mt-1 size-2.5 shrink-0 rounded-full bg-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[length:var(--text-body-sm)] font-semibold leading-snug text-foreground">
                  {formatHistoricoCargoTituloPublico(h)}
                </p>
                <span className="text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground">
                  {formatHistoricoPeriodoDisplay(h, historicoOrdenado)}
                </span>
                {observation && (
                  <p className="mt-0.5 line-clamp-1 text-[length:var(--text-eyebrow)] font-medium leading-snug text-muted-foreground">
                    {observation}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </TeaserCard>
  )
}

/* ─── Main component ──────────────────────────── */

export function ProfileOverview({
  ficha,
  onNavigateTab,
  trailingCard,
  factChecksCard,
  closingCard,
}: {
  ficha: FichaCandidato
  onNavigateTab: (tabId: string) => void
  /** Programa de governo (coluna da esquerda, depois do financiamento). */
  trailingCard?: React.ReactNode
  /** Resumo das checagens atribuídas; a lista completa fica na aba Checagens. */
  factChecksCard?: React.ReactNode
  /** Suplentes do Senado e afins: vão para o fim da coluna mais baixa. */
  closingCard?: React.ReactNode
}) {
  const socialNetworksVerification = ficha.verificacao_campos?.social_networks
  const socialNetworksEmptyVerifiedAt =
    typeof socialNetworksVerification === "object" &&
    socialNetworksVerification !== null &&
    "estado" in socialNetworksVerification &&
    socialNetworksVerification.estado === "vazio_confirmado" &&
    "verificado_em" in socialNetworksVerification
      ? validarDataDeVerificacao(
          typeof socialNetworksVerification.verificado_em === "string"
            ? socialNetworksVerification.verificado_em
            : null,
        )?.bruto ?? null
      : null
  const sitesTseCollectedAt = ficha.sites_candidato?.coletado_em ?? null
  const sitesTseEmptyAt =
    ficha.sites_candidato?.resultado === "vazio_confirmado"
      ? sitesTseCollectedAt
      : socialNetworksEmptyVerifiedAt
  const sitesTseIndeterminateAt =
    ficha.sites_candidato?.resultado === "indeterminado" ? sitesTseCollectedAt : null
  const disciplinares = getRepresentacoesEticaAprovadas(ficha.slug)

  if (!hasOverviewData(ficha) && disciplinares.length === 0 && !trailingCard && !factChecksCard && !closingCard) {
    return <EmptyOverviewState />
  }

  const patrimonio = ficha.patrimonio ?? []
  const financiamento = ficha.financiamento ?? []
  const processos = ficha.processos ?? []
  const votos = ficha.votos ?? []
  const historico = ficha.historico ?? []
  const historicoOrdenado = prepareHistoricoPoliticoPublicDisplayList(historico)
  const pontosAtencao = ficha.pontos_atencao ?? []
  const gastos = ficha.gastos_parlamentares ?? []
  const gastosExecutivo = ficha.gastos_executivo ?? []

  const pontosContradicao = pontosAtencao.filter((p) => isContradictionAttentionCategory(p.categoria))
  const contradicoes = votos.filter((v) => v.contradicao)

  const patrimonioSummary = getPatrimonioSummary(patrimonio)
  const patrimonioEleicoes = resolvePatrimonioEleicoes(ficha)
  const latestFin = getLatestFinancing(financiamento)
  const latestFinPleitoLabel =
    latestFin != null ? formatFinanciamentoPleitoPublicLabelForRow(latestFin, historico) : null
  const finSegments = getFinancingSegments(latestFin)
  const topGastos = getLatestSpending(gastos)

  // Ordem fixa por coluna (md+). No mobile, a leitura intercala E1, D1, E2, D2...
  const leftColumn: React.ReactNode[] = [
    <PatrimonioTeaser
      key="patrimonio"
      patrimonio={patrimonio}
      summary={patrimonioSummary}
      eleicoes={patrimonioEleicoes}
      onNavigate={() => onNavigateTab("dinheiro")}
    />,
    <FinancingTeaser
      key="financiamento"
      latestFin={latestFin}
      pleitoLabel={latestFinPleitoLabel}
      segments={finSegments}
      onNavigate={() => onNavigateTab("dinheiro")}
    />,
    trailingCard,
    <ParliamentarySpendingTeaser
      key="cota"
      topGastos={topGastos}
      onNavigate={() => onNavigateTab("dinheiro")}
    />,
    <ExecutiveSpendingTeaser
      key="gasto-executivo"
      gastosExecutivo={gastosExecutivo}
      onNavigate={() => onNavigateTab("dinheiro")}
    />,
  ]
  const rightColumn: React.ReactNode[] = [
    factChecksCard,
    <ProcessesTeaser
      key="processos"
      processos={processos}
      disciplinares={disciplinares}
      onNavigate={() => onNavigateTab("justica")}
    />,
    <ContradictionsHighlight
      key="contradicoes"
      votosContradicao={contradicoes}
      pontosContradicao={pontosContradicao}
      onNavigateTab={onNavigateTab}
    />,
    <VotesTeaser
      key="votos"
      votos={votos}
      contradicoes={contradicoes}
      onNavigate={() => onNavigateTab("votos")}
    />,
    <CareerTeaser
      key="carreira"
      historico={historico}
      historicoOrdenado={historicoOrdenado}
      onNavigate={() => onNavigateTab("trajetoria")}
    />,
    <CandidateSitesCard
      sites={ficha.sites_candidato?.sites}
      key="sites"
      vazioConfirmadoEm={sitesTseEmptyAt}
      indeterminadoEm={sitesTseIndeterminateAt}
    />,
  ]

  return <OverviewColumns left={leftColumn} right={rightColumn} auto={closingCard ? [closingCard] : []} />
}
