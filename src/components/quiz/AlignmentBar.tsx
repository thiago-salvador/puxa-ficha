"use client"

import { cn } from "@/lib/utils"

interface AlignmentBarProps {
  value: number
  className?: string
}

export function AlignmentBar({ value, className }: AlignmentBarProps) {
  const pct = Math.max(0, Math.min(100, value))
  const hue = pct < 40 ? "from-red-600 to-red-400" : pct < 70 ? "from-amber-600 to-amber-400" : "from-emerald-600 to-emerald-400"

  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", hue)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
