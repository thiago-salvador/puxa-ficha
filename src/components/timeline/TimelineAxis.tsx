"use client"

import { useMemo } from "react"
import { getTimelineAxisTicks } from "@/lib/timeline-utils"

export interface TimelineAxisProps {
  yearMin: number
  yearMax: number
  leftPad: number
  rightPad: number
  width: number
  y: number
}

/** Tick marks and year labels for the horizontal time axis (SVG coordinates). */
export function TimelineAxis({ yearMin, yearMax, leftPad, rightPad, width, y }: TimelineAxisProps) {
  const innerW = width - leftPad - rightPad
  const span = Math.max(yearMax - yearMin, 1)

  const ticks = useMemo(() => getTimelineAxisTicks(yearMin, yearMax), [yearMin, yearMax])

  function xForYear(yr: number) {
    return leftPad + ((yr - yearMin) / span) * innerW
  }

  return (
    <g aria-hidden="true">
      <line
        x1={leftPad}
        y1={y}
        x2={width - rightPad}
        y2={y}
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeWidth={1}
        className="text-foreground"
      />
      {ticks.map((yr) => (
        <g key={yr}>
          <line
            x1={xForYear(yr)}
            y1={y}
            x2={xForYear(yr)}
            y2={y + 8}
            stroke="currentColor"
            strokeOpacity={0.24}
            strokeWidth={1}
            className="text-foreground"
          />
          <text
            x={xForYear(yr)}
            y={y + 22}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px] font-bold tracking-[0.04em]"
            style={{ fontSize: 10 }}
          >
            {yr}
          </text>
        </g>
      ))}
    </g>
  )
}
