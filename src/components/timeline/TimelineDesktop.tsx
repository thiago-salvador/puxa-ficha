"use client"

import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion"
import {
  clampTimeWindow,
  getTimelineRange,
  TIMELINE_EVENT_TYPES,
  type TimelineEvent,
  type TimelineEventType,
} from "@/lib/timeline-utils"
import { TimelineAxis } from "./TimelineAxis"
import { TimelineLane } from "./TimelineLane"
import {
  getLaneTheme,
  laneMarkerColor,
  markerBadgeLabel,
  processSeverityFill,
  voteGlyph,
} from "./TimelineEvent"
import { LaneSparkline } from "./TimelineSparkline"
import { TimelineMinimap } from "./TimelineMinimap"

gsap.registerPlugin(ScrollTrigger)

const VB_W = 980
const LEFT_PAD = 126
const RIGHT_PAD = 28
const LANE_H = 48
const TOP_PAD = 10
const CLUSTER_LIMIT = 5
const BADGE_MIN_GAP = 82

function anchorFromSvgTarget(target: EventTarget | null): DOMRect | undefined {
  if (!target || !(target instanceof SVGGraphicsElement)) return undefined
  return target.getBoundingClientRect()
}

type BucketItem =
  | { kind: "single"; ev: TimelineEvent }
  | { kind: "cluster"; year: number; items: TimelineEvent[]; id: string }

function bucketLaneEvents(
  events: TimelineEvent[],
  type: TimelineEventType,
  expanded: Set<string>,
): BucketItem[] {
  const list = events.filter((e) => e.type === type)
  const byYear = new Map<number, TimelineEvent[]>()
  for (const ev of list) {
    const y = ev.year_start
    const g = byYear.get(y) ?? []
    g.push(ev)
    byYear.set(y, g)
  }
  const out: BucketItem[] = []
  const years = [...byYear.keys()].sort((a, b) => a - b)
  for (const y of years) {
    const group = byYear.get(y)!
    const key = `${type}-${y}`
    if (group.length <= CLUSTER_LIMIT || expanded.has(key)) {
      for (const ev of group) out.push({ kind: "single", ev })
    } else {
      out.push({ kind: "cluster", year: y, items: group, id: `cluster-${key}` })
    }
  }
  return out
}

function shortenLabel(label: string, limit: number) {
  if (label.length <= limit) return label
  return `${label.slice(0, Math.max(limit - 1, 1))}…`
}

export interface TimelineDesktopProps {
  events: TimelineEvent[]
  visibleLanes: Set<TimelineEventType>
  nomeUrna: string
  selectedId: string | null
  /** Segundo argumento: retangulo do marcador para posicionar tooltip flutuante (desktop). */
  onSelectId: (id: string | null, anchorRect?: DOMRect) => void
  onChartPointerMove?: (point: { x: number; y: number }) => void
  onChartPointerLeave?: () => void
  /** Troca de candidato: reseta viewport inicial (ultimos 20 anos quando aplicavel). */
  resetViewportKey?: string
}

const INTRO_ITEM_CLASS = "js-timeline-intro-item"

export function TimelineDesktop({
  events,
  visibleLanes,
  nomeUrna,
  selectedId,
  onSelectId,
  onChartPointerMove,
  onChartPointerLeave,
  resetViewportKey,
}: TimelineDesktopProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const svgRef = useRef<SVGSVGElement>(null)
  const introRootRef = useRef<HTMLDivElement>(null)
  const chartWheelRegionRef = useRef<HTMLDivElement>(null)
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(() => new Set())
  const [windowOverride, setWindowOverride] = useState<{ min: number; max: number } | null>(null)

  const dataRange = useMemo(() => getTimelineRange(events), [events])
  const extentMax = Math.max(dataRange.year_max, new Date().getFullYear())
  const extentMin = dataRange.year_min
  const canNarrow = extentMax - extentMin > 20
  const extentSpan = extentMax - extentMin
  const showMinimap = extentSpan > 0

  const [viewportMode, setViewportMode] = useState<"full" | "recent20">(() =>
    extentMax - extentMin > 20 ? "recent20" : "full",
  )

  const eventsRef = useRef(events)
  eventsRef.current = events

  useEffect(() => {
    if (resetViewportKey === undefined) return
    setExpandedClusters(new Set())
    setWindowOverride(null)
    const r = getTimelineRange(eventsRef.current)
    const emax = Math.max(r.year_max, new Date().getFullYear())
    const emin = r.year_min
    setViewportMode(emax - emin > 20 ? "recent20" : "full")
  }, [resetViewportKey])

  const presetWindow = useMemo(() => {
    if (!canNarrow) return { min: extentMin, max: extentMax }
    if (viewportMode === "recent20") return { min: Math.max(extentMin, extentMax - 19), max: extentMax }
    return { min: extentMin, max: extentMax }
  }, [canNarrow, viewportMode, extentMin, extentMax])

  const { min: viewMin, max: viewMax } = useMemo(() => {
    if (windowOverride) {
      return clampTimeWindow(windowOverride.min, windowOverride.max, extentMin, extentMax)
    }
    return presetWindow
  }, [windowOverride, presetWindow, extentMin, extentMax])

  const viewWindowRef = useRef({ min: 0, max: 0 })
  viewWindowRef.current = { min: viewMin, max: viewMax }
  const extentBoundsRef = useRef({ min: 0, max: 0 })
  extentBoundsRef.current = { min: extentMin, max: extentMax }

  /**
   * React 19 registra onWheel como listener passivo por padrao; preventDefault nao bloqueia o zoom nativo
   * do navegador com Ctrl/Cmd+scroll. Precisamos de { passive: false } (auditoria P7).
   */
  useEffect(() => {
    const el = chartWheelRegionRef.current
    if (!el) return

    function handleWheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey)) return
      const { min: emin, max: emax } = extentBoundsRef.current
      if (emax - emin < 2) return
      e.preventDefault()
      e.stopPropagation()
      const { min: vm, max: vx } = viewWindowRef.current
      const center = (vm + vx) / 2
      let span = Math.max(vx - vm, 1)
      const maxSpan = emax - emin
      const zoomOut = e.deltaY > 0
      span = zoomOut ? Math.min(span * 1.12, maxSpan) : Math.max(span / 1.12, 2)
      span = Math.min(span, maxSpan)
      const c = clampTimeWindow(center - span / 2, center + span / 2, emin, emax)
      setWindowOverride({ min: c.min, max: c.max })
    }

    el.addEventListener("wheel", handleWheel, { passive: false })
    return () => {
      el.removeEventListener("wheel", handleWheel)
    }
  }, [])

  function applyMinimapWindow(min: number, max: number) {
    setWindowOverride(clampTimeWindow(min, max, extentMin, extentMax))
  }

  useLayoutEffect(() => {
    if (prefersReducedMotion) return
    const root = introRootRef.current
    const svg = svgRef.current
    if (!root || !svg) return
    const items = svg.querySelectorAll<SVGGElement>(`.${INTRO_ITEM_CLASS}`)
    if (items.length === 0) return

    let played = false
    const playIntro = () => {
      if (played) return
      played = true
      gsap.fromTo(
        items,
        { autoAlpha: 0, y: 8 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.4,
          stagger: 0.06,
          ease: "power2.out",
          overwrite: "auto",
        },
      )
    }

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: root,
        start: "top 90%",
        onEnter: () => playIntro(),
      })
      requestAnimationFrame(() => {
        const r = root.getBoundingClientRect()
        if (r.top < window.innerHeight * 0.9 && r.bottom > 0) playIntro()
        ScrollTrigger.refresh()
      })
    }, root)

    return () => {
      ctx.revert()
    }
  }, [resetViewportKey, viewportMode, prefersReducedMotion])

  const span = Math.max(viewMax - viewMin, 1)

  const visibleLaneTypes = useMemo(
    () => TIMELINE_EVENT_TYPES.filter((t) => visibleLanes.has(t)),
    [visibleLanes],
  )

  const innerW = VB_W - LEFT_PAD - RIGHT_PAD
  const chartRight = VB_W - RIGHT_PAD

  function xForYear(yr: number) {
    return LEFT_PAD + ((yr - viewMin) / span) * innerW
  }

  function isYearInView(yr: number) {
    return yr >= viewMin && yr <= viewMax
  }

  function barVisible(yStart: number, yEnd: number) {
    const lo = Math.min(yStart, yEnd)
    const hi = Math.max(yStart, yEnd)
    return hi >= viewMin && lo <= viewMax
  }

  const laneCount = Math.max(visibleLaneTypes.length, 1)
  const axisY = TOP_PAD + laneCount * LANE_H
  const vbHeight = axisY + 38

  function toggleCluster(key: string) {
    setExpandedClusters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div ref={introRootRef} className="w-full">
      <div className="mb-4 rounded-[24px] border border-border/50 bg-card/80 p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border/60 bg-secondary/40 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-foreground">
                Mapa da carreira
              </span>
              <span className="rounded-full border border-border/50 bg-background px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {visibleLaneTypes.length} trilhas
              </span>
              <span className="rounded-full border border-border/50 bg-background px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {events.length} eventos
              </span>
            </div>
          <p className="text-[length:var(--text-caption)] font-semibold text-muted-foreground">
            Eixo visivel: {Math.round(viewMin)} a {Math.round(viewMax)}
          </p>
          {extentSpan >= 2 ? (
            <p className="mt-0.5 text-[length:var(--text-caption)] text-muted-foreground/90">
              Ctrl ou Cmd + rolagem sobre o grafico para zoom. Dois cliques no grafico aproximam cerca de 5 anos
              no ponto. Clique ou arraste no mapa acima para mover a janela.
            </p>
          ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {windowOverride != null && (
              <button
                type="button"
                onClick={() => setWindowOverride(null)}
                className="rounded-full border border-dashed border-foreground/40 px-3 py-2 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.04em] text-foreground transition-colors hover:bg-secondary/60"
              >
                Redefinir zoom
              </button>
            )}
            {canNarrow && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setWindowOverride(null)
                    setViewportMode("recent20")
                  }}
                  className={`rounded-full border px-3 py-2 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.04em] transition-colors ${
                    viewportMode === "recent20" && windowOverride == null
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/60 bg-secondary/40 text-foreground hover:border-foreground/30"
                  }`}
                >
                  Ultimos 20 anos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWindowOverride(null)
                    setViewportMode("full")
                  }}
                  className={`rounded-full border px-3 py-2 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.04em] transition-colors ${
                    viewportMode === "full" && windowOverride == null
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/60 bg-secondary/40 text-foreground hover:border-foreground/30"
                  }`}
                >
                  Ver carreira completa
                </button>
              </>
            )}
          </div>
        </div>

        {showMinimap && (
          <div className="mt-4">
            <TimelineMinimap
              extentMin={extentMin}
              extentMax={extentMax}
              viewMin={viewMin}
              viewMax={viewMax}
              onWindowChange={(min, max) => applyMinimapWindow(min, max)}
              label={nomeUrna}
            />
          </div>
        )}
      </div>

      <div
        ref={chartWheelRegionRef}
        data-pf-timeline-chart-region="true"
        className="w-full overflow-x-auto rounded-[24px] border border-border/50 bg-card/70 px-3 py-4 shadow-[0_18px_40px_rgba(10,10,10,0.05)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        tabIndex={0}
        role="region"
        aria-label={`Area do grafico da timeline de ${nomeUrna}. Com foco aqui, use Ctrl ou Cmd e a rolagem para zoom.`}
        onPointerMove={(e) => {
          onChartPointerMove?.({ x: e.clientX, y: e.clientY })
        }}
        onPointerLeave={() => {
          onChartPointerLeave?.()
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${vbHeight}`}
          className="min-w-[720px] w-full text-foreground motion-reduce:transition-none"
          role="group"
          aria-label={`Timeline politica de ${nomeUrna}`}
          onDoubleClick={(e) => {
            const svg = svgRef.current
            if (!svg) return
            const pt = svg.createSVGPoint()
            pt.x = e.clientX
            pt.y = e.clientY
            const m = svg.getScreenCTM()
            if (!m) return
            const p = pt.matrixTransform(m.inverse())
            if (p.x < LEFT_PAD || p.x > chartRight) return
            const year = viewMin + ((p.x - LEFT_PAD) / innerW) * span
            const center = Math.round(year)
            const half = 2
            setWindowOverride(clampTimeWindow(center - half, center + half, extentMin, extentMax))
          }}
        >
          <g className={INTRO_ITEM_CLASS}>
            <TimelineAxis
              yearMin={viewMin}
              yearMax={viewMax}
              leftPad={LEFT_PAD}
              rightPad={RIGHT_PAD}
              width={VB_W}
              y={axisY}
            />
          </g>

          {visibleLaneTypes.map((laneType, laneIndex) => {
            const laneY = TOP_PAD + laneIndex * LANE_H
            const theme = getLaneTheme(laneType)
            const buckets = bucketLaneEvents(events, laneType, expandedClusters)
            let lastBadgeX = -Infinity

            return (
              <TimelineLane
                key={laneType}
                className={INTRO_ITEM_CLASS}
                type={laneType}
                laneY={laneY}
                laneHeight={LANE_H}
                leftPad={LEFT_PAD}
                chartRight={chartRight}
              >
                {laneType === "patrimonio" && (
                  <LaneSparkline
                    events={events}
                    laneType="patrimonio"
                    laneY={laneY}
                    laneHeight={LANE_H}
                    xForYear={xForYear}
                  />
                )}
                {laneType === "gasto_parlamentar" && (
                  <LaneSparkline
                    events={events}
                    laneType="gasto_parlamentar"
                    laneY={laneY}
                    laneHeight={LANE_H}
                    xForYear={xForYear}
                  />
                )}

                {buckets.map((b) => {
                  if (b.kind === "cluster") {
                    if (!isYearInView(b.year)) return null
                    const cx = xForYear(b.year)
                    const cy = laneY + LANE_H / 2
                    const clusterKey = `${laneType}-${b.year}`
                    return (
                      <g key={b.id}>
                        <rect
                          role="button"
                          tabIndex={0}
                          x={cx - 24}
                          y={cy - 12}
                          width={48}
                          height={24}
                          rx={12}
                          fill={theme.softFill}
                          stroke={theme.softStroke}
                          strokeWidth={1}
                          className="cursor-pointer outline-none"
                          onClick={() => toggleCluster(clusterKey)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              toggleCluster(clusterKey)
                            }
                          }}
                          aria-label={`Expandir ${b.items.length} eventos em ${b.year}`}
                        />
                        <circle cx={cx - 11} cy={cy} r={3.5} fill={theme.marker} />
                        <text
                          x={cx + 2}
                          y={cy + 4}
                          textAnchor="middle"
                          fill={theme.text}
                          className="pointer-events-none text-[10px] font-bold"
                          style={{ fontSize: 10 }}
                        >
                          {b.items.length}+
                        </text>
                      </g>
                    )
                  }

                  const ev = b.ev
                  const isSel = selectedId === ev.id
                  const cy = laneY + LANE_H / 2

                  if (laneType === "cargo" || laneType === "processo") {
                    const yStart = ev.year_start
                    const yEnd =
                      ev.year_end ??
                      (laneType === "cargo" || (laneType === "processo" && !ev.year_end) ? viewMax : yStart)
                    if (!barVisible(yStart, yEnd)) return null
                    const x0raw = xForYear(yStart)
                    const x1raw = xForYear(Math.max(yEnd, yStart))
                    if (x1raw < LEFT_PAD || x0raw > chartRight) return null
                    const x0 = Math.max(LEFT_PAD, x0raw)
                    const x1 = Math.min(chartRight, x1raw)
                    const width = Math.max(x1 - x0, 8)
                    const fill = laneType === "processo" ? processSeverityFill(ev.severity) : theme.softFill
                    const stroke = laneType === "processo" ? fill : theme.softStroke
                    const textFill = laneType === "processo" ? "#171717" : theme.text
                    return (
                      <g key={ev.id}>
                        <rect
                          role="button"
                          tabIndex={0}
                          x={x0}
                          y={cy - 9}
                          width={width}
                          height={18}
                          rx={7}
                          fill={fill}
                          fillOpacity={laneType === "processo" ? 0.18 : 1}
                          stroke={stroke}
                          strokeOpacity={0.92}
                          strokeWidth={isSel ? 2.2 : 1.1}
                          strokeDasharray={!ev.year_end ? "6 4" : undefined}
                          className="cursor-pointer outline-none"
                          onClick={(e) => {
                            const a = anchorFromSvgTarget(e.currentTarget)
                            onSelectId(isSel ? null : ev.id, isSel ? undefined : a)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              const a = anchorFromSvgTarget(e.currentTarget)
                              onSelectId(isSel ? null : ev.id, isSel ? undefined : a)
                            }
                          }}
                          aria-label={ev.label}
                        />
                        {laneType === "cargo" && width > 52 && (
                          <rect
                            x={x0 + 2}
                            y={cy - 7}
                            width={Math.max(width - 4, 4)}
                            height={2.5}
                            rx={1.25}
                            fill={theme.marker}
                            fillOpacity={0.9}
                            className="pointer-events-none"
                          />
                        )}
                        {width > 98 && (
                          <text
                            x={x0 + 10}
                            y={cy + 3}
                            textAnchor="start"
                            className="pointer-events-none text-[8px] font-semibold"
                            fill={textFill}
                            style={{ fontSize: 8 }}
                          >
                            {shortenLabel(ev.label, width > 180 ? 42 : 24)}
                          </text>
                        )}
                      </g>
                    )
                  }

                  if (!isYearInView(ev.year_start)) return null

                  const cx = xForYear(ev.year_start)
                  if (cx < LEFT_PAD - 10 || cx > chartRight + 10) return null

                  const fill = laneMarkerColor(laneType, ev)
                  const glyph =
                    laneType === "votacao"
                      ? voteGlyph(ev.vote)
                      : laneType === "projeto_lei"
                        ? "PL"
                        : laneType === "ponto_atencao"
                          ? "!"
                          : laneType === "financiamento_campanha"
                            ? "$"
                            : laneType === "patrimonio"
                              ? "R"
                              : laneType === "gasto_parlamentar"
                                ? "G"
                                : null
                  const badgeLabel = (() => {
                    if (isSel && laneType === "mudanca_partido") return shortenLabel(ev.label, 18)
                    if (isSel && ev.type === "ponto_atencao") return shortenLabel(ev.label, 22)
                    return markerBadgeLabel(ev)
                  })()
                  const badgeGap = laneType === "mudanca_partido" ? BADGE_MIN_GAP + 28 : BADGE_MIN_GAP
                  const showBadge = Boolean(badgeLabel) && (isSel || cx - lastBadgeX >= badgeGap)
                  if (showBadge) lastBadgeX = cx
                  const badgeWidth = badgeLabel ? Math.min(Math.max(badgeLabel.length * 6.4 + 18, 46), 122) : 0
                  const badgeX = Math.min(Math.max(cx + 12, LEFT_PAD + 8), chartRight - badgeWidth - 4)
                  const badgeY = cy - 11

                  return (
                    <g
                      key={ev.id}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer outline-none"
                      onClick={(e) => {
                        const a = anchorFromSvgTarget(e.currentTarget)
                        onSelectId(isSel ? null : ev.id, isSel ? undefined : a)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          const a = anchorFromSvgTarget(e.currentTarget)
                          onSelectId(isSel ? null : ev.id, isSel ? undefined : a)
                        }
                      }}
                      aria-label={ev.label}
                    >
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isSel ? 12 : 10}
                        fill={theme.softFill}
                        stroke={ev.contradicao ? "#f59e0b" : theme.softStroke}
                        strokeWidth={ev.contradicao || isSel ? 1.6 : 1}
                      />
                      {laneType === "mudanca_partido" ? (
                        <polygon
                          points={`${cx},${cy - 8.5} ${cx + 8.5},${cy} ${cx},${cy + 8.5} ${cx - 8.5},${cy}`}
                          fill={fill}
                          stroke="#ffffff"
                          strokeWidth={1.2}
                        />
                      ) : laneType === "projeto_lei" ? (
                        <rect
                          x={cx - 7}
                          y={cy - 7}
                          width={14}
                          height={14}
                          rx={4}
                          fill={fill}
                          stroke="#ffffff"
                          strokeWidth={1.2}
                        />
                      ) : laneType === "ponto_atencao" ? (
                        <polygon
                          points={`${cx},${cy - 8.5} ${cx + 8},${cy + 6.5} ${cx - 8},${cy + 6.5}`}
                          fill={fill}
                          stroke="#ffffff"
                          strokeWidth={1.2}
                        />
                      ) : (
                        <circle cx={cx} cy={cy} r={6.5} fill={fill} stroke="#ffffff" strokeWidth={1.2} />
                      )}
                      {glyph ? (
                        <text
                          x={cx}
                          y={cy + 2.6}
                          textAnchor="middle"
                          className="pointer-events-none text-[6.5px] font-black uppercase"
                          fill="#ffffff"
                          style={{ fontSize: laneType === "projeto_lei" ? 5.8 : 6.5 }}
                        >
                          {glyph}
                        </text>
                      ) : null}
                      {showBadge && badgeLabel ? (
                        <g>
                          <rect
                            x={badgeX}
                            y={badgeY}
                            width={badgeWidth}
                            height={22}
                            rx={11}
                            fill={theme.softFill}
                            stroke={theme.softStroke}
                            strokeWidth={1}
                          />
                          <text
                            x={badgeX + badgeWidth / 2}
                            y={badgeY + 14}
                            textAnchor="middle"
                            fill={theme.text}
                            className="pointer-events-none text-[8px] font-bold"
                            style={{ fontSize: 8 }}
                          >
                            {badgeLabel}
                          </text>
                        </g>
                      ) : null}
                    </g>
                  )
                })}
              </TimelineLane>
            )
          })}
        </svg>
        </div>
    </div>
  )
}
