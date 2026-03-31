import { AlertTriangle } from "lucide-react"
import type { PontoAtencao } from "@/lib/types"

export function AlertBanner({ pontos }: { pontos: PontoAtencao[] }) {
  const graves = pontos.filter((p) => p.gravidade === "critica" || p.gravidade === "alta")
  if (graves.length === 0) return null

  return (
    <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 sm:rounded-[16px] sm:px-5 sm:py-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600 sm:size-5" />
        <div className="flex-1">
          <p className="text-[length:var(--text-body-sm)] font-bold text-red-900 sm:text-[length:var(--text-body)]">
            {graves.length} alerta{graves.length > 1 ? "s" : ""} grave{graves.length > 1 ? "s" : ""}
          </p>
          <ul className="mt-1 space-y-0.5">
            {graves.map((p) => (
              <li key={p.id} className="text-[length:var(--text-caption)] font-medium text-red-800 sm:text-[length:var(--text-body-sm)]">
                {p.titulo}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
