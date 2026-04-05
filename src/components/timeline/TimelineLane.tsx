"use client"

import type { ReactNode } from "react"
import { TIMELANE_LABELS, type TimelineEventType } from "@/lib/timeline-utils"
import { getLaneTheme } from "./TimelineEvent"

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
  const theme = getLaneTheme(type)
  const pillWidth = Math.max(Math.min(leftPad - 16, 104), 84)

  return (
    <g className={className}>
      <rect
        x={8}
        y={laneY + laneHeight / 2 - 11}
        width={pillWidth}
        height={22}
        rx={11}
        fill={theme.softFill}
        stroke={theme.softStroke}
        strokeWidth={1}
      />
      <circle cx={20} cy={laneY + laneHeight / 2} r={3.5} fill={theme.marker} />
      <text
        x={30}
        y={laneY + laneHeight / 2 + 4}
        className="text-[9px] font-bold uppercase tracking-[0.08em]"
        fill={theme.text}
        style={{ fontSize: 9 }}
      >
        {TIMELANE_LABELS[type]}
      </text>
      <line
        x1={leftPad - 4}
        y1={laneY + laneHeight / 2}
        x2={chartRight}
        y2={laneY + laneHeight / 2}
        stroke={theme.softStroke}
        strokeOpacity={0.6}
        strokeWidth={1}
      />
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
