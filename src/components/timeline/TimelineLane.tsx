"use client"

import type { ReactNode } from "react"
import { TIMELANE_LABELS, type TimelineEventType } from "@/lib/timeline-utils"

export interface TimelineLaneProps {
  type: TimelineEventType
  laneY: number
  laneHeight: number
  leftPad: number
  chartRight: number
  children: ReactNode
  /** Extra class on the root `<g>` (ex.: intro animation targets). */
  className?: string
}

/** One swim lane: label on the left + SVG content area. */
export function TimelineLane({
  type,
  laneY,
  laneHeight,
  leftPad,
  chartRight,
  children,
  className,
}: TimelineLaneProps) {
  return (
    <g className={className}>
      <text
        x={8}
        y={laneY + laneHeight / 2 + 4}
        className="fill-muted-foreground text-[9px] font-bold uppercase tracking-[0.08em]"
        style={{ fontSize: 9 }}
      >
        {TIMELANE_LABELS[type]}
      </text>
      <line
        x1={leftPad - 4}
        y1={laneY + laneHeight}
        x2={chartRight}
        y2={laneY + laneHeight}
        stroke="currentColor"
        strokeOpacity={0.08}
        strokeWidth={1}
        className="text-foreground"
      />
      {children}
    </g>
  )
}
