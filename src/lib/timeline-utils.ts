import { buildPublicHistoricoPoliticoDisplayListFromRaw } from "@/lib/trajetoria-public-display"
import type { FichaCandidato, Financiamento, GastoParlamentar } from "@/lib/types"
import { formatFinanciamentoPleitoPublicLabelForRow } from "@/lib/financiamento-pleito-public-label"
import {
  formatHistoricoCargoTituloPublico,
  formatHistoricoObservacaoPublica,
  formatHistoricoPartidoEstadoLine,
  inferStaleOpenEndYear,
  isHistoricoOpenStale,
} from "@/lib/historico-display"
import {
  formatFinancingLabel,
  formatProcessStatusLabel,
  formatProcessTypeLabel,
} from "@/lib/ui-labels"
import {
  groupProcessosForDisplay,
  isProcessStatusNeutral,
  processStatusRepeatsDescription,
} from "@/lib/processos-display"
import { formatPartyTransitionLabel } from "@/lib/party-switches"
import { getCurrentPublicYear } from "@/lib/public-date"
import { formatBRL } from "@/lib/utils"

export { getCurrentPublicYear } from "@/lib/public-date"

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
export type TimelineVote = "sim" | "não" | "abstenção" | "ausente" | "obstrução" | "artigo_17"

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
  patrimonio: "Patrimônio",
  financiamento_campanha: "Financiamento",
  processo: "Processos",
  votacao: "Votações",
  projeto_lei: "Projetos",
  gasto_parlamentar: "Gastos CEAP",
  ponto_atencao: "Alertas",
}

/** Tab ids in CandidatoProfile (not including timeline). */
export const TIMELINE_TAB_LABELS: Record<string, string> = {
  geral: "Visão geral",
  timeline: "Timeline",
  dinheiro: "Dinheiro",
  justica: "Justiça",
  votos: "Votos",
  trajetoria: "Trajetória",
  legislacao: "Legislação",
  alertas: "Alertas",
}

function parseTimelineDate(value: string | null | undefined): { valid: boolean; year?: number } {
  if (!value) return { valid: false }
  const trimmed = value.trim()
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return { valid: false }
  const yearMatch = /^(\d{4})/.exec(trimmed)
  if (yearMatch) {
    return { valid: true, year: Number(yearMatch[1]) }
  }
  return { valid: true, year: parsed.getUTCFullYear() }
}

function financiamentoDescription(f: Financiamento): string | undefined {
  const parts: string[] = []
  if (f.total_fundo_eleitoral > 0) {
    parts.push(`${formatFinancingLabel("fundo_eleitoral")} ${formatBRL(f.total_fundo_eleitoral)}`)
  }
  if (f.total_fundo_partidario > 0) {
    parts.push(`${formatFinancingLabel("fundo_partidario")} ${formatBRL(f.total_fundo_partidario)}`)
  }
  if (f.total_pessoa_fisica > 0) {
    parts.push(`${formatFinancingLabel("pessoa_fisica")} ${formatBRL(f.total_pessoa_fisica)}`)
  }
  if (f.total_recursos_proprios > 0) {
    parts.push(`${formatFinancingLabel("recursos_proprios")} ${formatBRL(f.total_recursos_proprios)}`)
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
    if (h.periodo_inicio != null) ys.push(h.periodo_inicio)
    if (h.periodo_fim != null) ys.push(h.periodo_fim)
  }
  for (const m of ficha.mudancas_partido ?? []) ys.push(m.ano)
  for (const p of ficha.patrimonio ?? []) ys.push(p.ano_eleicao)
  for (const v of ficha.votos ?? []) {
    if (!v.votacao?.data_votacao) continue
    const parsed = parseTimelineDate(v.votacao.data_votacao)
    if (parsed.valid && parsed.year != null) ys.push(parsed.year)
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
  const historico = buildPublicHistoricoPoliticoDisplayListFromRaw(ficha.historico ?? [])

  for (const h of historico) {
    const partyLine = formatHistoricoPartidoEstadoLine(h)
    const obs = formatHistoricoObservacaoPublica(h.observacoes)
    const descParts = [partyLine || null, obs].filter(Boolean) as string[]
    const yearEnd =
      h.periodo_fim ??
      inferStaleOpenEndYear(h, historico) ??
      (isHistoricoOpenStale(h, historico) && h.periodo_inicio != null ? h.periodo_inicio : undefined)
    events.push({
      id: `cargo-${h.id}`,
      type: "cargo",
      // Mesmo rótulo da aba Trajetória, e não uma segunda regra: era por isso
      // que "Presidente Nacional do Partido Missão" saía sem a marca
      // `· cargo não eletivo` aqui, e a timeline contradizia a ficha.
      label: formatHistoricoCargoTituloPublico(h),
      description: descParts.length > 0 ? descParts.join(" · ") : undefined,
      year_start: h.periodo_inicio ?? processFallback,
      year_end: yearEnd,
      tab_link: "trajetoria",
    })
  }

  for (const m of ficha.mudancas_partido ?? []) {
    events.push({
      id: `partido-${m.id}`,
      type: "mudanca_partido",
      label: formatPartyTransitionLabel(m),
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
      extra = `Variação vs. ${prev.ano_eleicao}: ${pct >= 0 ? "+" : ""}${pct}%`
    }
    events.push({
      id: `patrimonio-${p.id}`,
      type: "patrimonio",
      label: `Patrimônio ${p.ano_eleicao}`,
      description: extra,
      value: p.valor_total,
      value_formatted: formatBRL(p.valor_total),
      year_start: p.ano_eleicao,
      tab_link: "dinheiro",
    })
  }

  const finSorted = [...(ficha.financiamento ?? [])].sort((a, b) => a.ano_eleicao - b.ano_eleicao)
  const historicoRawFin = ficha.historico ?? []
  for (const fin of finSorted) {
    const total = fin.total_arrecadado ?? 0
    events.push({
      id: `financiamento-${fin.id}`,
      type: "financiamento_campanha",
      label: formatFinanciamentoPleitoPublicLabelForRow(fin, historicoRawFin),
      description: financiamentoDescription(fin),
      value: total > 0 ? total : undefined,
      value_formatted: total > 0 ? formatBRL(total) : undefined,
      year_start: fin.ano_eleicao,
      tab_link: "dinheiro",
    })
  }

  for (const processGroup of groupProcessosForDisplay(ficha.processos ?? [])) {
    const proc = processGroup[0]
    const startDates = processGroup
      .map((item) => ({ raw: item.data_inicio, parsed: parseTimelineDate(item.data_inicio) }))
      .filter((item) => item.parsed.valid && item.parsed.year != null)
      .sort((a, b) => a.parsed.year! - b.parsed.year!)
    const endDates = processGroup
      .map((item) => parseTimelineDate(item.data_decisao))
      .filter((item) => item.valid && item.year != null)
      .sort((a, b) => b.year! - a.year!)
    const startDate = startDates[0]?.parsed
    const endDate = endDates[0]
    const independentStatuses = [...new Set(
      processGroup
        .filter((item) => !processStatusRepeatsDescription(item))
        .map((item) => formatProcessStatusLabel(item.status)),
    )]
    const statusDetail = independentStatuses.length === 0
      ? null
      : independentStatuses.length === 1
        ? `Status: ${independentStatuses[0]}`
        : `Situações processuais: ${independentStatuses.join("; ")}`
    events.push({
      id: `processo-${proc.id}`,
      type: "processo",
      label: processGroup.length > 1
        ? `${formatProcessTypeLabel(proc.tipo)}, ${processGroup.length} processos`
        : `${isProcessStatusNeutral(proc.status) ? "Comunicação processual" : formatProcessTypeLabel(proc.tipo)}, ${proc.tribunal}`,
      description: [proc.descricao, statusDetail].filter(Boolean).join(" · "),
      year_start: startDate?.year ?? processFallback,
      year_end: endDate?.year ?? (startDate ? undefined : processFallback),
      date: startDates[0]?.raw ?? undefined,
      date_unknown: !startDate,
      severity: proc.gravidade ?? undefined,
      tab_link: "justica",
    })
  }

  for (const v of ficha.votos ?? []) {
    if (!v.votacao) continue
    const voteDate = parseTimelineDate(v.votacao.data_votacao)
    if (!voteDate.valid || voteDate.year == null) continue
    events.push({
      id: `voto-${v.id}`,
      type: "votacao",
      label: v.votacao.titulo,
      description: v.votacao.impacto_popular || v.votacao.descricao || undefined,
      year_start: voteDate.year,
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
  const nowY = getCurrentPublicYear()
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
