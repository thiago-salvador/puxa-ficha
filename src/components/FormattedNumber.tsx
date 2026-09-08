import { formatCompact, formatCompactNumber, formatDecimal, formatPercent } from "@/lib/utils"

type NumberKind = "currency" | "count" | "percent" | "decimal"

/** The full value remains available to screen readers and in the native tooltip. */
export function FormattedNumber({ value, kind = "currency", digits = 1 }: {
  value: number
  kind?: NumberKind
  digits?: number
}) {
  const full = kind === "currency"
    ? `${formatDecimal(value, 2)} reais`
    : kind === "percent"
      ? `${formatDecimal(value, digits)} por cento`
      : formatDecimal(value, kind === "count" ? 0 : digits)
  const compact = kind === "currency" ? formatCompact(value)
    : kind === "count" ? formatCompactNumber(value)
      : kind === "percent" ? formatPercent(value, digits) : formatDecimal(value, digits)
  return <span title={full}><span aria-hidden="true">{compact}</span><span className="sr-only">{full}</span></span>
}
