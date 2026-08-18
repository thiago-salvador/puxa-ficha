import { formatStateIndicatorFonte } from "@/lib/state-indicator-fonte"

export function IndicadorFonteTag({
  fonte,
  className = "",
}: {
  fonte: string | null | undefined
  className?: string
}) {
  if (!fonte?.trim()) return null
  const label = formatStateIndicatorFonte(fonte)
  if (!label) return null
  return (
    <span
      data-pf-source-badge=""
      data-pf-source-label={label}
      data-pf-source-value={fonte.trim()}
      className={`text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground ${className}`.trim()}
    >
      {label}
    </span>
  )
}
