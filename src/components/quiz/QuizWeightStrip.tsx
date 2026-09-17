"use client"

import type { QuizScoreExplanation } from "@/lib/quiz-types"

interface QuizWeightStripProps {
  explanation: QuizScoreExplanation
}

export function QuizWeightStrip({ explanation }: QuizWeightStripProps) {
  const v = Math.round((explanation.peso_voto_usado ?? 0) * 100)
  const p = Math.round((explanation.peso_posicoes_usado ?? 0) * 100)
  const segments = [
    { key: "v", label: "Votos", pct: v, className: "bg-foreground/90" },
    ...(p > 0 ? [{ key: "p", label: "Posições", pct: p, className: "bg-foreground/35" }] : []),
  ].filter((s) => s.pct > 0)

  if (segments.length === 0) return null

  return (
    <div className="space-y-2" aria-label="Evidências usadas na comparação">
      <p className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-wide text-muted-foreground">Composição das evidências</p>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {segments.map((s) => (
          <div
            key={s.key}
            className={`${s.className} min-w-0 transition-[width]`}
            style={{ width: `${s.pct}%` }}
            title={`${s.label}: ${s.pct}%`}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[length:var(--text-eyebrow)] text-muted-foreground">
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
