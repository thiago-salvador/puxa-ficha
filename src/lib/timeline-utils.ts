import type { FichaCandidato, Financiamento, GastoParlamentar } from "@/lib/types"
import { formatBRL } from "@/lib/utils"

export type TimelineEventType =
  | "cargo"
  | "mudanca_partido"
  | "patrimonio"
  | "financiamento_campanha"
  | "processo"
  | "votacao"
  | "projeto_lei"
  | "gasto_parlamentar"
  | "ponto_atencao"

export type TimelineAttentionGravidade = "critica" | "alta" | "media" | "baixa"

/** Mirrors `VotoCandidato["voto"]` in types.ts (accented literals). */
export type TimelineVote = "sim" | "não" | "abstenção" | "ausente" | "obstrução"

export interface TimelineEvent {
  id: string
  type: TimelineEventType
  label: string
  description?: string
  year_start: number
  year_end?: number
  date?: string
  value?: number
  value_formatted?: string
  severity?: "alta" | "media" | "baixa"
  date_unknown?: boolean
  vote?: TimelineVote
  contradicao?: boolean
  destaque?: boolean
  partido_anterior?: string
  partido_novo?: string
  contexto?: string
  tab_link?: string
  /** Gravidade editorial (pontos de atencao na timeline). */
  attention_gravidade?: TimelineAttentionGravidade
}

export interface TimelineRange {
  year_min: number
  year_max: number
}

export const TIMELINE_EVENT_TYPES: TimelineEventType[] = [
  "cargo",
  "mudanca_partido",
  "patrimonio",
  "financiamento_campanha",
  "processo",
  "votacao",
  "projeto_lei",
  "gasto_parlamentar",
  "ponto_atencao",
]

export const TIMELANE_LABELS: Record<TimelineEventType, string> = {
  cargo: "Cargos",
  mudanca_partido: "Partido",
  patrimonio: "Patrimonio",
  financiamento_campanha: "Financiamento",
  processo: "Processos",
  votacao: "Votacoes",
  projeto_lei: "Projetos",
  gasto_parlamentar: "Gastos CEAP",
  ponto_atencao: "Alertas",
}

/** Tab ids in CandidatoProfile (not including timeline). */
export const TIMELINE_TAB_LABELS: Record<string, string> = {
  geral: "Visao Geral",
  timeline: "Timeline",
  dinheiro: "Dinheiro",
  justica: "Justica",
  votos: "Votos",
  trajetoria: "Trajetoria",
  legislacao: "Legislacao",
  alertas: "Alertas",
}

function financiamentoDescription(f: Financiamento): string | undefined {
  const parts: string[] = []
  if (f.total_fundo_eleitoral > 0) {
    parts.push(`Fundo eleitoral ${formatBRL(f.total_fundo_eleitoral)}`)
  }
  if (f.total_fundo_partidario > 0) {
    parts.push(`Fundo partidario ${formatBRL(f.total_fundo_partidario)}`)
  }
  if (f.total_pessoa_fisica > 0) {
    parts.push(`PF ${formatBRL(f.total_pessoa_fisica)}`)
  }
  if (f.total_recursos_proprios > 0) {
    parts.push(`Proprios ${formatBRL(f.total_recursos_proprios)}`)
  }
  const top = f.maiores_doadores?.[0]
  if (top && top.valor > 0) {
    parts.push(`Maior doador: ${top.nome} (${formatBRL(top.valor)})`)
  }
  return parts.length > 0 ? parts.join(" · ") : undefined
}

function topGastoDescription(g: GastoParlamentar): string | undefined {
  const d = g.detalhamento ?? []
  if (d.length === 0 || g.total_gasto <= 0) return undefined
  const sorted = [...d].sort((a, b) => b.valor - a.valor)
  const top = sorted[0]
  const pct = Math.round((top.valor / g.total_gasto) * 100)
  return `Maior rubrica: ${top.categoria} (${pct}%)`
}

/**
 * Min year from non-process sources only, so undated processos do not imply "current year"
 * and do not depend on other undated processos.
 */
export function computeProcessYearFallback(ficha: FichaCandidato): number {
  const ys: number[] = []
  for (const h of ficha.historico ?? []) {
    ys.push(h.periodo_inicio)
    if (h.periodo_fim != null) ys.push(h.periodo_fim)
  }
  for (const m of ficha.mudancas_partido ?? []) ys.push(m.ano)
  for (const p of ficha.patrimonio ?? []) ys.push(p.ano_eleicao)
  for (const v of ficha.votos ?? []) {
    if (!v.votacao?.data_votacao) continue
    const d = new Date(v.votacao.data_votacao)
    if (!Number.isNaN(d.getTime())) ys.push(d.getFullYear())
  }
  for (const pl of ficha.projetos_lei ?? []) {
    if (pl.ano != null) ys.push(pl.ano)
  }
  for (const g of ficha.gastos_parlamentares ?? []) ys.push(g.ano)
  for (const fin of ficha.financiamento ?? []) ys.push(fin.ano_eleicao)
  for (const pa of ficha.pontos_atencao ?? []) {
    if (!pa.data_referencia) continue
    const raw = pa.data_referencia.trim().split("T")[0]
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
    if (dm) ys.push(Number(dm[1]))
  }
  if (ys.length === 0) return 2000
  return Math.min(...ys)
}

export function buildTimelineEvents(ficha: FichaCandidato): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const processFallback = computeProcessYearFallback(ficha)

  for (const h of ficha.historico ?? []) {
    const party = h.partido?.trim() || ficha.partido_sigla || ""
    const cargoLabel = party ? `${h.cargo} (${party})` : h.cargo
    events.push({
      id: `cargo-${h.id}`,
      type: "cargo",
      label: cargoLabel,
      description: h.observacoes ?? undefined,
      year_start: h.periodo_inicio,
      year_end: h.periodo_fim ?? undefined,
      tab_link: "trajetoria",
    })
  }

  for (const m of ficha.mudancas_partido ?? []) {
    events.push({
      id: `partido-${m.id}`,
      type: "mudanca_partido",
      label: `${m.partido_anterior} → ${m.partido_novo}`,
      description: m.contexto ?? undefined,
      year_start: m.ano,
      date: m.data_mudanca ?? undefined,
      partido_anterior: m.partido_anterior,
      partido_novo: m.partido_novo,
      contexto: m.contexto ?? undefined,
      tab_link: "trajetoria",
    })
  }

  const patSorted = [...(ficha.patrimonio ?? [])].sort((a, b) => a.ano_eleicao - b.ano_eleicao)
  for (let i = 0; i < patSorted.length; i++) {
    const p = patSorted[i]
    const prev = i > 0 ? patSorted[i - 1] : null
    let extra: string | undefined
    if (prev && prev.valor_total > 0) {
      const pct = Math.round(((p.valor_total - prev.valor_total) / prev.valor_total) * 100)
      extra = `Variacao vs ${prev.ano_eleicao}: ${pct >= 0 ? "+" : ""}${pct}%`
    }
    events.push({
      id: `patrimonio-${p.id}`,
      type: "patrimonio",
      label: `Patrimonio ${p.ano_eleicao}`,
      description: extra,
      value: p.valor_total,
      value_formatted: formatBRL(p.valor_total),
      year_start: p.ano_eleicao,
      tab_link: "dinheiro",
    })
  }

  const finSorted = [...(ficha.financiamento ?? [])].sort((a, b) => a.ano_eleicao - b.ano_eleicao)
  for (const fin of finSorted) {
    const total = fin.total_arrecadado ?? 0
    events.push({
      id: `financiamento-${fin.id}`,
      type: "financiamento_campanha",
      label: `Campanha ${fin.ano_eleicao}`,
      description: financiamentoDescription(fin),
      value: total > 0 ? total : undefined,
      value_formatted: total > 0 ? formatBRL(total) : undefined,
      year_start: fin.ano_eleicao,
      tab_link: "dinheiro",
    })
  }

  for (const proc of ficha.processos ?? []) {
    const startDate = proc.data_inicio ? new Date(proc.data_inicio) : null
    const endDate = proc.data_decisao ? new Date(proc.data_decisao) : null
    const hasStart = Boolean(startDate && !Number.isNaN(startDate.getTime()))
    const hasEnd = Boolean(endDate && !Number.isNaN(endDate.getTime()))
    const statusLabel = proc.status.replaceAll("_", " ")
    events.push({
      id: `processo-${proc.id}`,
      type: "processo",
      label: `${proc.tipo}, ${proc.tribunal}`,
      description: [proc.descricao, `Status: ${statusLabel}`].filter(Boolean).join(" — "),
      year_start: hasStart ? startDate!.getFullYear() : processFallback,
      year_end: hasEnd ? endDate!.getFullYear() : undefined,
      date: proc.data_inicio ?? undefined,
      date_unknown: !hasStart,
      severity: proc.gravidade,
      tab_link: "justica",
    })
  }

  for (const v of ficha.votos ?? []) {
    if (!v.votacao) continue
    const voteDate = new Date(v.votacao.data_votacao)
    if (Number.isNaN(voteDate.getTime())) continue
    events.push({
      id: `voto-${v.id}`,
      type: "votacao",
      label: v.votacao.titulo,
      description: v.votacao.impacto_popular || v.votacao.descricao || undefined,
      year_start: voteDate.getFullYear(),
      date: v.votacao.data_votacao,
      vote: v.voto as TimelineVote,
      contradicao: v.contradicao,
      tab_link: "votos",
    })
  }

  for (const pl of ficha.projetos_lei ?? []) {
    if (pl.ano == null) continue
    const num = pl.numero ? `${pl.numero}/${pl.ano}` : String(pl.ano)
    events.push({
      id: `pl-${pl.id}`,
      type: "projeto_lei",
      label: `${pl.tipo} ${num}`.trim(),
      description: pl.ementa ?? pl.tema ?? undefined,
      year_start: pl.ano,
      destaque: pl.destaque,
      tab_link: "legislacao",
    })
  }

  for (const g of ficha.gastos_parlamentares ?? []) {
    const top = topGastoDescription(g)
    events.push({
      id: `gasto-${g.id}`,
      type: "gasto_parlamentar",
      label: `Gastos CEAP ${g.ano}`,
      description: top,
      value: g.total_gasto,
      value_formatted: formatBRL(g.total_gasto),
      year_start: g.ano,
      tab_link: "dinheiro",
    })
  }

  for (const pa of ficha.pontos_atencao ?? []) {
    if (!pa.data_referencia) continue
    const raw = pa.data_referencia.trim().split("T")[0]
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
    if (!dm) continue
    const year = Number(dm[1])
    const iso = `${dm[1]}-${dm[2]}-${dm[3]}`
    events.push({
      id: `ponto-${pa.id}`,
      type: "ponto_atencao",
      label: pa.titulo,
      description: pa.descricao,
      year_start: year,
      date: iso,
      tab_link: "alertas",
      attention_gravidade: pa.gravidade,
    })
  }

  events.sort((a, b) => {
    if (a.year_start !== b.year_start) return a.year_start - b.year_start
    if (a.date && b.date) return a.date.localeCompare(b.date)
    return a.id.localeCompare(b.id)
  })

  return events
}

export function getTimelineRange(events: TimelineEvent[]): TimelineRange {
  const nowY = new Date().getFullYear()
  if (events.length === 0) return { year_min: nowY - 10, year_max: nowY }
  const years = events.flatMap((e) => {
    const ys = [e.year_start]
    if (e.year_end != null) ys.push(e.year_end)
    return ys
  })
  return {
    year_min: Math.min(...years),
    year_max: Math.max(...years, nowY),
  }
}

export function getTimelineAxisTicks(yearMin: number, yearMax: number): number[] {
  const lo = Math.ceil(Math.min(yearMin, yearMax))
  const hi = Math.floor(Math.max(yearMin, yearMax))

  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return []
  if (lo > hi) return [Math.round((yearMin + yearMax) / 2)]

  const span = hi - lo
  if (span <= 1) return [...new Set([lo, hi])]

  const step = [1, 2, 5, 10, 20].find((candidate) => span / candidate <= 8) ?? 25
  const first = Math.ceil(lo / step) * step
  const ticks: number[] = []

  for (let year = first; year <= hi; year += step) {
    ticks.push(year)
  }

  if (ticks.length === 0) {
    ticks.push(lo)
  }

  const gapThreshold = Math.max(step * 0.6, 1)
  if (ticks[0] != null && ticks[0] - lo >= gapThreshold) ticks.unshift(lo)
  if (ticks[ticks.length - 1] != null && hi - ticks[ticks.length - 1] >= gapThreshold) ticks.push(hi)

  return [...new Set(ticks.filter((year) => year >= lo && year <= hi))]
}

/** Keeps [viewMin, viewMax] inside [extentMin, extentMax], preserving span up to full extent. */
export function clampTimeWindow(
  viewMin: number,
  viewMax: number,
  extentMin: number,
  extentMax: number,
): { min: number; max: number } {
  let lo = Math.min(viewMin, viewMax)
  let hi = Math.max(viewMin, viewMax)
  const extentSpan = Math.max(extentMax - extentMin, 0)
  if (extentSpan <= 0) return { min: extentMin, max: extentMax }

  let span = Math.max(hi - lo, 1)
  span = Math.min(span, extentSpan)
  lo = Math.min(Math.max(lo, extentMin), extentMax - span)
  hi = lo + span
  if (hi > extentMax) {
    hi = extentMax
    lo = extentMax - span
  }
  if (lo < extentMin) lo = extentMin
  return { min: lo, max: Math.max(hi, lo + 1) }
}

export function countEventsByType(events: TimelineEvent[]): Record<TimelineEventType, number> {
  const out = {} as Record<TimelineEventType, number>
  for (const t of TIMELINE_EVENT_TYPES) out[t] = 0
  for (const e of events) out[e.type] += 1
  return out
}
