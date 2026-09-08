"use client"

import type { IndicadorEstadual } from "@/lib/types"
import { getEstadoNome } from "@/lib/br-uf"
import { STATE_INDICATOR_CONFIG, STATE_INDICATOR_ORDER } from "@/lib/state-indicator-metadata"
import { formatPercent } from "@/lib/utils"
import { IndicadorFonteTag } from "@/components/IndicadorFonteTag"
import { comparisonIssue, indicatorPeriod, latestIndicator, metadataText } from "@/lib/state-indicator-comparability"

const SHORT_LABELS: Record<string, string> = {
  populacao_estimada: "População", pib_total: "PIB", taxa_desemprego: "Desemprego",
  taxa_pobreza: "Pobreza", homicidios_100k: "Homicídios/100 mil",
}

export function StateIndicators({ indicadores, estado, unavailable = false }: {
  indicadores: IndicadorEstadual[]; estado: string; unavailable?: boolean
}) {
  if (indicadores.length === 0) return <div className="rounded-xl border border-border/50 p-4"><p className="font-semibold">{unavailable ? "Indicadores temporariamente indisponíveis" : "Indicadores ainda não disponíveis"}</p><p className="mt-2 text-sm text-muted-foreground">{unavailable ? "Não foi possível carregar a fonte nesta consulta. Tente recarregar a página." : "Não há valores publicados nesta base para o estado. Ausência de dado não significa valor zero."}</p><a href="https://www.ibge.gov.br/cidades-e-estados.html" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm underline">Consultar estados no IBGE</a></div>

  return <div aria-label={`Indicadores de ${getEstadoNome(estado) ?? estado}`} className="grid grid-cols-1 items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
    {STATE_INDICATOR_ORDER.map(key => {
      const config = STATE_INDICATOR_CONFIG[key]
      const latest = latestIndicator(indicadores, estado, key)
      const previous = latest ? indicadores.filter(row => row.estado.toUpperCase() === estado.toUpperCase() && comparisonIssue(latest, row, true) === null).sort((a, b) => b.ano - a.ano)[0] : undefined
      const change = latest?.valor != null && previous?.valor ? ((latest.valor - previous.valor) / Math.abs(previous.valor)) * 100 : null
      const period = latest ? indicatorPeriod(latest) : null
      return <details key={key} data-pf-state-indicator-card className="group min-w-0 rounded-xl border border-border/50 bg-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-3 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 font-semibold text-muted-foreground">{SHORT_LABELS[key] ?? config.label}</span>
          <span className="shrink-0 whitespace-nowrap font-heading text-base leading-none tracking-tight text-foreground">{latest?.valor != null ? config.format(latest.valor) : "Sem dado"}</span>
          <span className="shrink-0 whitespace-nowrap text-[length:var(--text-eyebrow)] text-muted-foreground">{latest ? `${latest.ano}${period?.key ? "" : "*"}` : ""}</span>
          <span aria-hidden="true" className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
          <span className="sr-only">Abrir fonte e limites de {config.label}</span>
        </summary>
        <div className="space-y-2 border-t border-border/50 px-3 py-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">{config.label} · Fonte e limites</p>
          {latest ? <>
            <p>Referência: {period!.label}.</p>
            <p>{key === "populacao_estimada" ? "Medida de tamanho" : config.scale ? "Medida de escala" : "Contexto social"}.</p>
            {latest.fonte && <IndicadorFonteTag fonte={latest.fonte} />}
            <p>Unidade: {latest.unidade ?? "não informada"}. Fonte: {latest.fonte || "não informada"}.</p>
            <p>Publicação na fonte: {metadataText(latest, "data_publicacao", "published_at") ?? "não informada"}.</p>
            <p>Revisão do indicador: {metadataText(latest, "data_revisao", "reviewed_at") ?? "não informada"}.</p>
            {config.scale && <p>Maior ou menor não significa melhor ou pior.</p>}
            {change != null && previous ? <p>Variação de {previous.ano} a {latest.ano}: {change > 0 ? "+" : change < 0 ? "−" : ""}{formatPercent(Math.abs(change), 1)}.</p> : <p>Variação indisponível: não há duas referências com intervalo e definição confirmados e base diferente de zero.</p>}
            {!period!.key && <p>* Sem o período completo, a comparação fica indisponível.</p>}
          </> : <><p>Não há valor numérico disponível nesta base para este indicador. Ausência de dado não significa zero.</p><a href="https://www.ibge.gov.br/cidades-e-estados.html" target="_blank" rel="noopener noreferrer" className="inline-block underline">Consultar estados no IBGE</a></>}
        </div>
      </details>
    })}
  </div>
}
