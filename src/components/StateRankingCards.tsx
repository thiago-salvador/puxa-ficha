import { Check, Minus, X } from "lucide-react"
import { IndicadorFonteTag } from "@/components/IndicadorFonteTag"
import { MetaBadge } from "@/components/MetaBadge"
import type { StateRankingResult } from "@/lib/state-ranking"
import {
  STATE_INDICATOR_CONFIG,
  STATE_INDICATOR_ORDER,
} from "@/lib/state-indicator-metadata"

function QualityBadge({ qualidade }: { qualidade: "bom" | "ruim" | "neutro" }) {
  if (qualidade === "bom") {
    return (
      <MetaBadge tone="positive" className="gap-1 px-2 py-0.5">
        <Check className="size-3 shrink-0" aria-hidden />
        <span>Melhor que a média</span>
      </MetaBadge>
    )
  }
  if (qualidade === "ruim") {
    return (
      <MetaBadge tone="critical" className="gap-1 px-2 py-0.5">
        <X className="size-3 shrink-0" aria-hidden />
        <span>Pior que a média</span>
      </MetaBadge>
    )
  }
  return (
    <MetaBadge tone="muted" className="gap-1 px-2 py-0.5">
      <Minus className="size-3 shrink-0" aria-hidden />
      <span>Próximo da média</span>
    </MetaBadge>
  )
}

export function StateRankingCards({ ranking }: { ranking: StateRankingResult }) {
  if (ranking.rankings.length === 0) return null

  const byKey = new Map(ranking.rankings.map((r) => [r.indicador, r]))
  const ordered = STATE_INDICATOR_ORDER.map((k) => byKey.get(k)).filter(
    (r): r is (typeof ranking.rankings)[0] => r != null
  )

  if (ordered.length === 0) return null

  return (
    <div>
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        Posição no país
      </p>
      <p
        className="mt-1 font-heading uppercase leading-[0.95] text-foreground"
        style={{ fontSize: "clamp(22px, 4vw, 36px)" }}
      >
        Ranking nacional
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {ordered.map((r) => {
          const cfg = STATE_INDICATOR_CONFIG[r.indicador]
          if (!cfg) return null
          const barPct =
            r.total <= 1 ? 100 : Math.round(((r.total - r.posicao + 1) / r.total) * 100)
          return (
            <div
              key={r.indicador}
              className="rounded-[16px] border border-border/50 bg-card px-5 py-5"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-[length:var(--text-eyebrow)]">
                {cfg.label}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="block font-heading text-[24px] leading-[0.95] tracking-tight text-foreground sm:text-[30px]">
                  {cfg.format(r.valor)}
                </span>
                <QualityBadge qualidade={r.qualidade} />
              </div>
              <p className="mt-1 text-[10px] font-semibold text-muted-foreground sm:text-[length:var(--text-caption)]">
                {r.label} · ano {r.ano}
              </p>
              {r.fonte ? (
                <div className="mt-2">
                  <IndicadorFonteTag fonte={r.fonte} />
                </div>
              ) : null}
              <div
                className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
                role="presentation"
              >
                <div
                  className="h-full rounded-full bg-foreground/80 transition-[width] duration-500"
                  style={{ width: `${barPct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
