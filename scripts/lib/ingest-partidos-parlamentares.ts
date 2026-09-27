import { createHash } from "node:crypto"
import { appendFileSync, mkdirSync, chmodSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import type { CandidatoConfig, IngestResult } from "./types"
import { stripAccents } from "../../src/lib/strip-accents"

export const FONTE_MUDANCAS_PARTIDO_PARLAMENTAR = "partidos-parlamentares"
export const CAMARA_HISTORICO_URL = "https://dadosabertos.camara.leg.br/api/v2/deputados"
export const SENADO_DADOS_ABERTOS_URL = "https://legis.senado.leg.br/dadosabertos"

export type CasaParlamentar = "camara" | "senado"
export type ResultadoFonteParlamentar = "ok" | "vazio_confirmado" | "erro" | "indisponivel" | "indeterminado"
export type ProvaSemIdParlamentar = { verificado: true; detalhe: string; url: string; sha256: string }

export interface MudancaPartidoParlamentar {
  partido: string
  data_inicio: string
  data_fim: string | null
}

/**
 * Receipt component intentionally identifies itself as parliamentary. A later
 * TSE candidacy collector can join on candidato_slug while retaining a distinct
 * source and component; neither source is allowed to claim the other's scope.
 */
export interface ReciboPartidoParlamentar {
  schema_version: "partido-parlamentar-receipt-v1"
  componente: "parlamentar"
  fonte: typeof FONTE_MUDANCAS_PARTIDO_PARLAMENTAR
  casa: CasaParlamentar | "ambas"
  candidato_slug: string
  candidato_id: string | null
  identidade: "id_oficial" | "sem_id_verificado" | "mista_verificada" | "nao_verificada"
  resultado: ResultadoFonteParlamentar
  volume: number
  detalhe: string
  fontes: Array<{
    casa: CasaParlamentar
    id_oficial: number | null
    url: string | null
    sha256: string | null
    resultado: ResultadoFonteParlamentar
    mudancas: MudancaPartidoParlamentar[]
  }>
}

export interface RespostaCamaraHistorico {
  dados?: Array<Record<string, unknown>>
}

export interface RespostaSenadoFiliacoes {
  FiliacaoParlamentar?: {
    Parlamentar?: {
      Codigo?: unknown
      Filiacoes?: { Filiacao?: unknown | unknown[] }
    }
  }
}

export type FetchFontePartidaria = (url: string) => Promise<{ status: number; body: string }>

interface RegistroDiretorioParlamentar {
  casa: CasaParlamentar
  id: number
  nomes: string[]
  uf: string | null
  partido: string | null
  legislatura: number
}

interface ArquivoDiretorioParlamentar {
  url: string
  sha256: string
  status: number
  parse_result: "ok" | "http_error" | "parse_error" | "fetch_error"
  error?: string
}

interface DiretorioParlamentar {
  registros: RegistroDiretorioParlamentar[]
  arquivos: ArquivoDiretorioParlamentar[]
  completo: boolean
  erros: string[]
}

export interface IdentidadeParlamentarDescoberta {
  slug: string
  casa: CasaParlamentar
  id_oficial: number | null
  api_id: number | null
  ideCadastro: number | null
  nome_oficial: string | null
  uf: string | null
  url: string | null
  sha256: string | null
  jev_noul: number | null
  status: "id_oficial" | "revisar" | "sem_match" | "falha_jev" | "diretorio_incompleto"
}

export interface ResultadoDescobertaParlamentar {
  porSlug: Map<string, Partial<Record<CasaParlamentar, IdentidadeParlamentarDescoberta>>>
  provaSemIdPorSlug: Map<string, Partial<Record<CasaParlamentar, ProvaSemIdParlamentar>>>
  arquivos: ArquivoDiretorioParlamentar[]
  completo: boolean
  erros: string[]
}

const PRIMEIRA_LEGISLATURA_COBERTA = 1
const JEV_SCRIPT = resolve(process.env.HOME ?? "", ".claude/scripts/jev.py")
const JEV_QUESTIONS = resolve(process.cwd(), "scripts/data/partidos-parlamentares-identity-questions.json")
const JEV_PRIVATE_DIR = resolve(process.env.HOME ?? "", "Library/Logs/puxa-ficha/jev")
const JEV_SHADOW_PATH = resolve(JEV_PRIVATE_DIR, "partidos-parlamentares-shadow.jsonl")
const JEV_REVIEW_PATH = resolve(JEV_PRIVATE_DIR, "partidos-parlamentares-review.jsonl")
const DIRECTORY_AUDIT_PATH = resolve(JEV_PRIVATE_DIR, "partidos-parlamentares-directory.json")
const IDENTITY_REVIEW_RANGE = { minimo: 0.35, maximo: 0.65 }
const directoryFetchCache = new Map<string, Promise<{ status: number; body: string }>>()
let directoryPromise: Promise<DiretorioParlamentar> | null = null

function normalizeName(value: string): string {
  return stripAccents(value).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ")
}

function recordAsObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function arrayOf(value: unknown): unknown[] {
  return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]
}

export function parseCamaraLegislatureRoster(payload: unknown, legislature: number): RegistroDiretorioParlamentar[] {
  const root = recordAsObject(payload)
  if (!root || !Array.isArray(root.dados)) throw new Error(`roster Câmara ${legislature}: dados ausente ou inválido`)
  return root.dados.map((raw, index) => {
    const row = recordAsObject(raw)
    const id = Number(row?.id)
    const name = text(row?.nome)
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`roster Câmara ${legislature}: ID inválido na linha ${index + 1}`)
    return {
      casa: "camara",
      id,
      nomes: name ? [name] : [],
      uf: text(row?.siglaUf) || null,
      partido: text(row?.siglaPartido) || null,
      legislatura: legislature,
    }
  })
}

export function parseCamaraDeputyIdentity(payload: unknown, expectedId: number, legislature: number): RegistroDiretorioParlamentar {
  const root = recordAsObject(payload)
  const row = recordAsObject(root?.dados)
  const status = recordAsObject(row?.ultimoStatus)
  const id = Number(row?.id)
  const names = [...new Set([text(row?.nomeCivil), text(status?.nome), text(status?.nomeEleitoral)].filter((name): name is string => Boolean(name)))]
  if (id !== expectedId || !names.length) throw new Error(`detalhe Câmara ${expectedId}: identidade oficial sem nome`)
  return {
    casa: "camara", id, nomes: names,
    uf: text(status?.siglaUf) || null,
    partido: text(status?.siglaPartido) || null,
    legislatura: legislature,
  }
}

export function parseSenadoLegislatureRoster(payload: unknown, legislature: number): RegistroDiretorioParlamentar[] {
  const root = recordAsObject(payload)
  const list = recordAsObject(root?.ListaParlamentarLegislatura)
  const parliamentarians = recordAsObject(list?.Parlamentares)
  if (!list || !parliamentarians || !("Parlamentar" in parliamentarians)) throw new Error(`roster Senado ${legislature}: Parlamentares.Parlamentar ausente`)
  return arrayOf(parliamentarians.Parlamentar).map((raw, index) => {
    const row = recordAsObject(raw)
    const identity = recordAsObject(row?.IdentificacaoParlamentar)
    const id = Number(identity?.CodigoParlamentar)
    const fullName = text(identity?.NomeCompletoParlamentar)
    const parliamentaryName = text(identity?.NomeParlamentar)
    if (!Number.isSafeInteger(id) || id <= 0 || (!fullName && !parliamentaryName)) {
      throw new Error(`roster Senado ${legislature}: identidade inválida na linha ${index + 1}`)
    }
    return {
      casa: "senado",
      id,
      nomes: [...new Set([fullName, parliamentaryName].filter(Boolean))],
      uf: text(identity?.UfParlamentar) || null,
      partido: text(identity?.SiglaPartidoParlamentar) || null,
      legislatura: legislature,
    }
  })
}

/** Senate's official range endpoint includes the membership of each mandate. */
export function parseSenadoLegislatureRange(payload: unknown, first: number, last: number): RegistroDiretorioParlamentar[] {
  const root = recordAsObject(payload)
  const list = recordAsObject(root?.ListaParlamentarLegislatura)
  const parliamentarians = recordAsObject(list?.Parlamentares)
  if (!parliamentarians || !("Parlamentar" in parliamentarians)) throw new Error("roster Senado por intervalo: Parlamentares.Parlamentar ausente")
  const records: RegistroDiretorioParlamentar[] = []
  for (const [index, raw] of arrayOf(parliamentarians.Parlamentar).entries()) {
    const row = recordAsObject(raw)
    const identity = recordAsObject(row?.IdentificacaoParlamentar)
    const id = Number(identity?.CodigoParlamentar)
    const names = [...new Set([text(identity?.NomeCompletoParlamentar), text(identity?.NomeParlamentar)].filter((name): name is string => Boolean(name)))]
    const mandates = recordAsObject(row?.Mandatos)
    const mandateRows = arrayOf(mandates?.Mandato)
    if (!Number.isSafeInteger(id) || id <= 0 || names.length === 0 || mandateRows.length === 0) {
      throw new Error(`roster Senado por intervalo: identidade ou mandato inválido na linha ${index + 1}`)
    }
    for (const mandateValue of mandateRows) {
      const mandate = recordAsObject(mandateValue)
      const firstTerm = recordAsObject(mandate?.PrimeiraLegislaturaDoMandato)
      const secondTerm = recordAsObject(mandate?.SegundaLegislaturaDoMandato)
      const termNumbers = [Number(firstTerm?.NumeroLegislatura), Number(secondTerm?.NumeroLegislatura)]
        .filter((term) => Number.isSafeInteger(term) && term >= first && term <= last)
      if (!termNumbers.length) throw new Error(`roster Senado por intervalo: legislatura ausente na linha ${index + 1}`)
      for (const term of new Set(termNumbers)) {
        records.push({
          casa: "senado", id, nomes: names,
          uf: text(mandate?.UfParlamentar) || text(identity?.UfParlamentar) || null,
          partido: text(identity?.SiglaPartidoParlamentar) || null,
          legislatura: term,
        })
      }
    }
  }
  return records
}

async function cachedOfficialBody(url: string): Promise<{ status: number; body: string }> {
  let request = directoryFetchCache.get(url)
  if (!request) {
    request = fetchOfficialJson(url)
    directoryFetchCache.set(url, request)
  }
  return request
}

async function limitedMap<T, R>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      output[index] = await worker(items[index])
    }
  }))
  return output
}

function directoryAttempt(url: string, body: string, status: number): ArquivoDiretorioParlamentar {
  return { url, sha256: sha256(body), status, parse_result: "http_error" }
}

async function loadLegislatureDirectory(
  legislature: number,
  attempts: ArquivoDiretorioParlamentar[],
): Promise<{ records: RegistroDiretorioParlamentar[]; files: ArquivoDiretorioParlamentar[] }> {
  const records: RegistroDiretorioParlamentar[] = []
  const files: ArquivoDiretorioParlamentar[] = []
  for (let page = 1; page <= 20; page++) {
    const url = `${CAMARA_HISTORICO_URL}?idLegislatura=${legislature}&itens=100&ordem=ASC&ordenarPor=id&pagina=${page}`
    let camara: { status: number; body: string }
    try { camara = await cachedOfficialBody(url) }
    catch (error) {
      attempts.push({ ...directoryAttempt(url, "", 0), parse_result: "fetch_error", error: error instanceof Error ? error.message : String(error) })
      throw new Error(`Câmara roster legislatura ${legislature} página ${page}: fetch falhou`)
    }
    const camaraAttempt = directoryAttempt(url, camara.body, camara.status)
    attempts.push(camaraAttempt); files.push(camaraAttempt)
    if (camara.status < 200 || camara.status >= 300) throw new Error(`Câmara roster legislatura ${legislature} página ${page}: HTTP ${camara.status}`)
    let pageRecords: RegistroDiretorioParlamentar[]
    try {
      pageRecords = parseCamaraLegislatureRoster(JSON.parse(camara.body) as unknown, legislature)
      camaraAttempt.parse_result = "ok"
    } catch (error) {
      camaraAttempt.parse_result = "parse_error"
      camaraAttempt.error = error instanceof Error ? error.message : String(error)
      throw new Error(`Câmara roster legislatura ${legislature} página ${page}: payload inválido`)
    }
    const unresolvedNames = pageRecords.filter((record) => record.nomes.length === 0)
    const resolved = await limitedMap(unresolvedNames, 4, async (record) => {
      const detailUrl = `${CAMARA_HISTORICO_URL}/${record.id}`
      let response: { status: number; body: string }
      try { response = await cachedOfficialBody(detailUrl) }
      catch (error) {
        attempts.push({ ...directoryAttempt(detailUrl, "", 0), parse_result: "fetch_error", error: error instanceof Error ? error.message : String(error) })
        return { record, error: "fetch falhou" }
      }
      const attempt = directoryAttempt(detailUrl, response.body, response.status)
      attempts.push(attempt); files.push(attempt)
      if (response.status < 200 || response.status >= 300) return { record, error: `HTTP ${response.status}` }
      try {
        const identity = parseCamaraDeputyIdentity(JSON.parse(response.body) as unknown, record.id, legislature)
        attempt.parse_result = "ok"
        return { record: identity, error: null }
      } catch (error) {
        attempt.parse_result = "parse_error"
        attempt.error = error instanceof Error ? error.message : String(error)
        return { record, error: "payload inválido" }
      }
    })
    const resolutionErrors = resolved.filter((item) => item.error)
    if (resolutionErrors.length) throw new Error(`Câmara roster legislatura ${legislature}: ${resolutionErrors.length} registro(s) sem nome oficial resolvido`)
    const resolvedById = new Map(resolved.map((item) => [item.record.id, item.record]))
    records.push(...pageRecords.map((record) => resolvedById.get(record.id) ?? record))
    if (pageRecords.length < 100) break
    if (page === 20) throw new Error(`Câmara roster legislatura ${legislature}: excedeu limite de páginas`)
  }
  return { records, files }
}

/** Loads the complete official legislature directory once per process (legislatures 1..current). */
export async function loadOfficialParliamentaryDirectory(): Promise<DiretorioParlamentar> {
  if (directoryPromise) return directoryPromise
  directoryPromise = (async () => {
    const currentLegislature = 57
    const legislatures = Array.from({ length: currentLegislature - PRIMEIRA_LEGISLATURA_COBERTA + 1 }, (_, i) => i + PRIMEIRA_LEGISLATURA_COBERTA)
    const attempts: ArquivoDiretorioParlamentar[] = []
    const senateRangeUrl = `${SENADO_DADOS_ABERTOS_URL}/senador/lista/legislatura/${PRIMEIRA_LEGISLATURA_COBERTA}/${currentLegislature}.json`
    let senateRecords: RegistroDiretorioParlamentar[] = []
    let senateError: string | null = null
    try {
      const response = await cachedOfficialBody(senateRangeUrl)
      const attempt = directoryAttempt(senateRangeUrl, response.body, response.status)
      attempts.push(attempt)
      if (response.status < 200 || response.status >= 300) {
        senateError = `Senado roster por intervalo: HTTP ${response.status}`
      } else {
        try {
          senateRecords = parseSenadoLegislatureRange(JSON.parse(response.body) as unknown, PRIMEIRA_LEGISLATURA_COBERTA, currentLegislature)
          attempt.parse_result = "ok"
        } catch (error) {
          attempt.parse_result = "parse_error"
          attempt.error = error instanceof Error ? error.message : String(error)
          senateError = "Senado roster por intervalo: payload inválido"
        }
      }
    } catch (error) {
      attempts.push({ ...directoryAttempt(senateRangeUrl, "", 0), parse_result: "fetch_error", error: error instanceof Error ? error.message : String(error) })
      senateError = "Senado roster por intervalo: fetch falhou"
    }
    const results = await limitedMap(legislatures, 3, async (legislature) => {
      try { return { ...(await loadLegislatureDirectory(legislature, attempts)), error: null as string | null } }
      catch (error) { return { records: [], files: [], error: `legislatura ${legislature}: ${error instanceof Error ? error.message : String(error)}` } }
    })
    const errors = [...(senateError ? [senateError] : []), ...results.flatMap((result) => result.error ? [result.error] : [])]
    const directory = { registros: [...senateRecords, ...results.flatMap((result) => result.records)], arquivos: attempts, completo: errors.length === 0, erros: errors }
    mkdirSync(JEV_PRIVATE_DIR, { recursive: true, mode: 0o700 })
    chmodSync(JEV_PRIVATE_DIR, 0o700)
    writeFileSync(DIRECTORY_AUDIT_PATH, `${JSON.stringify({ schema_version: "partidos-parlamentares-directory-v1", completo: directory.completo, erros: errors, arquivos: attempts }, null, 2)}\n`, { mode: 0o600 })
    chmodSync(DIRECTORY_AUDIT_PATH, 0o600)
    return directory
  })()
  return directoryPromise!
}

function hashDirectoryManifest(files: readonly ArquivoDiretorioParlamentar[]): string {
  const stable = [...files].sort((a, b) => a.url.localeCompare(b.url))
  return sha256(JSON.stringify(stable))
}

interface MatchJevResult {
  p: number | null
  error?: string
}

async function askSamePersonByJev(candidate: CandidatoConfig, record: RegistroDiretorioParlamentar, aliases: string[], recordLegislatures: number[]): Promise<MatchJevResult> {
  const { readFileSync } = await import("node:fs")
  const jevQuestions = JSON.parse(readFileSync(JEV_QUESTIONS, "utf8")) as Record<string, unknown>
  const state = {
    candidato: {
      nome_completo: candidate.nome_completo,
      nome_urna: candidate.nome_urna,
      uf_candidatura: candidate.estado ?? null,
      cargo_disputado: candidate.cargo_disputado,
    },
    registro_parlamentar: {
      casa: record.casa,
      id_oficial: record.id,
      nomes_oficiais: aliases,
      ufs: [record.uf].filter(Boolean),
      partidos: [record.partido].filter(Boolean),
      legislaturas: recordLegislatures,
    },
  }
  const request = spawnSync("python3", [JEV_SCRIPT, "ask"], {
    input: JSON.stringify({ state, questions: jevQuestions }),
    encoding: "utf8",
    timeout: 30_000,
  })
  if (request.status !== 0) return { p: null, error: request.stderr.trim() || `jev ask exit ${request.status ?? "signal"}` }
  try {
    const output = JSON.parse(request.stdout) as { answers?: { mesma_pessoa?: { noul?: number } } }
    const p = output.answers?.mesma_pessoa?.noul
    return typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1 ? { p } : { p: null, error: "Jev Noul ausente ou inválido" }
  } catch { return { p: null, error: "Jev retornou JSON inválido" } }
}

function recordIdentityShadow(input: {
  slug: string
  candidateName: string
  source: CasaParlamentar
  officialId: number
  officialNames: string[]
  p: number | null
  url: string
  sha256: string
  error?: string
}): void {
  mkdirSync(JEV_PRIVATE_DIR, { recursive: true, mode: 0o700 })
  chmodSync(JEV_PRIVATE_DIR, 0o700)
  const row = JSON.stringify({ schema_version: "partidos-parlamentares-jev-shadow-v1", ...input, consultado_em: new Date().toISOString() })
  appendFileSync(JEV_SHADOW_PATH, `${row}\n`, { mode: 0o600 })
  chmodSync(JEV_SHADOW_PATH, 0o600)
  if (input.p !== null && input.p >= IDENTITY_REVIEW_RANGE.minimo && input.p <= IDENTITY_REVIEW_RANGE.maximo) {
    appendFileSync(JEV_REVIEW_PATH, `${row}\n`, { mode: 0o600 })
    chmodSync(JEV_REVIEW_PATH, 0o600)
  }
}

/** Name matching is candidate generation only; every proposed link needs a Jev Noul shadow result. */
export async function discoverParliamentaryIdsByName(
  candidates: readonly CandidatoConfig[],
  options: { targetSlugs?: readonly string[]; directory?: DiretorioParlamentar } = {},
): Promise<ResultadoDescobertaParlamentar> {
  const targetSlugs = options.targetSlugs?.length ? new Set(options.targetSlugs) : null
  const eligible = selecionarCandidatosPartidarios(candidates, (candidate) =>
    (!targetSlugs || targetSlugs.has(candidate.slug)) && (candidate.ids.camara == null || candidate.ids.senado == null),
  )
  const directory = options.directory ?? await loadOfficialParliamentaryDirectory()
  const bySlug = new Map<string, Partial<Record<CasaParlamentar, IdentidadeParlamentarDescoberta>>>()
  const provaSemIdPorSlug = new Map<string, Partial<Record<CasaParlamentar, ProvaSemIdParlamentar>>>()

  for (const candidate of eligible) {
    const ids = bySlug.get(candidate.slug) ?? {}
    const noIdProofs = provaSemIdPorSlug.get(candidate.slug) ?? {}
    for (const house of ["camara", "senado"] as const) {
      if (candidate.ids[house] != null) continue
      const houseFiles = directory.arquivos.filter((file) => house === "camara"
        ? file.url.includes("dadosabertos.camara.leg.br")
        : file.url.includes("legis.senado.leg.br"))
      const houseManifestSha = hashDirectoryManifest(houseFiles)
      const manifestUrl = houseFiles[0]?.url ?? (house === "camara" ? CAMARA_HISTORICO_URL : `${SENADO_DADOS_ABERTOS_URL}/senador/lista/legislatura/1.json`)
      if (!directory.completo || !houseFiles.length) {
        ids[house] = { slug: candidate.slug, casa: house, id_oficial: null, api_id: null, ideCadastro: null, nome_oficial: null, uf: null, url: manifestUrl, sha256: houseManifestSha, jev_noul: null, status: "diretorio_incompleto" }
        bySlug.set(candidate.slug, ids)
        continue
      }

      const candidateNames = new Set([candidate.nome_completo, candidate.nome_urna].map(normalizeName).filter(Boolean))
      const grouped = new Map<number, { record: RegistroDiretorioParlamentar; names: Set<string>; legislatures: Set<number> }>()
      for (const record of directory.registros) {
        if (record.casa !== house || !record.nomes.some((name) => candidateNames.has(normalizeName(name)))) continue
        const existing = grouped.get(record.id) ?? { record, names: new Set<string>(), legislatures: new Set<number>() }
        record.nomes.forEach((name) => existing.names.add(name))
        existing.legislatures.add(record.legislatura)
        grouped.set(record.id, existing)
      }

      const accepted: Array<{ record: RegistroDiretorioParlamentar; p: number }> = []
      let unresolved = false
      for (const entry of grouped.values()) {
        const aliases = [...entry.names].sort()
        const jev = await askSamePersonByJev(candidate, entry.record, aliases, [...entry.legislatures].sort((a, b) => a - b))
        const sourceFile = houseFiles.find((file) => file.url.includes(`idLegislatura=${entry.record.legislatura}`) || file.url.endsWith(`/${entry.record.legislatura}.json`)) ?? houseFiles[0]
        recordIdentityShadow({
          slug: candidate.slug,
          candidateName: candidate.nome_completo,
          source: house,
          officialId: entry.record.id,
          officialNames: aliases,
          p: jev.p,
          url: sourceFile.url,
          sha256: sourceFile.sha256,
          error: jev.error,
        })
        if (jev.p === null || (jev.p >= IDENTITY_REVIEW_RANGE.minimo && jev.p <= IDENTITY_REVIEW_RANGE.maximo)) unresolved = true
        else if (jev.p > IDENTITY_REVIEW_RANGE.maximo) accepted.push({ record: entry.record, p: jev.p })
      }

      if (accepted.length === 1 && !unresolved) {
        const { record, p } = accepted[0]
        const sourceFile = houseFiles.find((file) => file.url.includes(`idLegislatura=${record.legislatura}`) || file.url.endsWith(`/${record.legislatura}.json`)) ?? houseFiles[0]
        ids[house] = {
          slug: candidate.slug, casa: house, id_oficial: record.id, api_id: record.id, ideCadastro: null,
          nome_oficial: record.nomes[0] ?? null, uf: record.uf, url: sourceFile.url, sha256: sourceFile.sha256,
          jev_noul: p, status: "id_oficial",
        }
      } else if (accepted.length > 1 || unresolved) {
        ids[house] = { slug: candidate.slug, casa: house, id_oficial: null, api_id: null, ideCadastro: null, nome_oficial: null, uf: null, url: manifestUrl, sha256: houseManifestSha, jev_noul: null, status: grouped.size ? "revisar" : "falha_jev" }
      } else {
        ids[house] = { slug: candidate.slug, casa: house, id_oficial: null, api_id: null, ideCadastro: null, nome_oficial: null, uf: null, url: manifestUrl, sha256: houseManifestSha, jev_noul: grouped.size ? 0 : null, status: "sem_match" }
        noIdProofs[house] = {
          verificado: true,
          detalhe: `Roster oficial integral das legislaturas ${PRIMEIRA_LEGISLATURA_COBERTA}-57 consultado; nomes completos e de urna conferidos; nenhuma identidade parlamentar confirmada; manifesto SHA-256 ${houseManifestSha}`,
          url: manifestUrl,
          sha256: houseFiles[0].sha256,
        }
      }
      bySlug.set(candidate.slug, ids)
      provaSemIdPorSlug.set(candidate.slug, noIdProofs)
    }
  }
  return { porSlug: bySlug, provaSemIdPorSlug, arquivos: directory.arquivos, completo: directory.completo, erros: directory.erros }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""
}

function isoDate(value: unknown): string | null {
  const raw = text(value)
  if (!raw) return null
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)
  if (!match) return null
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`)
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== `${match[1]}-${match[2]}-${match[3]}`
    ? null
    : `${match[1]}-${match[2]}-${match[3]}`
}

function sha256(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex")
}

function validNoIdProof(proof: ProvaSemIdParlamentar | undefined): proof is ProvaSemIdParlamentar {
  return proof?.verificado === true
    && Boolean(proof.detalhe.trim())
    && /^https:\/\//i.test(proof.url)
    && /^[a-f0-9]{64}$/i.test(proof.sha256)
}

export function urlHistoricoCamara(id: number): string {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("ID Câmara inválido")
  return `${CAMARA_HISTORICO_URL}/${id}/historico`
}

export function urlFiliacoesSenado(codigo: number): string {
  if (!Number.isSafeInteger(codigo) || codigo <= 0) throw new Error("código Senado inválido")
  return `${SENADO_DADOS_ABERTOS_URL}/senador/${codigo}/filiacoes.json`
}

export function parseHistoricoPartidarioCamara(
  payload: unknown,
  idEsperado: number,
): MudancaPartidoParlamentar[] {
  const root = object(payload)
  if (!root || !Array.isArray(root.dados)) throw new Error("resposta Câmara sem dados em lista")
  const events: MudancaPartidoParlamentar[] = []
  for (const raw of root.dados) {
    const row = object(raw)
    if (!row || Number(row.id) !== idEsperado) throw new Error("histórico Câmara contém identidade divergente")
    const partido = text(row.siglaPartido)
    const data = isoDate(row.dataHora)
    if (!partido || !data) throw new Error("registro Câmara sem partido ou data válida")
    events.push({ partido, data_inicio: data, data_fim: null })
  }
  const unique = new Map(events.map((event) => [`${event.data_inicio}\u0000${event.partido.toUpperCase()}`, event]))
  return [...unique.values()].sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
}

export function parseFiliacoesPartidariasSenado(
  payload: unknown,
  codigoEsperado: number,
): MudancaPartidoParlamentar[] {
  const parlamentar = object(object(object(payload)?.FiliacaoParlamentar)?.Parlamentar)
  if (!parlamentar || text(parlamentar.Codigo) !== String(codigoEsperado)) {
    throw new Error("resposta Senado sem código parlamentar correspondente")
  }
  const filiacoes = object(parlamentar.Filiacoes)
  const raw = filiacoes?.Filiacao
  const rows = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]
  const events: MudancaPartidoParlamentar[] = []
  for (const item of rows) {
    const row = object(item)
    const party = object(row?.Partido)
    const partido = text(party?.SiglaPartido)
    const start = isoDate(row?.DataFiliacao)
    const end = row?.DataDesfiliacao == null ? null : isoDate(row.DataDesfiliacao)
    if (!partido || !start || (row?.DataDesfiliacao != null && !end)) {
      throw new Error("filiação Senado sem partido ou datas válidas")
    }
    events.push({ partido, data_inicio: start, data_fim: end })
  }
  return events.sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
}

/** One predicate boundary is shared by normal runs and optional cohort runs. */
export function selecionarCandidatosPartidarios(
  candidates: readonly CandidatoConfig[],
  cohortPredicate?: (candidate: CandidatoConfig) => boolean,
): CandidatoConfig[] {
  return candidates.filter((candidate) => !cohortPredicate || cohortPredicate(candidate))
}

function makeSourceReceipt(
  house: CasaParlamentar,
  id: number | null,
  url: string | null,
  hash: string | null,
  result: ResultadoFonteParlamentar,
  events: MudancaPartidoParlamentar[] = [],
) {
  return { casa: house, id_oficial: id, url, sha256: hash, resultado: result, mudancas: events }
}

async function fetchSource(
  house: CasaParlamentar,
  id: number,
  fetcher: FetchFontePartidaria,
): Promise<ReciboPartidoParlamentar["fontes"][number]> {
  const url = house === "camara" ? urlHistoricoCamara(id) : urlFiliacoesSenado(id)
  let response: { status: number; body: string }
  try {
    response = await fetcher(url)
  } catch {
    return makeSourceReceipt(house, id, url, null, "indisponivel")
  }
  const digest = sha256(response.body)
  if (response.status < 200 || response.status >= 300) {
    return makeSourceReceipt(house, id, url, digest, "erro")
  }
  try {
    const payload = JSON.parse(response.body) as unknown
    const events = house === "camara"
      ? parseHistoricoPartidarioCamara(payload, id)
      : parseFiliacoesPartidariasSenado(payload, id)
    // A valid official ID with an empty endpoint response is not proof that
    // the candidate has no parliamentary ID or that no party change exists.
    return makeSourceReceipt(house, id, url, digest, events.length ? "ok" : "indeterminado", events)
  } catch {
    return makeSourceReceipt(house, id, url, digest, "erro")
  }
}

/**
 * Reads only by verified official numeric IDs. Name matching is intentionally
 * absent; callers must route any future name-derived identity through Jev Noul
 * shadow and the human review band before supplying an official ID here.
 */
export async function coletarHistoricoPartidarioParlamentar(
  candidate: CandidatoConfig,
  options: {
    candidatoId?: string | null
    fetcher?: FetchFontePartidaria
    /** Independently verified per-house proof; local null IDs alone do not qualify. */
    provaSemIdPorCasa?: Partial<Record<CasaParlamentar, ProvaSemIdParlamentar>>
    descoberta?: ResultadoDescobertaParlamentar
  } = {},
): Promise<ReciboPartidoParlamentar> {
  const fetcher = options.fetcher ?? fetchOfficialJson
  const camaraId = candidate.ids.camara
  const senadoId = candidate.ids.senado
  const sources: ReciboPartidoParlamentar["fontes"] = []
  for (const [house, id] of [["camara", camaraId], ["senado", senadoId]] as const) {
    if (id != null) {
      sources.push(await fetchSource(house, id, fetcher))
      continue
    }
    const proof = options.provaSemIdPorCasa?.[house]
    sources.push(validNoIdProof(proof)
      ? makeSourceReceipt(house, null, proof.url, proof.sha256, "vazio_confirmado")
      : makeSourceReceipt(house, null, null, null, "indeterminado"))
  }

  const results = sources.map((source) => source.resultado)
  const result: ResultadoFonteParlamentar = results.includes("erro") ? "erro"
    : results.includes("indisponivel") ? "indisponivel"
      : results.includes("indeterminado") ? "indeterminado"
        : results.includes("ok") ? "ok"
          : "vazio_confirmado"

  const events = sources.flatMap((source) => source.mudancas)
  const allIdsMissing = camaraId == null && senadoId == null
  const allMissingIdsVerified = sources.every((source) => source.id_oficial !== null ? true : source.resultado === "vazio_confirmado")
  const allHaveIds = camaraId != null && senadoId != null
  const casa = "ambas"
  const detail = JSON.stringify({
    schema_version: "partidos-parlamentares-coleta-detail-v1",
    componente: "parlamentar",
    candidato_slug: candidate.slug,
    tse_source_separate: true,
    diretorio_historico: options.descoberta ? {
      completo: options.descoberta.completo,
      erros: options.descoberta.erros,
      manifesto_sha256: hashDirectoryManifest(options.descoberta.arquivos),
      arquivos: options.descoberta.arquivos,
    } : null,
    fontes: sources.map((source) => {
      const proof = source.id_oficial === null ? options.provaSemIdPorCasa?.[source.casa] : undefined
      return {
        casa: source.casa,
        id_oficial: source.id_oficial,
        resultado: source.resultado,
        url: source.url,
        sha256: source.sha256,
        mudancas: source.mudancas,
        verificacao_sem_id: validNoIdProof(proof) ? { detalhe: proof.detalhe, url: proof.url, sha256: proof.sha256 } : null,
      }
    }),
  })
  return {
    schema_version: "partido-parlamentar-receipt-v1",
    componente: "parlamentar",
    fonte: FONTE_MUDANCAS_PARTIDO_PARLAMENTAR,
    casa,
    candidato_slug: candidate.slug,
    candidato_id: options.candidatoId ?? null,
    identidade: allHaveIds ? "id_oficial"
      : allIdsMissing && allMissingIdsVerified ? "sem_id_verificado"
        : !allIdsMissing && allMissingIdsVerified ? "mista_verificada"
          : "nao_verificada",
    resultado: result,
    volume: events.length,
    detalhe: detail,
    fontes: sources,
  }
}

export interface OpcoesColetaPartidosParlamentares {
  targetSlugs?: readonly string[]
  cohortPredicate?: (candidate: CandidatoConfig) => boolean
}

/** Run-shaped API for integrations; output is read-only receipts for each selected candidate. */
export async function executarColetaHistoricoPartidarioParlamentar(
  candidates: readonly CandidatoConfig[],
  options: OpcoesColetaPartidosParlamentares & {
    candidatoIdPorSlug?: (slug: string) => Promise<string | null>
    fetcher?: FetchFontePartidaria
    provaSemIdPorCasaPorSlug?: (candidate: CandidatoConfig) => Partial<Record<CasaParlamentar, ProvaSemIdParlamentar>>
    cohortPredicate?: (candidate: CandidatoConfig) => boolean
  } = {},
): Promise<ReciboPartidoParlamentar[]> {
  const targets = options.targetSlugs?.length ? new Set(options.targetSlugs) : null
  const selected = selecionarCandidatosPartidarios(candidates, (candidate) =>
    (!targets || targets.has(candidate.slug)) && (!options.cohortPredicate || options.cohortPredicate(candidate)),
  )
  const discovery = await discoverParliamentaryIdsByName(selected, { targetSlugs: options.targetSlugs })
  const receipts: ReciboPartidoParlamentar[] = []
  for (const candidate of selected) {
    const discovered = discovery.porSlug.get(candidate.slug)
    const effectiveCandidate = {
      ...candidate,
      ids: {
        ...candidate.ids,
        camara: candidate.ids.camara ?? (discovered?.camara?.status === "id_oficial" ? discovered.camara.id_oficial : null),
        senado: candidate.ids.senado ?? (discovered?.senado?.status === "id_oficial" ? discovered.senado.id_oficial : null),
      },
    }
    receipts.push(await coletarHistoricoPartidarioParlamentar(effectiveCandidate, {
      candidatoId: await options.candidatoIdPorSlug?.(candidate.slug),
      fetcher: options.fetcher,
      provaSemIdPorCasa: options.provaSemIdPorCasaPorSlug?.(candidate) ?? discovery.provaSemIdPorSlug.get(candidate.slug),
      descoberta: discovery,
    }))
  }
  return receipts
}

interface TransicoesPartidarias {
  transicoes: Array<{
    partido_anterior: string
    partido_novo: string
    data_mudanca: string
    ano: number
    casa: CasaParlamentar
    id_oficial: number
    url: string
    sha256: string
  }>
  ambiguidades: Array<{ casa: CasaParlamentar; data: string; partidos: string[] }>
}

export function classificarResultadoPartidario(
  receipt: ReciboPartidoParlamentar,
  transitionCount: number,
  ambiguityCount = 0,
): { resultado: "encontrado" | "vazio_confirmado" | "indeterminado" | "erro"; volume: number; motivo: string } {
  if (receipt.resultado === "erro" || receipt.resultado === "indisponivel") {
    return { resultado: "erro", volume: 0, motivo: "fonte_parlamentar_com_falha" }
  }
  if (receipt.resultado === "indeterminado" || ambiguityCount > 0) {
    return { resultado: "indeterminado", volume: 0, motivo: ambiguityCount > 0 ? "ambiguidades_temporais" : "fonte_parlamentar_indeterminada" }
  }
  if (receipt.identidade === "sem_id_verificado" && receipt.resultado === "vazio_confirmado") {
    return { resultado: "vazio_confirmado", volume: 0, motivo: "sem_id_parlamentar_verificado_em_ambas_as_casas" }
  }
  if ((receipt.identidade === "id_oficial" || receipt.identidade === "mista_verificada") && receipt.volume > 0) {
    return transitionCount > 0
      ? { resultado: "encontrado", volume: transitionCount, motivo: "transicoes_partidarias_encontradas" }
      : { resultado: "encontrado", volume: receipt.volume, motivo: "observacoes_oficiais_sem_transicao_partidaria" }
  }
  return { resultado: "indeterminado", volume: 0, motivo: "id_oficial_sem_observacoes_partidarias" }
}

export function transitionsFromSources(receipt: ReciboPartidoParlamentar): TransicoesPartidarias {
  const transitions: TransicoesPartidarias["transicoes"] = []
  const ambiguidades: TransicoesPartidarias["ambiguidades"] = []
  for (const source of receipt.fontes) {
    if (source.id_oficial === null || !source.url || !source.sha256 || source.resultado === "erro" || source.resultado === "indisponivel") continue
    const partiesByDate = new Map<string, Set<string>>()
    for (const observation of source.mudancas) {
      const parties = partiesByDate.get(observation.data_inicio) ?? new Set<string>()
      parties.add(observation.partido.trim().toUpperCase())
      partiesByDate.set(observation.data_inicio, parties)
    }
    const conflictingDates = [...partiesByDate.entries()].filter(([, parties]) => parties.size > 1)
    if (conflictingDates.length) {
      for (const [date, parties] of conflictingDates) ambiguidades.push({ casa: source.casa, data: date, partidos: [...parties].sort() })
      continue
    }
    let previousParty: string | null = null
    for (const observation of source.mudancas) {
      const party = observation.partido.trim().toUpperCase()
      const date = observation.data_inicio
      if (previousParty !== null && previousParty !== party) {
        transitions.push({
          partido_anterior: previousParty,
          partido_novo: party,
          data_mudanca: date,
          ano: Number(date.slice(0, 4)),
          casa: source.casa,
          id_oficial: source.id_oficial,
          url: source.url,
          sha256: source.sha256,
        })
      }
      previousParty = party
    }
  }
  return { transicoes: transitions, ambiguidades }
}

/** Production ingest API. Reads official sources, plans in dry-run, and audits all writes. */
export async function ingestPartidosParlamentares(options: OpcoesColetaPartidosParlamentares = {}): Promise<IngestResult[]> {
  const [{ loadCandidatosPublicos, resolveCandidatoId }, { supabase }, { emDryRun, planejarEscrita }, { escreverAuditado }] = await Promise.all([
    import("./helpers-db"), import("./supabase"), import("./dry-run"), import("./escrita-auditada"),
  ])
  const targets = options.targetSlugs?.length ? new Set(options.targetSlugs) : null
  const candidates = selecionarCandidatosPartidarios(await loadCandidatosPublicos(), (candidate) =>
    (!targets || targets.has(candidate.slug)) && (!options.cohortPredicate || options.cohortPredicate(candidate)),
  )
  // One complete official roster sweep per process; name-derived IDs remain
  // shadow-only unless Jev Noul is above the acceptance threshold.
  const discovery = await discoverParliamentaryIdsByName(candidates, { targetSlugs: options.targetSlugs })
  const results: IngestResult[] = []
  for (const candidate of candidates) {
    const started = Date.now()
    const result: IngestResult = {
      source: "partidos-parlamentares",
      candidato: candidate.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }
    try {
      const candidateId = await resolveCandidatoId(candidate.slug)
      if (!candidateId) throw new Error("candidato_id ausente no banco")
      const discovered = discovery.porSlug.get(candidate.slug)
      const effectiveCandidate = {
        ...candidate,
        ids: {
          ...candidate.ids,
          camara: candidate.ids.camara ?? (discovered?.camara?.status === "id_oficial" ? discovered.camara.id_oficial : null),
          senado: candidate.ids.senado ?? (discovered?.senado?.status === "id_oficial" ? discovered.senado.id_oficial : null),
        },
      }
      const receipt = await coletarHistoricoPartidarioParlamentar(effectiveCandidate, {
        candidatoId: candidateId,
        provaSemIdPorCasa: discovery.provaSemIdPorSlug.get(candidate.slug),
        descoberta: discovery,
      })
      result.coleta_detalhe = receipt.detalhe
      result.coleta_url = receipt.fontes.find((source) => source.url)?.url ?? undefined
      if (receipt.resultado === "erro" || receipt.resultado === "indisponivel") {
        result.errors.push(receipt.detalhe)
      } else if (receipt.resultado === "indeterminado") {
        result.coleta_resultado = "indeterminado"
      } else {
        const { transicoes: transitions, ambiguidades } = transitionsFromSources(receipt)
        if (ambiguidades.length) {
          const detail = JSON.parse(receipt.detalhe) as Record<string, unknown>
          result.coleta_detalhe = JSON.stringify({ ...detail, ambiguidades_temporais: ambiguidades })
        }
        const classification = classificarResultadoPartidario(receipt, transitions.length, ambiguidades.length)
        const detail = JSON.parse(result.coleta_detalhe ?? receipt.detalhe) as Record<string, unknown>
        result.coleta_detalhe = JSON.stringify({
          ...detail,
          observacoes_parlamentares: receipt.volume,
          transicoes_detectadas: transitions.length,
          resultado_historico: classification.resultado,
          motivo_resultado_historico: classification.motivo,
        })
        const { data: existingRows, error: readError } = await supabase
          .from("mudancas_partido")
          .select("id,partido_anterior,partido_novo,ano,data_mudanca,contexto,despublicado_em")
          .eq("candidato_id", candidateId)
        if (readError) throw new Error(`mudancas_partido readback: ${readError.message}`)

        const pendingRows: Array<Record<string, unknown>> = []
        for (const change of transitions) {
          const collision = (existingRows ?? []).find((row) => row.ano === change.ano && row.partido_novo === change.partido_novo)
          if (collision) continue
          pendingRows.push({
            candidato_id: candidateId,
            partido_anterior: change.partido_anterior,
            partido_novo: change.partido_novo,
            data_mudanca: change.data_mudanca,
            ano: change.ano,
            contexto: `Fonte parlamentar oficial (${change.casa}; ID ${change.id_oficial}); ${change.url}; SHA-256 ${change.sha256}`,
          })
        }

        if (pendingRows.length) {
          if (emDryRun()) {
            for (const row of pendingRows) {
              planejarEscrita({
                fonte: FONTE_MUDANCAS_PARTIDO_PARLAMENTAR,
                tabela: "mudancas_partido",
                operacao: "insert",
                alvo: candidate.slug,
                identidade: `id:${candidateId}`,
                chave: { candidato_id: candidateId, ano: row.ano, partido_novo: row.partido_novo },
                valores: row,
              })
            }
            // Planned rows are reported by the dry-run planner, not as persisted writes.
          } else {
            const inserted = await escreverAuditado(
              {
                script: "ingest-partidos-parlamentares",
                tabela: "mudancas_partido",
                motivo: "Coletar transições partidárias datadas em fontes oficiais das Casas do Congresso",
                recorte: candidate.slug,
              },
              () => supabase.from("mudancas_partido").insert(pendingRows).select("id"),
            )
            result.rows_upserted = inserted.length
            if (inserted.length) result.tables_updated.push("mudancas_partido")
          }
        }
        result.coleta_resultado = classification.resultado
        if (classification.volume > 0) result.coleta_volume = classification.volume
      }
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error))
      result.coleta_resultado = "erro"
    }
    result.duration_ms = Date.now() - started
    results.push(result)
  }
  return results
}

async function fetchOfficialJson(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(60_000) })
  return { status: response.status, body: await response.text() }
}
