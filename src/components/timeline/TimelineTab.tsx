"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { FichaCandidato } from "@/lib/types"
import {
  countEventsByType,
  TIMELINE_EVENT_TYPES,
  type TimelineEvent,
  type TimelineEventType,
} from "@/lib/timeline-utils"
import { EmptyState } from "@/components/EmptyState"
import { SectionLabel, SectionTitle } from "@/components/SectionHeader"
import { TimelineDesktop } from "./TimelineDesktop"
import { TimelineCopyLinkButton } from "./TimelineCopyLinkButton"
import { TimelineExportButton } from "./TimelineExportButton"
import { TimelineFilters } from "./TimelineFilters"
import { TimelineMobile } from "./TimelineMobile"
import { TimelineTooltipFloating, TimelineTooltipPanel } from "./TimelineTooltip"
import type { TimelineNavigateOptions } from "./TimelineTooltip"

export interface TimelineTabProps {
  ficha: FichaCandidato
  events: TimelineEvent[]
  onTabNavigate: (tabId: string, options?: TimelineNavigateOptions) => void
  suggest?: { label: string; go: () => void } | null
}

function allLanesOn(): Set<TimelineEventType> {
  return new Set(TIMELINE_EVENT_TYPES)
}

export function TimelineTab({ ficha, events, onTabNavigate, suggest }: TimelineTabProps) {
  const timelineExportRef = useRef<HTMLDivElement>(null)
  const desktopChartRef = useRef<HTMLDivElement>(null)
  const [visibleLanes, setVisibleLanes] = useState<Set<TimelineEventType>>(allLanesOn)
  const [showAllProjects, setShowAllProjects] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectionAnchor, setSelectionAnchor] = useState<DOMRect | null>(null)
  const [chartPointRect, setChartPointRect] = useState<DOMRect | null>(null)
  const [tooltipBoundaryRect, setTooltipBoundaryRect] = useState<DOMRect | null>(null)
  const [tooltipCursor, setTooltipCursor] = useState<{ x: number; y: number } | null>(null)

  const fullCounts = useMemo(() => countEventsByType(events), [events])
  const projectTotalCount = fullCounts.projeto_lei

  const filteredEvents = useMemo(() => {
    let ev = events.filter((e) => visibleLanes.has(e.type))
    if (!showAllProjects) {
      ev = ev.filter((e) => e.type !== "projeto_lei" || e.destaque)
    }
    return ev
  }, [events, visibleLanes, showAllProjects])

  const projectVisibleCount = useMemo(
    () => filteredEvents.filter((e) => e.type === "projeto_lei").length,
    [filteredEvents],
  )

  const selectedEvent: TimelineEvent | undefined = useMemo(() => {
    if (!selectedId) return undefined
    return filteredEvents.find((e) => e.id === selectedId)
  }, [filteredEvents, selectedId])

  function handleSelectId(id: string | null, anchor?: DOMRect) {
    setSelectedId(id)
    setSelectionAnchor(anchor ?? null)
    setTooltipCursor(null)
  }

  useLayoutEffect(() => {
    if (!selectedEvent) {
      setChartPointRect(null)
      setTooltipBoundaryRect(null)
      return
    }
    const el = desktopChartRef.current
    if (!el) {
      setChartPointRect(null)
      setTooltipBoundaryRect(null)
      return
    }
    const region = el.querySelector<HTMLElement>('[data-pf-timeline-chart-region="true"]') ?? el
    const r = region.getBoundingClientRect()
    const y = r.top + Math.min(r.height * 0.4, 160)
    setChartPointRect(new DOMRect(r.left + r.width / 2 - 1, y - 1, 2, 2))
    setTooltipBoundaryRect(r)
  }, [selectedEvent])

  useEffect(() => {
    if (!selectedId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectedId(null)
        setSelectionAnchor(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId])

  function toggleLane(t: TimelineEventType) {
    setVisibleLanes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      if (next.size === 0) return prev
      return next
    })
  }

  if (events.length === 0) {
    return (
      <div>
        <SectionLabel>Timeline</SectionLabel>
        <SectionTitle>Linha do tempo</SectionTitle>
        <EmptyState
          title="Sem dados temporais"
          description="Nao ha eventos suficientes para montar a timeline deste candidato."
          suggestLabel={suggest?.label}
          onSuggest={suggest?.go}
        />
      </div>
    )
  }

  return (
    <div>
      <SectionLabel>Timeline ({filteredEvents.length} eventos)</SectionLabel>
      <SectionTitle>Linha do tempo</SectionTitle>
      <p className="mt-2 max-w-3xl text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
        Cargos, partidos, patrimonio, financiamento de campanha, processos, votacoes, projetos, gastos e alertas com
        data no mesmo eixo. Use as camadas para filtrar; em telas grandes a visualizacao e horizontal.
      </p>

      <div className="mt-8 space-y-6">
        <div className="hidden flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end lg:flex">
          <TimelineCopyLinkButton slug={ficha.slug} />
          <TimelineExportButton targetRef={timelineExportRef} fileBaseName={ficha.slug} />
        </div>

        <div
          ref={timelineExportRef}
          className="space-y-6 rounded-lg border border-border/30 bg-background p-4 lg:p-6"
        >
          <TimelineFilters
            visibleLanes={visibleLanes}
            onToggleLane={toggleLane}
            counts={fullCounts}
            showAllProjects={showAllProjects}
            onToggleShowAllProjects={() => setShowAllProjects((v) => !v)}
            projectTotalCount={projectTotalCount}
            projectVisibleCount={projectVisibleCount}
          />

          <div
            ref={desktopChartRef}
            className="hidden lg:block"
          >
            <TimelineDesktop
              resetViewportKey={ficha.slug}
              events={filteredEvents}
              visibleLanes={visibleLanes}
              nomeUrna={ficha.nome_urna}
              selectedId={selectedId}
              onSelectId={handleSelectId}
              onChartPointerMove={(point) => {
                if (!selectedId) return
                setTooltipCursor(point)
              }}
              onChartPointerLeave={() => {
                setTooltipCursor(null)
              }}
            />
          </div>
        </div>

        <div className="lg:hidden">
          <TimelineMobile
            introKey={ficha.slug}
            events={filteredEvents}
            selectedId={selectedId}
            onSelectId={handleSelectId}
          />
        </div>

        {selectedEvent && (
          <>
            <button
              type="button"
              aria-label="Fechar detalhe do evento"
              className="fixed inset-0 z-[70] bg-black/40 lg:hidden"
              onClick={() => handleSelectId(null)}
            />
            <div className="fixed inset-x-0 bottom-0 z-[80] max-h-[min(78vh,560px)] overflow-y-auto rounded-t-2xl border-t border-border bg-card px-4 pb-6 pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.15)] lg:hidden">
              <TimelineTooltipPanel
                event={selectedEvent}
                onNavigateTab={onTabNavigate}
                onClose={() => handleSelectId(null)}
              />
            </div>
            <TimelineTooltipFloating
              anchorRect={selectionAnchor}
              fallbackRect={chartPointRect}
              boundaryRect={tooltipBoundaryRect}
              cursorClient={tooltipCursor}
            >
              <div className="hidden lg:block">
                <TimelineTooltipPanel
                  event={selectedEvent}
                  onNavigateTab={onTabNavigate}
                  onClose={() => handleSelectId(null)}
                />
              </div>
            </TimelineTooltipFloating>
          </>
        )}
      </div>
    </div>
  )
}
