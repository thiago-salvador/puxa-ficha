import type { DataSourceStatus } from "@/lib/types"
import { NoticePanel } from "./NoticePanel"

interface DataSourceNoticeProps {
  status: DataSourceStatus
  message?: string | null
  className?: string
}

export function DataSourceNotice({
  status,
  message,
  className = "",
}: DataSourceNoticeProps) {
  if (status === "live") return null

  const fallbackMessage =
    "Algumas fontes públicas não responderam. Parte do conteúdo pode estar incompleta nesta página."

  return (
    <NoticePanel
      role="status"
      tone="caution"
      eyebrow="Fonte temporariamente instável"
      description={message ?? fallbackMessage}
      className={className}
    >
    </NoticePanel>
  )
}
