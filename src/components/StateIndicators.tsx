"use client"

import type { IndicadorEstadual } from "@/lib/types"
import { SectionLabel, SectionTitle } from "./SectionHeader"

const UF_NAMES: Record<string, string> = {
  ac: "Acre", al: "Alagoas", am: "Amazonas", ap: "Amapa", ba: "Bahia",
  ce: "Ceara", df: "Distrito Federal", es: "Espirito Santo", go: "Goias",
  ma: "Maranhao", mg: "Minas Gerais", ms: "Mato Grosso do Sul", mt: "Mato Grosso",
  pa: "Para", pb: "Paraiba", pe: "Pernambuco", pi: "Piaui", pr: "Parana",
  rj: "Rio de Janeiro", rn: "Rio Grande do Norte", ro: "Rondonia", rr: "Roraima",
  rs: "Rio Grande do Sul", sc: "Santa Catarina", se: "Sergipe", sp: "Sao Paulo",
  to: "Tocantins",
}

interface IndicatorConfig {
  label: string
  format: (value: number) => string
  /** true = lower is better (homicidios, pobreza, desemprego, gini) */
  lowerIsBetter: boolean
}

const INDICATOR_CONFIG: Record<string, IndicatorConfig> = {
  homicidios_100k: {
    label: "Homicidios por 100k hab.",
    format: (v) => v.toFixed(1),
    lowerIsBetter: true,
  },
  pib_total: {
    label: "PIB Total",
    format: (v) => {
      const billions = v / 1_000_000
      if (billions >= 1) return `R$ ${billions.toFixed(0)} bi`
      const millions = v / 1_000
      return `R$ ${millions.toFixed(0)} mi`
    },
    lowerIsBetter: false,
  },
  populacao_estimada: {
    label: "Populacao",
    format: (v) => {
      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} mi`
      if (v >= 1_000) return `${(v / 1_000).toFixed(0)} mil`
      return v.toFixed(0)
    },
    lowerIsBetter: false,
  },
  gini: {
    label: "Indice de Gini",
    format: (v) => v.toFixed(3),
    lowerIsBetter: true,
  },
  taxa_desemprego: {
    label: "Taxa de Desemprego",
    format: (v) => `${v.toFixed(1)}%`,
    lowerIsBetter: true,
  },
  taxa_pobreza: {
    label: "Taxa de Pobreza",
    format: (v) => `${v.toFixed(1)}%`,
    lowerIsBetter: true,
  },
}

const INDICATOR_ORDER = [
  "populacao_estimada",
  "pib_total",
  "taxa_desemprego",
  "taxa_pobreza",
  "homicidios_100k",
  "gini",
]

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null

  const width = 80
  const height = 28
  const padding = 2

  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1

  const coords = points.map((val, i) => {
    const x = padding + (i / (points.length - 1)) * (width - padding * 2)
    const y = padding + (1 - (val - min) / range) * (height - padding * 2)
    return `${x},${y}`
  })

  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-muted-foreground/60"
      />
      {/* Latest point dot */}
      {(() => {
        const last = coords[coords.length - 1].split(",")
        return (
          <circle
            cx={last[0]}
            cy={last[1]}
            r="2.5"
            fill="currentColor"
            className="text-foreground"
          />
        )
      })()}
    </svg>
  )
}

function TrendArrow({
  latest,
  previous,
  lowerIsBetter,
}: {
  latest: number
  previous: number
  lowerIsBetter: boolean
}) {
  if (previous === 0) return null
  const pctChange = ((latest - previous) / Math.abs(previous)) * 100
  if (Math.abs(pctChange) < 0.1) return null

  const isUp = pctChange > 0
  const isPositive = lowerIsBetter ? !isUp : isUp
  const arrow = isUp ? "\u2191" : "\u2193"

  return (
    <span
      className={`text-[10px] font-bold sm:text-[length:var(--text-caption)] ${
        isPositive ? "text-green-600" : "text-red-600"
      }`}
    >
      {arrow} {Math.abs(pctChange).toFixed(1)}%
    </span>
  )
}

export function StateIndicators({
  indicadores,
  estado,
}: {
  indicadores: IndicadorEstadual[]
  estado: string
}) {
  if (indicadores.length === 0) return null

  const estadoNome = UF_NAMES[estado.toLowerCase()] ?? estado

  // Group by indicator, sorted by year desc
  const byIndicator = new Map<string, IndicadorEstadual[]>()
  for (const ind of indicadores) {
    if (ind.valor == null) continue
    const existing = byIndicator.get(ind.indicador) ?? []
    existing.push(ind)
    byIndicator.set(ind.indicador, existing)
  }

  // Sort each group by year desc
  for (const [key, items] of byIndicator) {
    byIndicator.set(
      key,
      items.sort((a, b) => b.ano - a.ano)
    )
  }

  const cards = INDICATOR_ORDER
    .filter((key) => byIndicator.has(key))
    .map((key) => {
      const config = INDICATOR_CONFIG[key]
      const items = byIndicator.get(key)!
      const latest = items[0]
      const previous = items.length > 1 ? items[1] : null
      // Last 5 years for sparkline, chronological order
      const sparkData = items
        .slice(0, 5)
        .reverse()
        .map((i) => i.valor!)

      return { key, config, latest, previous, sparkData }
    })

  if (cards.length === 0) return null

  return (
    <div>
      <SectionLabel>O estado</SectionLabel>
      <SectionTitle>{estadoNome}</SectionTitle>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {cards.map(({ key, config, latest, previous, sparkData }) => (
          <div
            key={key}
            className="rounded-[16px] border border-border/50 bg-card px-5 py-5"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-[length:var(--text-eyebrow)]">
              {config.label}
            </p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div>
                <span className="block font-heading text-[24px] leading-[0.95] tracking-tight text-foreground sm:text-[30px]">
                  {config.format(latest.valor!)}
                </span>
                <span className="mt-1 block text-[10px] font-semibold text-muted-foreground sm:text-[length:var(--text-caption)]">
                  {latest.ano}
                </span>
              </div>
              <Sparkline points={sparkData} />
            </div>
            {previous && (
              <div className="mt-2">
                <TrendArrow
                  latest={latest.valor!}
                  previous={previous.valor!}
                  lowerIsBetter={config.lowerIsBetter}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
