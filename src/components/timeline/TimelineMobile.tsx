"use client"

import { gsap } from "gsap"
import { useLayoutEffect, useRef } from "react"
import type { TimelineEvent } from "@/lib/timeline-utils"
import { TIMELANE_LABELS } from "@/lib/timeline-utils"
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion"
import { formatDate } from "@/lib/utils"
import { voteAbbrev } from "./TimelineEvent"

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
        return (
          <li key={ev.id}>
            <button
              type="button"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                onSelectId(active ? null : ev.id, active ? undefined : r)
              }}
              className={`w-full rounded-[12px] border px-4 py-3 text-left transition-colors ${
                active ? "border-foreground bg-secondary/60" : "border-border/50 bg-card"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    {TIMELANE_LABELS[ev.type]}
                  </span>
                  <p className="mt-1 text-[length:var(--text-body)] font-bold text-foreground">{ev.label}</p>
                  <p className="mt-0.5 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                    {sub}
                    {extra ? ` · ${extra}` : ""}
                  </p>
                </div>
                {ev.contradicao && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-900">
                    Contrad.
                  </span>
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
