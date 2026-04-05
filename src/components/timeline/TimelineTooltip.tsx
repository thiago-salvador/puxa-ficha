"use client"

import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react"
import { ArrowRight } from "lucide-react"
import { cn, formatDate } from "@/lib/utils"
import type { TimelineEvent } from "@/lib/timeline-utils"
import { TIMELINE_TAB_LABELS } from "@/lib/timeline-utils"
import { voteAbbrev } from "./TimelineEvent"

const tabLabels = TIMELINE_TAB_LABELS

export interface TimelineNavigateOptions {
  /** Id do evento na timeline (`processo-…`, `voto-…`, etc.) para destacar a linha na tab de destino. */
  timelineEventId: string
}

export interface TimelineTooltipPanelProps {
  event: TimelineEvent
  onNavigateTab: (tabId: string, options?: TimelineNavigateOptions) => void
  onClose: () => void
  className?: string
}

/** Rich tooltip / popover for a timeline event (painel estacionario abaixo da area da timeline). */
export function TimelineTooltipPanel({
  event,
  onNavigateTab,
  onClose,
  className,
}: TimelineTooltipPanelProps) {
  const tab = event.tab_link
  const tabLabel = tab ? tabLabels[tab] ?? tab : null

  return (
    <div
      className={cn("rounded-[12px] border border-border/60 bg-card p-4 shadow-lg", className)}
      role="dialog"
      aria-label="Detalhe do evento"
    >
      <p className="text-[length:var(--text-body)] font-bold text-foreground">{event.label}</p>
      {event.description && (
        <p className="mt-2 max-h-32 overflow-y-auto text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
          {event.description}
        </p>
      )}
      <dl className="mt-3 space-y-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
        {event.date && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-foreground">Data</dt>
            <dd>{formatDate(event.date)}</dd>
          </div>
        )}
        {!event.date && event.date_unknown && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-foreground">Data</dt>
            <dd>Desconhecida ou aproximada</dd>
          </div>
        )}
        {event.value_formatted && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-foreground">Valor</dt>
            <dd>{event.value_formatted}</dd>
          </div>
        )}
        {event.vote && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-foreground">Voto</dt>
            <dd>{voteAbbrev(event.vote)}</dd>
          </div>
        )}
        {event.severity && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-foreground">Gravidade</dt>
            <dd className="capitalize">{event.severity}</dd>
          </div>
        )}
        {event.contradicao && (
          <p className="rounded-md bg-amber-50 px-2 py-1 text-amber-900">Marcado como contradicao</p>
        )}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {tab && tab !== "timeline" && (
          <button
            type="button"
            onClick={() => onNavigateTab(tab, { timelineEventId: event.id })}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3 py-1.5 text-[length:var(--text-caption)] font-bold text-background"
          >
            Ver em {tabLabel}
            <ArrowRight className="size-3" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border px-3 py-1.5 text-[length:var(--text-caption)] font-bold text-foreground"
        >
          Fechar
        </button>
      </div>
    </div>
  )
}

/** Tooltip posicionado junto ao marcador (desktop); usa fallback quando nao ha retangulo (ex.: teclado). */
export function TimelineTooltipFloating({
  anchorRect,
  fallbackRect,
  children,
}: {
  anchorRect: DOMRect | null
  fallbackRect: DOMRect | null
  children: ReactNode
}) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" })

  useLayoutEffect(() => {
    const rect = anchorRect ?? fallbackRect
    if (!rect) {
      setStyle({ visibility: "hidden" })
      return
    }
    const vw = window.innerWidth
    const margin = 12
    const width = Math.min(360, vw - 2 * margin)
    const centerX = rect.left + rect.width / 2
    const left = Math.min(Math.max(centerX - width / 2, margin), vw - width - margin)
    const spaceAbove = rect.top
    const flipBelow = spaceAbove < 200
    setStyle({
      position: "fixed",
      left,
      width,
      top: flipBelow ? rect.bottom + 8 : rect.top - 8,
      zIndex: 80,
      transform: flipBelow ? "none" : "translateY(-100%)",
      visibility: "visible",
    })
  }, [anchorRect, fallbackRect])

  return <div style={style}>{children}</div>
}
