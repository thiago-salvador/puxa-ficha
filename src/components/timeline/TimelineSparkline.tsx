"use client"

import type { TimelineEvent } from "@/lib/timeline-utils"

type MoneyLane = "patrimonio" | "gasto_parlamentar"

function buildPolylinePoints(
  events: TimelineEvent[],
  laneType: MoneyLane,
  laneY: number,
  laneH: number,
  xForYear: (yr: number) => number,
): string | null {
  const pts = events
    .filter((e) => e.type === laneType && e.value != null && e.value > 0)
    .sort((a, b) => a.year_start - b.year_start)
  if (pts.length < 2) return null

  const values = pts.map((p) => p.value!)
  const vmin = Math.min(...values)
  const vmax = Math.max(...values)
  const vspan = Math.max(vmax - vmin, 1)
  const padY = 8

  return pts
    .map((p) => {
      const x = xForYear(p.year_start)
      const ny = (p.value! - vmin) / vspan
      const y = laneY + laneH - padY - ny * (laneH - 2 * padY)
      return `${x},${y}`
    })
    .join(" ")
}

export interface LaneSparklineProps {
  events: TimelineEvent[]
  laneType: MoneyLane
  laneY: number
  laneHeight: number
  xForYear: (yr: number) => number
}

/** Conecta pontos de patrimonio ou gastos na mesma swim lane (Fase B, plano). */
export function LaneSparkline({ events, laneType, laneY, laneHeight, xForYear }: LaneSparklineProps) {
  const points = buildPolylinePoints(events, laneType, laneY, laneHeight, xForYear)
  if (!points) return null

  const stroke = laneType === "patrimonio" ? "#059669" : "#737373"

  return (
    <polyline
      points={points}
      fill="none"
      stroke={stroke}
      strokeWidth={1.5}
      strokeOpacity={0.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none"
      aria-hidden
    />
  )
}
