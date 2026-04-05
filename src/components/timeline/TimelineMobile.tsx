"use client"

import { gsap } from "gsap"
import { useLayoutEffect, useRef } from "react"
import type { TimelineEvent } from "@/lib/timeline-utils"
import { TIMELANE_LABELS } from "@/lib/timeline-utils"
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion"
import { formatDate } from "@/lib/utils"
import { getLaneTheme, markerBadgeLabel, voteAbbrev } from "./TimelineEvent"

export interface TimelineMobileProps {
  events: TimelineEvent[]
  selectedId: string | null
  onSelectId: (id: string | null, anchorRect?: DOMRect) => void
  /** Troca de candidato: entrada escalonada na lista (respeita prefers-reduced-motion). */
  introKey?: string
}

export function TimelineMobile({ events, selectedId, onSelectId, introKey }: TimelineMobileProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const listRef = useRef<HTMLUListElement>(null)

  useLayoutEffect(() => {
    if (prefersReducedMotion) return
    const ul = listRef.current
    if (!ul) return
    const rows = ul.querySelectorAll(":scope > li")
    if (rows.length === 0) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        rows,
        { autoAlpha: 0, x: -10 },
        {
          autoAlpha: 1,
          x: 0,
          duration: 0.32,
          stagger: 0.035,
          ease: "power2.out",
          overwrite: "auto",
        },
      )
    }, ul)
    return () => ctx.revert()
  }, [introKey, prefersReducedMotion])

  const sorted = [...events].sort((a, b) => {
    if (a.year_start !== b.year_start) return b.year_start - a.year_start
    if (a.date && b.date) return b.date.localeCompare(a.date)
    return a.id.localeCompare(b.id)
  })

  return (
    <ul ref={listRef} className="space-y-2" aria-label="Lista de eventos da timeline">
      {sorted.map((ev) => {
        const active = selectedId === ev.id
        const theme = getLaneTheme(ev.type)
        const sub =
          ev.date != null
            ? formatDate(ev.date)
            : ev.date_unknown
              ? "Data aproximada/desconhecida"
              : String(ev.year_start)
        const extra =
          ev.type === "votacao" && ev.vote
            ? voteAbbrev(ev.vote)
            : ev.value_formatted ?? null
        const badge = markerBadgeLabel(ev)
        return (
          <li key={ev.id}>
            <button
              type="button"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                onSelectId(active ? null : ev.id, active ? undefined : r)
              }}
              className={`w-full rounded-[18px] border px-4 py-3 text-left transition-colors ${
                active
                  ? "border-foreground bg-secondary/60 shadow-[0_12px_28px_rgba(10,10,10,0.1)]"
                  : "border-border/50 bg-card shadow-[0_8px_24px_rgba(10,10,10,0.04)]"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center pt-0.5">
                  <span
                    className="block size-3 rounded-full border border-white/90"
                    style={{ backgroundColor: theme.marker }}
                    aria-hidden
                  />
                  <span className="mt-1 h-full min-h-10 w-px bg-border/70" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
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
                        {TIMELANE_LABELS[ev.type]}
                      </span>
                      {badge ? (
                        <span className="rounded-full border border-border/60 bg-background px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                          {badge}
                        </span>
                      ) : null}
                    </div>
                    {ev.contradicao && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-900">
                        Contrad.
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[length:var(--text-body)] font-bold text-foreground">{ev.label}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                    <span className="rounded-full bg-secondary/60 px-2.5 py-1">{sub}</span>
                    {extra ? <span className="rounded-full bg-secondary/60 px-2.5 py-1">{extra}</span> : null}
                  </div>
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
