import { AlertTriangle, TrendingUp } from "lucide-react"
import type { PontoAtencao } from "@/lib/types"

type BannerVariant = "critical" | "positive"

const VARIANT_STYLES: Record<
  BannerVariant,
  {
    container: string
    icon: string
    title: string
    item: string
    button: string
    Icon: typeof AlertTriangle
  }
> = {
  critical: {
    container: "border-red-200 bg-red-50",
    icon: "text-red-600",
    title: "text-red-900",
    item: "text-red-800",
    button: "border-red-200 text-red-900 hover:border-red-300 hover:bg-red-100",
    Icon: AlertTriangle,
  },
  positive: {
    container: "border-green-200 bg-green-50",
    icon: "text-green-600",
    title: "text-green-900",
    item: "text-green-800",
    button: "border-green-200 text-green-900 hover:border-green-300 hover:bg-green-100",
    Icon: TrendingUp,
  },
}

export function AlertBanner({
  pontos,
  variant = "critical",
  actionLabel,
  onAction,
}: {
  pontos: PontoAtencao[]
  variant?: BannerVariant
  actionLabel?: string
  onAction?: () => void
}) {
  if (pontos.length === 0) return null

  const styles = VARIANT_STYLES[variant]
  const heading =
    variant === "positive"
      ? `${pontos.length} ponto${pontos.length > 1 ? "s" : ""} positivo${pontos.length > 1 ? "s" : ""}`
      : `${pontos.length} alerta${pontos.length > 1 ? "s" : ""} grave${pontos.length > 1 ? "s" : ""}`

  return (
    <div className={`rounded-[12px] border px-4 py-3 sm:rounded-[16px] sm:px-5 sm:py-4 ${styles.container}`}>
      <div className="flex items-start gap-3">
        <styles.Icon className={`mt-0.5 size-4 shrink-0 sm:size-5 ${styles.icon}`} />
        <div className="flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-[length:var(--text-body-sm)] font-bold sm:text-[length:var(--text-body)] ${styles.title}`}>
              {heading}
            </p>
            {actionLabel && onAction && (
              <button
                type="button"
                onClick={onAction}
                className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors sm:text-[length:var(--text-eyebrow)] ${styles.button}`}
              >
                {actionLabel}
              </button>
            )}
          </div>
          <ul className="mt-1 space-y-0.5">
            {pontos.slice(0, 3).map((ponto) => (
              <li key={ponto.id} className={`text-[length:var(--text-caption)] font-medium sm:text-[length:var(--text-body-sm)] ${styles.item}`}>
                {ponto.titulo}
              </li>
            ))}
          </ul>
          {pontos.length > 3 && (
            <p className={`mt-1 text-[length:var(--text-caption)] font-bold ${styles.item}`}>
              +{pontos.length - 3} mais
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
