import type { SectionFreshnessInfo } from "@/lib/types"
import { NoticePanel, type NoticePanelTone } from "./NoticePanel"

interface DataFreshnessNoticeProps {
  info?: SectionFreshnessInfo | null
  className?: string
}

export function DataFreshnessNotice({
  info,
  className = "",
}: DataFreshnessNoticeProps) {
  if (!info) return null

  const config: { tone: NoticePanelTone; title: string } =
    info.status === "current"
      ? {
          tone: "neutral",
          title: "Verificação recente",
        }
      : info.status === "stale"
        ? {
            tone: "caution",
            title: "Verificação desatualizada",
          }
        : info.status === "historical"
        ? {
            tone: "neutral",
            title: "Último dado disponível",
          }
          : {
              tone: "neutral",
              title: "Sem dado estruturado",
            }

  const { tone, title } = config

  return (
    <NoticePanel
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
      tone={tone}
      eyebrow={title}
      description={info.message}
      className={className}
    >
    </NoticePanel>
  )
}
