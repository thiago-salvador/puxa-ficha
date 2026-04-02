import type { DataSourceStatus } from "@/lib/types"
import { AlertTriangle, DatabaseZap } from "lucide-react"

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

  const isDegraded = status === "degraded"
  const Icon = isDegraded ? AlertTriangle : DatabaseZap
  const title = isDegraded ? "Fonte temporariamente instavel" : "Modo demonstracao"
  const fallbackMessage = isDegraded
    ? "Algumas fontes publicas nao responderam. Parte do conteudo pode estar incompleta nesta pagina."
    : "Os dados exibidos nesta pagina estao vindo do fallback local de desenvolvimento."

  return (
    <div
      role="status"
      className={`rounded-[16px] border px-4 py-3 sm:px-5 ${
        isDegraded
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-sky-200 bg-sky-50 text-sky-950"
      } ${className}`.trim()}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={`mt-0.5 size-4 shrink-0 ${
            isDegraded ? "text-amber-700" : "text-sky-700"
          }`}
        />
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em]">
            {title}
          </p>
          <p className="mt-1 text-[13px] font-medium leading-snug">
            {message ?? fallbackMessage}
          </p>
        </div>
      </div>
    </div>
  )
}
