"use client"

import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react"
import { ArrowRight } from "lucide-react"
import { cn, formatDate } from "@/lib/utils"
import type { TimelineEvent } from "@/lib/timeline-utils"
import { TIMELANE_LABELS, TIMELINE_TAB_LABELS } from "@/lib/timeline-utils"
import { getLaneTheme, markerBadgeLabel, voteAbbrev } from "./TimelineEvent"

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
  const theme = getLaneTheme(event.type)
  const badge = markerBadgeLabel(event)

  return (
    <div
      className={cn(
        "w-full rounded-[20px] border border-border/60 bg-card/95 p-4 shadow-[0_18px_48px_rgba(10,10,10,0.18)] backdrop-blur-sm",
        className,
      )}
      role="dialog"
      aria-label="Detalhe do evento"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{
              backgroundColor: theme.softFill,
              borderColor: theme.softStroke,
              color: theme.text,
            }}
          >
            {TIMELANE_LABELS[event.type]}
          </span>
          {badge ? (
            <span className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {badge}
            </span>
          ) : null}
          {event.contradicao ? (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-900">
              Contradicao
            </span>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-[length:var(--text-body-lg)] font-bold leading-tight text-foreground">{event.label}</p>
      {event.description && (
        <p className="mt-2 max-h-32 overflow-y-auto border-l-2 border-border/70 pl-3 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
          {event.description}
        </p>
      )}

      <dl className="mt-4 grid gap-2 text-[length:var(--text-caption)] font-semibold text-muted-foreground sm:grid-cols-2">
        {event.date && (
          <div className="rounded-2xl border border-border/60 bg-background px-3 py-2">
            <dt className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Data</dt>
            <dd className="mt-1 text-foreground">{formatDate(event.date)}</dd>
          </div>
        )}
        {!event.date && event.date_unknown && (
          <div className="rounded-2xl border border-border/60 bg-background px-3 py-2">
            <dt className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Data</dt>
            <dd className="mt-1 text-foreground">Desconhecida ou aproximada</dd>
          </div>
        )}
        {event.value_formatted && (
          <div className="rounded-2xl border border-border/60 bg-background px-3 py-2">
            <dt className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Valor</dt>
            <dd className="mt-1 text-foreground">{event.value_formatted}</dd>
          </div>
        )}
        {event.vote && (
          <div className="rounded-2xl border border-border/60 bg-background px-3 py-2">
            <dt className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Voto</dt>
            <dd className="mt-1 text-foreground">{voteAbbrev(event.vote)}</dd>
          </div>
        )}
        {event.severity && (
          <div className="rounded-2xl border border-border/60 bg-background px-3 py-2">
            <dt className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Gravidade</dt>
            <dd className="mt-1 capitalize text-foreground">{event.severity}</dd>
          </div>
        )}
        {event.attention_gravidade && (
          <div className="rounded-2xl border border-border/60 bg-background px-3 py-2">
            <dt className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Gravidade</dt>
            <dd className="mt-1 capitalize text-foreground">{event.attention_gravidade}</dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
        {tab && tab !== "timeline" && (
          <button
            type="button"
            onClick={() => onNavigateTab(tab, { timelineEventId: event.id })}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3 py-2 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.04em] text-background"
          >
            Ver em {tabLabel}
            <ArrowRight className="size-3" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border px-3 py-2 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.04em] text-foreground"
        >
          Fechar
        </button>
      </div>
    </div>
  )
}

/** Desktop: segue o ponteiro quando `cursorClient` existe; senao ancora no marcador ou fallback (teclado). */
export function TimelineTooltipFloating({
  anchorRect,
  fallbackRect,
  boundaryRect,
  cursorClient,
  children,
}: {
  anchorRect: DOMRect | null
  fallbackRect: DOMRect | null
  boundaryRect?: DOMRect | null
  cursorClient: { x: number; y: number } | null
  children: ReactNode
}) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" })

  useLayoutEffect(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 16
    const width = Math.min(360, vw - 2 * margin)
    const estHeight = 320
    const offset = 16
    const minLeft = Math.max(boundaryRect?.left ?? margin, margin)
    const maxLeft = Math.min((boundaryRect?.right ?? vw - margin) - width, vw - width - margin)
    const minTop = Math.max(boundaryRect?.top ?? margin, margin)
    const maxTop = Math.min((boundaryRect?.bottom ?? vh - margin) - estHeight, vh - estHeight - margin)
    const clampLeft = (value: number) => Math.min(Math.max(value, minLeft), Math.max(minLeft, maxLeft))
    const clampTop = (value: number) => Math.min(Math.max(value, minTop), Math.max(minTop, maxTop))

    if (cursorClient) {
      const left = clampLeft(cursorClient.x + offset)
      let top = cursorClient.y + offset
      if (top > maxTop) top = cursorClient.y - estHeight - offset
      top = clampTop(top)
      setStyle({
        position: "fixed",
        left,
        top,
        width,
        zIndex: 80,
        transform: "none",
        visibility: "visible",
      })
      return
    }

    const rect = anchorRect ?? fallbackRect
    if (!rect) {
      setStyle({ visibility: "hidden" })
      return
    }
    const centerX = rect.left + rect.width / 2
    const left = clampLeft(centerX - width / 2)
    const preferBelow = rect.top - estHeight < minTop
    let top = preferBelow ? rect.bottom + 12 : rect.top - estHeight - 12
    top = clampTop(top)
    setStyle({
      position: "fixed",
      left,
      width,
      top,
      zIndex: 80,
      transform: "none",
      visibility: "visible",
    })
  }, [anchorRect, boundaryRect, fallbackRect, cursorClient])

  return <div style={style}>{children}</div>
}
