/** Contagem ao lado do título de um card da visão geral (mesmo desenho do badge das abas). */
export function OverviewCountBadge({ value }: { value: number }) {
  return (
    <span
      data-pf-overview-count-badge={value}
      className="inline-flex min-w-[22px] shrink-0 items-center justify-center rounded-full bg-foreground px-1.5 py-1 text-[length:var(--text-eyebrow)] font-bold leading-none tabular-nums text-background"
    >
      {value}
    </span>
  )
}
