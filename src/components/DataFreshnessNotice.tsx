import type { SectionFreshnessInfo } from "@/lib/types"
import { formatDate } from "@/lib/utils"
import { NoticePanel, type NoticePanelTone } from "./NoticePanel"
import { TrackedExternalSourceLink } from "./TrackedExternalSourceLink"

interface DataFreshnessNoticeProps {
  info?: SectionFreshnessInfo | null
  className?: string
}

export function DataFreshnessNotice({
  info,
  className = "",
}: DataFreshnessNoticeProps) {
  if (!info) return null

  const isInconclusiveResult =
    info.status === "stale" && /indeterminado|inconclusiv/i.test(info.message)
  const config: { tone: NoticePanelTone; title: string } =
    info.status === "current"
      ? {
          tone: "neutral",
          title: "Verificação recente",
        }
      : info.status === "stale"
        ? {
            tone: "caution",
            title: isInconclusiveResult ? "Resultado inconclusivo" : "Verificação desatualizada",
          }
      : info.status === "historical"
        ? {
            tone: "neutral",
            title: "Último dado disponível",
          }
        : info.status === "not_applicable"
          ? {
              tone: "neutral",
              title: "Não se aplica",
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
      data-pf-freshness-not-applicable={
        info.status === "not_applicable" ? info.key : undefined
      }
      tone={tone}
      eyebrow={title}
      description={
        info.status === "not_applicable" ? (
          <>
            <p>{info.message}</p>
            <p className="mt-2 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
              Fonte: {info.sourceLabel ?? "não informada"}. Verificado em {info.verifiedAt ? formatDate(info.verifiedAt) : "data não informada"}.
              {info.scope ? ` Escopo: ${info.scope}.` : ""}
            </p>
            {info.source_urls && info.source_urls.length > 0 && (
              <p className="mt-2 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                <span>Fontes consultadas: </span>
                {info.source_urls.map((url, index) => (
                  <span key={url}>
                    {index > 0 ? "; " : ""}
                    <TrackedExternalSourceLink
                      area="candidate-freshness"
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      Fonte {index + 1}
                    </TrackedExternalSourceLink>
                  </span>
                ))}
                .
              </p>
            )}
          </>
        ) : info.message
      }
      className={className}
    >
    </NoticePanel>
  )
}
