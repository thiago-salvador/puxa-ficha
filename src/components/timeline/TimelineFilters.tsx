"use client"

import {
  TIMELANE_LABELS,
  TIMELINE_EVENT_TYPES,
  type TimelineEventType,
} from "@/lib/timeline-utils"

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
    <div className="mb-6 flex flex-col gap-3">
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        Camadas
      </p>
      <div className="flex flex-wrap gap-2">
        {TIMELINE_EVENT_TYPES.map((t) => {
          const on = visibleLanes.has(t)
          const c = counts[t] ?? 0
          return (
            <button
              key={t}
              type="button"
              onClick={() => onToggleLane(t)}
              className={`rounded-full border px-3 py-1.5 text-[length:var(--text-caption)] font-bold transition-colors ${
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/60 bg-secondary/50 text-muted-foreground hover:border-foreground/40"
              }`}
              aria-pressed={on}
            >
              {TIMELANE_LABELS[t]}
              {c > 0 ? ` (${c})` : ""}
            </button>
          )
        })}
      </div>
      {projectTotalCount > 0 && (
        <label className="flex cursor-pointer items-center gap-2 text-[length:var(--text-caption)] font-semibold text-foreground">
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
