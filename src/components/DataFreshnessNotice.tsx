import type { SectionFreshnessInfo } from "@/lib/types"
import { AlertTriangle, CheckCircle2, Clock3, Info } from "lucide-react"

interface DataFreshnessNoticeProps {
  info?: SectionFreshnessInfo | null
  className?: string
}

export function DataFreshnessNotice({
  info,
  className = "",
}: DataFreshnessNoticeProps) {
  if (!info) return null

  const config =
    info.status === "current"
      ? {
          Icon: CheckCircle2,
          container: "border-emerald-200 bg-emerald-50 text-emerald-950",
          icon: "text-emerald-700",
          title: "Dado atual",
        }
      : info.status === "stale"
        ? {
            Icon: AlertTriangle,
            container: "border-amber-200 bg-amber-50 text-amber-950",
            icon: "text-amber-700",
            title: "Pode estar defasado",
          }
        : info.status === "historical"
          ? {
              Icon: Clock3,
              container: "border-border bg-secondary/40 text-foreground",
              icon: "text-muted-foreground",
              title: "Ultimo dado disponivel",
            }
          : {
              Icon: Info,
              container: "border-border bg-secondary/40 text-foreground",
              icon: "text-muted-foreground",
              title: "Sem dado estruturado",
            }

  const { Icon, container, icon, title } = config

  return (
    <div
      data-pf-freshness-key={info.key}
      data-pf-freshness-status={info.status}
      data-pf-freshness-reference-date={info.referenceDate ?? undefined}
      data-pf-freshness-reference-year={info.referenceYear ?? undefined}
      data-pf-freshness-verified-at={info.verifiedAt ?? undefined}
      data-pf-freshness-source={info.sourceLabel ?? undefined}
      data-pf-freshness-current={info.status === "current" ? info.key : undefined}
      data-pf-freshness-historical={
        info.status === "historical" || info.status === "stale" ? info.key : undefined
      }
      className={`rounded-[12px] border px-4 py-3 ${container} ${className}`.trim()}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 size-4 shrink-0 ${icon}`} />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em]">
            {title}
          </p>
          <p className="mt-1 text-[13px] font-medium leading-snug">
            {info.message}
          </p>
        </div>
      </div>
    </div>
  )
}
