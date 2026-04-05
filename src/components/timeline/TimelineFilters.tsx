"use client"

import {
  BriefcaseBusiness,
  CircleDollarSign,
  Landmark,
  type LucideIcon,
  Receipt,
  Scale,
  ScrollText,
  Shuffle,
  TriangleAlert,
  Vote,
} from "lucide-react"
import {
  TIMELANE_LABELS,
  TIMELINE_EVENT_TYPES,
  type TimelineEventType,
} from "@/lib/timeline-utils"

const FILTER_ICONS: Record<TimelineEventType, LucideIcon> = {
  cargo: BriefcaseBusiness,
  mudanca_partido: Shuffle,
  patrimonio: Landmark,
  financiamento_campanha: CircleDollarSign,
  processo: Scale,
  votacao: Vote,
  projeto_lei: ScrollText,
  gasto_parlamentar: Receipt,
  ponto_atencao: TriangleAlert,
}

export interface TimelineFiltersProps {
  visibleLanes: Set<TimelineEventType>
  onToggleLane: (t: TimelineEventType) => void
  counts: Record<TimelineEventType, number>
  showAllProjects: boolean
  onToggleShowAllProjects: () => void
  projectTotalCount: number
  projectVisibleCount: number
}

export function TimelineFilters({
  visibleLanes,
  onToggleLane,
  counts,
  showAllProjects,
  onToggleShowAllProjects,
  projectTotalCount,
  projectVisibleCount,
}: TimelineFiltersProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-[20px] border border-border/50 bg-card/80 p-4 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Camadas
          </p>
          <p className="mt-1 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
            Ligue ou desligue trilhas para limpar o eixo e focar no que importa.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {TIMELINE_EVENT_TYPES.map((t) => {
          const on = visibleLanes.has(t)
          const c = counts[t] ?? 0
          const Icon = FILTER_ICONS[t]
          return (
            <button
              key={t}
              type="button"
              onClick={() => onToggleLane(t)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.04em] transition-colors ${
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/60 bg-secondary/50 text-muted-foreground hover:border-foreground/40 hover:bg-secondary/70"
              }`}
              aria-pressed={on}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              <span>{TIMELANE_LABELS[t]}</span>
              {c > 0 ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                    on ? "bg-background/15 text-background" : "bg-background text-foreground"
                  }`}
                >
                  {c}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      {projectTotalCount > 0 && (
        <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-border/50 bg-secondary/30 px-3 py-2 text-[length:var(--text-caption)] font-semibold text-foreground">
          <input
            type="checkbox"
            checked={showAllProjects}
            onChange={onToggleShowAllProjects}
            className="size-4 rounded border-border"
          />
          Mostrar todos os projetos de lei ({projectVisibleCount} visiveis / {projectTotalCount} no total)
        </label>
      )}
    </div>
  )
}
