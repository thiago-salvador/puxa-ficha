import { formatDisplayName } from "@/lib/display-name"
import { imprensaHref, normalizeRecorteUf } from "@/lib/imprensa-nav"
import { IMPRENSA_UFS, type ImprensaUf } from "@/lib/imprensa-uf-pack"
import type { VerifiedCandidateUpdate } from "@/lib/verified-candidate-updates"

/**
 * O que mudou: junta cada mudança verificada ao cargo e à UF do dataset da
 * imprensa, filtra por UF, cargo e tipo de mudança e conta cada opção de
 * filtro. Puro, sem acesso a banco.
 */

export type UpdateField = VerifiedCandidateUpdate["field"]

const UPDATE_FIELDS: ReadonlyArray<{ id: UpdateField; label: string }> = [
  { id: "situacao", label: "Situação da candidatura" },
  { id: "patrimonio", label: "Patrimônio declarado" },
  { id: "partido", label: "Partido" },
]

export const UPDATES_PAGE_SIZE = 20

export function updateFieldLabel(field: UpdateField): string {
  return UPDATE_FIELDS.find((item) => item.id === field)?.label ?? "Outro campo"
}

export interface UpdateCandidate {
  slug: string
  nome: string
  cargo: string
  uf: string | null
}

export interface UpdateRow extends VerifiedCandidateUpdate {
  nome: string
  /** null quando o candidato não está no dataset da imprensa. */
  cargo: string | null
  uf: ImprensaUf | null
}

export function joinUpdates(updates: readonly VerifiedCandidateUpdate[], candidates: readonly UpdateCandidate[]): UpdateRow[] {
  const bySlug = new Map(candidates.map((candidate) => [candidate.slug, candidate]))
  return updates.map((update) => {
    const candidate = bySlug.get(update.candidate_slug)
    return {
      ...update,
      nome: candidate?.nome || formatDisplayName(update.candidate_name),
      cargo: candidate?.cargo ?? null,
      uf: normalizeRecorteUf(candidate?.uf),
    }
  })
}

export interface UpdatesQuery {
  uf: ImprensaUf | null
  cargo: string | null
  tipo: UpdateField | null
  page: number
}

type RawParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Valores fora da lista viram null, e a página nunca passa de um número razoável. */
export function parseUpdatesQuery(params: RawParams, cargos: readonly string[]): UpdatesQuery {
  const cargo = first(params.cargo)?.trim() ?? ""
  const tipo = first(params.tipo)?.trim() ?? ""
  const rawPage = first(params.page) ?? "1"
  const page = /^\d{1,4}$/.test(rawPage) && Number(rawPage) > 0 ? Number(rawPage) : 1
  return {
    uf: normalizeRecorteUf(first(params.uf)),
    cargo: cargos.includes(cargo) ? cargo : null,
    tipo: UPDATE_FIELDS.some((item) => item.id === tipo) ? (tipo as UpdateField) : null,
    page,
  }
}

type Filters = Pick<UpdatesQuery, "uf" | "cargo" | "tipo">

function matches(row: UpdateRow, filters: Filters, skip?: keyof Filters): boolean {
  if (skip !== "uf" && filters.uf && row.uf !== filters.uf) return false
  if (skip !== "cargo" && filters.cargo && row.cargo !== filters.cargo) return false
  if (skip !== "tipo" && filters.tipo && row.field !== filters.tipo) return false
  return true
}

export function filterUpdates(rows: readonly UpdateRow[], filters: Filters): UpdateRow[] {
  return rows.filter((row) => matches(row, filters))
}

export interface UpdatesFacets {
  uf: Array<{ value: ImprensaUf; count: number }>
  cargo: Array<{ value: string; count: number }>
  tipo: Array<{ value: UpdateField; label: string; count: number }>
}

/**
 * Quantas mudanças cada opção mostraria, mantendo os outros dois filtros.
 * Toda UF e todo cargo aparecem, inclusive com zero mudanças.
 */
export function computeUpdatesFacets(rows: readonly UpdateRow[], filters: Filters, cargos: readonly string[]): UpdatesFacets {
  const count = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    rows.filter((row) => matches(row, filters, key) && matches(row, { uf: null, cargo: null, tipo: null, [key]: value })).length
  return {
    uf: IMPRENSA_UFS.map((value) => ({ value, count: count("uf", value) })),
    cargo: cargos.map((value) => ({ value, count: count("cargo", value) })),
    tipo: UPDATE_FIELDS.map(({ id, label }) => ({ value: id, label, count: count("tipo", id) })),
  }
}

export interface UpdatesView {
  /** Filtros aplicados de fato. Sem o dataset, UF e cargo ficam null. */
  query: UpdatesQuery
  /** false quando o dataset da imprensa falhou: cargo e UF de cada mudança são desconhecidos. */
  recorteDisponivel: boolean
  /** A URL pediu UF ou cargo, mas o recorte não pôde ser aplicado. */
  recorteIgnorado: boolean
  rows: UpdateRow[]
  filtered: UpdateRow[]
  facets: UpdatesFacets
}

/**
 * Monta a lista de O que mudou. `candidates` null quer dizer que o dataset da
 * imprensa não carregou: uma falha de consulta não é zero, então UF e cargo não
 * filtram nem contam (nada de "0 de N" nem de facetas zeradas). A lista sai
 * inteira, só com o nome, e o filtro por tipo continua valendo.
 */
export function buildUpdatesView(
  params: RawParams,
  updates: readonly VerifiedCandidateUpdate[],
  candidates: readonly UpdateCandidate[] | null,
  cargos: readonly string[],
): UpdatesView {
  const recorteDisponivel = candidates !== null
  const parsed = parseUpdatesQuery(params, cargos)
  const query = recorteDisponivel ? parsed : { ...parsed, uf: null, cargo: null }
  const recorteIgnorado = !recorteDisponivel && Boolean(parsed.uf || first(params.cargo)?.trim())
  const rows = joinUpdates(updates, candidates ?? [])
  const filtered = filterUpdates(rows, query)
  const facets = computeUpdatesFacets(rows, query, recorteDisponivel ? cargos : [])
  return {
    query,
    recorteDisponivel,
    recorteIgnorado,
    rows,
    filtered,
    facets: recorteDisponivel ? facets : { ...facets, uf: [], cargo: [] },
  }
}

/** Data de detecção mais recente, ou null sem linhas. */
export function latestDetection(rows: readonly UpdateRow[]): string | null {
  let latest: string | null = null
  for (const row of rows) {
    if (!latest || Date.parse(row.detected_at) > Date.parse(latest)) latest = row.detected_at
  }
  return latest
}

/** Link de O que mudou com UF e cargo pelo recorte comum da seção, mais tipo e página. */
export function updatesHref(filters: Filters, page = 1): string {
  const base = imprensaHref("/imprensa/atualizacoes", { uf: filters.uf, cargo: filters.cargo })
  const [path, search = ""] = base.split("?")
  const query = new URLSearchParams(search)
  if (filters.tipo) query.set("tipo", filters.tipo)
  if (page > 1) query.set("page", String(page))
  const text = query.toString()
  return text ? `${path}?${text}` : path
}

const DAY_MONTH = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })
const FULL_DATE = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })

/** "DD/MM" no horário de Brasília. */
export function formatDayMonth(value: string): string {
  return DAY_MONTH.format(new Date(value))
}

/** "DD/MM/AAAA" no horário de Brasília. */
export function formatFullDate(value: string): string {
  return FULL_DATE.format(new Date(value))
}
