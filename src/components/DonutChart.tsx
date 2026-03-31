import { formatBRL } from "@/lib/utils"

interface Segment {
  label: string
  value: number
  color: string
}

export function DonutChart({
  segments,
  size = 160,
  strokeWidth = 24,
  centerLabel,
  centerValue,
}: {
  segments: Segment[]
  size?: number
  strokeWidth?: number
  centerLabel?: string
  centerValue?: string
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0)
  if (total === 0) return null

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  let cumulativePercent = 0
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const percent = s.value / total
      const offset = circumference * (1 - percent)
      const rotation = cumulativePercent * 360 - 90
      cumulativePercent += percent
      return { ...s, percent, offset, rotation }
    })

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--gray-100)"
            strokeWidth={strokeWidth}
          />
          {/* Segments */}
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference}`}
              strokeDashoffset={arc.offset}
              strokeLinecap="round"
              transform={`rotate(${arc.rotation} ${center} ${center})`}
              style={{ transition: "stroke-dashoffset 0.5s ease" }}
            />
          ))}
        </svg>
        {/* Center text */}
        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {centerValue && (
              <span className="text-[18px] font-bold leading-none tracking-tight text-foreground sm:text-[22px]">
                {centerValue}
              </span>
            )}
            {centerLabel && (
              <span className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
                {centerLabel}
              </span>
            )}
          </div>
        )}
      </div>
      {/* Legend */}
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {arcs.map((arc) => (
          <div key={arc.label} className="flex items-center gap-1.5">
            <div className="size-2.5 rounded-full" style={{ backgroundColor: arc.color }} />
            <span className="text-[10px] font-semibold text-muted-foreground sm:text-[length:var(--text-caption)]">
              {arc.label} ({Math.round(arc.percent * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
