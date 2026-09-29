import { CLASSES_TOM_VEREDITO, tomDoVeredito } from "@/lib/checagem-veredito-cor"
import { cn } from "@/lib/utils"

/** Pílula com o rótulo do próprio veículo; a cor vem do mapa determinístico. */
export function VeredictoPill({ label, className }: { label: string; className?: string }) {
  const tom = tomDoVeredito(label)
  return (
    <span
      data-pf-attributed-original-label=""
      data-pf-veredito-tom={tom}
      className={cn(
        "inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-[length:var(--text-caption)] font-bold leading-snug [overflow-wrap:anywhere]",
        CLASSES_TOM_VEREDITO[tom],
        className,
      )}
    >
      {label}
    </span>
  )
}
