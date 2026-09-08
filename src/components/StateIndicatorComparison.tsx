"use client"

import { useState } from "react"
import { getEstadoNome } from "@/lib/br-uf"
import { STATE_INDICATOR_CONFIG, STATE_INDICATOR_ORDER } from "@/lib/state-indicator-metadata"
import { comparisonIssue, indicatorPeriod, latestIndicator, type ComparableIndicator } from "@/lib/state-indicator-comparability"

export function StateIndicatorComparison({ indicadores, estado, unavailable = false }: { indicadores: ComparableIndicator[]; estado: string; unavailable?: boolean }) {
  const ufs = [...new Set(indicadores.map(row => row.estado.toUpperCase()))].filter(uf => uf !== estado.toUpperCase()).sort()
  const [indicator, setIndicator] = useState<string>("populacao_estimada")
  const [selected, setSelected] = useState("")
  const other = ufs.includes(selected) ? selected : ufs.includes("MG") ? "MG" : ufs[0] ?? ""
  const a = latestIndicator(indicadores, estado, indicator)
  const b = latestIndicator(indicadores, other, indicator)
  const issue = unavailable ? "Não foi possível carregar os dados nesta consulta. Tente recarregar a página." : comparisonIssue(a, b)
  const config = STATE_INDICATOR_CONFIG[indicator]
  return <div className="mt-6 rounded-[16px] border border-border/50 bg-card p-5 sm:p-6">
    <h3 className="font-heading text-2xl">Antes de colocar lado a lado</h3>
    <p className="mt-2 text-sm text-muted-foreground">A comparação exige o mesmo indicador, unidade, período, fonte e definição. Sem isso, mostramos a limitação.</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Indicador<select value={indicator} onChange={event => setIndicator(event.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border border-border bg-background px-3">{STATE_INDICATOR_ORDER.map(key => <option key={key} value={key}>{STATE_INDICATOR_CONFIG[key].label}</option>)}</select></label>
      <label className="text-sm font-semibold">Comparar com<select value={other} disabled={ufs.length === 0} onChange={event => setSelected(event.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border border-border bg-background px-3">{!ufs.length && <option value="">Nenhuma UF disponível</option>}{ufs.map(uf => <option key={uf} value={uf}>{getEstadoNome(uf) ?? uf}</option>)}</select></label>
    </div>
    <div aria-live="polite" className="mt-5 rounded-xl bg-muted/40 p-4">
      {issue ? <><p className="font-semibold">Comparação indisponível</p><p className="mt-1 text-sm text-muted-foreground">{issue}</p><p className="mt-2 text-xs text-muted-foreground">{a && `${estado.toUpperCase()}: ${indicatorPeriod(a).label}. `}{b && `${other}: ${indicatorPeriod(b).label}.`} Selecione outro indicador ou consulte as fontes nos cartões.</p></> : <><p className="text-sm font-semibold">Bases compatíveis · {indicatorPeriod(a!).label}</p><div className="mt-4 grid grid-cols-2 gap-4">{[a!, b!].map(row => <div key={row.estado}><p className="text-sm text-muted-foreground">{getEstadoNome(row.estado) ?? row.estado}</p><p className="mt-1 font-heading text-2xl">{config.format(row.valor!)}</p></div>)}</div><p className="mt-3 text-xs text-muted-foreground">Fonte: {a!.fonte} · unidade: {a!.unidade}.{config.scale && " Maior ou menor não significa melhor ou pior."}</p></>}
    </div>
  </div>
}
