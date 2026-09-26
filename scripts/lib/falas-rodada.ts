import { SOURCES, type CandidatoFalas } from "./falas-monitoramento"
import type { CatalogoFalas } from "../../src/lib/falas-candidatos"

/** Canonical contract for the two-day search receipt and its offline audit. */
export const SCHEMA_RODADA_FALAS = "falas-rodada-v1" as const
export const SCHEMA_FALAS_RODADA = SCHEMA_RODADA_FALAS

export const ESTADOS_RECIBO_RODADA = ["executed", "no_results", "planned", "blocked"] as const
export type EstadoReciboRodada = (typeof ESTADOS_RECIBO_RODADA)[number]

export interface RespostaIndividualFalas {
  candidate_id: string
  candidate_slug: string
  result?: "found" | "empty" | "no_results"
  [key: string]: unknown
}

export interface ReciboBuscaFalas {
  candidate_id: string
  candidate_slug: string
  provider: string
  query: string
  observed_at: string
  status: EstadoReciboRodada
  /** The response must identify the same candidate. Batch-only responses fail closed. */
  individual_response?: RespostaIndividualFalas
  response?: RespostaIndividualFalas
  source_id?: string
  source_origin?: string
  [key: string]: unknown
}

export interface ArquivoRecibosRodada {
  schema_version?: string
  round_start?: string
  round_end?: string
  receipts?: readonly unknown[]
  attempts?: readonly unknown[]
}

export interface AuditoriaCandidatoRodada {
  candidate_id: string
  candidate_slug: string
  name: string
  office: CandidatoFalas["cargo_disputado"]
  uf: string | null
  status: "searched" | "blocked" | "planned" | "not_searched"
  searched: boolean
  no_results: boolean
  covered: boolean
  reasons: string[]
  receipt_count: number
  /** Algum recibo válido declarou `result=found` (aspa explícita na fonte). */
  found: boolean
  /** O catálogo tem aspa do candidato cujo período termina dentro da janela da rodada. */
  has_window_quote: boolean
  /** `found` sem aspa na janela: o rótulo afirma algo que a ficha não mostra. */
  found_without_quote: boolean
  /** Instante do recibo válido mais recente; null sem busca válida. */
  searched_at: string | null
}

export interface AuditoriaRodadaFalas {
  schema_version: typeof SCHEMA_RODADA_FALAS
  round_start: string
  now: string
  total: number
  searched: number
  no_results: number
  blocked: number
  planned: number
  not_searched: number
  covered: number
  covered_but_unsearched: number
  invalid_receipts: number
  complete: boolean
  missing_names: string[]
  /** Início da janela de aspas da rodada (14 dias antes do início, inclusive). */
  quote_window_from: string
  found: number
  found_without_quote: number
  found_without_quote_names: string[]
  candidates: AuditoriaCandidatoRodada[]
}

/** Janela de busca das falas: 14 dias até o início da rodada (falas-rotina-48h.md). */
export const JANELA_FALAS_DIAS = 14

type CatalogQuote = { candidate_id?: unknown; candidate_slug?: unknown; occurred_on?: unknown; occurred_between?: unknown }

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function dateValue(value: unknown, label: string): Date {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(stringValue(value) ?? NaN)
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} inválido`)
  if (typeof value === "string" && !/[Tt].*(?:Z|[+-]\d{2}:\d{2})$/.test(value.trim())) throw new Error(`${label} exige instante ISO com fuso`)
  return parsed
}

function identityKey(id: string, slug: string): string {
  return `${id}\u0000${slug}`
}

function providerIsAllowed(receipt: Record<string, unknown>): boolean {
  const provider = stringValue(receipt.provider ?? receipt.search_provider ?? receipt.engine)?.toLowerCase()
  if (provider === "google" || provider === "perplexity") return true
  const sourceId = stringValue(receipt.source_id ?? (typeof receipt.source === "object" && receipt.source ? (receipt.source as Record<string, unknown>).id : null))
  const sourceOrigin = stringValue(receipt.source_origin ?? (typeof receipt.source === "object" && receipt.source ? (receipt.source as Record<string, unknown>).origin : null))
  // Metadata cannot turn an invented provider into an approved source.
  return SOURCES.some((source) => (source.id === provider || source.origin === provider)
    && (!sourceId || source.id === sourceId) && (!sourceOrigin || source.origin === sourceOrigin))
}

function normalizeStatus(receipt: Record<string, unknown>): EstadoReciboRodada | null {
  const raw = stringValue(receipt.status ?? receipt.attempt_status)
  if (!raw) return null
  const normalized = raw.toLowerCase().replace(/[- ]/g, "_")
  if (normalized === "noresults" || normalized === "empty" || normalized === "no_result") return "no_results"
  return (ESTADOS_RECIBO_RODADA as readonly string[]).includes(normalized) ? normalized as EstadoReciboRodada : null
}

function responseObject(receipt: Record<string, unknown>): Record<string, unknown> | null {
  const response = receipt.individual_response ?? receipt.response
  return response && typeof response === "object" && !Array.isArray(response) ? response as Record<string, unknown> : null
}

function responseIdentity(row: Record<string, unknown>): { id: string; slug: string } | null {
  const id = stringValue(row.candidate_id ?? row.candidateId)
  const slug = stringValue(row.candidate_slug ?? row.candidateSlug)
  return id && slug ? { id, slug } : null
}

function responseOutcome(row: Record<string, unknown>): "found" | "empty" | "no_results" | null {
  const raw = stringValue(row.result ?? row.outcome ?? row.response_status)?.toLowerCase().replace(/[- ]/g, "_")
  return raw === "found" || raw === "empty" || raw === "no_results" || raw === "no_result" ? raw === "no_result" ? "no_results" : raw : null
}

function responseHasEvidence(row: Record<string, unknown>, outcome: "found" | "empty" | "no_results"): boolean {
  const textFields = ["response_text", "response_excerpt", "evidence_ref", "evidence_path", "tool_response_ref", "raw", "raw_response"]
  if (textFields.some((field) => stringValue(row[field]))) return true
  for (const field of ["results", "items", "matches", "urls"]) {
    if (Array.isArray(row[field]) && (outcome !== "found" || row[field].length > 0)) return true
  }
  return false
}

function flattenReceipts(input: readonly unknown[] | ArquivoRecibosRodada | unknown): Record<string, unknown>[] {
  if (Array.isArray(input)) return input.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
  if (!input || typeof input !== "object") return []
  const object = input as Record<string, unknown>
  for (const key of ["receipts", "attempts"]) {
    if (Array.isArray(object[key])) return flattenReceipts(object[key])
  }
  return [object]
}

function catalogIdentities(catalog: CatalogoFalas | { quotes?: readonly CatalogQuote[] } | undefined): Set<string> {
  const quotes = catalog && Array.isArray(catalog.quotes) ? catalog.quotes : []
  return new Set(quotes.flatMap((quote) => {
    const id = stringValue(quote.candidate_id)
    const slug = stringValue(quote.candidate_slug)
    return id && slug ? [identityKey(id, slug)] : []
  }))
}

function quoteEnd(quote: CatalogQuote): string | null {
  const occurredOn = stringValue(quote.occurred_on)
  if (occurredOn) return occurredOn.slice(0, 10)
  const range = quote.occurred_between
  if (range && typeof range === "object" && !Array.isArray(range)) return stringValue((range as Record<string, unknown>).to)?.slice(0, 10) ?? null
  return null
}

/** Identidades com aspa cujo período termina em `from` ou depois. */
function windowQuoteIdentities(catalog: CatalogoFalas | { quotes?: readonly CatalogQuote[] } | undefined, from: string): Set<string> {
  const quotes: readonly CatalogQuote[] = catalog && Array.isArray(catalog.quotes) ? catalog.quotes : []
  return new Set(quotes.flatMap((quote) => {
    const id = stringValue(quote.candidate_id)
    const slug = stringValue(quote.candidate_slug)
    const end = quoteEnd(quote)
    return id && slug && end && end >= from ? [identityKey(id, slug)] : []
  }))
}

function invalidReceiptReason(receipt: Record<string, unknown>, start: Date, now: Date): string | null {
  const status = normalizeStatus(receipt)
  if (!status) return "status_invalid"
  if (!stringValue(receipt.candidate_id) || !stringValue(receipt.candidate_slug)) return "identity_missing"
  if (!providerIsAllowed(receipt)) return "provider_unapproved"
  if (!stringValue(receipt.query)) return "query_missing"
  const observed = stringValue(receipt.observed_at)
  if (!observed) return "observed_at_missing"
  if (!/[Tt].*(?:Z|[+-]\d{2}:\d{2})$/.test(observed)) return "observed_at_timezone_missing"
  const observedAt = new Date(observed)
  if (!Number.isFinite(observedAt.getTime()) || observedAt < start || observedAt > now) return "observed_at_outside_round"
  if (status === "executed" || status === "no_results") {
    const row = responseObject(receipt)
    if (!row) return "individual_response_missing"
    if (receipt.blocked === true || row.blocked === true) return "blocked_response_cannot_complete_search"
    const response = responseIdentity(row)
    if (!response) return "individual_response_identity_missing"
    if (response.id !== receipt.candidate_id || response.slug !== receipt.candidate_slug) return "individual_response_identity_mismatch"
    const outcome = responseOutcome(row)
    if (!outcome) return "individual_response_outcome_missing"
    if ((status === "no_results" && outcome === "found") || (status === "executed" && outcome !== "found")) return "individual_response_status_mismatch"
    if (!responseHasEvidence(row, outcome)) return "individual_response_evidence_missing"
  }
  return null
}

export function auditarRodadaFalas(input: {
  roster: readonly CandidatoFalas[]
  receipts: readonly unknown[] | ArquivoRecibosRodada | unknown
  roundStart?: Date | string
  round_start?: Date | string
  now?: Date | string
  catalog?: CatalogoFalas | { quotes?: readonly CatalogQuote[] }
}): AuditoriaRodadaFalas {
  const start = dateValue(input.roundStart ?? input.round_start, "Início da rodada")
  const now = dateValue(input.now, "Agora")
  if (now < start) throw new Error("Agora é anterior ao início da rodada")
  const identities = new Set<string>()
  for (const candidate of input.roster) {
    if (!candidate.id || !candidate.slug || !candidate.nome_urna || !["Presidente", "Governador"].includes(candidate.cargo_disputado)) throw new Error("Roster público inválido")
    const key = identityKey(candidate.id, candidate.slug)
    if (identities.has(key)) throw new Error(`Candidato duplicado na rodada: ${candidate.slug}`)
    identities.add(key)
  }
  const byKey = new Map<string, { valid: number; noResults: number; found: number; blocked: number; planned: number; lastObserved: string | null; reasons: Set<string> }>()
  for (const candidate of input.roster) byKey.set(identityKey(candidate.id, candidate.slug), { valid: 0, noResults: 0, found: 0, blocked: 0, planned: 0, lastObserved: null, reasons: new Set() })
  let invalidReceipts = 0
  for (const receipt of flattenReceipts(input.receipts)) {
    const reason = invalidReceiptReason(receipt, start, now)
    const id = stringValue(receipt.candidate_id)
    const slug = stringValue(receipt.candidate_slug)
    const key = id && slug ? identityKey(id, slug) : null
    const bucket = key ? byKey.get(key) : undefined
    if (reason) {
      invalidReceipts++
      if (bucket) {
        bucket.reasons.add(reason)
        // A planned or blocked attempt remains visibly distinct even when its
        // operational receipt is incomplete. It never contributes to searched.
        const status = normalizeStatus(receipt)
        if (reason !== "observed_at_outside_round" && status === "blocked") { bucket.blocked++; bucket.reasons.add("blocked") }
        if (reason !== "observed_at_outside_round" && status === "planned") { bucket.planned++; bucket.reasons.add("planned") }
      }
      continue
    }
    if (!bucket) { invalidReceipts++; continue }
    const status = normalizeStatus(receipt)!
    // A validação acima garante executed <=> result=found.
    if (status === "executed" || status === "no_results") {
      bucket.valid++
      if (status === "no_results") bucket.noResults++
      else bucket.found++
      const observed = new Date(stringValue(receipt.observed_at)!).toISOString()
      if (!bucket.lastObserved || observed > bucket.lastObserved) bucket.lastObserved = observed
    }
    else if (status === "blocked") { bucket.blocked++; bucket.reasons.add("blocked") }
    else { bucket.planned++; bucket.reasons.add("planned") }
  }
  const coveredKeys = catalogIdentities(input.catalog)
  const quoteWindowFrom = new Date(start.getTime() - JANELA_FALAS_DIAS * 86_400_000).toISOString().slice(0, 10)
  const windowKeys = windowQuoteIdentities(input.catalog, quoteWindowFrom)
  const candidates = input.roster.map((candidate) => {
    const key = identityKey(candidate.id, candidate.slug)
    const bucket = byKey.get(key)!
    const status: AuditoriaCandidatoRodada["status"] = bucket.valid ? "searched" : bucket.blocked ? "blocked" : bucket.planned ? "planned" : "not_searched"
    const covered = coveredKeys.has(key)
    const found = bucket.found > 0
    const hasWindowQuote = windowKeys.has(key)
    return { candidate_id: candidate.id, candidate_slug: candidate.slug, name: candidate.nome_urna, office: candidate.cargo_disputado, uf: candidate.estado,
      status, searched: status === "searched", no_results: bucket.valid > 0 && bucket.noResults === bucket.valid, covered,
      reasons: [...bucket.reasons].sort(), receipt_count: bucket.valid + bucket.blocked + bucket.planned,
      found, has_window_quote: hasWindowQuote, found_without_quote: found && !hasWindowQuote, searched_at: bucket.lastObserved }
  })
  const foundWithoutQuote = candidates.filter((candidate) => candidate.found_without_quote)
  const searched = candidates.filter((candidate) => candidate.searched).length
  const noResults = candidates.filter((candidate) => candidate.no_results).length
  const blocked = candidates.filter((candidate) => candidate.status === "blocked").length
  const planned = candidates.filter((candidate) => candidate.status === "planned").length
  const notSearched = candidates.filter((candidate) => candidate.status === "not_searched").length
  const covered = candidates.filter((candidate) => candidate.covered).length
  const missingNames = candidates.filter((candidate) => !candidate.searched).map((candidate) => candidate.name)
  return { schema_version: SCHEMA_RODADA_FALAS, round_start: start.toISOString(), now: now.toISOString(), total: candidates.length,
    searched, no_results: noResults, blocked, planned, not_searched: notSearched, covered, covered_but_unsearched: candidates.filter((candidate) => candidate.covered && !candidate.searched).length,
    invalid_receipts: invalidReceipts, complete: candidates.length > 0 && searched === candidates.length, missing_names: missingNames,
    quote_window_from: quoteWindowFrom, found: candidates.filter((candidate) => candidate.found).length,
    found_without_quote: foundWithoutQuote.length, found_without_quote_names: foundWithoutQuote.map((candidate) => candidate.name), candidates }
}

export const auditarRodada = auditarRodadaFalas
export const auditarCoberturaDaRodada = auditarRodadaFalas
