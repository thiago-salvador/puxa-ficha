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
import { comparisonIssue, indicatorPeriod, metadataText } from "@/lib/state-indicator-comparability"

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
  neutral,
}: {
  latest: number
  previous: number
  lowerIsBetter: boolean
  neutral?: boolean
}) {
  if (previous === 0) return null
  const pctChange = ((latest - previous) / Math.abs(previous)) * 100
  if (Math.abs(pctChange) < 0.1) return null

  const isUp = pctChange > 0
  const isPositive = lowerIsBetter ? !isUp : isUp
  const arrow = isUp ? "\u2191" : "\u2193"

  return (
    <span
      className={`text-[length:var(--text-eyebrow)] font-bold sm:text-[length:var(--text-caption)] ${
        neutral ? "text-muted-foreground" : isPositive ? "text-green-700" : "text-red-700"
      }`}
    >
      {arrow} {formatPercent(Math.abs(pctChange), 1)}
    </span>
  )
}

export function StateIndicators({
  indicadores,
  estado,
  unavailable = false,
}: {
  indicadores: IndicadorEstadual[]
  estado: string
  unavailable?: boolean
}) {
  if (indicadores.length === 0) return <div className="rounded-[16px] border border-border/50 p-5"><p className="font-semibold">{unavailable ? "Indicadores temporariamente indisponíveis" : "Indicadores ainda não disponíveis"}</p><p className="mt-2 text-sm text-muted-foreground">{unavailable ? "Não foi possível carregar a fonte nesta consulta. Tente recarregar a página." : "Não há valores publicados nesta base para o estado. Ausência de dado não significa valor zero."}</p><a href="https://www.ibge.gov.br/cidades-e-estados.html" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm underline">Consultar estados no IBGE</a></div>

  const estadoNome = getEstadoNome(estado) ?? estado

  // Group by indicator, sorted by year desc
  const byIndicator = new Map<string, IndicadorEstadual[]>()
  for (const ind of indicadores) {
    if (ind.valor == null || !Number.isFinite(ind.valor)) continue
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
      const previous = items.slice(1).find(item => comparisonIssue(latest, item, true) === null) ?? null
      // Last 5 years for sparkline, chronological order
      const sparkData = items.filter(item => item === latest || comparisonIssue(latest, item, true) === null)
        .slice(0, 5)
        .reverse()
        .map((i) => i.valor!)

      return { key, config, latest, previous, sparkData }
    })

  if (cards.length === 0) return <p className="text-sm text-muted-foreground">Não há valores numéricos disponíveis para os indicadores deste estado. Ausência de dado não significa zero.</p>

  return (
    <div>
      <SectionLabel>O estado</SectionLabel>
      <SectionTitle>{estadoNome}</SectionTitle>
      <p className="mt-3 text-sm text-muted-foreground">O tamanho de um estado não mede a qualidade de uma gestão. Cada indicador tem seu próprio período.</p>
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
            <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {config.label}
            </p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div className="min-w-0">
                <span className="block whitespace-nowrap font-heading text-[24px] leading-[0.95] tracking-tight text-foreground sm:text-[30px]">
                  {config.format(latest.valor!)}
                </span>
                <span className="mt-1 block text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground sm:text-[length:var(--text-caption)]">
                  Referência: {indicatorPeriod(latest).label}
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
                  neutral={config.scale}
                />
                <span className="ml-2 text-xs text-muted-foreground">{previous.ano} a {latest.ano}</span>
              </div>
            )}
            <p className="mt-3 text-xs font-semibold text-muted-foreground">{key === "populacao_estimada" ? "Medida de tamanho" : config.scale ? "Medida de escala" : "Contexto social"}</p>
            {latest.fonte ? (
              <div className="mt-2">
                <IndicadorFonteTag fonte={latest.fonte} />
              </div>
            ) : null}
            <details className="mt-3 border-t border-border/50 pt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-semibold text-foreground">Fonte e limites</summary>
              <div className="mt-2 space-y-2">
                <p>Unidade: {latest.unidade ?? "não informada"}. Fonte: {latest.fonte || "não informada"}.</p>
                <p>Publicação na fonte: {metadataText(latest, "data_publicacao", "published_at") ?? "não informada"}.</p>
                <p>Revisão do indicador: {metadataText(latest, "data_revisao", "reviewed_at") ?? "não informada"}.</p>
                {config.scale && <p>Maior ou menor não significa melhor ou pior.</p>}
                {!previous && <p>Variação indisponível: não há duas referências com intervalo e definição confirmados.</p>}
                {!indicatorPeriod(latest).key && <p>Sem o período completo, a comparação fica indisponível.</p>}
              </div>
            </details>
          </div>
        ))}
      </div>
    </div>
  )
}
