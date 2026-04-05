import { BRAZIL_STATES } from "@/data/brazil-states"
import { formatBRL } from "@/lib/utils"

export const RANKING_CARGOS = ["Presidente", "Governador", "Senador"] as const

export type RankingCargo = (typeof RANKING_CARGOS)[number]
export type RankingSortOrder = "desc" | "asc"
export type RankingMetricUnit = "currency" | "count"
export type RankingQueryType = "comparador-field" | "aggregate-table"
export type RankingSourceField = "mudancas_partido" | "patrimonio_declarado"
export type RankingTableName = "gastos_parlamentares"
export type RankingAggregateField = "total_gasto"

export interface RankingDefinition {
  slug: string
  title: string
  eyebrow: string
  description: string
  metricLabel: string
  metricUnit: RankingMetricUnit
  contextExplanation: string
  sortDirection: "desc"
  queryType: RankingQueryType
  sourceField?: RankingSourceField
  tableName?: RankingTableName
  aggregateField?: RankingAggregateField
  supportsUf: boolean
}

export interface RankingEntryLike {
  candidato: {
    nome_urna: string
    slug: string
  }
  metricValue: number | null
}

export interface RankingCandidateSummary {
  id: string
  nome_urna: string
  slug: string
  partido_sigla: string
  cargo_disputado: string
  estado: string | null
  foto_url: string | null
}

export interface RankingEntry extends RankingEntryLike {
  candidato: RankingCandidateSummary
}

export interface RankingDataset {
  definition: RankingDefinition
  cargo: RankingCargo
  estado?: string
  entries: RankingEntry[]
}

export interface RankingFieldCandidate extends RankingCandidateSummary {
  mudancas_partido: number
  patrimonio_declarado: number | null
}

export interface RankingFilters {
  cargo: RankingCargo
  estado?: string
  isFiltered: boolean
}

export interface RankingViewState extends RankingFilters {
  sortOrder: RankingSortOrder
}

const VALID_UFS = new Set<string>(BRAZIL_STATES.map((state) => state.sigla))

export function isRankingCargo(value: string): value is RankingCargo {
  return (RANKING_CARGOS as readonly string[]).includes(value)
}

export function normalizeRankingFilters(input: {
  cargo?: string | null
  uf?: string | null
}): RankingFilters {
  const cargoRaw = input.cargo?.trim() ?? ""
  const ufRaw = input.uf?.trim().toUpperCase() ?? ""
  const cargo = isRankingCargo(cargoRaw) ? cargoRaw : "Presidente"
  const estado = cargo === "Governador" && VALID_UFS.has(ufRaw) ? ufRaw : undefined
  const isFiltered = cargo !== "Presidente" || Boolean(estado)

  return {
    cargo,
    estado,
    isFiltered,
  }
}

export function normalizeRankingViewState(input: {
  cargo?: string | null
  uf?: string | null
  ordem?: string | null
}): RankingViewState {
  const base = normalizeRankingFilters({ cargo: input.cargo, uf: input.uf })
  const sortOrder: RankingSortOrder = input.ordem === "asc" ? "asc" : "desc"

  return {
    ...base,
    sortOrder,
    isFiltered: base.isFiltered || sortOrder !== "desc",
  }
}

export function sortRankingEntries<T extends RankingEntryLike>(
  entries: T[],
  sortOrder: RankingSortOrder = "desc"
): T[] {
  return [...entries].sort((a, b) => {
    if (a.metricValue == null && b.metricValue == null) {
      return a.candidato.nome_urna.localeCompare(b.candidato.nome_urna, "pt-BR")
    }

    if (a.metricValue == null) return 1
    if (b.metricValue == null) return -1
    if (a.metricValue !== b.metricValue) {
      return sortOrder === "asc" ? a.metricValue - b.metricValue : b.metricValue - a.metricValue
    }

    return a.candidato.nome_urna.localeCompare(b.candidato.nome_urna, "pt-BR")
  })
}

export function buildRankingPath(
  slug: string,
  input: { cargo: RankingCargo; estado?: string; sortOrder?: RankingSortOrder }
): string {
  const searchParams = new URLSearchParams()
  const sortOrder = input.sortOrder ?? "desc"

  if (input.cargo !== "Presidente") {
    searchParams.set("cargo", input.cargo)
  }

  if (input.cargo === "Governador" && input.estado) {
    searchParams.set("uf", input.estado)
  }

  if (sortOrder !== "desc") {
    searchParams.set("ordem", sortOrder)
  }

  const query = searchParams.toString()
  return query ? `/rankings/${slug}?${query}` : `/rankings/${slug}`
}

export function buildAggregateRankingEntries(input: {
  candidatos: RankingCandidateSummary[]
  rows: Array<{ candidato_id: string; metricValue: number | null }>
}): RankingEntry[] {
  const totals = new Map<string, number | null>()

  for (const row of input.rows) {
    if (row.metricValue == null) continue
    const current = totals.get(row.candidato_id) ?? 0
    totals.set(row.candidato_id, current + row.metricValue)
  }

  return input.candidatos.map((candidato) => ({
    candidato,
    metricValue: totals.get(candidato.id) ?? null,
  }))
}

export function buildFieldRankingEntries(input: {
  candidatos: RankingFieldCandidate[]
  sourceField: RankingSourceField
}): RankingEntry[] {
  return input.candidatos.map((candidato) => ({
    candidato: {
      id: candidato.id,
      nome_urna: candidato.nome_urna,
      slug: candidato.slug,
      partido_sigla: candidato.partido_sigla,
      cargo_disputado: candidato.cargo_disputado,
      estado: candidato.estado,
      foto_url: candidato.foto_url,
    },
    metricValue: candidato[input.sourceField],
  }))
}

export function formatRankingMetricValue(
  value: number | null,
  unit: RankingMetricUnit
): string {
  if (value == null) return "--"
  if (unit === "currency") return formatBRL(value).replace(/\u00a0/g, " ")
  return new Intl.NumberFormat("pt-BR").format(value)
}
