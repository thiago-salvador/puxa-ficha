"use client"

import type { QuizScoreExplanation } from "@/lib/quiz-types"

interface QuizWeightStripProps {
  explanation: QuizScoreExplanation
}

export function QuizWeightStrip({ explanation }: QuizWeightStripProps) {
  const v = Math.round((explanation.peso_voto_usado ?? 0) * 100)
  const e = Math.round((explanation.peso_espectro_usado ?? 0) * 100)
  const p = Math.round((explanation.peso_posicoes_usado ?? 0) * 100)
  const pl = Math.round((explanation.peso_projetos_usado ?? 0) * 100)
  const fin = Math.round((explanation.peso_financiamento_usado ?? 0) * 100)
  const segments = [
    { key: "v", label: "Votos", pct: v, className: "bg-foreground/90" },
    { key: "e", label: "Espectro", pct: e, className: "bg-foreground/50" },
    ...(p > 0 ? [{ key: "p", label: "Posições", pct: p, className: "bg-foreground/35" }] : []),
    ...(pl > 0 ? [{ key: "pl", label: "Projetos", pct: pl, className: "bg-foreground/25" }] : []),
    ...(fin > 0 ? [{ key: "fin", label: "Financ.", pct: fin, className: "bg-foreground/18" }] : []),
  ].filter((s) => s.pct > 0)

  if (segments.length === 0) return null

  return (
    <div className="space-y-2" aria-label="Pesos efetivos no resultado">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pesos no resultado</p>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img">
        {segments.map((s) => (
          <div
            key={s.key}
            className={`${s.className} min-w-0 transition-[width]`}
            style={{ width: `${s.pct}%` }}
            title={`${s.label}: ${s.pct}%`}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-sm ${s.className}`} aria-hidden />
            {s.label} {s.pct}%
          </li>
        ))}
      </ul>
    </div>
  )
}
