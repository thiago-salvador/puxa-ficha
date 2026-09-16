import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

import { sleep } from "./helpers"
import { log } from "./logger"
import { supabase } from "./supabase"
import type { IngestResult } from "./types"
import { stripAccents } from "../../src/lib/strip-accents"

const API = process.env.PF_TRANSPARENCIA_API_BASE ?? "https://api.portaldatransparencia.gov.br/api-de-dados"
const DEFAULT_CACHE_DIR = resolve(process.env.PF_TRANSPARENCIA_CACHE_DIR ?? ".transparencia-cache")
const PUBLIC_SOURCE = "https://portaldatransparencia.gov.br"
const MAX_PAGES = 10_000

export type TransparenciaFamilia = "cartoes" | "viagens" | "contratos"

interface EndpointSpec {
  familia: TransparenciaFamilia
  path: string
  parameter: "cpfPortador" | "cpf" | "cpfCnpj"
  fonte: string
}

export const ENDPOINTS: readonly EndpointSpec[] = [
  { familia: "cartoes", path: "cartoes", parameter: "cpfPortador", fonte: "Portal da Transparência — cartões por portador" },
  { familia: "viagens", path: "viagens-por-cpf", parameter: "cpf", fonte: "Portal da Transparência — viagens por CPF" },
  { familia: "contratos", path: "contratos/cpf-cnpj", parameter: "cpfCnpj", fonte: "Portal da Transparência — contratos por CPF" },
]

export function endpointTransparencia(familia: TransparenciaFamilia): EndpointSpec {
  const spec = ENDPOINTS.find((item) => item.familia === familia)
  if (!spec) throw new Error(`Família Transparência desconhecida: ${familia}`)
  return spec
}

type JsonRecord = Record<string, unknown>

export interface TransparenciaFetchOptions {
  fetchImpl?: typeof fetch
  cacheDir?: string
  useCache?: boolean
  apiKey?: string
  pauseMs?: number
  /** Nome civil/eleitoral já reconciliado com o candidato TSE, sem persistir identificadores pessoais. */
  expectedIdentityNames?: readonly string[]
}

export interface TransparenciaFamiliaResult {
  familia: TransparenciaFamilia
  fonte: string
  endpoint: string
  paginas: number
  registros: number
  resposta_sha256: string | null
  rows: JsonRecord[]
  resultado: "encontrado" | "vazio_confirmado" | "erro"
  erro?: string
}

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex") }
function onlyDigits(value: string): string { return value.replace(/\D/g, "") }
function validCpf(value: string): boolean {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^([0-9])\1{10}$/.test(cpf)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i)
  let check = (sum * 10) % 11
  if (check === 10) check = 0
  if (check !== Number(cpf[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i)
  check = (sum * 10) % 11
  if (check === 10) check = 0
  return check === Number(cpf[10])
}

function normalizeName(value: string): string {
  return stripAccents(value).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()
}

function namesEquivalent(actual: string, expected: string): boolean {
  const left = normalizeName(actual)
  const right = normalizeName(expected)
  if (!left || !right) return false
  if (left === right || left.includes(right) || right.includes(left)) return true
  const leftTokens = new Set(left.split(" ").filter(Boolean))
  const rightTokens = new Set(right.split(" ").filter(Boolean))
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length
  return Math.min(leftTokens.size, rightTokens.size) >= 2 && overlap >= Math.min(leftTokens.size, rightTokens.size) - 1
}

function looksPersonalKey(key: string): boolean {
  return /cpf|cnpj|nis|document|email|telefone|celular/i.test(key)
}

/** Remove identificadores pessoais antes de gravar cache, JSON ou banco público. */
export function sanitizeTransparenciaPublic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeTransparenciaPublic)
  if (value && typeof value === "object") {
    const output: JsonRecord = {}
    for (const [key, child] of Object.entries(value as JsonRecord)) {
      if (looksPersonalKey(key)) continue
      output[key] = sanitizeTransparenciaPublic(child)
    }
    return output
  }
  return value
}

function hasScalarField(row: JsonRecord, key: string): boolean {
  const value = row[key]
  return value !== null && value !== undefined && value !== "" && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
}

function hasMinimumFamilySchema(row: JsonRecord, familia: TransparenciaFamilia): boolean {
  if (familia === "cartoes") return hasScalarField(row, "id") && hasScalarField(row, "dataTransacao") && hasScalarField(row, "valorTransacao")
  if (familia === "viagens") return hasScalarField(row, "id") && hasScalarField(row, "dataInicioAfastamento") && hasScalarField(row, "tipoViagem")
  return (hasScalarField(row, "id") || hasScalarField(row, "numeroContrato")) && ["objeto", "valorContrato", "dataAssinatura", "dataInicioVigencia"].some((key) => hasScalarField(row, key))
}

export function validateTransparenciaPage(payload: unknown, familia?: TransparenciaFamilia): JsonRecord[] | null {
  if (!Array.isArray(payload)) return null
  if (payload.some((row) => !row || typeof row !== "object" || Array.isArray(row))) return null
  if (!familia) return payload as JsonRecord[]
  if (payload.some((row) => !hasMinimumFamilySchema(row as JsonRecord, familia))) return null
  return payload as JsonRecord[]
}

function extractSubjectDocumentValues(value: unknown, familia: TransparenciaFamilia, path: string[] = []): string[] {
  if (Array.isArray(value)) return value.flatMap((child) => extractSubjectDocumentValues(child, familia, path))
  if (!value || typeof value !== "object") {
    const key = path.at(-1) ?? ""
    const parent = path.slice(0, -1).join(".").toLowerCase()
    const subjectKey = familia === "cartoes" ? /portador/ : familia === "viagens" ? /beneficiario|viajante|passageiro/ : /contratado|fornecedor|favorecido/
    const directKey = familia === "cartoes" ? /cpfportador/i : familia === "viagens" ? /cpf(?:beneficiario|viajante|passageiro)?/i : /cpfcnpj|cpfcontratado|documentocontratado/i
    return typeof value === "string" && looksPersonalKey(key) && (subjectKey.test(parent) || directKey.test(key)) ? [value] : []
  }
  return Object.entries(value as JsonRecord).flatMap(([childKey, child]) => extractSubjectDocumentValues(child, familia, [...path, childKey]))
}

function extractSubjectNames(value: unknown, familia: TransparenciaFamilia, path: string[] = []): string[] {
  if (Array.isArray(value)) return value.flatMap((child) => extractSubjectNames(child, familia, path))
  if (!value || typeof value !== "object") {
    const key = path.at(-1) ?? ""
    const parent = path.slice(0, -1).join(".").toLowerCase()
    const subject = familia === "cartoes" ? /portador/ : familia === "viagens" ? /beneficiario|viajante|passageiro/ : /contratado|fornecedor|favorecido/
    return typeof value === "string" && /nome/i.test(key) && (subject.test(parent) || (familia === "cartoes" && /nomeportador/i.test(key)) || (familia === "viagens" && /nome(?:beneficiario|viajante|passageiro)/i.test(key)) || (familia === "contratos" && /nome(?:contratado|fornecedor|favorecido)/i.test(key))) ? [value] : []
  }
  return Object.entries(value as JsonRecord).flatMap(([childKey, child]) => extractSubjectNames(child, familia, [...path, childKey]))
}

function identityMismatch(rows: readonly JsonRecord[], cpf: string, familia: TransparenciaFamilia, expectedNames: readonly string[] = []): boolean {
  const candidateCpf = onlyDigits(cpf)
  for (const row of rows) for (const document of extractSubjectDocumentValues(row, familia)) {
    const digits = onlyDigits(document)
    if (digits.length === 11 && validCpf(document) && digits !== candidateCpf) return true
  }
  const names = rows.flatMap((row) => extractSubjectNames(row, familia))
  return expectedNames.length > 0 && names.length > 0 && names.some((name) => !expectedNames.some((expected) => namesEquivalent(name, expected)))
}

function endpointUrl(spec: EndpointSpec): string { return `${API}/${spec.path}` }
function cacheFile(cacheDir: string, spec: EndpointSpec, cpf: string, page: number): string {
  return resolve(cacheDir, `${sha256(`${spec.familia}:${onlyDigits(cpf)}:${page}`)}.json`)
}

interface CachedResponse {
  schema_version: string
  familia: TransparenciaFamilia
  pagina: number
  endpoint: string
  request_cpf_sha256: string
  body_sha256: string
  body: string
  identity_validated?: boolean
  identity_proof?: "request_cpf_filter_subject_name" | "request_cpf_filter_document" | "request_cpf_filter_empty_response"
}

async function fetchPage(spec: EndpointSpec, cpf: string, page: number, options: TransparenciaFetchOptions): Promise<{ payload: unknown; sha: string; cacheFile: string; fromCache: boolean }> {
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR
  const file = cacheFile(cacheDir, spec, cpf, page)
  if (options.useCache !== false && existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8")) as Partial<CachedResponse>
    if (cached.schema_version !== "transparencia-response-cache-v1" || cached.familia !== spec.familia || cached.pagina !== page || cached.endpoint !== endpointUrl(spec) || cached.request_cpf_sha256 !== sha256(onlyDigits(cpf)) || typeof cached.body !== "string" || cached.body_sha256 !== sha256(cached.body)) {
      throw new Error(`${spec.familia}: cache recusado por proveniência incompleta ou hash divergente`)
    }
    let payload: unknown
    try { payload = JSON.parse(cached.body) } catch { throw new Error(`${spec.familia}: cache com JSON inválido`) }
    if (!validateTransparenciaPage(payload, spec.familia)) throw new Error(`${spec.familia}: cache com schema de linha inválido`)
    if (cached.identity_validated !== true || !cached.identity_proof) {
      const rows = payload as JsonRecord[]
      if (rows.length > 0 && (!options.expectedIdentityNames?.length || identityMismatch(rows, cpf, spec.familia, options.expectedIdentityNames))) throw new Error(`${spec.familia}: cache antigo sem prova de identidade segura`)
      return { payload, sha: cached.body_sha256, cacheFile: file, fromCache: false }
    }
    return { payload, sha: cached.body_sha256, cacheFile: file, fromCache: true }
  }
  const apiKey = options.apiKey ?? process.env.TRANSPARENCIA_API_KEY
  if (!apiKey) throw new Error("TRANSPARENCIA_API_KEY ausente")
  mkdirSync(cacheDir, { recursive: true })
  const params = new URLSearchParams({ [spec.parameter]: onlyDigits(cpf), pagina: String(page) })
  const response = await (options.fetchImpl ?? fetch)(`${endpointUrl(spec)}?${params}`, { headers: { "chave-api-dados": apiKey, Accept: "application/json" } })
  const text = await response.text()
  if (!response.ok) throw new Error(`${spec.familia}: HTTP ${response.status}`)
  let payload: unknown
  try { payload = JSON.parse(text) } catch { throw new Error(`${spec.familia}: JSON inválido`) }
  const body = JSON.stringify(sanitizeTransparenciaPublic(payload))
  return { payload, sha: sha256(body), cacheFile: file, fromCache: false }
}

function writeValidatedCache(file: string, spec: EndpointSpec, cpf: string, page: number, payload: unknown, identityProof: CachedResponse["identity_proof"]): string {
  const body = JSON.stringify(sanitizeTransparenciaPublic(payload))
  const bodySha = sha256(body)
  writeFileSync(file, JSON.stringify({ schema_version: "transparencia-response-cache-v1", familia: spec.familia, pagina: page, endpoint: endpointUrl(spec), request_cpf_sha256: sha256(onlyDigits(cpf)), body_sha256: bodySha, body, identity_validated: true, identity_proof: identityProof }) + "\n")
  return bodySha
}

export async function coletarFamiliaTransparencia(cpf: string, spec: EndpointSpec, options: TransparenciaFetchOptions = {}): Promise<TransparenciaFamiliaResult> {
  if (!validCpf(cpf)) return { familia: spec.familia, fonte: spec.fonte, endpoint: endpointUrl(spec), paginas: 0, registros: 0, resposta_sha256: null, rows: [], resultado: "erro", erro: "CPF ausente ou inválido; consulta não realizada" }
  const rows: JsonRecord[] = []
  const hashes: string[] = []
  const seenPages = new Set<string>()
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await fetchPage(spec, cpf, page, options)
      const pageRows = validateTransparenciaPage(response.payload, spec.familia)
      if (!pageRows) return { familia: spec.familia, fonte: spec.fonte, endpoint: endpointUrl(spec), paginas: page, registros: rows.length, resposta_sha256: null, rows: [], resultado: "erro", erro: `${spec.familia}: payload não tabular` }
      if (seenPages.has(response.sha)) return { familia: spec.familia, fonte: spec.fonte, endpoint: endpointUrl(spec), paginas: page, registros: rows.length, resposta_sha256: sha256(hashes.join(";")), rows: [], resultado: "erro", erro: `${spec.familia}: página repetida durante paginação` }
      seenPages.add(response.sha)
      hashes.push(response.sha)
      if (identityMismatch(pageRows, cpf, spec.familia, options.expectedIdentityNames)) return { familia: spec.familia, fonte: spec.fonte, endpoint: endpointUrl(spec), paginas: page, registros: rows.length, resposta_sha256: sha256(hashes.join(";")), rows: [], resultado: "erro", erro: `${spec.familia}: registro devolvido com identidade divergente` }
      if (pageRows.length > 0 && extractSubjectNames(pageRows, spec.familia).length === 0 && extractSubjectDocumentValues(pageRows, spec.familia).length === 0) return { familia: spec.familia, fonte: spec.fonte, endpoint: endpointUrl(spec), paginas: page, registros: rows.length, resposta_sha256: sha256(hashes.join(";")), rows: [], resultado: "erro", erro: `${spec.familia}: registro sem prova de identidade no campo da família` }
      if (!response.fromCache) response.sha = writeValidatedCache(response.cacheFile, spec, cpf, page, response.payload, pageRows.length === 0 ? "request_cpf_filter_empty_response" : extractSubjectNames(pageRows, spec.familia).length > 0 ? "request_cpf_filter_subject_name" : "request_cpf_filter_document")
      if (pageRows.length === 0) return { familia: spec.familia, fonte: spec.fonte, endpoint: endpointUrl(spec), paginas: page, registros: rows.length, resposta_sha256: sha256(hashes.join(";")), rows, resultado: rows.length > 0 ? "encontrado" : "vazio_confirmado" }
      rows.push(...pageRows.map((row) => sanitizeTransparenciaPublic(row) as JsonRecord))
      if (options.pauseMs) await sleep(options.pauseMs)
    }
    return { familia: spec.familia, fonte: spec.fonte, endpoint: endpointUrl(spec), paginas: MAX_PAGES, registros: rows.length, resposta_sha256: sha256(hashes.join(";")), rows: [], resultado: "erro", erro: `${spec.familia}: paginação excedeu limite` }
  } catch (error) {
    return { familia: spec.familia, fonte: spec.fonte, endpoint: endpointUrl(spec), paginas: hashes.length, registros: rows.length, resposta_sha256: hashes.length ? sha256(hashes.join(";")) : null, rows: [], resultado: "erro", erro: error instanceof Error ? error.message : String(error) }
  }
}

function yearForRow(familia: TransparenciaFamilia, row: JsonRecord): number | null {
  const keys = familia === "viagens" ? ["dataInicioAfastamento"] : familia === "cartoes" ? ["dataTransacao"] : ["dataAssinatura", "dataInicioVigencia", "dataFimVigencia", "dataPublicacao"]
  for (const key of keys) {
    const value = row[key]
    const match = typeof value === "string" ? value.match(/(?:19|20)\d{2}/) : null
    if (match) return Number(match[0])
  }
  return familia === "viagens" && row.viagem && typeof row.viagem === "object" && typeof (row.viagem as JsonRecord).ano === "number" ? Number((row.viagem as JsonRecord).ano) : null
}

async function persistFamilia(candidatoId: string, coleta: TransparenciaFamiliaResult): Promise<{ rowsUpserted: number; unresolvedRows: number }> {
  if (coleta.resultado !== "encontrado") return { rowsUpserted: 0, unresolvedRows: 0 }
  const byYear = new Map<number, JsonRecord[]>()
  let unresolvedRows = 0
  for (const row of coleta.rows) {
    const year = yearForRow(coleta.familia, row)
    if (year === null) { unresolvedRows++; continue }
    const familyRows = byYear.get(year) ?? []
    familyRows.push(row)
    byYear.set(year, familyRows)
  }
  for (const [ano, rows] of byYear) {
    const periodoFonte = coleta.familia === "viagens" ? "dataInicioAfastamento" : coleta.familia === "cartoes" ? "dataTransacao" : "dataAssinatura/dataInicioVigencia/dataPublicacao"
    const detalhamento = { transparencia_familia: coleta.familia, resultado: coleta.resultado, registros: rows, paginas: coleta.paginas, resposta_sha256: coleta.resposta_sha256, escopo: `${coleta.fonte}; páginas desde 1 até ${coleta.paginas}; ano extraído de ${periodoFonte} da fonte`, fonte_publica: PUBLIC_SOURCE }
    const { data: existing, error: selectError } = await supabase.from("gastos_parlamentares").select("id").eq("candidato_id", candidatoId).eq("fonte", coleta.fonte).eq("ano", ano).limit(1)
    if (selectError) throw new Error(`transparencia ${coleta.familia}: leitura de persistência falhou: ${selectError.message}`)
    const row = { candidato_id: candidatoId, ano, total_gasto: null, detalhamento, gastos_destaque: [], fonte: coleta.fonte }
    if (existing?.[0]?.id) {
      const { error } = await supabase.from("gastos_parlamentares").update(row).eq("id", existing[0].id)
      if (error) throw new Error(`transparencia ${coleta.familia}: atualização falhou: ${error.message}`)
    } else {
      const { error } = await supabase.from("gastos_parlamentares").insert(row)
      if (error) throw new Error(`transparencia ${coleta.familia}: inserção falhou: ${error.message}`)
    }
  }
  return { rowsUpserted: byYear.size, unresolvedRows }
}

export type IngestTransparenciaOptions = TransparenciaFetchOptions & {
  targetSlugs?: readonly string[]
  candidateRows?: readonly { slug: string; nome_completo?: string | null; nome_urna?: string | null }[]
}

export async function ingestTransparencia(options: IngestTransparenciaOptions = {}): Promise<IngestResult[]> {
  const selected = options.targetSlugs ? new Set(options.targetSlugs) : null
  const candidatos = (options.candidateRows ? [...options.candidateRows] : (await supabase.from("candidatos").select("slug, nome_completo, nome_urna").eq("publicavel", true).limit(1000)).data ?? [])
    .filter((cand) => !selected || selected.has(cand.slug))
  const results: IngestResult[] = []
  for (const cand of candidatos) {
    const result: IngestResult = {
      source: "transparencia",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }
    const start = Date.now()
    try {
      const { data: dbCand, error } = await supabase.from("candidatos").select("id, cpf, nome_completo, nome_urna").eq("slug", cand.slug).single()
      if (error || !dbCand) { result.errors.push("Candidato não encontrado no Supabase"); results.push(result); continue }
      if (!validCpf(String(dbCand.cpf ?? ""))) { result.skipped = true; result.skip_reason = "CPF ausente ou inválido; famílias permanecem pendentes"; result.coleta_resultado = "erro"; result.coleta_detalhe = result.skip_reason; results.push(result); continue }
      const coletas: TransparenciaFamiliaResult[] = []
      const expectedIdentityNames = [dbCand.nome_completo, dbCand.nome_urna, cand.nome_completo, cand.nome_urna].filter((name): name is string => Boolean(name))
      for (const spec of ENDPOINTS) coletas.push(await coletarFamiliaTransparencia(String(dbCand.cpf), spec, { ...options, expectedIdentityNames }))
      for (const coleta of coletas) {
        if (coleta.resultado === "erro") { result.errors.push(coleta.erro ?? `${coleta.familia}: erro sem detalhe`); continue }
        const persisted = await persistFamilia(dbCand.id, coleta)
        if (persisted.rowsUpserted > 0 && !result.tables_updated.includes("gastos_parlamentares")) result.tables_updated.push("gastos_parlamentares")
        result.rows_upserted += persisted.rowsUpserted
        if (persisted.unresolvedRows > 0) result.errors.push(`${coleta.familia}: ${persisted.unresolvedRows} registro(s) sem ano explícito, não materializado(s)`)
      }
      const errors = coletas.filter((coleta) => coleta.resultado === "erro")
      result.coleta_volume = coletas.reduce((sum, coleta) => sum + coleta.registros, 0)
      result.coleta_resultado = errors.length > 0 ? "erro" : result.coleta_volume > 0 ? "encontrado" : "vazio_confirmado"
      result.coleta_detalhe = coletas.map((coleta) => `${coleta.familia}=${coleta.resultado}:${coleta.registros} registro(s), páginas=${coleta.paginas}, fonte=${coleta.endpoint}`).join("; ")
      result.coleta_url = coletas[0]?.endpoint
    } catch (error) { result.errors.push(error instanceof Error ? error.message : String(error)); result.coleta_resultado = "erro" }
    result.duration_ms = Date.now() - start
    results.push(result)
    log("transparencia", `${cand.slug}: ${result.coleta_resultado ?? "erro"} (${result.coleta_volume ?? 0} registros agregados)`)
    await sleep(options.pauseMs ?? 50)
  }
  return results
}

export function resultadoTransparenciaPendente(slug: string): IngestResult {
  return { source: "transparencia", candidato: slug, tables_updated: [], rows_upserted: 0, errors: ["Coleta pendente: nenhuma consulta ao Portal foi realizada"], duration_ms: 0, coleta_resultado: "erro", coleta_detalhe: "Nenhuma consulta ao Portal realizada; ausência não confirmada." }
}

if (import.meta.url === `file://${process.argv[1]}`) ingestTransparencia().then((results) => console.log(JSON.stringify(results, null, 2)))
