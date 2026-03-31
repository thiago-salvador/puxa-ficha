import { formatBRL, formatCompact } from "@/lib/utils"

interface BarItem {
  label: string
  value: number
  highlight?: boolean
}

export function HorizontalBars({ items, maxValue }: { items: BarItem[]; maxValue?: number }) {
  const max = maxValue ?? Math.max(...items.map((i) => i.value), 1)

  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const pct = Math.max((item.value / max) * 100, 2)
        return (
          <div key={item.label}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[length:var(--text-caption)] font-semibold text-foreground sm:text-[length:var(--text-body-sm)]">
                {item.label}
              </span>
              <span className="text-[length:var(--text-caption)] font-bold tabular-nums text-foreground sm:text-[length:var(--text-body-sm)]">
                {formatCompact(item.value)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full transition-all ${item.highlight ? "bg-red-500" : "bg-foreground"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function PatrimonioChart({ data }: { data: { ano: number; valor: number }[] }) {
  if (data.length === 0) return null
  const max = Math.max(...data.map((d) => d.valor), 1)
  const sorted = [...data].sort((a, b) => a.ano - b.ano)

  return (
    <div className="flex items-end gap-2 sm:gap-3">
      {sorted.map((d) => {
        const pct = Math.max((d.valor / max) * 100, 8)
        return (
          <div key={d.ano} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[10px] font-bold tabular-nums text-foreground sm:text-[length:var(--text-caption)]">
              {formatCompact(d.valor)}
            </span>
            <div className="w-full overflow-hidden rounded-t-[4px] bg-secondary" style={{ height: "120px" }}>
              <div
                className="mt-auto w-full rounded-t-[4px] bg-foreground transition-all"
                style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
              />
            </div>
            <span className="text-[10px] font-bold tabular-nums text-muted-foreground sm:text-[length:var(--text-caption)]">
              {d.ano}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function StackedBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((acc, s) => acc + s.value, 0)
  if (total === 0) return null

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {segments.filter(s => s.value > 0).map((s) => (
          <div
            key={s.label}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(s.value / total) * 100}%`,
              backgroundColor: s.color,
              minWidth: s.value > 0 ? "4px" : "0",
            }}
            title={`${s.label}: ${formatBRL(s.value)}`}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {segments.filter(s => s.value > 0).map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[10px] font-semibold text-foreground sm:text-[length:var(--text-caption)]">
              {s.label} ({Math.round((s.value / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
