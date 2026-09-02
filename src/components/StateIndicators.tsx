"use client"

import type { IndicadorEstadual } from "@/lib/types"
import { getEstadoNome } from "@/lib/br-uf"
import {
  STATE_INDICATOR_CONFIG,
  STATE_INDICATOR_ORDER,
} from "@/lib/state-indicator-metadata"
import { formatPercent } from "@/lib/utils"
import { IndicadorFonteTag } from "@/components/IndicadorFonteTag"
import { SectionLabel, SectionTitle } from "./SectionHeader"

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
    <svg width={width} height={height} className="shrink-0" aria-hidden="true">
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
        isPositive ? "text-green-700" : "text-red-700"
      }`}
    >
      {arrow} {formatPercent(Math.abs(pctChange), 1)}
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

  const estadoNome = getEstadoNome(estado) ?? estado

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

  const cards = STATE_INDICATOR_ORDER.filter((key) => byIndicator.has(key)).map((key) => {
      const config = STATE_INDICATOR_CONFIG[key]
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
      {/*
        Abaixo de `sm` o card tem ~114px úteis (2 colunas a 360px). Valor e ano
        ficam em `whitespace-nowrap` e a sparkline só entra a partir de `sm`:
        com ela visível, "R$ 431 bi" quebrava caractere por caractere.
      */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {cards.map(({ key, config, latest, previous, sparkData }) => (
          <div
            key={key}
            data-pf-state-indicator-card
            className="rounded-[16px] border border-border/50 bg-card px-4 py-5 sm:px-5"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-[length:var(--text-eyebrow)]">
              {config.label}
            </p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div className="min-w-0">
                <span className="block whitespace-nowrap font-heading text-[24px] leading-[0.95] tracking-tight text-foreground sm:text-[30px]">
                  {config.format(latest.valor!)}
                </span>
                <span className="mt-1 block whitespace-nowrap text-[10px] font-semibold text-muted-foreground sm:text-[length:var(--text-caption)]">
                  {latest.ano}
                </span>
              </div>
              <div className="hidden sm:block">
                <Sparkline points={sparkData} />
              </div>
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
            {latest.fonte ? (
              <div className="mt-2">
                <IndicadorFonteTag fonte={latest.fonte} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
