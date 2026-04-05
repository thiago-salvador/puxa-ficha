"use client"

import { useMemo } from "react"

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

  const ticks = useMemo(() => {
    const out: number[] = []
    const rawSpan = yearMax - yearMin
    let step = 1
    if (rawSpan > 40) step = 10
    else if (rawSpan > 24) step = 5
    else if (rawSpan > 14) step = 2
    for (let yv = yearMin; yv <= yearMax; yv += step) out.push(yv)
    if (out[out.length - 1] !== yearMax) out.push(yearMax)
    return out
  }, [yearMin, yearMax])

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
            y2={y + 6}
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeWidth={1}
            className="text-foreground"
          />
          <text
            x={xForYear(yr)}
            y={y + 20}
            textAnchor="middle"
            className="fill-muted-foreground text-[9px] font-bold uppercase tracking-tight"
            style={{ fontSize: 9 }}
          >
            {yr}
          </text>
        </g>
      ))}
    </g>
  )
}
