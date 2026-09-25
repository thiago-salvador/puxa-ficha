import rawChecagensRecibos from "../../scripts/data/checagens-recibos.json"
import rawFalasRecibos from "../../scripts/data/falas-recibos.json"

/**
 * Recibos de busca por candidato, versionados no repositório e lidos no build.
 *
 * Servem só para uma coisa: distinguir "busca feita, nada encontrado" de
 * "nunca buscado". Recibo ausente, malformado ou de busca que falhou devolve
 * null, e a interface não afirma ausência nenhuma nesse caso.
 */

export interface ReciboChecagensVisivel {
  searchedAt: string
  result: "encontrado" | "vazio_confirmado"
  leads: number
  agencias: string[]
}

export interface ReciboFalasVisivel {
  searchedAt: string
  result: "com_fala" | "sem_fala"
  windowFrom: string
  windowTo: string
}

interface IdentidadeRecibo {
  candidate_id: string
  candidate_slug: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function validInstant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
}

function validDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function sameIdentity(row: Record<string, unknown>, identity: IdentidadeRecibo): boolean {
  return row.candidate_id === identity.candidate_id && row.candidate_slug === identity.candidate_slug
}

export function selecionarReciboChecagens(raw: unknown, identity: IdentidadeRecibo): ReciboChecagensVisivel | null {
  if (!isRecord(raw) || raw.schema_version !== "checagens-recibos-v1" || !Array.isArray(raw.receipts) || !Array.isArray(raw.agencias)) return null
  const agencias = raw.agencias.filter((agencia): agencia is string => typeof agencia === "string" && agencia.trim().length > 0)
  if (agencias.length === 0) return null
  const row = raw.receipts.find((item): item is Record<string, unknown> => isRecord(item) && sameIdentity(item, identity))
  if (!row || !validInstant(row.searched_at)) return null
  if (row.result !== "encontrado" && row.result !== "vazio_confirmado") return null
  const leads = typeof row.leads === "number" && Number.isInteger(row.leads) && row.leads >= 0 ? row.leads : null
  if (leads === null || (row.result === "encontrado") !== (leads > 0)) return null
  return { searchedAt: row.searched_at, result: row.result, leads, agencias }
}

export function selecionarReciboFalas(raw: unknown, identity: IdentidadeRecibo): ReciboFalasVisivel | null {
  if (!isRecord(raw) || raw.schema_version !== "falas-recibos-v1" || !Array.isArray(raw.receipts)) return null
  const row = raw.receipts.find((item): item is Record<string, unknown> => isRecord(item) && sameIdentity(item, identity))
  if (!row || !validInstant(row.searched_at) || !validDay(row.window_from) || !validDay(row.window_to)) return null
  if (row.result !== "com_fala" && row.result !== "sem_fala") return null
  return { searchedAt: row.searched_at, result: row.result, windowFrom: row.window_from, windowTo: row.window_to }
}

export function getReciboChecagens(identity: IdentidadeRecibo): ReciboChecagensVisivel | null {
  return selecionarReciboChecagens(rawChecagensRecibos, identity)
}

export function getReciboFalas(identity: IdentidadeRecibo): ReciboFalasVisivel | null {
  return selecionarReciboFalas(rawFalasRecibos, identity)
}

/** Data da busca no fuso de Brasília, dd/mm/aaaa. */
export function formatarDataBusca(value: string): string {
  const day = validDay(value) ? new Date(`${value}T12:00:00Z`) : new Date(value)
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(day)
}

/** Lista em prosa: "A, B e C". */
export function listarEmProsa(items: readonly string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`
}
