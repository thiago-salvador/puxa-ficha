/**
 * Gera recibos locais, somente leitura, para as três famílias parlamentares.
 *
 * O módulo não consulta rede, Supabase nem grava coleta_log. Ele recebe um
 * snapshot oficial já capturado e um readback do DTO público. Assim a prova
 * pode ser reproduzida sem transformar uma tentativa de coleta em dado
 * publicado.
 *
 * A chave de identidade é sempre (casa, id oficial). Nome nunca participa do
 * join. Candidatos sem ID permanecem `indeterminado` e não são promovidos a
 * vazio por falta de uma consulta.
 */

import { createHash, randomUUID } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { publicFamilyPayloadSha256 } from "./lib/coverage-source-proof"
import { parseSenadoLegislatureRoster, SENADO_EXPENSE_LEGISLATURES, senadoLegislatureRosterUrl } from "../lib/senado-legislature-roster"
import { normalizeForMatch } from "../lib/normalize-for-match"
import { stripAccents } from "../../src/lib/strip-accents"
import { camaraVoteListIsComplete, capturePageIsComplete } from "./fetch-parliamentary-family-sources-local"

export const PARLIAMENTARY_FAMILIES = [
  "projetos_lei",
  "votos_candidato",
  "gastos_parlamentares",
] as const

export type ParliamentaryFamily = (typeof PARLIAMENTARY_FAMILIES)[number]
export type ParliamentaryHouse = "camara" | "senado"
export type ReceiptResult = "encontrado" | "vazio_confirmado" | "indeterminado" | "erro"

export interface ParliamentaryCandidate {
  slug: string
  candidato_id: string
  ids: { camara?: number | string | null; senado?: number | string | null }
}

export interface OfficialRosterProof {
  /** URL do roster/lista oficial que contém o ID consultado. */
  roster_url: string
  /** Revisão, data ou ETag declarada pelo pacote/endpoint oficial. */
  roster_revision: string
  /** Caminho local do payload bruto; o coletor calcula o SHA-256. */
  roster_path: string
}

export interface ParliamentaryReadback {
  /** Arquivo bruto do DTO público relido independentemente. */
  dto_path: string
  /** Caminho até a lista do DTO; obrigatório para evitar escolher array errado. */
  dto_rows_path: readonly string[]
  /** Arquivo bruto do perfil público inteiro. */
  profile_path: string
  /** Revisão do DTO público que foi relida. */
  dto_revision: string
  /** URL ou referência local da leitura independente. */
  dto_readback_url: string
}

export interface OfficialFamilyObservation {
  /** Endpoint/pacote oficial da família, não a rota do DTO público. */
  source_url: string
  /** Caminho local do payload bruto; o coletor calcula linhas e SHA-256. */
  source_path: string
  /** Caminho até a lista de linhas, quando o formato não for autodetectável. */
  rows_path?: readonly string[]
  source_revisions?: Array<{ url: string; sha256: string; year?: number }>
  source_kind?: "camara-cota-csv" | "senado-selected-votes" | "senado-complete-authorship-single-response"
  selected_vote_ids?: string[]
  vote_catalog?: Array<{ vote_id_api: string; url: string; path: string; sha256: string }>
  source_filter?: { field: string; value?: string; values?: string[]; method: string }
  scope_evidence?: {
    rosters: Array<{ legislature: number; url: string; path: string | null; sha256: string | null; membership: boolean | "unverified"; years: number[]; failure: string | null }>
    scope_years: number[]
    excluded_years: number[]
  }
}

interface DerivedRawPage {
  page: number
  url: string
  path: string
  bytes: number
  sha256: string
  source_sha256?: string
  complete: boolean
}

export interface ParliamentarySourceObservation {
  house: ParliamentaryHouse
  family: ParliamentaryFamily
  official_id: number | string
  roster: OfficialRosterProof
  source: OfficialFamilyObservation
  readback: ParliamentaryReadback
  /** Anos declarados antes da captura de gastos, para detectar ano omitido. */
  years?: readonly number[]
  /** Completeness of each official annual Cota archive; current year is partial. */
  year_completeness?: Record<number, { complete: boolean; use_for_absence: boolean }>
}

export interface ParliamentaryReceipt {
  fonte: "camara-proposicoes" | "camara-votacoes" | "camara-gastos" | "senado-proposicoes" | "senado-votacoes" | "ceaps-senado"
  escopo: "candidato"
  alvo: string
  candidato_id: string
  resultado: ReceiptResult
  volume: number
  url: string
  detalhe: string
  /** Campo auxiliar para consumidores locais; não é coluna de coleta_log. */
  familia: ParliamentaryFamily
  executado_em: string
  /** Identificador aleatório compartilhado por todas as provas desta rodada local. */
  execucao: string
}

export interface ParliamentaryReceiptRun {
  generated_at: string
  run_id: string
  receipts: ParliamentaryReceipt[]
  unresolved_without_id: Array<{ slug: string; familia: ParliamentaryFamily; motivo: string }>
  errors: string[]
  /** As mesmas falhas de `errors`, estruturadas para virar recibo honesto. */
  failures: ParliamentaryFailure[]
  /** Hypothetical readback after the audited writers run; never a persisted receipt. */
  apply_projection?: ParliamentaryApplyProjection[]
}

export interface ParliamentaryApplyProjection {
  fonte: ParliamentaryReceipt["fonte"]
  alvo: string
  estado: "closed_now" | "safe_write" | "review" | "unresolved"
  resultado_projetado: "encontrado" | "vazio_confirmado" | null
  source_rows: number | null
  projected_public_rows: number | null
  source_url: string | null
  source_sha256: string | null
  motivo: string
  database_readback_sha256?: string
}

export interface ParliamentaryDatabaseReadback {
  schema_version: "parliamentary-db-readback-v1"
  generated_at: string
  query_sha256: string
  candidates: Array<{
    candidate_id: string
    slug: string
    projetos_lei: Record<string, unknown>[]
    gastos_parlamentares: Record<string, unknown>[]
    votos_candidato: Record<string, unknown>[]
    votacoes_chave: Record<string, unknown>[]
    row_totals: Record<string, number>
  }>
  row_totals: Record<string, number>
  artifact_sha256?: string
}

export interface ParliamentaryFailure {
  slug: string
  candidato_id: string
  familia: ParliamentaryFamily
  house: ParliamentaryHouse
  official_id: string
  /** `fonte`: a casa não entregou a observação; `prova`: entregou e a prova não fechou. */
  tipo: "fonte" | "prova"
  motivo: string
  source_url?: string | null
  source_sha256?: string | null
  source_sha256_basis?: "bundle-bytes" | "unavailable"
}

/** Pendência da captura (`fetch-parliamentary-family-sources-local.ts`). */
export interface ParliamentaryPending {
  house: ParliamentaryHouse
  family: ParliamentaryFamily
  official_id?: string
  reason: string
  source?: string
}

function normalizedId(value: number | string): string {
  const normalized = String(value).trim()
  if (!/^\d+$/.test(normalized)) throw new Error(`ID parlamentar inválido: ${normalized || "vazio"}`)
  return normalized
}

export function compactPublicHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function mapCompactPublicRows(
  publicRows: readonly Record<string, unknown>[],
  databaseRows: readonly Record<string, unknown>[],
  prefix: "pl" | "gasto" | "voto",
  candidateId: string,
): Map<Record<string, unknown>, Record<string, unknown>> {
  const mapped = new Map<Record<string, unknown>, Record<string, unknown>>()
  const hashes = new Map<string, Record<string, unknown>[]>()
  for (const row of databaseRows) {
    if (String(row.candidato_id ?? "") !== candidateId || typeof row.id !== "string" || !row.id) continue
    const hash = compactPublicHash(row.id)
    const matches = hashes.get(hash) ?? []
    matches.push(row)
    hashes.set(hash, matches)
  }
  for (const row of publicRows) {
    const matchId = typeof row.id === "string" ? new RegExp(`^${prefix}-(\\d+)-([a-z0-9]+)$`).exec(row.id) : null
    if (!matchId) throw new Error(`ID público compacto inválido para ${prefix}`)
    const matches = hashes.get(matchId[2]!) ?? []
    if (matches.length !== 1) throw new Error(`ID público compacto ${row.id} mapeia ${matches.length} IDs DB, esperado 1`)
    mapped.set(row, matches[0]!)
  }
  return mapped
}

export function validateParliamentaryDatabaseReadback(
  bytes: Buffer,
  expectedSha256: string,
): ParliamentaryDatabaseReadback {
  if (!validSha(expectedSha256) || sha256Bytes(bytes) !== expectedSha256) throw new Error("SHA-256 do readback parlamentar DB diverge")
  const parsed = object(JSON.parse(bytes.toString("utf8")))
  if (!parsed || parsed.schema_version !== "parliamentary-db-readback-v1" || typeof parsed.generated_at !== "string" || !validSha(String(parsed.query_sha256 ?? "")) || !Array.isArray(parsed.candidates)) {
    throw new Error("schema do readback parlamentar DB inválido")
  }
  const candidates = parsed.candidates as unknown[]
  const seen = new Set<string>()
  let projects = 0; let expenses = 0; let votes = 0; let votacoes = 0
  for (const raw of candidates) {
    const candidate = object(raw)
    if (!candidate || typeof candidate.candidate_id !== "string" || typeof candidate.slug !== "string" || seen.has(candidate.candidate_id)) throw new Error("identidade ou duplicidade no readback parlamentar DB")
    seen.add(candidate.candidate_id)
    for (const key of ["projetos_lei", "gastos_parlamentares", "votos_candidato", "votacoes_chave"] as const) {
      if (!Array.isArray(candidate[key])) throw new Error(`readback DB sem array completo: ${key}`)
      for (const row of candidate[key] as unknown[]) if (!object(row) || (key !== "votacoes_chave" && String(object(row)!.candidato_id ?? "") !== candidate.candidate_id)) throw new Error(`linha inválida no readback DB: ${key}`)
    }
    const totals = object(candidate.row_totals)
    if (!totals || totals.projetos_lei !== (candidate.projetos_lei as unknown[]).length || totals.gastos_parlamentares !== (candidate.gastos_parlamentares as unknown[]).length || totals.votos_candidato !== (candidate.votos_candidato as unknown[]).length || totals.votacoes_chave !== (candidate.votacoes_chave as unknown[]).length) throw new Error(`totais/linhas não fecham no readback DB para ${candidate.slug}`)
    projects += totals.projetos_lei as number; expenses += totals.gastos_parlamentares as number; votes += totals.votos_candidato as number; votacoes = Math.max(votacoes, totals.votacoes_chave as number)
  }
  const rowTotals = object(parsed.row_totals)
  if (!rowTotals || rowTotals.projects !== projects || rowTotals.expenses !== expenses || rowTotals.votes !== votes || rowTotals.votacoes_chave !== votacoes) throw new Error("totais globais do readback DB não fecham nas linhas por candidato")
  return { ...parsed, artifact_sha256: expectedSha256 } as unknown as ParliamentaryDatabaseReadback
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function sha256Bytes(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

function sortedIds(values: readonly (number | string)[]): string[] {
  return [...new Set(values.map(normalizedId))].sort()
}

function validSha(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value)
}

function validOfficialUrl(url: string, family: ParliamentaryFamily, officialId: string, requireId = true): boolean {
  try {
    const parsed = new URL(url)
    const hosts = family === "gastos_parlamentares"
      ? ["dadosabertos.camara.leg.br", "adm.senado.gov.br", "legis.senado.leg.br", "www.senado.leg.br", "www.camara.leg.br"]
      : ["dadosabertos.camara.leg.br", "legis.senado.leg.br", "www.senado.leg.br", "www.camara.leg.br"]
    return parsed.protocol === "https:" && hosts.includes(parsed.hostname) && (!requireId || parsed.href.includes(officialId))
  } catch {
    return false
  }
}

export function sourceName(house: ParliamentaryHouse, family: ParliamentaryFamily): ParliamentaryReceipt["fonte"] {
  if (house === "camara") {
    if (family === "projetos_lei") return "camara-proposicoes"
    if (family === "votos_candidato") return "camara-votacoes"
    return "camara-gastos"
  }
  if (family === "projetos_lei") return "senado-proposicoes"
  if (family === "votos_candidato") return "senado-votacoes"
  return "ceaps-senado"
}

function normalizedKeys(values: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return values.map((value) => {
    const key = String(value).trim()
    if (!key) throw new Error("chave de linha vazia")
    const occurrence = seen.get(key) ?? 0
    seen.set(key, occurrence + 1)
    // Repeated official documents can be legitimate rows. Preserve their
    // multiplicity instead of rejecting the whole source as duplicate.
    return occurrence === 0 ? key : `${key}#${occurrence + 1}`
  }).sort()
}

function rowsByNormalizedKey(rows: readonly Record<string, unknown>[], family: ParliamentaryFamily, house: ParliamentaryHouse): Map<string, Record<string, unknown>> {
  const seen = new Map<string, number>()
  return new Map(rows.map((row) => {
    const base = rowKey(row, family, house)
    const occurrence = seen.get(base) ?? 0
    seen.set(base, occurrence + 1)
    return [occurrence === 0 ? base : `${base}#${occurrence + 1}`, row]
  }))
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readRawJson(filePath: string): { bytes: Buffer; value: unknown } {
  const bytes = readFileSync(filePath)
  try {
    return { bytes, value: JSON.parse(bytes.toString("utf8")) }
  } catch {
    throw new Error(`payload oficial não é JSON legível: ${filePath}; XML/CSV exige adaptador explícito`)
  }
}

function failureSourceEvidence(observation: ParliamentarySourceObservation): Pick<ParliamentaryFailure, "source_url" | "source_sha256" | "source_sha256_basis"> {
  let sourceUrl = observation.source.source_url
  let sourceSha256: string | null = null
  try {
    const raw = readRawJson(observation.source.source_path)
    sourceSha256 = sha256Bytes(raw.bytes)
    const derived = object(raw.value)?.derived_from_pages
    if (Array.isArray(derived)) {
      const firstPage = derived.map(object).find((page) => typeof page?.url === "string" && /^https:\/\//.test(page.url))
      if (typeof firstPage?.url === "string") sourceUrl = firstPage.url
    }
  } catch { /* unreadable bundle has no verifiable content hash */ }
  return {
    source_url: /^https:\/\//.test(sourceUrl) ? sourceUrl.replace(/\{[^}]*\}/g, "") : null,
    source_sha256: sourceSha256,
    source_sha256_basis: sourceSha256 ? "bundle-bytes" : "unavailable",
  }
}

function officialPendingUrl(failure: ParliamentaryFailure): string | null {
  const id = encodeURIComponent(failure.official_id)
  if (failure.house === "camara") {
    if (failure.familia === "projetos_lei") return "https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=" + id
    if (failure.familia === "gastos_parlamentares") return "https://dadosabertos.camara.leg.br/api/v2/deputados/" + id + "/despesas"
    return "https://dadosabertos.camara.leg.br/api/v2/votacoes"
  }
  if (failure.familia === "projetos_lei") return "https://legis.senado.leg.br/dadosabertos/senador/" + id + "/autorias.json"
  if (failure.familia === "votos_candidato") return "https://legis.senado.leg.br/dadosabertos/senador/" + id + "/votacoes.json"
  return null
}

export function verifySenadoLegislatureScope(observation: ParliamentarySourceObservation, officialId: string): Record<string, unknown> | undefined {
  if (observation.house !== "senado" || observation.family !== "gastos_parlamentares") return undefined
  const years = [...(observation.years ?? [])].sort((a, b) => a - b)
  const evidence = observation.source.scope_evidence
  if (!evidence) return undefined
  if (!Array.isArray(evidence.rosters) || evidence.rosters.length !== 5 || !Array.isArray(evidence.scope_years) || !Array.isArray(evidence.excluded_years)) throw new Error("provas de rosters legislativos ausentes/incompletas")
  const allYears = Array.from({ length: 19 }, (_, index) => 2008 + index)
  const actualYears = [...years].sort((a, b) => a - b)
  if (JSON.stringify(actualYears) !== JSON.stringify([...evidence.scope_years].sort((a, b) => a - b))) throw new Error("anos do bundle CEAPS divergem da prova de escopo")
  const expectedExcluded = new Set<number>()
  const rosterProofs: Array<Record<string, unknown>> = []
  for (const legislature of [53, 54, 55, 56, 57]) {
    const entry = evidence.rosters.find((row) => row.legislature === legislature)
    const expectedUrl = senadoLegislatureRosterUrl(legislature)
    const legislatureYears = [...SENADO_EXPENSE_LEGISLATURES[legislature]!]
    if (!entry || entry.url !== expectedUrl || JSON.stringify([...entry.years].sort((a, b) => a - b)) !== JSON.stringify(legislatureYears)) throw new Error(`escopo/URL do roster ${legislature} inválido`)
    if (entry.membership === "unverified") {
      if (entry.path !== null || entry.sha256 !== null || !entry.failure) throw new Error(`roster ${legislature} marcado não verificado sem falha`)
      rosterProofs.push({ legislature, url: expectedUrl, membership: "unverified", years: legislatureYears })
      continue
    }
    if (typeof entry.membership !== "boolean" || !entry.path || !entry.sha256 || !validSha(entry.sha256) || entry.failure !== null) throw new Error(`roster ${legislature} sem prova íntegra`)
    const payload = readRawJson(entry.path)
    const actualSha = sha256Bytes(payload.bytes)
    if (actualSha !== entry.sha256) throw new Error(`SHA do roster ${legislature} diverge`)
    const roster = parseSenadoLegislatureRoster(payload.bytes, legislature)
    const actualMembership = roster.ids.has(officialId)
    if (entry.membership !== actualMembership) throw new Error(`membership diverge do roster ${legislature}`)
    if (!actualMembership) for (const year of legislatureYears) expectedExcluded.add(year)
    rosterProofs.push({ legislature, url: expectedUrl, sha256: actualSha, membership: actualMembership ? "present" : "absent", years: legislatureYears })
  }
  const expectedYears = allYears.filter((year) => !expectedExcluded.has(year))
  const actualExcluded = [...evidence.excluded_years].sort((a, b) => a - b)
  if (JSON.stringify(expectedYears) !== JSON.stringify(actualYears) || JSON.stringify([...expectedExcluded].sort((a, b) => a - b)) !== JSON.stringify(actualExcluded)) throw new Error("escopo CEAPS não corresponde às cinco listas legislativas")
  return { rosters: rosterProofs, excluded_years: actualExcluded, scope_years: actualYears }
}

function valueAtPath(value: unknown, path: readonly string[] | undefined): unknown {
  let current = value
  for (const part of path ?? []) {
    const container = object(current)
    if (!container) return undefined
    current = container[part]
  }
  return current
}

function rowsFromPayload(value: unknown, path: readonly string[] | undefined): Record<string, unknown>[] {
  if (!path || path.length === 0) throw new Error("rows_path obrigatório; o coletor não escolhe o maior array")
  const selected = valueAtPath(value, path)
  if (!Array.isArray(selected)) throw new Error("rows_path não aponta para uma lista")
  return selected.filter((row): row is Record<string, unknown> => Boolean(object(row)))
}

function rowContainsOfficialId(value: unknown, officialId: string): boolean {
  if (Array.isArray(value)) return value.some((item) => rowContainsOfficialId(item, officialId))
  const row = object(value)
  if (!row) return false
  const deputy = object(row.deputado_)
  if (String(deputy?.id ?? "").trim() === officialId) return true
  if (["idDeputado", "idDeputadoAutor", "idParlamentar", "codSenador", "CodigoParlamentar", "codigoParlamentar", "idSenador"].some((key) => String(row[key] ?? "").trim() === officialId)) return true
  return Object.values(row).some((item) => item && typeof item === "object" && rowContainsOfficialId(item, officialId))
}

function normalizeOfficialVote(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ")
  const aliases: Record<string, string> = { sim: "sim", "não": "não", nao: "não", "abstenção": "abstenção", abstencao: "abstenção", "obstrução": "obstrução", obstrucao: "obstrução", ausente: "ausente", "artigo 17": "artigo_17", artigo_17: "artigo_17" }
  const result = aliases[normalized]
  if (!result) throw new Error(`voto oficial sem valor reconhecido (${normalized || "vazio"})`)
  return result
}

function selectSenadoNominalRows(rows: Record<string, unknown>[], officialId: string, ids: string[]): Record<string, unknown>[] {
  if (ids.length === 0 || ids.some((id) => !/^\d+$/.test(id)) || new Set(ids).size !== ids.length) throw new Error("IDs selecionados de votação Senado inválidos ou duplicados")
  const selected = new Set(ids)
  const seen = new Set<string>()
  const normalized: Record<string, unknown>[] = []
  for (const row of rows) {
    const id = String(row.CodigoSessaoVotacao ?? "").trim()
    if (!selected.has(id)) continue
    if (seen.has(id)) throw new Error(`CodigoSessaoVotacao duplicado na fonte Senado: ${id}`)
    seen.add(id)
    const label = String(row.SiglaDescricaoVoto ?? "").trim()
    const folded = stripAccents(label).toLowerCase()
    if (folded === "votou") throw new Error(`Votou não publica polaridade individual: ${id}`)
    let vote: string | null = null
    if (folded === "sim") vote = "sim"
    else if (folded === "nao") vote = "não"
    else if (folded.startsWith("absten")) vote = "abstenção"
    else if (folded.startsWith("obstr")) vote = "obstrução"
    if (vote) normalized.push({ ...row, CodigoParlamentar: officialId, vote_id_api: id, voto: vote })
  }
  return normalized
}

function validRawPageUrl(value: string, observation: ParliamentarySourceObservation, officialId: string): boolean {
  const senateCeaps = observation.house === "senado" && observation.family === "gastos_parlamentares"
  const camaraCota = observation.house === "camara" && observation.family === "gastos_parlamentares" && observation.source.source_kind === "camara-cota-csv"
  if (!validOfficialUrl(value, observation.family, officialId, !senateCeaps && !camaraCota && (observation.house === "camara" && observation.family !== "votos_candidato"))) return false
  const url = new URL(value)
  if (observation.house === "camara" && observation.family === "projetos_lei") return url.pathname === "/api/v2/proposicoes" && url.searchParams.get("idDeputadoAutor") === officialId
  if (observation.house === "camara" && observation.family === "gastos_parlamentares") {
    if (observation.source.source_kind === "camara-cota-csv") return url.hostname === "www.camara.leg.br" && /^\/cotas\/Ano-20\d{2}\.csv\.zip$/.test(url.pathname)
    const year = Number(url.searchParams.get("ano"))
    return url.pathname === `/api/v2/deputados/${officialId}/despesas` && Number.isInteger(year) && year >= 2000 && year <= 2026 && url.searchParams.get("idLegislatura") === (year <= 2022 ? "56" : "57")
  }
  if (observation.house === "camara") return observation.family === "votos_candidato"
    ? /^\/api\/v2\/votacoes\/\d+-\d+\/votos$/.test(url.pathname)
    : /^\/api\/v2\/votacoes\/\d+\/votos$/.test(url.pathname)
  if (observation.family === "projetos_lei") return url.pathname === `/dadosabertos/senador/${officialId}/autorias.json`
  if (observation.family === "votos_candidato") return url.pathname === `/dadosabertos/senador/${officialId}/votacoes.json`
  return /^\/transparencia\/LAI\/verba\/despesa_ceaps_\d{4}\.csv$/.test(url.pathname)
}

function rawPageRows(value: unknown, observation: ParliamentarySourceObservation, officialId: string): Record<string, unknown>[] {
  if (observation.house === "camara" && observation.family === "gastos_parlamentares" && observation.source.source_kind === "camara-cota-csv") {
    const root = object(value)
    const rows = root?.CotaRows
    if (!Array.isArray(rows) || root?.complete !== true) throw new Error("bundle anual Cota Câmara sem CotaRows/complete")
    return rows.map((raw) => {
      const row = object(raw)
      if (!row || String(row.ideCadastro ?? "") !== officialId || !Number.isInteger(row.ano) || !Number.isInteger(row.source_rows) || Number(row.source_rows) <= 0 || !Number.isFinite(row.total_gasto) || !Array.isArray(row.categorias)) throw new Error("agregado anual Cota Câmara inválido ou com ID divergente")
      return row
    })
  }
  if (observation.house === "senado" && observation.family !== "gastos_parlamentares") {
    const envelopeName = observation.family === "projetos_lei" ? "MateriasAutoriaParlamentar" : "VotacaoParlamentar"
    const groupName = observation.family === "projetos_lei" ? "Autorias" : "Votacoes"
    const rowName = observation.family === "projetos_lei" ? "Autoria" : "Votacao"
    const envelope = object(object(value)?.[envelopeName])
    const parliamentarian = object(envelope?.Parlamentar)
    const declaredId = normalizedId(String(parliamentarian?.Codigo ?? ""))
    if (declaredId !== officialId) throw new Error("página bruta do Senado diverge do ID oficial")
    const list = object(parliamentarian?.[groupName])?.[rowName]
    if (!Array.isArray(list)) throw new Error(`página bruta do Senado sem ${groupName}.${rowName}`)
    return list.map((row) => {
      const record = object(row)
      if (!record) throw new Error("linha bruta do Senado inválida")
      return { ...record, CodigoParlamentar: declaredId }
    })
  }
  if (observation.house === "senado" && observation.family === "gastos_parlamentares") {
    const list = object(value)?.CeapsRows
    const filter = observation.source.source_filter
    const names = filter?.values ?? (filter?.value ? [filter.value] : [])
    if (!Array.isArray(list) || names.length === 0 || names.some((name) => typeof name !== "string" || !name.trim()) || filter?.field !== "SENADOR") throw new Error("página bruta CEAPS sem CSV anual ou filtro nominal verificado")
    const normalize = (text: string) => normalizeForMatch(text).replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
    const knownNames = new Set(names.map(normalize))
    return list.filter((raw) => {
      const row = object(raw)
      return Boolean(row && typeof row.SENADOR === "string" && knownNames.has(normalize(row.SENADOR)))
    }).map((raw) => ({ ...(raw as Record<string, unknown>), CodigoParlamentar: officialId }))
  }
  const rows = rowsFromPayload(value, observation.source.rows_path)
  return observation.house === "camara" && observation.family === "votos_candidato"
    ? rows.filter((row) => rowContainsOfficialId(row, officialId))
    : rows
}

function reconstructFromRawPages(bundle: Record<string, unknown>, observation: ParliamentarySourceObservation, officialId: string): Record<string, unknown>[] {
  const pages = bundle.derived_from_pages
  if (!Array.isArray(pages) || pages.length === 0) throw new Error("bundle positivo sem derived_from_pages")
  const metadata = pages.map((raw): DerivedRawPage => {
    const page = object(raw)
    if (!page || !Number.isInteger(page.page) || typeof page.url !== "string" || typeof page.path !== "string" || !Number.isInteger(page.bytes) || typeof page.sha256 !== "string" || typeof page.complete !== "boolean") {
      throw new Error("metadado de página bruta incompleto")
    }
    const camaraCota = observation.house === "camara" && observation.family === "gastos_parlamentares" && observation.source.source_kind === "camara-cota-csv"
    const camaraVotes = observation.house === "camara" && observation.family === "votos_candidato"
    if (!validSha(page.sha256) || !validRawPageUrl(page.url, observation, officialId) || ((observation.house === "senado" && observation.family === "gastos_parlamentares" || camaraCota) && !validSha(String(page.source_sha256 ?? "")))) {
      throw new Error("URL ou SHA inválido em página bruta")
    }
    if (camaraVotes) {
      const revision = observation.source.source_revisions?.find((entry) => entry.url === page.url)
      if (!revision || revision.sha256 !== page.sha256) throw new Error("página nominal de votação ausente/divergente do manifesto SHA")
    }
    if (camaraCota && page.source_sha256 !== sha256Bytes(Buffer.from(JSON.stringify(observation.source.source_revisions ?? [])))) throw new Error("manifesto de ZIP Cota Câmara diverge do pacote capturado")
    if (observation.house === "senado" && observation.family === "gastos_parlamentares") {
      const year = Number(new URL(page.url).pathname.match(/despesa_ceaps_(\d{4})\.csv$/)?.[1])
      const revision = observation.source.source_revisions?.find((entry) => entry.url === page.url)
      if (!Number.isInteger(year) || !revision || revision.year !== year || revision.sha256 !== page.source_sha256) throw new Error("URL, ano ou SHA do CSV CEAPS diverge do manifesto")
    }
    return page as unknown as DerivedRawPage
  })
  const rows: Record<string, unknown>[] = []
  const groups = new Map<string, DerivedRawPage[]>()
  for (const page of metadata) {
    if (!existsSync(page.path)) throw new Error(`página bruta ausente ou SHA divergente: ${page.page}`)
    const raw = readFileSync(page.path)
    if (raw.length !== page.bytes || sha256Bytes(raw) !== page.sha256) throw new Error(`página bruta ausente ou SHA divergente: ${page.page}`)
    const value = JSON.parse(raw.toString("utf8")) as unknown
    const parsedUrl = new URL(page.url)
    const camaraCota = observation.house === "camara" && observation.family === "gastos_parlamentares" && observation.source.source_kind === "camara-cota-csv"
    if (observation.house === "senado" && observation.family === "gastos_parlamentares" && !/despesa_ceaps_\d{4}\.csv$/.test(parsedUrl.pathname)) throw new Error("página CEAPS sem ano no endpoint")
    if (camaraCota && (page.page !== 1 || !page.complete)) throw new Error("bundle agregado Cota Câmara deve ser uma página completa")
    if (camaraCota) {
      const valueParsed = JSON.parse(raw.toString("utf8")) as unknown
      rows.push(...rawPageRows(valueParsed, observation, officialId))
      continue
    }
    const pageParam = parsedUrl.searchParams.get("pagina")
    if (pageParam !== null && Number(pageParam) !== page.page) throw new Error("número de página diverge da URL")
    parsedUrl.searchParams.delete("pagina")
    const groupKey = parsedUrl.href
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), page])
    const pageRows = rawPageRows(value, observation, officialId)
    if (observation.house === "senado" && observation.family === "votos_candidato" && observation.source.source_kind === "senado-selected-votes") {
      const ids = observation.source.selected_vote_ids
      const revision = observation.source.source_revisions?.find((entry) => entry.url === page.url)
      if (!ids || !revision || revision.sha256 !== page.sha256 || page.page !== 1 || !page.complete) throw new Error("captura de votos selecionados Senado sem IDs/revisão SHA/página completa")
      rows.push(...selectSenadoNominalRows(pageRows, officialId, ids))
    } else if (observation.house === "camara" && observation.family === "votos_candidato") {
      const nominalRows = object(value)?.dados
      if (!Array.isArray(nominalRows) || nominalRows.some((row) => !object(row))) throw new Error("lista nominal oficial de votação inválida")
      const voteId = parsedUrl.pathname.match(/\/votacoes\/(\d+-\d+)\/votos/)?.[1]
      if (!voteId) throw new Error("URL da página sem ID de votação Câmara")
      rows.push(...pageRows.map((row) => ({ ...row, vote_id_api: voteId })))
    } else rows.push(...pageRows)

    if (observation.house === "camara") {
      const links = object(value)?.links
      const rawRows = object(value)?.dados
      const pageItemCount = Array.isArray(rawRows) ? rawRows.length : pageRows.length
      // Lista nominal de votação sem `pagina`/`itens` é resposta única (a API
      // recusa esses parâmetros desde 30/09/2026); URL paginada segue a regra antiga.
      const singleVoteList = observation.family === "votos_candidato" && !new URL(page.url).search
      const expectedComplete = singleVoteList
        ? camaraVoteListIsComplete(value, page.url)
        : Array.isArray(links) && links.length > 0
          ? capturePageIsComplete(value, pageItemCount, page.page, page.url)
          : pageItemCount < 100
      if (page.complete !== expectedComplete) {
        throw new Error("marcador de exaustão diverge da resposta bruta")
      }
    } else if (!page.complete) throw new Error("página Senado/CEAPS sem marcador de exaustão")
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.page - b.page)
    if (group.some((page, index) => page.page !== index + 1)) throw new Error("sequência de páginas não contígua")
    if (group.some((page, index) => page.complete !== (index === group.length - 1))) throw new Error("paginação sem esgotamento comprovado")
  }
  if (observation.family === "gastos_parlamentares") {
    const expected = observation.years
    if (!Array.isArray(expected) || expected.length === 0 || expected.some((year) => !Number.isInteger(year))) throw new Error("escopo anual de gastos ausente")
    const camaraCota = observation.house === "camara" && observation.source.source_kind === "camara-cota-csv"
    const actual = camaraCota
      ? (observation.source.source_revisions ?? []).map((revision) => revision.year)
      : metadata.map((page) => {
      const url = new URL(page.url)
      return observation.house === "camara" ? Number(url.searchParams.get("ano")) : Number(url.pathname.match(/despesa_ceaps_(\d{4})\.csv$/)?.[1])
      })
    if (camaraCota) {
      const revisions = observation.source.source_revisions ?? []
      const exact = expected.length === 19 && expected[0] === 2008 && expected[18] === 2026 && revisions.length === 19 && revisions.every((revision, index) => revision.year === 2008 + index && revision.url === `https://www.camara.leg.br/cotas/Ano-${2008 + index}.csv.zip` && validSha(revision.sha256))
      if (!exact) throw new Error("escopo Cota Câmara exige os 19 ZIPs de 2008–2026 com URL e SHA individual")
    }
    if (new Set(actual).size !== expected.length || new Set(expected).size !== expected.length || expected.some((year) => !actual.includes(year))) {
      throw new Error("páginas de gastos não cobrem todos os anos declarados")
    }
  }
  if (observation.house === "camara" && observation.family === "votos_candidato") {
    const catalog = verifyCamaraVoteCatalog(observation)
    const observedIds = new Set(metadata.map((page) => new URL(page.url).pathname.match(/\/votacoes\/(\d+-\d+)\/votos/)?.[1]).filter((value): value is string => Boolean(value)))
    if (observedIds.size !== catalog.size || [...catalog.keys()].some((id) => !observedIds.has(id))) throw new Error("listas nominais não cobrem exatamente o catálogo de IDs de votação")
    const revisions = observation.source.source_revisions ?? []
    if (revisions.length !== metadata.length + catalog.size) throw new Error("manifesto de votação não inclui cada página nominal e metadado oficial")
  }
  if (bundle.complete !== true || bundle.total !== rows.length) throw new Error("bundle diverge das páginas brutas reconstruídas")
  return rows
}

function identityFromRow(row: Record<string, unknown>): string | null {
  const deputyId = object(row.deputado_)?.id
  if (deputyId !== undefined && deputyId !== null && String(deputyId).trim()) return normalizedId(String(deputyId))
  for (const field of ["ideCadastro", "idDeputadoAutor", "idDeputado", "idParlamentar", "codSenador", "CodigoParlamentar", "codigoParlamentar", "idSenador"]) {
    const raw = row[field]
    if (raw !== undefined && raw !== null && String(raw).trim()) return normalizedId(String(raw))
  }
  return null
}

function publicRowHouse(row: Record<string, unknown>, family: ParliamentaryFamily): ParliamentaryHouse | null {
  const vote = family === "votos_candidato" ? object(row.votacao) : null
  const value = family === "votos_candidato" ? vote?.casa : row.casa
  if (typeof value !== "string") return null
  const normalized = stripAccents(value).trim().toLocaleLowerCase("pt-BR")
  if (normalized === "camara") return "camara"
  if (normalized === "senado") return "senado"
  return null
}

function databaseRowHouse(row: Record<string, unknown> | undefined, family: ParliamentaryFamily, candidate: ParliamentaryCandidate): ParliamentaryHouse | null {
  const source = stripAccents(String(row?.fonte ?? "")).trim().toLocaleLowerCase("pt-BR")
  if (!source) return null
  if (family === "votos_candidato") return null
  if (family === "projetos_lei") {
    if (["senado", "senado federal"].includes(source)) return "senado"
    if (["camara", "camara dos deputados"].includes(source)) return "camara"
    return null
  }
  if (family === "gastos_parlamentares") {
    if (source.includes("portal da transparencia")) return null
    const officialId = candidate.ids.camara == null ? null : normalizedId(candidate.ids.camara)
    if (officialId && /^https?:\/\/(?:www\.)?camara\.leg\.br\/transparencia\/gastosemfim\//.test(source)) return "camara"
    try {
      const url = new URL(String(row?.fonte ?? ""))
      if (officialId && url.hostname === "dadosabertos.camara.leg.br" && url.pathname === `/api/v2/deputados/${officialId}/despesas`) return "camara"
    } catch { /* source may be a named allowlisted alias */ }
    if (["camara cota", "camara ceap csv", "camara ceaps csv", "camara-cota-csv", "camara"].includes(source)) return "camara"
    if (["ceaps/senado", "senado ceaps", "senado ceaps csv", "senado", "senado federal"].includes(source)) return "senado"
  }
  return null
}

function publicTotalForHouse(
  profile: Record<string, unknown>,
  family: ParliamentaryFamily,
  house: ParliamentaryHouse,
  visibleRows: number,
): number {
  if (family !== "projetos_lei") return visibleRows
  const camara = profile.projetos_lei_camara_total
  const senado = profile.projetos_lei_senado_total
  const global = profile.projetos_lei_total
  const validCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  const houseTotal = house === "camara" ? camara : senado
  if (!validCount(houseTotal)) throw new Error(`contagem integral de projetos da Casa ${house} ausente no DTO público`)
  if (validCount(camara) && validCount(senado) && validCount(global) && camara + senado !== global) {
    throw new Error("contagens integrais Câmara/Senado não fecham o total público de projetos")
  }
  return houseTotal
}

function rowKey(row: Record<string, unknown>, family: ParliamentaryFamily, house?: ParliamentaryHouse): string {
  if (family === "votos_candidato") {
    if (house === "senado") {
      const voting = object(row.votacao)
      const session = object(row.SessaoPlenaria)
      const matter = object(row.Materia)
      const proposition = field(voting ?? {}, ["proposicao_id", "CodigoMateria"]) ?? field(matter ?? {}, ["Codigo"])
      const date = field(voting ?? {}, ["data_votacao", "DataSessao"]) ?? field(session ?? {}, ["DataSessao"])
      const vote = field(row, ["voto", "Voto", "SiglaDescricaoVoto", "tipoVoto"])
      if (proposition === undefined || date === undefined || vote === undefined) throw new Error("voto Senado sem proposição, data ou polaridade para chave natural")
      return `senado-vote:${canonicalJson({ proposition: String(proposition).trim(), date: String(date).slice(0, 10), vote: normalizeOfficialVote(String(vote)) })}`
    }
    const voteId = field(row, ["vote_id_api", "votacao_id_api"]) ?? field(object(row.votacao) ?? {}, ["vote_id_api", "votacao_id_api"])
    if (voteId !== undefined) return `vote:${String(voteId).trim()}`
  }
  if (family === "gastos_parlamentares" && (house === "senado" || (house === "camara" && ("ideCadastro" in row || "total_gasto" in row)))) {
    const year = field(row, ["ano", "ANO", "Ano", "year"])
    if (year !== undefined) return `year:${String(year).trim()}`
  }
  if (family === "gastos_parlamentares") {
    const document = field(row, ["codDocumento", "codDocumentoFiscal", "numeroDocumento", "numeroDocumentoFiscal", "urlDocumento"])
    const year = field(row, ["ano", "ANO", "Ano", "year"])
    const month = field(row, ["mes", "MES", "Mes", "month"])
    const amount = field(row, ["valorLiquido", "valorLiquidoFonte", "valorReembolsado", "ValorDespesa", "VALOR_REEMBOLSADO", "valor"])
    if (document !== undefined && year !== undefined && month !== undefined && amount !== undefined) {
      return `expense:${canonicalJson({ document: String(document).trim(), year: String(year).trim(), month: String(month).trim(), amount: String(amount).trim() })}`
    }
  }
  if (family === "projetos_lei") {
    const material = object(row.Materia) ?? row
    const type = field(material, ["siglaTipo", "tipo", "Sigla", "sigla"])
    const number = field(material, ["numero", "Numero", "numeroMateria"])
    const year = field(material, ["ano", "Ano", "anoMateria"])
    // Câmara `id` is official when paired with its API `uri`; Senado uses
    // Materia.Codigo. Prefer the stable bill tuple when available so the key
    // also joins public DTO rows, whose display ID is synthetic.
    if (type !== undefined && number !== undefined && year !== undefined) {
      return `project:${canonicalJson({ type: String(type).trim(), number: String(number).trim(), year: String(year).trim() })}`
    }
    const officialId = field(material, ["Codigo", "idProposicao", "proposicao_id_api"]) ??
      field(row, ["proposicao_id_api", "idProposicao"]) ??
      (typeof row.uri === "string" ? field(row, ["id"]) : undefined)
    if (officialId !== undefined) return `project-id:${String(officialId).trim()}`
    throw new Error("projeto sem tupla legal nem ID oficial para chave")
  }
  const fields = family === "votos_candidato"
    ? ["id", "idVotacao", "CodigoVotacao", "Codigo", "votacao_id_api"]
    : ["id", "numeroDocumento", "numeroDocumentoFiscal", "id_despesa", "data", "DataDespesa"]
  for (const field of fields) {
    const raw = row[field]
    if (raw !== undefined && raw !== null && String(raw).trim()) return `${field}:${String(raw).trim()}`
  }
  return `sha256:${sha256(canonicalJson(row))}`
}

function field(row: Record<string, unknown>, names: readonly string[]): unknown {
  for (const name of names) {
    const value = row[name]
    if (value !== undefined && value !== null && String(value).trim() !== "") return value
  }
  return undefined
}

function materialRow(row: Record<string, unknown>, family: ParliamentaryFamily, house?: ParliamentaryHouse): Record<string, unknown> {
  if (family === "projetos_lei") {
    const material = object(row.Materia) ?? row
    const type = field(material, ["siglaTipo", "tipo", "Sigla", "sigla"])
    const number = field(material, ["numero", "Numero", "numeroMateria"])
    const year = field(material, ["ano", "Ano", "anoMateria"])
    const text = field(material, ["ementa", "Ementa", "EmentaMateria"])
    const statusRaw = field(material, ["situacao", "statusProposicao", "DescricaoSituacao", "Situacao"])
    const status = object(statusRaw)?.descricaoSituacao ?? statusRaw
    const nullable = (value: unknown) => value === undefined || value === null || value === "" ? null : String(value)
    return { type: nullable(type), number: nullable(number), year: nullable(year), text: nullable(text), status: nullable(status) }
  }
  if (family === "gastos_parlamentares" && (house === "senado" || (house === "camara" && ("ideCadastro" in row || "total_gasto" in row)))) {
    const year = field(row, ["ano", "ANO", "Ano", "year"])
    const amount = field(row, ["total_gasto", "valorReembolsado", "VALOR_REEMBOLSADO", "valor"])
    if (year === undefined || amount === undefined) throw new Error("gasto CEAPS sem ano ou total anual")
    const rawAmount = String(amount).trim()
    const parsed = typeof amount === "number" ? amount : Number(rawAmount.includes(",") ? rawAmount.replace(/\./g, "").replace(",", ".") : rawAmount)
    if (!Number.isFinite(parsed)) throw new Error("gasto CEAPS com total anual inválido")
    const categoriesRaw = house === "camara" ? field(row, ["categorias"]) : undefined
    const categories = Array.isArray(categoriesRaw)
      ? categoriesRaw.map((item) => {
        const category = object(item)
        if (!category || typeof category.categoria !== "string" || !Number.isFinite(category.valor)) throw new Error("agregado Cota Câmara com categoria inválida")
        return { categoria: category.categoria, valor: Number(category.valor).toFixed(2) }
      }).sort((a, b) => a.categoria.localeCompare(b.categoria))
      : Array.isArray(row.detalhamento)
        ? (row.detalhamento as unknown[]).map((item) => {
          const category = object(item)
          if (!category || typeof category.categoria !== "string" || !Number.isFinite(category.valor)) throw new Error("DTO Cota Câmara com categoria inválida")
          return { categoria: category.categoria, valor: Number(category.valor).toFixed(2) }
        }).sort((a, b) => a.categoria.localeCompare(b.categoria))
        : []
    return { id: String(year), year: String(year), amount: (Math.round(parsed * 100) / 100).toFixed(2), ...(house === "camara" ? { categories } : {}) }
  }
  if (family === "votos_candidato") {
    const nested = object(row.votacao)
    if (house === "senado") {
      const session = object(row.SessaoPlenaria)
      const matter = object(row.Materia)
      const proposition = field(nested ?? {}, ["proposicao_id", "CodigoMateria"]) ?? field(matter ?? {}, ["Codigo"])
      const date = field(nested ?? {}, ["data_votacao", "DataSessao"]) ?? field(session ?? {}, ["DataSessao"])
      const vote = field(row, ["voto", "Voto", "SiglaDescricaoVoto", "tipoVoto"])
      if (proposition === undefined || date === undefined || vote === undefined) throw new Error("voto Senado sem proposição, data ou polaridade material")
      return { proposition: String(proposition).trim(), date: String(date).slice(0, 10), vote: normalizeOfficialVote(String(vote)) }
    }
    const id = field(row, ["vote_id_api", "votacao_id_api"]) ?? field(nested ?? {}, ["vote_id_api", "votacao_id_api"])
    const vote = field(row, ["voto", "Voto", "tipoVoto", "voto_normalizado"])
    if (id === undefined || vote === undefined) throw new Error("votação sem ID de votação ou voto")
    return { id: String(id), vote: normalizeOfficialVote(String(vote)) }
  }
  const id = field(row, ["id", "codDocumento", "codDocumentoFiscal", "numeroDocumento", "numeroDocumentoFiscal", "urlDocumento", "id_despesa"])
  const year = field(row, ["ano", "Ano", "year"])
  const amount = field(row, ["valorLiquido", "valorLiquidoFonte", "valorReembolsado", "ValorDespesa", "valor"])
  if (id === undefined || year === undefined || amount === undefined) throw new Error("gasto sem ID, ano ou valor")
  return { id: String(id), year: String(year), amount: String(amount) }
}

function sourceMaterialMatchesDto(source: Record<string, unknown>, dto: Record<string, unknown>, family: ParliamentaryFamily, house: ParliamentaryHouse): boolean {
  if (family === "projetos_lei") {
    const sourceMaterial = object(source.Materia) ?? source
    const dtoMaterial = object(dto.Materia) ?? dto
    const pairs: Array<[readonly string[], readonly string[]]> = [
      [["siglaTipo", "tipo", "Sigla", "sigla"], ["siglaTipo", "tipo", "Sigla", "sigla"]],
      [["numero", "Numero", "numeroMateria"], ["numero", "Numero", "numeroMateria"]],
      [["ano", "Ano", "anoMateria"], ["ano", "Ano", "anoMateria"]],
      [["ementa", "Ementa", "EmentaMateria"], ["ementa", "Ementa", "EmentaMateria"]],
      [["situacao", "statusProposicao", "DescricaoSituacao", "Situacao"], ["situacao", "statusProposicao", "DescricaoSituacao", "Situacao"]],
    ]
    for (const [sourceNames, dtoNames] of pairs) {
      const sourceValue = field(sourceMaterial, sourceNames)
      if (sourceValue === undefined) continue
      const dtoValue = field(dtoMaterial, dtoNames)
      if (dtoValue === undefined || String(sourceValue).trim() !== String(dtoValue).trim()) return false
    }
    return pairs.slice(0, 3).every(([sourceNames, dtoNames]) => {
      const sourceValue = field(sourceMaterial, sourceNames)
      const dtoValue = field(dtoMaterial, dtoNames)
      return sourceValue !== undefined && dtoValue !== undefined && String(sourceValue).trim() === String(dtoValue).trim()
    })
  }
  try {
    return canonicalJson(materialRow(source, family, house)) === canonicalJson(materialRow(dto, family, house))
  } catch {
    return false
  }
}

function sourceProjectIdentityMatchesDto(source: Record<string, unknown>, dto: Record<string, unknown>): boolean {
  const sourceMaterial = object(source.Materia) ?? source
  const dtoMaterial = object(dto.Materia) ?? dto
  const normalize = (value: unknown): string => stripAccents(String(value ?? "")).toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim()
  const sourceType = field(sourceMaterial, ["siglaTipo", "tipo", "Sigla", "sigla"])
  const dtoType = field(dtoMaterial, ["siglaTipo", "tipo", "Sigla", "sigla"])
  const sourceNumber = field(sourceMaterial, ["numero", "Numero", "numeroMateria"])
  const dtoNumber = field(dtoMaterial, ["numero", "Numero", "numeroMateria"])
  if (sourceType === undefined || dtoType === undefined || normalize(sourceType) !== normalize(dtoType) ||
      sourceNumber === undefined || dtoNumber === undefined || normalize(sourceNumber) !== normalize(dtoNumber)) return false
  const sourceYear = field(sourceMaterial, ["ano", "Ano", "anoMateria"])
  const dtoYear = field(dtoMaterial, ["ano", "Ano", "anoMateria"])
  if (sourceYear !== undefined && dtoYear !== undefined && normalize(sourceYear) === normalize(dtoYear)) return true
  const sourceText = field(sourceMaterial, ["ementa", "Ementa", "EmentaMateria"])
  const dtoText = field(dtoMaterial, ["ementa", "Ementa", "EmentaMateria"])
  return sourceText !== undefined && dtoText !== undefined && normalize(sourceText) === normalize(dtoText)
}

function aggregateSenadoCeapsRows(rows: Record<string, unknown>[], officialId: string): Record<string, unknown>[] {
  const years = new Map<number, number>()
  for (const row of rows) {
    const year = Number(row.ANO)
    const raw = String(row.VALOR_REEMBOLSADO ?? "").trim()
    const amount = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw)
    if (!Number.isInteger(year) || !Number.isFinite(amount) || String(row.CodigoParlamentar ?? "") !== officialId) throw new Error("CSV CEAPS tem ano, valor ou identidade inválidos")
    years.set(year, (years.get(year) ?? 0) + Math.round(amount * 100))
  }
  return [...years.entries()].sort((a, b) => a[0] - b[0]).map(([year, cents]) => ({ CodigoParlamentar: officialId, ano: year, total_gasto: cents / 100 }))
}

function writerRows(rows: Record<string, unknown>[], house: ParliamentaryHouse, family: ParliamentaryFamily, officialId: string): Record<string, unknown>[] {
  if (house === "senado" && family === "gastos_parlamentares") return aggregateSenadoCeapsRows(rows, officialId)
  if (house === "senado" && family === "projetos_lei") {
    const seenMatterIds = new Set<string>()
    return rows.filter((row) => {
      const materia = object(row.Materia)
      const materiaId = String(field(materia ?? {}, ["Codigo", "CodigoMateria"]) ?? "").trim()
      if (!materiaId) return true
      if (seenMatterIds.has(materiaId)) return false
      seenMatterIds.add(materiaId)
      return true
    })
  }
  // The ficha labels this inventory as authorship and includes coauthorship;
  // keep the simulated writer and the receipt count on that same full scope.
  return rows
}

function verifiedWriterRows(observation: ParliamentarySourceObservation): Record<string, unknown>[] {
  const officialId = normalizedId(observation.official_id)
  const roster = readRawJson(observation.roster.roster_path)
  if (!idsFromRoster(roster.value).includes(officialId)) throw new Error("ID ausente no roster oficial da Casa peer")
  const source = readRawJson(observation.source.source_path)
  const bundle = object(source.value)
  if (!bundle || bundle.complete !== true) throw new Error("captura da Casa peer incompleta")
  const captured = reconstructFromRawPages(bundle, observation, officialId)
  if (canonicalJson(rowsFromPayload(source.value, observation.source.rows_path)) !== canonicalJson(captured) || Number(bundle.total) !== captured.length) {
    throw new Error("páginas brutas da Casa peer não fecham o total capturado")
  }
  return writerRows(captured, observation.house, observation.family, officialId)
}

function verifyCamaraVoteCatalog(observation: ParliamentarySourceObservation): Map<string, { date: string; propositions: Set<string> }> {
  const catalog = observation.source.vote_catalog
  if (observation.house !== "camara" || observation.family !== "votos_candidato") return new Map()
  if (!Array.isArray(catalog) || catalog.length === 0) throw new Error("catálogo de IDs de votação Câmara ausente")
  const result = new Map<string, { date: string; propositions: Set<string> }>()
  for (const entry of catalog) {
    if (!/^\d+-\d+$/.test(entry.vote_id_api) || result.has(entry.vote_id_api) || entry.url !== `https://dadosabertos.camara.leg.br/api/v2/votacoes/${entry.vote_id_api}` || !validSha(entry.sha256) || !existsSync(entry.path)) throw new Error("entrada de catálogo de votação Câmara inválida")
    const raw = readRawJson(entry.path)
    if (sha256Bytes(raw.bytes) !== entry.sha256) throw new Error(`SHA dos metadados da votação ${entry.vote_id_api} diverge`)
    const data = object(object(raw.value)?.dados)
    if (!data || String(data.id) !== entry.vote_id_api || typeof data.data !== "string") throw new Error(`metadados oficiais sem ID/data para votação ${entry.vote_id_api}`)
    const revision = observation.source.source_revisions?.find((item) => item.url === entry.url)
    if (!revision || revision.sha256 !== entry.sha256) throw new Error(`metadados da votação ${entry.vote_id_api} ausentes do manifesto SHA`)
    const props = Array.isArray(data.proposicoesAfetadas) ? data.proposicoesAfetadas.map((rawProp) => object(rawProp)?.id).filter((id): id is string | number => typeof id === "string" || typeof id === "number").map(String) : []
    result.set(entry.vote_id_api, { date: data.data.slice(0, 10), propositions: new Set(props) })
  }
  return result
}

function attachVoteIdsToPublicRows(rows: Record<string, unknown>[], catalog: Map<string, { date: string; propositions: Set<string> }>): Record<string, unknown>[] {
  if (catalog.size === 0) return rows
  const dayDistance = (left: string, right: string): number => {
    const a = Date.parse(`${left}T00:00:00Z`)
    const b = Date.parse(`${right}T00:00:00Z`)
    return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) / 86_400_000 : Number.POSITIVE_INFINITY
  }
  return rows.map((row) => {
    const vote = object(row.votacao)
    if (!vote) throw new Error("voto DTO sem metadados da votação")
    const explicit = field(row, ["vote_id_api", "votacao_id_api"]) ?? field(vote, ["vote_id_api", "votacao_id_api"])
    let id = explicit === undefined ? null : String(explicit)
    if (id === null) {
      const date = typeof vote.data_votacao === "string" ? vote.data_votacao.slice(0, 10) : ""
      const proposition = vote.proposicao_id === undefined || vote.proposicao_id === null ? null : String(vote.proposicao_id)
      const matches = [...catalog.entries()].filter(([, metadata]) => proposition === null
        ? metadata.date === date
        : metadata.propositions.has(proposition) && dayDistance(metadata.date, date) <= 1).map(([voteId]) => voteId)
      if (matches.length !== 1) throw new Error(`voto público não mapeia univocamente aos IDs oficiais (${matches.length} correspondências)`)
      id = matches[0]!
    }
    if (!catalog.has(id)) throw new Error(`voto público aponta para ID fora do escopo oficial: ${id}`)
    const metadata = catalog.get(id)!
    const date = typeof vote.data_votacao === "string" ? vote.data_votacao.slice(0, 10) : ""
    const proposition = vote.proposicao_id === undefined || vote.proposicao_id === null ? null : String(vote.proposicao_id)
    const exactEventKey = explicit !== undefined
    if (proposition !== null && !metadata.propositions.has(proposition) && !exactEventKey) throw new Error(`proposição do voto público diverge da votação oficial ${id}`)
    const skewDays = dayDistance(metadata.date, date)
    if (skewDays !== 0 && (skewDays !== 1 || (!exactEventKey && (proposition === null || !metadata.propositions.has(proposition))))) throw new Error(`data do voto público diverge da votação oficial ${id}`)
    return { ...row, vote_id_api: id, ...(skewDays === 1 ? { vote_date_skew_days: 1, official_vote_date: metadata.date, public_vote_date: date } : {}) }
  })
}

function idsFromRoster(value: unknown): string[] {
  // Câmara returns an individual object while Senado commonly wraps the
  // identity in DetalheParlamentar/IdentificacaoParlamentar. Do not choose the
  // largest array: it can be a list of unrelated mandate or contact rows.
  const ids: string[] = []
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) { current.forEach(visit); return }
    const record = object(current)
    if (!record) return
    for (const key of ["id", "codigo", "CodigoParlamentar", "codigoParlamentar", "Codigo", "idParlamentar", "idSenador"]) {
      const raw = record[key]
      if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
        try { ids.push(normalizedId(raw as number | string)) } catch { /* non-numeric object ids are not official IDs */ }
      }
    }
    Object.values(record).forEach(visit)
  }
  visit(value)
  return [...new Set(ids)].sort()
}

function detailFor(input: {
  candidate: ParliamentaryCandidate
  observation: ParliamentarySourceObservation
  dtoCount: number
  dtoSubsetSha256: string
  identityIds: string[]
  sourceSha256: string
  sourceRows: number
  houseSubsetSha256: string
  publicTotalRows: number
  rowAttribution?: Array<{ row_key: string; method: string; field: string; value: string; urls: string[] }>
  declaredTotal: number | null
  rosterSha256: string
  publicPayloadSha256: string
  voteDateSkews?: Array<{ vote_id_api: string; public_date: string; official_date: string; days: 1; proposition_id: unknown }>
  unassignedPublicRows: number
}): string {
  const { candidate, observation, dtoCount, dtoSubsetSha256, identityIds, sourceSha256, sourceRows, declaredTotal, rosterSha256, publicPayloadSha256, houseSubsetSha256, publicTotalRows, rowAttribution, voteDateSkews, unassignedPublicRows } = input
  return JSON.stringify({
    contrato: "parliamentary-family-receipt-v1",
    casa: observation.house,
    official_id: normalizedId(observation.official_id),
    familia: observation.family,
    roster_url: observation.roster.roster_url,
    roster_revision: observation.roster.roster_revision,
    roster_sha256: rosterSha256,
    dto_revision: observation.readback.dto_revision,
    dto_readback_url: observation.readback.dto_readback_url,
    dto_readback_count: dtoCount,
    dto_subset_sha256: dtoSubsetSha256,
    dto_identity_ids: identityIds,
    identidade_verificada_por: "casa+id; nome não participa do join",
    coverage_proof: {
      version: 1,
      family: observation.family,
      method: "official-source-to-public-readback",
      source_revisions: observation.source.source_revisions?.length
        ? observation.source.source_revisions
        : [{ url: observation.source.source_url, sha256: sourceSha256, revision: observation.roster.roster_revision }],
      public_payload_sha256: publicPayloadSha256,
      ...(observation.house === "camara" && observation.family === "votos_candidato" ? { vote_ids_api: observation.source.vote_catalog?.map((entry) => entry.vote_id_api) ?? [] } : {}),
      ...(observation.house === "camara" && observation.family === "votos_candidato" ? { vote_date_skews: voteDateSkews ?? [] } : {}),
      ...(observation.house === "camara" && (observation.family === "projetos_lei" || observation.family === "gastos_parlamentares") ? {
        row_attribution: rowAttribution ?? [],
      } : {}),
      source_rows: sourceRows,
      public_rows: dtoCount,
      unassigned_public_rows: unassignedPublicRows,
      matched_rows: dtoCount,
      unmatched_rows: 0,
      house_partition: {
        casa: observation.house,
        public_rows: dtoCount,
        public_subset_sha256: houseSubsetSha256,
        public_total_rows: publicTotalRows,
        source_rows: sourceRows,
        matched_rows: dtoCount,
        unmatched_rows: 0,
      },
      scope_complete: true,
      scope_evidence: verifySenadoLegislatureScope(observation, normalizedId(observation.official_id)),
      scope_years: observation.years ?? null,
      ...(observation.source.source_kind === "camara-cota-csv" ? {
        year_completeness: observation.year_completeness ?? Object.fromEntries((observation.years ?? []).map((year) => [year, { complete: year < 2026, use_for_absence: year < 2026 }])),
      } : {}),
      declared_total: declaredTotal,
      identity: {
        slug: candidate.slug,
        candidate_id: candidate.candidato_id,
        house: observation.house,
        source_id: normalizedId(observation.official_id),
        official_id: normalizedId(observation.official_id),
        roster_url: observation.roster.roster_url,
        roster_sha256: rosterSha256,
      },
    },
  })
}

/** Primeiro ano com despesa de cota disponível na API oficial de cada casa. */
export const EXPENSE_SOURCE_FIRST_YEAR: Record<"camara" | "senado", number> = { camara: 2008, senado: 2008 }

/** Anos de mandato federal da casa, segundo o histórico publicado da ficha. */
export function mandateYears(profile: Record<string, unknown>, house: "camara" | "senado", currentYear = new Date().getUTCFullYear()): number[] {
  const office = house === "camara" ? "Deputado Federal" : "Senador"
  const years = new Set<number>()
  for (const raw of Array.isArray(profile.historico) ? profile.historico : []) {
    const row = object(raw)
    if (!row || row.tipo_evento === "candidatura") continue
    const cargo = typeof row.cargo_canonico === "string" ? row.cargo_canonico : typeof row.cargo === "string" ? row.cargo : ""
    if (!cargo.startsWith(office.slice(0, 8)) || (house === "camara" && !/federal/i.test(cargo))) continue
    const start = typeof row.periodo_inicio === "number" ? row.periodo_inicio : null
    const end = typeof row.periodo_fim === "number" ? row.periodo_fim : currentYear
    if (start === null) continue
    for (let year = start; year <= Math.min(end, currentYear); year++) years.add(year)
  }
  return [...years].sort((a, b) => a - b)
}

/**
 * Um vazio de gastos só prova ausência quando a consulta cobriu os anos de
 * mandato dentro da janela da fonte. Mandato todo antes da janela não gera
 * vazio (a fonte não tem esses anos), e zero despesa em ano de mandato ativo
 * é implausível para a cota parlamentar: vai para revisão, não para vazio.
 */
export function assertExpenseEmptinessCoversMandates(profile: Record<string, unknown>, observation: ParliamentarySourceObservation): void {
  const house = observation.house
  const mandates = mandateYears(profile, house)
  const inWindow = mandates.filter((year) => year >= EXPENSE_SOURCE_FIRST_YEAR[house])
  if (mandates.length > 0 && inWindow.length === 0) {
    throw new Error(`mandato anterior a ${EXPENSE_SOURCE_FIRST_YEAR[house]}: a fonte de gastos não cobre esses anos, vazio não prova ausência`)
  }
  const queried = new Set(observation.years ?? [])
  const missing = inWindow.filter((year) => !queried.has(year))
  if (missing.length > 0) throw new Error(`anos de mandato não consultados: ${missing.join(",")}`)
  if (inWindow.length > 0) throw new Error(`zero despesa em ano de mandato ativo (${inWindow.join(",")}) exige revisão da identidade ou da fonte`)
}

function makeReceipt(candidate: ParliamentaryCandidate, observation: ParliamentarySourceObservation, executedAt: string, familyObservations: readonly ParliamentarySourceObservation[] = [observation], sourceRowsCache: Map<string, Record<string, unknown>[] | null> = new Map(), projectedReadback?: { profile: Record<string, unknown>; rows: Record<string, unknown>[] }, writerRefreshedProjectKeys: ReadonlySet<string> = new Set()): Omit<ParliamentaryReceipt, "execucao"> {
  const officialId = normalizedId(observation.official_id)
  const sourceIdInUrl = observation.house === "camara" && (observation.source.source_kind === "camara-cota-csv" || observation.family === "votos_candidato") ? false : observation.house === "camara" || observation.family !== "gastos_parlamentares"
  if (!validOfficialUrl(observation.source.source_url, observation.family, officialId, sourceIdInUrl)) throw new Error("source_url oficial inválida para a família")
  if (!validOfficialUrl(observation.roster.roster_url, observation.family, officialId, false)) throw new Error("roster_url oficial inválido")
  const rosterPayload = readRawJson(observation.roster.roster_path)
  const rosterSha256 = sha256Bytes(rosterPayload.bytes)
  const rosterIds = idsFromRoster(rosterPayload.value)
  if (!rosterIds.includes(officialId)) throw new Error(`ID ${officialId} não consta no roster oficial ${observation.roster.roster_url}`)
  const sourcePayload = readRawJson(observation.source.source_path)
  const sourceSha256 = sha256Bytes(sourcePayload.bytes)
  const sourceBundle = object(sourcePayload.value)
  if (!sourceBundle) throw new Error("bundle oficial inválido")
  const capturedRows = reconstructFromRawPages(sourceBundle, observation, officialId)
  const camaraVoteCatalog = observation.house === "camara" && observation.family === "votos_candidato" ? verifyCamaraVoteCatalog(observation) : new Map<string, { date: string; propositions: Set<string> }>()
  const bundleRows = rowsFromPayload(sourcePayload.value, observation.source.rows_path)
  if (canonicalJson(bundleRows) !== canonicalJson(capturedRows)) throw new Error("dados do bundle divergem da reconstrução das páginas brutas")
  const sourceRowsData = writerRows(capturedRows, observation.house, observation.family, officialId)
  const currentSourceCacheKey = `${observation.house}:${officialId}:${observation.family}`
  sourceRowsCache.set(currentSourceCacheKey, sourceRowsData)
  const sourceRowsByHouse = new Map<ParliamentaryHouse, Record<string, unknown>[]>()
  for (const familyObservation of familyObservations) {
    if (familyObservation.family !== observation.family) continue
    const houseId = normalizedId(familyObservation.official_id)
    if (familyObservation === observation || (familyObservation.house === observation.house && houseId === officialId)) {
      sourceRowsByHouse.set(familyObservation.house, sourceRowsData)
      continue
    }
    const cacheKey = `${familyObservation.house}:${houseId}:${familyObservation.family}`
    if (sourceRowsCache.has(cacheKey)) {
      const cached = sourceRowsCache.get(cacheKey)
      if (cached) sourceRowsByHouse.set(familyObservation.house, cached)
      continue
    }
    try {
      const rosterRaw = readRawJson(familyObservation.roster.roster_path)
      if (!idsFromRoster(rosterRaw.value).includes(houseId)) { sourceRowsCache.set(cacheKey, null); continue }
      const bundleRaw = readRawJson(familyObservation.source.source_path)
      const bundle = object(bundleRaw.value)
      if (!bundle || bundle.complete !== true) { sourceRowsCache.set(cacheKey, null); continue }
      const reconstructed = reconstructFromRawPages(bundle, familyObservation, houseId)
      if (canonicalJson(rowsFromPayload(bundleRaw.value, familyObservation.source.rows_path)) !== canonicalJson(reconstructed)) { sourceRowsCache.set(cacheKey, null); continue }
      const root = object(bundleRaw.value)
      if (typeof root?.total !== "number" && typeof root?.total !== "string") { sourceRowsCache.set(cacheKey, null); continue }
      if (Number(root.total) !== reconstructed.length) { sourceRowsCache.set(cacheKey, null); continue }
      const verifiedRows = writerRows(reconstructed, familyObservation.house, familyObservation.family, houseId)
      sourceRowsCache.set(cacheKey, verifiedRows)
      sourceRowsByHouse.set(familyObservation.house, verifiedRows)
    } catch { sourceRowsCache.set(cacheKey, null) /* missing/invalid counterpart cannot disambiguate a row */ }
  }
  const publicHouseForRow = (row: Record<string, unknown>): ParliamentaryHouse | null => {
    const explicit = publicRowHouse(row, observation.family)
    if (explicit) return explicit
    if (observation.family !== "projetos_lei" && observation.family !== "gastos_parlamentares") return null
    const matches = [...sourceRowsByHouse].flatMap(([house, sourceRows]) => sourceRows.some((sourceRow) => {
      try {
        return rowKey(sourceRow, observation.family, house) === rowKey(row, observation.family, house) && sourceMaterialMatchesDto(sourceRow, row, observation.family, house)
      } catch { return false }
    }) ? [house] : [])
    return matches.length === 1 ? matches[0]! : null
  }
  const filteredCamaraFamily = observation.house === "camara" && (observation.family === "projetos_lei" || observation.family === "gastos_parlamentares") && observation.source.source_kind !== "camara-cota-csv"
  const camaraFilterUrls = filteredCamaraFamily && Array.isArray(sourceBundle.derived_from_pages)
    ? (sourceBundle.derived_from_pages as unknown[]).flatMap((entry) => {
      const url = object(entry)?.url
      if (typeof url !== "string") return []
      try {
        const parsed = new URL(url)
        const filtered = observation.family === "projetos_lei"
          ? parsed.pathname === "/api/v2/proposicoes" && parsed.searchParams.get("idDeputadoAutor") === officialId
          : parsed.pathname === `/api/v2/deputados/${officialId}/despesas` && parsed.searchParams.get("idLegislatura") !== null
        return filtered ? [url] : []
      } catch { return [] }
    })
    : []
  const rowAttribution = filteredCamaraFamily && camaraFilterUrls.length > 0
    ? sourceRowsData.map((row) => ({ row_key: rowKey(row, observation.family, observation.house), method: "official-filtered-endpoint", field: observation.family === "projetos_lei" ? "idDeputadoAutor" : "deputado path", value: officialId, urls: camaraFilterUrls }))
    : undefined
  const sourceRows = sourceRowsData.length
  const sourceRoot = object(sourcePayload.value)
  if (sourceRoot?.complete !== true) throw new Error("fonte sem marcador complete=true; paginação não provada")
  const sourceKeys = normalizedKeys(sourceRowsData.map((row) => rowKey(row, observation.family, observation.house)))
  const sourceIdentities = sourceRowsData.map(identityFromRow).filter((id): id is string => id !== null)
  const urlFilteredCamaraRows = filteredCamaraFamily && camaraFilterUrls.length > 0
  if (sourceRows > 0 && sourceIdentities.length !== sourceRows && !urlFilteredCamaraRows) throw new Error("linhas oficiais sem ID parlamentar por linha")
  if (sourceIdentities.some((id) => id !== officialId)) throw new Error("linhas oficiais misturam IDs parlamentares")
  const rawDeclaredTotal = (() => {
    const root = sourceRoot
    for (const key of ["total", "totalCount", "count", "quantidade", "totalRegistros"]) {
      const raw = root?.[key]
      if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) return raw
      if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return Number(raw)
    }
    return null
  })()
  if (rawDeclaredTotal === null) throw new Error("fonte sem total explícito")
  const isSenateCeaps = observation.house === "senado" && observation.family === "gastos_parlamentares"
  if (rawDeclaredTotal !== capturedRows.length) throw new Error(`bundle bruto incompleto: ${capturedRows.length}/${rawDeclaredTotal} linhas`)
  // CEAPS captures transaction rows but the public DTO stores one aggregate per year.
  // The raw bundle total is independently checked above; the proof total is annual rows.
  const writerSubset = isSenateCeaps || (observation.house === "senado" && observation.family === "projetos_lei")
  const declaredTotal = writerSubset ? sourceRows : rawDeclaredTotal
  if (!writerSubset && declaredTotal !== sourceRows) throw new Error(`fonte paginada/incompleta: ${sourceRows}/${declaredTotal} linhas`)
  if (sourceRows === 0 && declaredTotal !== 0) throw new Error("vazio oficial exige total explícito zero")
  const dtoPayload = projectedReadback ? null : readRawJson(observation.readback.dto_path)
  const dtoRows = projectedReadback?.rows ?? rowsFromPayload(dtoPayload?.value, observation.readback.dto_rows_path)
  const profilePayload = projectedReadback ? null : readRawJson(observation.readback.profile_path)
  const envelope = projectedReadback?.profile ?? object(profilePayload?.value)
  const publicProfile = object(envelope?.data) ?? envelope
  if (!publicProfile || publicProfile.slug !== candidate.slug || publicProfile.id !== candidate.candidato_id) {
    throw new Error("perfil público do readback diverge de slug/candidato_id")
  }
  const publicDtoHouses = dtoRows.map(publicHouseForRow)
  const otherHouse: ParliamentaryHouse = observation.house === "camara" ? "senado" : "camara"
  const unresolvedHouseRows = publicDtoHouses.filter((house) => house === null).length
  if (unresolvedHouseRows > 0 && (candidate.ids[otherHouse] == null || !sourceRowsByHouse.has(otherHouse))) {
    throw new Error("DTO público contém linha sem Casa e sem proveniência verificada de outra Casa")
  }
  const rawHouseDtoRows = dtoRows.filter((row) => publicHouseForRow(row) === observation.house)
  const houseDtoRows = observation.house === "camara" && observation.family === "votos_candidato"
    ? attachVoteIdsToPublicRows(rawHouseDtoRows, camaraVoteCatalog)
    : rawHouseDtoRows
  const publicTotalRows = publicTotalForHouse(publicProfile, observation.family, observation.house, houseDtoRows.length)
  if (sourceRows !== publicTotalRows) throw new Error(`total completo da fonte/${observation.house} diverge do total público (${sourceRows}/${publicTotalRows})`)
  const dtoKeys = normalizedKeys(houseDtoRows.map((row) => rowKey(row, observation.family, observation.house)))
  // Public DTO rows often omit the upstream parliament ID. When an ID is
  // present, it must match the target; absence is handled by the profile
  // identity and does not turn a valid readback into an error.
  const dtoIdentities = houseDtoRows.map(identityFromRow)
  const dtoIdentityIds = sortedIds(dtoIdentities.filter((id): id is string => id !== null))
  if (dtoIdentityIds.some((id) => id !== officialId)) {
    throw new Error(`readback DTO devolveu ID fora do alvo ${candidate.slug}/${observation.family}`)
  }
  if (houseDtoRows.length > 0 && dtoIdentityIds.length > 1) throw new Error(`DTO sem identidade única para ${candidate.slug}/${observation.family}/${observation.house}`)
  const sourceKeySet = new Set(sourceKeys)
  const unmatched = dtoKeys.filter((key) => !sourceKeySet.has(key))
  if (unmatched.length > 0) throw new Error(`DTO contém chaves ausentes na fonte oficial: ${unmatched.slice(0, 3).join(",")}`)
  if (observation.family !== "projetos_lei" && dtoKeys.length !== sourceKeys.length) {
    throw new Error(`DTO truncado na partição ${observation.house}: ${dtoKeys.length}/${sourceKeys.length} linhas; declared_total=${declaredTotal ?? "?"}`)
  }
  const sourceByKey = rowsByNormalizedKey(sourceRowsData, observation.family, observation.house)
  const dtoRowsByKey = rowsByNormalizedKey(houseDtoRows, observation.family, observation.house)
  const dtoByKey = new Map([...dtoRowsByKey].map(([key, row]) => [key, materialRow(row, observation.family, observation.house)]))
  for (const key of dtoKeys) {
    const sourceRow = sourceByKey.get(key)
    const dtoRow = dtoRowsByKey.get(key)
    const matches = sourceRow && dtoRow && (observation.family === "projetos_lei"
      ? sourceMaterialMatchesDto(sourceRow, dtoRow, observation.family, observation.house)
      : canonicalJson(materialRow(sourceRow, observation.family, observation.house)) === canonicalJson(dtoByKey.get(key)))
    if (!matches && !(observation.family === "projetos_lei" && writerRefreshedProjectKeys.has(key))) {
      throw new Error(`conteúdo material da linha diverge entre fonte e DTO: ${key}`)
    }
  }
  const field = observation.family === "projetos_lei" ? "projetos_lei" : observation.family === "votos_candidato" ? "votos" : "gastos_parlamentares"
  const publicRows = publicProfile[field]
  if (!Array.isArray(publicRows) || canonicalJson(publicRows) !== canonicalJson(dtoRows)) {
    throw new Error("linhas do DTO não conferem com o perfil público integral")
  }
  const publicPayloadSha256 = publicFamilyPayloadSha256(publicProfile, observation.family)
  const dtoSubsetSha256 = sha256(canonicalJson(houseDtoRows))
  const houseSubsetSha256 = dtoSubsetSha256
  const dtoCount = houseDtoRows.length
  if (dtoCount === 0 && observation.family === "gastos_parlamentares") {
    if (observation.source.source_kind === "camara-cota-csv") {
      if (mandateYears(publicProfile, "camara").includes(2026)) throw new Error("Cota 2026 parcial não prova ausência durante mandato em 2026")
    } else assertExpenseEmptinessCoversMandates(publicProfile, observation)
  }
  const resultado: ReceiptResult = dtoCount > 0 ? "encontrado" : "vazio_confirmado"
  return {
    fonte: sourceName(observation.house, observation.family),
    escopo: "candidato",
    alvo: candidate.slug,
    candidato_id: candidate.candidato_id,
    resultado,
    volume: dtoCount,
    familia: observation.family,
    url: observation.source.source_url,
    executado_em: executedAt,
    detalhe: detailFor({ candidate, observation, dtoCount, dtoSubsetSha256, identityIds: dtoIdentityIds, sourceSha256, sourceRows, declaredTotal, rosterSha256, publicPayloadSha256, houseSubsetSha256, publicTotalRows, rowAttribution, unassignedPublicRows: unresolvedHouseRows, voteDateSkews: houseDtoRows.flatMap((row) => Number(row.vote_date_skew_days) === 1 ? [{ vote_id_api: String(row.vote_id_api), public_date: String(row.public_vote_date), official_date: String(row.official_vote_date), days: 1 as const, proposition_id: object(row.votacao)?.proposicao_id ?? null }] : []) }),
  }
}

/**
 * Simulates the values the audited writers place in the public families. The
 * original DTO is never changed. A projection is accepted only if the same
 * source/readback contract accepts the simulated post-write profile.
 */
export function projectParliamentaryFamilyApply(
  candidates: readonly ParliamentaryCandidate[],
  observations: readonly ParliamentarySourceObservation[],
  current: ParliamentaryReceiptRun,
  databaseReadback?: ParliamentaryDatabaseReadback,
): ParliamentaryApplyProjection[] {
  const closed = new Set(current.receipts.filter((receipt) => {
    if (receipt.fonte !== "camara-votacoes") return true
    try {
      const detail = object(JSON.parse(receipt.detalhe))
      const proof = object(detail?.coverage_proof)
      const skews = proof?.vote_date_skews
      return Array.isArray(skews) && skews.every((item) => {
        const skew = object(item)
        return !!skew && /^\d+-\d+$/.test(String(skew.vote_id_api ?? "")) &&
          typeof skew.public_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(skew.public_date) &&
          typeof skew.official_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(skew.official_date) &&
          skew.days === 1 && (typeof skew.proposition_id === "string" || typeof skew.proposition_id === "number")
      }) && skews.length === 0
    } catch { return false }
  }).map((receipt) => `${receipt.alvo}|${receipt.fonte}`))
  const byKey = new Map(observations.map((item) => [`${item.house}:${normalizedId(item.official_id)}:${item.family}`, item]))
  const completePeerRows = new Map<string, Record<string, unknown>[] | null>()
  const getCompletePeerRows = (item: ParliamentarySourceObservation): Record<string, unknown>[] => {
    const key = `${item.house}:${normalizedId(item.official_id)}:${item.family}`
    if (!completePeerRows.has(key)) {
      try { completePeerRows.set(key, verifiedWriterRows(item)) }
      catch { completePeerRows.set(key, null) }
    }
    const rows = completePeerRows.get(key)
    if (!rows) throw new Error(`captura peer incompleta: ${key}`)
    return rows
  }
  const projections: ParliamentaryApplyProjection[] = []
  for (const candidate of candidates) for (const house of ["camara", "senado"] as const) {
    const candidateId = candidate.ids[house]
    if (candidateId == null || String(candidateId).trim() === "") continue
    for (const family of PARLIAMENTARY_FAMILIES) {
      const fonte = sourceName(house, family)
      const base = { fonte, alvo: candidate.slug, ...(databaseReadback?.artifact_sha256 ? { database_readback_sha256: databaseReadback.artifact_sha256 } : {}) }
      const observation = byKey.get(`${house}:${normalizedId(candidateId)}:${family}`)
      if (!observation) {
        projections.push({ ...base, estado: "unresolved", resultado_projetado: null, source_rows: null, projected_public_rows: null, source_url: null, source_sha256: null, motivo: "captura oficial atribuída ausente" })
        continue
      }
      const sourceBytes = readFileSync(observation.source.source_path)
      const evidence = { source_url: observation.source.source_url, source_sha256: sha256Bytes(sourceBytes) }
      if (closed.has(`${candidate.slug}|${fonte}`)) {
        projections.push({ ...base, ...evidence, estado: "closed_now", resultado_projetado: current.receipts.find((receipt) => receipt.alvo === candidate.slug && receipt.fonte === fonte)!.resultado as "encontrado" | "vazio_confirmado", source_rows: null, projected_public_rows: null, motivo: "readback observado já fecha" })
        continue
      }
      let sourceRows: number | null = null
      try {
        const officialId = normalizedId(candidateId)
        const dbCandidate = databaseReadback?.candidates.find((item) => item.candidate_id === candidate.candidato_id && item.slug === candidate.slug)
        if (databaseReadback && !dbCandidate) throw new Error("candidato ausente no readback DB validado")
        const roster = readRawJson(observation.roster.roster_path)
        if (!idsFromRoster(roster.value).includes(officialId)) throw new Error("ID ausente no roster oficial")
        const bundle = object(JSON.parse(sourceBytes.toString("utf8")))
        if (!bundle || bundle.complete !== true) throw new Error("captura oficial incompleta")
        const captured = reconstructFromRawPages(bundle, observation, officialId)
        if (canonicalJson(rowsFromPayload(bundle, observation.source.rows_path)) !== canonicalJson(captured) || Number(bundle.total) !== captured.length) throw new Error("páginas brutas não fecham total da captura")
        const rows = writerRows(captured, house, family, officialId)
        sourceRows = rows.length
        const profilePayload = readRawJson(observation.readback.profile_path)
        const envelope = object(profilePayload.value)
        const profile = object(envelope?.data) ?? envelope
        if (!profile || profile.slug !== candidate.slug || profile.id !== candidate.candidato_id) throw new Error("identidade do snapshot público diverge")
        const dto = rowsFromPayload(readRawJson(observation.readback.dto_path).value, observation.readback.dto_rows_path)
        const databaseRows = dbCandidate ? family === "projetos_lei" ? dbCandidate.projetos_lei : family === "gastos_parlamentares" ? dbCandidate.gastos_parlamentares : dbCandidate.votos_candidato : []
        const dbRowsByDto = databaseReadback && dbCandidate
          ? mapCompactPublicRows(dto, databaseRows, family === "projetos_lei" ? "pl" : family === "gastos_parlamentares" ? "gasto" : "voto", candidate.candidato_id)
          : new Map<Record<string, unknown>, Record<string, unknown>>()
        const dbEventsById = new Map((dbCandidate?.votacoes_chave ?? []).map((event) => [String(event.id), event]))
        const dbEventsByApiId = new Map<string, Record<string, unknown>[]>()
        for (const event of dbCandidate?.votacoes_chave ?? []) {
          const apiId = String(event.votacao_id_api ?? "").trim()
          if (apiId) dbEventsByApiId.set(apiId, [...(dbEventsByApiId.get(apiId) ?? []), event])
        }
        const voteCatalog = house === "camara" && family === "votos_candidato" ? verifyCamaraVoteCatalog(observation) : null
        const otherHouse = house === "camara" ? "senado" : "camara"
        const kept: Record<string, unknown>[] = []
        for (const row of dto) {
          const dbRow = dbRowsByDto.get(row)
          const dbEvent = family === "votos_candidato" && dbRow ? dbEventsById.get(String(dbRow.votacao_id ?? "")) : undefined
          let rowHouse = publicRowHouse(row, family)
          if (rowHouse === null && dbRow) rowHouse = family === "votos_candidato"
            ? publicRowHouse({ votacao: dbEvent }, family)
            : databaseRowHouse(dbRow, family, candidate)
          if (family === "votos_candidato" && dbRow && dbCandidate) {
            if (!dbEvent) throw new Error(`voto DB ${dbRow.id} sem votacoes_chave integral no readback`)
            const publicVoteId = String(row.id ?? "")
            const indexMatch = /^voto-(\d+)-[a-z0-9]+$/.exec(publicVoteId)
            const publicVoting = object(row.votacao)
            const eventId = String(dbEvent.id ?? "")
            if (!indexMatch || !publicVoting || publicVoting.id !== `votacao-${indexMatch[1]}-${compactPublicHash(eventId)}`) throw new Error(`voto DTO ${publicVoteId} não mapeia univocamente ao evento DB ${eventId}`)
            if (String(row.votacao_id ?? "") !== eventId) throw new Error(`voto DTO ${publicVoteId} votacao_id diverge do evento DB`)
          }
          if (rowHouse === null && family === "projetos_lei") {
            const matchesByHouse = new Map<ParliamentaryHouse, Record<string, unknown>[]>()
            for (const peerHouse of ["camara", "senado"] as const) {
              const peerId = candidate.ids[peerHouse]
              if (peerId == null) continue
              const peer = observations.find((item) => item.house === peerHouse && item.family === family && normalizedId(item.official_id) === normalizedId(peerId))
              if (!peer) continue
              try {
                const peerRows = peer === observation ? rows : getCompletePeerRows(peer)
                const legacyId = String(dbRow?.proposicao_id_api ?? "").trim()
                const matched = peerRows.filter((official) => {
                  const officialMaterial = object(official.Materia) ?? official
                  const officialId = String(field(officialMaterial, ["Codigo", "CodigoMateria", "idProposicao", "proposicao_id_api", "id"]) ?? "").trim()
                  return (legacyId !== "" && legacyId === officialId) || sourceProjectIdentityMatchesDto(official, row)
                })
                if (matched.length > 0) matchesByHouse.set(peerHouse, matched)
              } catch { /* incomplete peer source cannot attribute a public row */ }
            }
            const matchingHouses = [...matchesByHouse.keys()]
            if (matchingHouses.length === 1) rowHouse = matchingHouses[0]!
            else if (matchingHouses.length > 1) throw new Error(`linha pública de proposição ambígua entre as Casas: ${row.id ?? "sem id"}`)
            else if (candidate.ids[otherHouse] != null) throw new Error(`linha pública sem Casa e sem correspondência legal em fontes completas: ${row.id ?? "sem id"}`)
            else throw new Error(`linha pública sem Casa/proveniência: ${row.id ?? "sem id"}`)
          }
          if (rowHouse === otherHouse) { kept.push(row); continue }
          if (family === "gastos_parlamentares" && dbRow) {
            const year = Number(dbRow.ano ?? row.ano)
            const officialYear = rows.find((official) => Number(materialRow(official, family, house).year) === year)
            const storedAmount = Number(dbRow.total_gasto ?? row.total_gasto)
            const officialAmount = officialYear ? Number(materialRow(officialYear, family, house).amount) : null
            const exactTotal = officialAmount !== null && Number.isFinite(storedAmount) && Math.round(storedAmount * 100) === Math.round(officialAmount * 100)
              const sourceName = stripAccents(String(dbRow.fonte ?? "")).trim().toLocaleLowerCase("pt-BR")
              const cotaFull = year <= 2025 && observation.year_completeness?.[year]?.use_for_absence !== false && house === "camara" && observation.source.source_kind === "camara-cota-csv" && observation.years?.length === 19 && observation.years.every((value, index) => value === 2008 + index) && observation.source.source_revisions?.length === 19 && observation.source.source_revisions.every((revision, index) => revision.year === 2008 + index && validSha(revision.sha256))
            if (house === "camara" && observation.source.source_kind === "camara-cota-csv") {
              const canonicalCamara = sourceName === "camara"
              if (canonicalCamara) {
                if (!officialYear) throw new Error(`linha Câmara canônica de gastos sem ano na Cota: ${rowKey(row, family, house)}`)
                continue
              }
              const explicitCamaraApi = candidate.ids.camara != null && sourceName === `https://dadosabertos.camara.leg.br/api/v2/deputados/${normalizedId(candidate.ids.camara)}/despesas`
              const recognizedLegacy = sourceName === "camara ceap csv" || explicitCamaraApi
              if (recognizedLegacy && exactTotal) continue
              if (recognizedLegacy && cotaFull) continue
              throw new Error(`linha legada Cota sem total exato/escopo de despublicação seguro: ${rowKey(row, family, house)}`)
            }
            if (house === "senado" && (sourceName === "senado" || sourceName === "ceaps/senado" || sourceName === "senado ceaps")) {
              if (officialYear && (sourceName === "senado" || exactTotal)) continue
              const ceapsRevision = observation.source.source_revisions?.find((revision) => revision.year === year)
              const scope = object(observation.source.scope_evidence)
              const scopeYears = Array.isArray(scope?.scope_years) ? scope.scope_years : []
              const rosterProof = Array.isArray(scope?.rosters) ? scope.rosters.map(object).find((roster) => Array.isArray(roster?.years) && roster.years.includes(year)) : undefined
              const absenceComplete = !officialYear && scopeYears.includes(year) && !!ceapsRevision && validSha(ceapsRevision.sha256) && !!rosterProof && rosterProof.membership === true && rosterProof.failure == null && validSha(String(rosterProof.sha256 ?? ""))
              if (absenceComplete) continue
              throw new Error(`linha CEAPS legada sem total anual/escopo seguro: ${rowKey(row, family, house)}`)
            }
          }
          if (rowHouse === house && family === "projetos_lei" && rows.some((official) => {
            const sourceMaterial = object(official.Materia) ?? official
            const sourceId = String(field(sourceMaterial, ["Codigo", "CodigoMateria", "idProposicao", "proposicao_id_api", "id"]) ?? "").trim()
            return (dbRow?.proposicao_id_api != null && sourceId === String(dbRow.proposicao_id_api)) || sourceProjectIdentityMatchesDto(official, row)
          })) {
            if (house === "senado" && dbRow?.fonte == null && candidate.ids.camara != null) throw new Error(`writer Senado não reconcilia legacy sem fonte quando há ID Câmara concorrente: ${rowKey(row, family, house)}`)
            continue
          }
          if (rowHouse === null) {
            // A writer upsert does not remove or identify a pre-existing row
            // without Casa. Such rows require row-level review before apply.
            throw new Error(`linha pública sem Casa/proveniência: ${rowKey(row, family, house)}`)
          }
          const voteSourceMatch = family === "votos_candidato" && rowHouse === house && dbEvent && voteCatalog
            ? rows.some((official) => rowKey(official, family, house) === `vote:${String(dbEvent.votacao_id_api ?? "").trim()}`)
            : false
          if (rowHouse === house && !voteSourceMatch && !rows.some((official) => {
            try {
              const comparable = voteCatalog ? attachVoteIdsToPublicRows([row], voteCatalog)[0]! : row
              return rowKey(official, family, house) === rowKey(comparable, family, house)
            } catch { return false }
          })) throw new Error(`linha pública fora da fonte filtrada; revisar despublicação: ${rowKey(row, family, house)}`)
        }
        const written = rows.map((row) => {
          if (family === "projetos_lei") {
            const material = object(row.Materia) ?? row
            const status = object(material.statusProposicao)?.descricaoSituacao ?? field(material, ["situacao", "DescricaoSituacao", "Situacao"])
            return { casa: house, tipo: field(material, ["siglaTipo", "Sigla", "tipo"]), numero: String(field(material, ["numero", "Numero"]) ?? ""), ano: Number(field(material, ["ano", "Ano"])), ementa: field(material, ["ementa", "Ementa", "EmentaMateria"]) ?? "", situacao: house === "camara" ? status ?? null : null }
          }
          if (family === "gastos_parlamentares") {
            const aggregate = materialRow(row, family, house)
            return { casa: house, ano: Number(aggregate.year), total_gasto: Number(aggregate.amount), detalhamento: house === "camara" ? (row.categorias ?? []) : [] }
          }
          if (house === "camara") {
            const voteId = String(field(row, ["vote_id_api", "votacao_id_api"]) ?? "")
            const event = voteCatalog?.get(voteId)
            if (!event) throw new Error(`catálogo oficial sem data para votação ${voteId}`)
            if (!databaseReadback) {
              const existing = dto.find((item) => {
                try { return rowKey(attachVoteIdsToPublicRows([item], voteCatalog!)[0]!, family, house) === `vote:${voteId}` }
                catch { return false }
              })
              if (!existing) throw new Error(`votação oficial ${voteId} não tem linha pública preexistente endereçável`)
              const prior = object(existing.votacao)
              if (!prior) throw new Error(`votação pública ${voteId} sem payload de data`)
              return { ...existing, casa: house, voto: field(row, ["tipoVoto", "voto", "Voto"]), votacao: { ...prior, casa: house, votacao_id_api: voteId, data_votacao: event.date } }
            }
            const eventMatches = dbEventsByApiId.get(voteId) ?? []
            if (eventMatches.length !== 1) throw new Error(`votacoes_chave não contém exatamente uma linha para evento oficial ${voteId}`)
            const dbEvent = eventMatches[0]!
            if (!candidate.ids.camara || stripAccents(String(dbEvent.casa ?? "")).toLocaleLowerCase("pt-BR") !== "camara" || String(dbEvent.fonte ?? "") !== "camara") {
              if (dbEvent.casa !== null && dbEvent.casa !== "Câmara" && dbEvent.casa !== "Camara") throw new Error(`chave de votação ${voteId} atribuída a outra Casa`)
            }
            const existingDb = dbCandidate?.votos_candidato.filter((candidateVote) => String(candidateVote.votacao_id) === String(dbEvent.id)) ?? []
            if (existingDb.length > 1) throw new Error(`votos_candidato tem duplicidade para evento ${voteId}`)
            const existing = existingDb.length === 1
              ? [...dbRowsByDto.entries()].find(([, raw]) => raw.id === existingDb[0]!.id)?.[0]
              : undefined
            if (existingDb.length === 1 && !existing) throw new Error(`voto DB ${existingDb[0]!.id} não tem mapeamento DTO compacto único`)
            const prior = object(existing?.votacao)
            const vote = field(row, ["tipoVoto", "voto", "Voto"])
            const officialPropositions = event?.propositions ?? new Set<string>()
            const projectedPropositionId = officialPropositions.size === 1
              ? [...officialPropositions][0]
              : dbEvent.proposicao_id ?? null
            return {
              ...(existing ?? {}),
              id: existing?.id ?? `voto-projetado-${candidate.slug}-${voteId}`,
              votacao_id: dbEvent.id,
              voto: vote,
              contradicao: existing?.contradicao ?? false,
              contradicao_descricao: existing?.contradicao_descricao ?? null,
              votacao: {
                ...(prior ?? {}), id: prior?.id ?? `votacao-projetada-${voteId}`,
                titulo: dbEvent.titulo, descricao: dbEvent.descricao, data_votacao: event.date,
                casa: "Câmara", votacao_id_api: voteId, tema: dbEvent.tema,
                impacto_popular: dbEvent.impacto_popular, proposicao_id: projectedPropositionId,
              },
            }
          }
          return { ...row, casa: house, voto: field(row, ["voto", "Voto", "SiglaDescricaoVoto", "tipoVoto"]), votacao: { casa: house, proposicao_id: field(object(row.Materia) ?? {}, ["Codigo"]), data_votacao: field(object(row.SessaoPlenaria) ?? {}, ["DataSessao"]) } }
        })
        // The public projects endpoint exposes a global 25-row preview, while
        // the exact house counts are separate DB counts. Rebuild both houses'
        // candidate display rows from their complete official writer inputs.
        let projectedRows = [...kept, ...written]
        if (family === "projetos_lei") {
          const peerObservation = observations.find((item) => item.house === otherHouse && item.family === family && candidate.ids[otherHouse] != null && normalizedId(candidate.ids[otherHouse] as number | string) === normalizedId(item.official_id))
          const peerRows = peerObservation ? getCompletePeerRows(peerObservation) : []
          const peerDisplay = peerRows.map((row) => {
            const material = object(row.Materia) ?? row
            const status = object(material.statusProposicao)?.descricaoSituacao ?? field(material, ["situacao", "DescricaoSituacao", "Situacao"])
            return { casa: otherHouse, tipo: field(material, ["siglaTipo", "Sigla", "tipo"]), numero: String(field(material, ["numero", "Numero"]) ?? ""), ano: Number(field(material, ["ano", "Ano"])), ementa: field(material, ["ementa", "Ementa", "EmentaMateria"]) ?? "", situacao: otherHouse === "camara" ? status ?? null : null }
          })
          projectedRows = [...peerDisplay, ...written].sort((a, b) => Number(b.ano) - Number(a.ano) || String(b.numero).localeCompare(String(a.numero))).slice(0, 25)
        }
        const fieldName = family === "votos_candidato" ? "votos" : family
        const projectedProfile = { ...profile, [fieldName]: projectedRows }
        if (family === "projetos_lei") {
          const peerObservation = observations.find((item) => item.house === otherHouse && item.family === family && candidate.ids[otherHouse] != null && normalizedId(candidate.ids[otherHouse] as number | string) === normalizedId(item.official_id))
          let otherCount: number | null = null
          if (peerObservation) otherCount = getCompletePeerRows(peerObservation).length
          else if (candidate.ids[otherHouse] != null) throw new Error("captura oficial completa da outra Casa ausente para projetar contagem e prévia")
          else otherCount = 0
          projectedProfile[house === "camara" ? "projetos_lei_camara_total" : "projetos_lei_senado_total"] = written.length
          projectedProfile[otherHouse === "camara" ? "projetos_lei_camara_total" : "projetos_lei_senado_total"] = otherCount
          projectedProfile.projetos_lei_total = written.length + otherCount
        }
        const peers = observations.filter((item) => item.family === family && candidate.ids[item.house] != null && normalizedId(candidate.ids[item.house] as number | string) === normalizedId(item.official_id))
        const writerRefreshedProjectKeys = new Set<string>()
        if (family === "projetos_lei" && dbRowsByDto.size > 0) {
          const officialKeyById = new Map<string, string>()
          const officialOccurrences = new Map<string, number>()
          for (const official of rows) {
            const baseKey = rowKey(official, family, house)
            const occurrence = officialOccurrences.get(baseKey) ?? 0
            officialOccurrences.set(baseKey, occurrence + 1)
            const key = occurrence === 0 ? baseKey : `${baseKey}#${occurrence + 1}`
            const id = String(field(object(official.Materia) ?? official, ["Codigo", "CodigoMateria", "idProposicao", "proposicao_id_api", "id"]) ?? "").trim()
            if (id) officialKeyById.set(id, key)
          }
          for (const dbRow of databaseRows) {
            const officialKey = officialKeyById.get(String(dbRow.proposicao_id_api ?? "").trim())
            if (!officialKey) continue
            const dbHouse = databaseRowHouse(dbRow, family, candidate)
            let sourceNullCanReconcile = dbRow.fonte == null && candidate.ids.camara == null && house === "senado"
            if (dbRow.fonte == null && house === "camara" && candidate.ids.senado == null) sourceNullCanReconcile = true
            if (dbRow.fonte == null && house === "camara" && candidate.ids.senado != null) {
              const peer = observations.find((item) => item.house === "senado" && item.family === "projetos_lei" && normalizedId(item.official_id) === normalizedId(candidate.ids.senado as number | string))
              try {
                const peerRows = peer ? getCompletePeerRows(peer) : null
                const legacyId = String(dbRow.proposicao_id_api ?? "").trim()
                const peerContainsId = peerRows?.some((item) => String(field(object(item.Materia) ?? item, ["Codigo", "CodigoMateria", "idProposicao", "proposicao_id_api", "id"]) ?? "").trim() === legacyId)
                sourceNullCanReconcile = Boolean(peerRows && !peerContainsId)
              } catch { sourceNullCanReconcile = false }
            }
            if (dbHouse === house || sourceNullCanReconcile) writerRefreshedProjectKeys.add(officialKey)
          }
        }
        const proof = makeReceipt(candidate, observation, current.generated_at, peers, new Map(), { profile: projectedProfile, rows: projectedRows }, writerRefreshedProjectKeys)
        projections.push({ ...base, ...evidence, estado: "safe_write", resultado_projetado: proof.resultado as "encontrado" | "vazio_confirmado", source_rows: sourceRows, projected_public_rows: projectedRows.length, motivo: "escrita auditada simulada e readback pós-escrita reconciliado" })
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        const review = /sem Casa|despublicação|identidade|ID ausente|misturam IDs|sem tupla legal/i.test(reason)
        projections.push({ ...base, ...evidence, estado: review ? "review" : "unresolved", resultado_projetado: null, source_rows: sourceRows, projected_public_rows: null, motivo: reason })
      }
    }
  }
  return projections
}

/**
 * Constrói recibos sem fazer join nominal e sem converter ID ausente em vazio.
 * A ausência de observação para um ID existente é erro de prova, não sucesso.
 */
export function collectParliamentaryFamilyReceipts(
  candidates: readonly ParliamentaryCandidate[],
  observations: readonly ParliamentarySourceObservation[],
  generatedAt = new Date().toISOString(),
): ParliamentaryReceiptRun {
  const runId = `capture:${randomUUID()}`
  const receipts: ParliamentaryReceipt[] = []
  const unresolved_without_id: ParliamentaryReceiptRun["unresolved_without_id"] = []
  const errors: string[] = []
  const failures: ParliamentaryFailure[] = []
  const sourceRowsCache = new Map<string, Record<string, unknown>[] | null>()
  const byKey = new Map(observations.map((item) => [`${item.house}:${normalizedId(item.official_id)}:${item.family}`, item]))

  for (const candidate of candidates) {
    for (const family of PARLIAMENTARY_FAMILIES) {
      const houses: ParliamentaryHouse[] = []
      if (candidate.ids.camara != null && String(candidate.ids.camara).trim() !== "") houses.push("camara")
      if (candidate.ids.senado != null && String(candidate.ids.senado).trim() !== "") houses.push("senado")
      if (houses.length === 0) {
        unresolved_without_id.push({ slug: candidate.slug, familia: family, motivo: "ID oficial da Câmara/Senado ausente; nenhum join por nome" })
        continue
      }
      for (const house of houses) {
        const id = normalizedId(candidate.ids[house] as number | string)
        const observation = byKey.get(`${house}:${id}:${family}`)
        const base = { slug: candidate.slug, candidato_id: candidate.candidato_id, familia: family, house, official_id: id }
        if (!observation) {
          errors.push(`${candidate.slug}/${family}/${house}/${id}: readback oficial ausente`)
          failures.push({ ...base, tipo: "fonte", motivo: "readback oficial ausente" })
          continue
        }
        try {
          const familyObservations = observations.filter((item) => item.family === family && candidate.ids[item.house] != null && String(candidate.ids[item.house]).trim() !== "" && normalizedId(item.official_id) === normalizedId(candidate.ids[item.house] as number | string))
          receipts.push({ ...makeReceipt(candidate, observation, generatedAt, familyObservations, sourceRowsCache), execucao: runId })
        } catch (error) {
          const motivo = error instanceof Error ? error.message : String(error)
          errors.push(`${candidate.slug}/${family}/${house}/${id}: ${motivo}`)
          failures.push({ ...base, tipo: "prova", motivo, ...failureSourceEvidence(observation) })
        }
      }
    }
  }
  return { generated_at: generatedAt, run_id: runId, receipts, unresolved_without_id, errors, failures }
}

/** Falha de rede, HTTP ou bloqueio: a casa não respondeu. Outro motivo é lacuna de prova. */
export function isSourceOutage(reason: string): boolean {
  return /HTTP\s*\d{3}|fetch failed|timeout|timed out|ETIMEDOUT|ECONN|ENOTFOUND|EAI_AGAIN|aborted|socket|network|bloque/i.test(reason)
}

/**
 * Recibo aberto e honesto para cada falha: casa que não respondeu vira `erro`;
 * observação que chegou e não fechou a prova vira `indeterminado`. Nunca vira
 * vazio: nenhuma falha é lida como ausência de dado.
 */
export function openParliamentaryReceipts(
  failures: readonly ParliamentaryFailure[],
  pending: readonly ParliamentaryPending[],
  generatedAt: string,
  runId = `capture:${randomUUID()}`,
): ParliamentaryReceipt[] {
  const receipts: ParliamentaryReceipt[] = []
  const seen = new Set<string>()
  for (const failure of failures) {
    const fonte = sourceName(failure.house, failure.familia)
    const key = `${failure.slug}|${fonte}`
    if (seen.has(key)) continue
    seen.add(key)
    const pendencia = pending.find((item) => item.house === failure.house && item.family === failure.familia && String(item.official_id ?? "") === failure.official_id)
    const motivo = pendencia?.reason ?? failure.motivo
    const resultado = failure.tipo === "fonte" && (!pendencia || isSourceOutage(pendencia.reason)) ? "erro" : "indeterminado"
    const sourceUrl = pendencia?.source && /^https:\/\//.test(pendencia.source)
      ? pendencia.source.replace(/\{ano\}/g, "2008")
      : failure.source_url ?? officialPendingUrl(failure)
    receipts.push({
      fonte, escopo: "candidato", alvo: failure.slug, candidato_id: failure.candidato_id, execucao: runId,
      resultado, volume: 0, familia: failure.familia,
      url: sourceUrl ?? "",
      executado_em: generatedAt,
      detalhe: JSON.stringify({ contract_version: 1, kind: "parlamentar-falha", family: failure.familia, house: failure.house, official_id: failure.official_id, tipo: failure.tipo, motivo: motivo.slice(0, 300), source_url: sourceUrl, source_url_template: pendencia?.source?.includes("{ano}") ? pendencia.source : null, source_url_role: pendencia?.source?.includes("{ano}") ? "year-2008-reference-only" : "evidence", source_sha256: failure.source_sha256 ?? null, source_sha256_basis: failure.source_sha256_basis ?? "unavailable" }),
    })
  }
  return receipts
}

/** Leitura opcional de um pacote JSON local; não consulta rede. */
export function loadLocalParliamentaryReceiptInputs(path: string): {
  candidates: ParliamentaryCandidate[]
  observations: ParliamentarySourceObservation[]
  pending: ParliamentaryPending[]
} {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { candidates?: ParliamentaryCandidate[]; observations?: ParliamentarySourceObservation[]; pending?: ParliamentaryPending[] }
  if (!Array.isArray(parsed.candidates) || !Array.isArray(parsed.observations)) throw new Error("pacote local precisa de candidates e observations")
  return { candidates: parsed.candidates, observations: parsed.observations, pending: Array.isArray(parsed.pending) ? parsed.pending : [] }
}

function cliArgument(name: string): string | null {
  const prefix = `--${name}=`
  const value = process.argv.slice(2).find((argument) => argument.startsWith(prefix))
  return value ? value.slice(prefix.length) : null
}

function cliInputArtifact(name: string): { value: ParliamentaryDatabaseReadback; sha256: string } | null {
  const inputPath = cliArgument(name)
  if (!inputPath) return null
  const bytes = readFileSync(resolve(inputPath))
  const expectedSha = cliArgument(`${name}-sha256`)
  if (!expectedSha) throw new Error(`--${name}-sha256 é obrigatório com --${name}`)
  return { value: validateParliamentaryDatabaseReadback(bytes, expectedSha), sha256: expectedSha }
}

function writePrivateAtomic(path: string, value: unknown): void {
  const absolute = resolve(path)
  const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
  if (absolute === moduleRoot || absolute.startsWith(`${moduleRoot}/`)) throw new Error("--out precisa estar fora do repositório")
  mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 })
  const temporary = `${absolute}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" })
  chmodSync(temporary, 0o600)
  renameSync(temporary, absolute)
  chmodSync(absolute, 0o600)
}

async function runCli(): Promise<void> {
  const input = cliArgument("input")
  const output = cliArgument("out")
  if (!input || !output) throw new Error("uso: --input=<manifest.json> --out=<arquivo-privado.json>")
  const { candidates, observations, pending } = loadLocalParliamentaryReceiptInputs(resolve(input))
  const result = collectParliamentaryFamilyReceipts(candidates, observations)
  if (process.argv.includes("--apply-projection")) {
    const dbReadback = cliInputArtifact("db-readback")?.value
    result.apply_projection = projectParliamentaryFamilyApply(candidates, observations, result, dbReadback)
  }
  // --abertos grava junto os recibos `erro`/`indeterminado` das falhas; sem a
  // flag a saída continua só com as provas, como antes.
  const abertos = process.argv.includes("--abertos") ? openParliamentaryReceipts(result.failures, pending, result.generated_at, result.run_id) : []
  writePrivateAtomic(output, { ...result, receipts: [...result.receipts, ...abertos] })
  process.stdout.write(JSON.stringify({
    status: result.errors.length === 0 ? "ok" : "partial",
    candidates: candidates.length,
    observations: observations.length,
    receipts: result.receipts.length,
    open_receipts: abertos.length,
    unresolved_without_id: result.unresolved_without_id.length,
    errors: result.errors.length,
  }) + "\n")
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) {
  void runCli().catch((error: unknown) => {
    process.stderr.write(`collect-parliamentary-family-receipts-local: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
