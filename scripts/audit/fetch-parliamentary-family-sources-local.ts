/**
 * Captura local, somente leitura, das fontes parlamentares oficiais.
 *
 * Este programa não conhece Supabase e não grava dados do produto. Cada
 * resposta é preservada como bytes recebidos. Para consultas paginadas, o
 * manifesto aponta para as páginas brutas e para um bundle derivado que o
 * coletor de recibos pode ler. A completude do bundle só é declarada quando a
 * API encerra a paginação; uma resposta XML/CSV sem adaptador é pendência.
 *
 * A lista de candidatos é o universo nominal. A identidade vem exclusivamente
 * de ids.camara e ids.senado. Um roster atual não é usado como prova de
 * completude histórica: ele é rotulado como legislatura atual e a cobertura
 * histórica permanece indeterminada.
 */

import { createHash } from "node:crypto"
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { spawnSync } from "node:child_process"
import { execFileSync } from "node:child_process"
import { aggregateCamaraCotaCsv, CAMARA_COTA_CSV_URL } from "../lib/ingest-camara-cota-csv"
import { decodeCeapsCsv, normalizeCeapsCsvAmount, parseCeapsCsvRecords } from "../lib/ceaps-csv-encoding"
import { normalizeForMatch } from "../lib/normalize-for-match"
import { stripAccents } from "../../src/lib/strip-accents"
import { parseSenadoLegislatureRoster, senadoExpenseLegislatureForYear, senadoLegislatureRosterUrl, SENADO_EXPENSE_LEGISLATURES } from "../lib/senado-legislature-roster"
import { assertOutsideRepository } from "./lib/private-output"

type House = "camara" | "senado"
type Family = "projetos_lei" | "votos_candidato" | "gastos_parlamentares"
type Candidate = { slug: string; candidato_id?: string; nome_completo?: string; ids?: { camara?: number | string | null; senado?: number | string | null } }
type Page = { page: number; url: string; path: string; bytes: number; sha256: string; rows: number; complete: boolean; source_sha256?: string }
type Pending = { house: House; family: Family; official_id?: string; reason: string; source?: string }
type Readback = { dto_path: string; dto_rows_path: string[]; profile_path: string; dto_revision: string; dto_readback_url: string }
type ReadbackIndex = Record<string, Readback>
type JevIdentityContext = {
  nome_completo?: string
  uf?: string
  partido?: string
  mandato_anos?: string[]
  fontes: { perfil_url_local?: string; profile_sha256?: string; roster_url?: string; roster_sha256?: string; mandatos_url?: string; mandatos_sha256?: string; mandatos_error?: string }
}

const CAMARA = "https://dadosabertos.camara.leg.br/api/v2"
const SENADO = "https://legis.senado.leg.br/dadosabertos"
const CEAPS = "https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps"
const MAX_BYTES = 200_000_000
let cacheRoot: string | null = null
const camaraCotaCache = new Map<number, { digest: string; parsed: Map<string, ReturnType<typeof aggregateCamaraCotaCsv> extends Map<string, infer T> ? T : never> }>()

function option(name: string): string | null {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
}

function sha256(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex") }

function id(value: unknown): string | null {
  const normalized = String(value ?? "").trim()
  return /^\d+$/.test(normalized) ? normalized : null
}

function officialUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== "https:" || ![
    "dadosabertos.camara.leg.br",
    "legis.senado.leg.br",
    "adm.senado.gov.br",
    "www.senado.leg.br",
    "www.camara.leg.br",
  ].includes(url.hostname)) throw new Error(`endpoint oficial rejeitado: ${value}`)
  return url
}

/** Metadados da página sem os bytes decodificados. */
function stripValue<T extends { value: unknown }>(item: T): Omit<T, "value"> {
  const copy: Partial<T> = { ...item }
  delete copy.value
  return copy as Omit<T, "value">
}

function privateDestination(value: string): string {
  const destination = assertOutsideRepository(value, "destino")
  mkdirSync(destination, { recursive: true, mode: 0o700 })
  return destination
}

function readCandidates(path: string): Candidate[] {
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown
  if (!Array.isArray(value)) throw new Error("candidatos precisa ser uma lista JSON")
  return value.filter((candidate): candidate is Candidate => Boolean(candidate && typeof candidate === "object" && typeof (candidate as Candidate).slug === "string"))
}

export function parseSlugList(contents: string): string[] {
  const slugs = contents.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
  if (!slugs.length || slugs.some((slug) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) throw new Error("--slugs-file precisa conter slugs válidos, um por linha")
  if (new Set(slugs).size !== slugs.length) throw new Error("--slugs-file contém slug duplicado")
  return slugs
}

export function filterCandidatesBySlugs(candidates: Candidate[], slugs: string[]): Candidate[] {
  const bySlug = new Map(candidates.map((candidate) => [candidate.slug, candidate]))
  const missing = slugs.filter((slug) => !bySlug.has(slug))
  if (missing.length) throw new Error(`--slugs-file contém slug ausente do roster (${missing.length})`)
  const selected = new Set(slugs)
  return candidates.filter((candidate) => selected.has(candidate.slug))
}

export function camaraLegislatureForYear(year: number): number {
  if (year >= 2008 && year <= 2010) return 53
  if (year >= 2011 && year <= 2014) return 54
  if (year >= 2015 && year <= 2018) return 55
  if (year >= 2019 && year <= 2022) return 56
  if (year >= 2023 && year <= 2026) return 57
  throw new Error(`ano sem legislatura mapeada: ${year}`)
}

function readVoteIds(path: string | null): string[] {
  if (!path) return []
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown
  const rows = Array.isArray(value) ? value : (value && typeof value === "object" && Array.isArray((value as { votacoes?: unknown[] }).votacoes) ? (value as { votacoes: unknown[] }).votacoes : [])
  return [...new Set(rows.map((row) => typeof row === "string" ? row : (row && typeof row === "object" ? (row as Record<string, unknown>).votacao_id_api ?? (row as Record<string, unknown>).id : null)).map(voteId).filter((value): value is string => value !== null))]
}

export function parseSenadoVoteIds(contents: string): string[] {
  const value = JSON.parse(contents) as unknown
  if (!Array.isArray(value) || value.length === 0) throw new Error("--senado-votacoes exige um JSON privado com array não vazio de CodigoSessaoVotacao")
  const ids = value.map((raw) => String(raw ?? "").trim())
  if (ids.some((id) => !/^\d+$/.test(id))) throw new Error("CodigoSessaoVotacao inválido no arquivo --senado-votacoes")
  if (new Set(ids).size !== ids.length) throw new Error("CodigoSessaoVotacao duplicado no arquivo --senado-votacoes")
  return ids
}

function normalizeSenadoNominalVote(value: unknown): string | null {
  const normalized = stripAccents(String(value ?? "")).trim().toLowerCase()
  if (normalized === "sim") return "sim"
  if (normalized === "nao") return "não"
  if (normalized.startsWith("absten")) return "abstenção"
  if (normalized.startsWith("obstr")) return "obstrução"
  return null
}

function selectSenadoVoteRows(payload: unknown, officialId: string, selectedIds: string[]): Record<string, unknown>[] {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}
  const parlament = (root.VotacaoParlamentar as Record<string, unknown> | undefined)?.Parlamentar as Record<string, unknown> | undefined
  if (String(parlament?.Codigo ?? "").trim() !== officialId) throw new Error("endpoint Senado retornou Codigo parlamentar divergente")
  const rawRows = ((parlament?.Votacoes as Record<string, unknown> | undefined)?.Votacao)
  if (!Array.isArray(rawRows) || rawRows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("endpoint Senado sem lista nominal Votacao explícita")
  const selected = new Set(selectedIds)
  const seen = new Set<string>()
  const rows: Record<string, unknown>[] = []
  for (const raw of rawRows as Record<string, unknown>[]) {
    const event = String(raw.CodigoSessaoVotacao ?? "").trim()
    if (!selected.has(event)) continue
    if (seen.has(event)) throw new Error(`CodigoSessaoVotacao duplicado na fonte Senado: ${event}`)
    seen.add(event)
    const label = String(raw.SiglaDescricaoVoto ?? "").trim()
    if (stripAccents(label).toLowerCase() === "votou") throw new Error(`Votou não publica polaridade individual: ${event}`)
    const vote = normalizeSenadoNominalVote(label)
    if (vote === null) continue
    rows.push({ ...raw, CodigoParlamentar: officialId, vote_id_api: event, voto: vote })
  }
  return rows
}

/** ID de votação da Câmara na API v2: `<idProposicao>-<sequência>` (ex.: 2270800-135). */
export function voteId(value: unknown): string | null {
  const normalized = String(value ?? "").trim()
  return /^\d+-\d+$/.test(normalized) ? normalized : null
}

function readReadbacks(path: string | null): ReadbackIndex {
  if (!path) return {}
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? ((value as { readbacks?: unknown }).readbacks ?? value)
    : {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("readback precisa ser um mapa house:id:family")
  const result: ReadbackIndex = {}
  for (const [key, candidate] of Object.entries(raw)) {
    if (!candidate || typeof candidate !== "object") continue
    const item = candidate as Partial<Readback>
    if (typeof item.dto_path === "string" && Array.isArray(item.dto_rows_path) && typeof item.profile_path === "string" && typeof item.dto_revision === "string" && typeof item.dto_readback_url === "string") {
      result[key] = { dto_path: resolve(item.dto_path), dto_rows_path: item.dto_rows_path.map(String), profile_path: resolve(item.profile_path), dto_revision: item.dto_revision, dto_readback_url: item.dto_readback_url }
    }
  }
  return result
}

function readbackFromPublicProfiles(path: string, destination: string, candidates: Candidate[]): ReadbackIndex {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
  if (!Array.isArray(parsed)) throw new Error("--public-profiles exige lista de perfis públicos")
  const bySlug = new Map<string, Record<string, unknown>>()
  for (const raw of parsed) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("perfil público inválido")
    const profile = raw as Record<string, unknown>
    if (typeof profile.slug !== "string" || typeof profile.id !== "string" || !profile.id || bySlug.has(profile.slug)) {
      throw new Error("slug/id público ausente ou duplicado")
    }
    bySlug.set(profile.slug, profile)
  }
  const result: ReadbackIndex = {}
  for (const candidate of candidates) {
    if (!candidate.ids?.camara && !candidate.ids?.senado) continue
    const profile = bySlug.get(candidate.slug)
    if (!profile) continue
    candidate.candidato_id = profile.id as string
    const dir = join(destination, "readbacks", sha256(Buffer.from(candidate.slug, "utf8")))
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const profileBytes = Buffer.from(`${JSON.stringify(profile)}\n`)
    const profilePath = join(dir, "profile.json")
    writeFileSync(profilePath, profileBytes, { mode: 0o600, flag: "wx" })
    for (const family of ["projetos_lei", "votos_candidato", "gastos_parlamentares"] as const) {
      const key = family === "votos_candidato" ? "votos" : family
      if (!Array.isArray(profile[key])) continue
      const dtoBytes = Buffer.from(`${JSON.stringify({ dados: profile[key] })}\n`)
      const dtoPath = join(dir, `${family}.json`)
      writeFileSync(dtoPath, dtoBytes, { mode: 0o600, flag: "wx" })
      for (const house of ["camara", "senado"] as const) {
        const officialId = id(candidate.ids[house])
        if (!officialId) continue
        result[`${house}:${officialId}:${family}`] = {
          dto_path: dtoPath, dto_rows_path: ["dados"], profile_path: profilePath,
          dto_revision: `sha256:${sha256(dtoBytes)}`, dto_readback_url: `local-public-profile-snapshot:${resolve(path)}`,
        }
      }
    }
  }
  return result
}

async function fetchRaw(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const parsed = officialUrl(url)
  const response = await fetch(parsed, { signal: AbortSignal.timeout(120_000), headers: { Accept: "application/json" } })
  const contentType = response.headers.get("content-type") ?? ""
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  if (bytes.length > MAX_BYTES) throw new Error(`${url}: resposta excede ${MAX_BYTES} bytes`)
  if (!/json/i.test(contentType)) throw new Error(`${url}: formato não JSON (${contentType || "sem content-type"}); XML/CSV permanece unresolved`)
  try { JSON.parse(bytes.toString("utf8")) } catch { throw new Error(`${url}: JSON inválido; XML/CSV permanece unresolved`) }
  return { bytes, contentType }
}

async function fetchZip(url: string): Promise<Buffer> {
  const response = await fetch(officialUrl(url), { signal: AbortSignal.timeout(45_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error(`ZIP vazio ou acima do limite: ${url}`)
  return bytes
}

function unzipCsv(bytes: Buffer): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "pf-cota-proof-"))
  chmodSync(dir, 0o700)
  const zip = join(dir, "snapshot.zip")
  try {
    writeFileSync(zip, bytes, { mode: 0o600 })
    return execFileSync("unzip", ["-p", zip], { maxBuffer: 512 * 1024 * 1024 })
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

async function writeCotaAggregatePages(destination: string, officialId: string, rows: Record<string, unknown>[], revisions: Array<{ url: string; sha256: string; year: number }>): Promise<Array<Page & { value: unknown }>> {
  const relative = `familias/camara/${officialId}/gastos_parlamentares`
  const value = { CotaRows: rows, complete: true, total: rows.length, source_revisions: revisions }
  const bytes = Buffer.from(JSON.stringify(value))
  const path = join(destination, relative, "pagina-1.json")
  mkdirSync(join(destination, relative), { recursive: true, mode: 0o700 })
  writeFileSync(path, bytes, { mode: 0o600 })
  return [{ page: 1, url: CAMARA_COTA_CSV_URL(revisions[0]!.year), path, bytes: bytes.length, sha256: sha256(bytes), rows: rows.length, complete: true, source_sha256: sha256(Buffer.from(JSON.stringify(revisions))), value }]
}

function rowsOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === "object" && Array.isArray((value as { CotaRows?: unknown[] }).CotaRows)) return (value as { CotaRows: unknown[] }).CotaRows
  if (value && typeof value === "object" && Array.isArray((value as { CeapsRows?: unknown[] }).CeapsRows)) return (value as { CeapsRows: unknown[] }).CeapsRows
  if (value && typeof value === "object" && Array.isArray((value as { dados?: unknown[] }).dados)) return (value as { dados: unknown[] }).dados
  if (value && typeof value === "object" && Array.isArray((value as { DespesasSenador?: unknown[] }).DespesasSenador)) return (value as { DespesasSenador: unknown[] }).DespesasSenador
  const root = value && typeof value === "object" ? value as Record<string, unknown> : {}
  for (const [envelope, group, rowKey] of [["MateriasAutoriaParlamentar", "Autorias", "Autoria"], ["VotacaoParlamentar", "Votacoes", "Votacao"]] as const) {
    if (!(envelope in root)) continue
    const parlamentar = (root[envelope] as { Parlamentar?: { Codigo?: unknown; [key: string]: unknown } } | undefined)?.Parlamentar
    const container = parlamentar?.[group] as Record<string, unknown> | undefined
    const rows = container?.[rowKey]
    if (!Array.isArray(rows) || !/^\d+$/.test(String(parlamentar?.Codigo ?? ""))) throw new Error(`formato ${envelope} sem ${group}.${rowKey} e ID`)
    return rows.map((row) => row && typeof row === "object" && !Array.isArray(row)
      ? { ...(row as Record<string, unknown>), CodigoParlamentar: String(parlamentar?.Codigo) }
      : row)
  }
  return []
}

/**
 * The Senado individual authorship endpoint returns the senator's complete
 * authorship list in one response. It does not expose the Câmara-style
 * `pagina`/`itens` protocol; adding those parameters returns the same complete
 * payload. Validate the envelope and parliamentarian ID before treating that
 * single response as a complete source.
 */
export function senateAuthorshipRows(value: unknown, officialId: string): unknown[] {
  const root = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const parliamentarian = (root.MateriasAutoriaParlamentar as Record<string, unknown> | undefined)?.Parlamentar as Record<string, unknown> | undefined
  if (String(parliamentarian?.Codigo ?? "").trim() !== officialId) {
    throw new Error("endpoint de autorias do Senado sem confirmação do CodigoParlamentar consultado")
  }
  const authorship = (parliamentarian?.Autorias as Record<string, unknown> | undefined)?.Autoria
  if (!Array.isArray(authorship) || authorship.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error("endpoint de autorias do Senado sem lista completa Autorias.Autoria explícita")
  }
  return authorship.map((row) => ({ ...(row as Record<string, unknown>), CodigoParlamentar: officialId }))
}

function hasNext(value: unknown, rowCount: number): boolean {
  if (Array.isArray(value)) return false
  if (value && typeof value === "object" && ("MateriasAutoriaParlamentar" in value || "VotacaoParlamentar" in value)) return false
  if (value && typeof value === "object" && Array.isArray((value as { links?: unknown[] }).links)) {
    return (value as { links: Array<{ rel?: string }> }).links.some((link) => link.rel === "next")
  }
  return rowCount >= 100
}

async function capturePage(destination: string, relative: string, page: number, url: string): Promise<Page & { value: unknown }> {
  const cached = cacheRoot ? join(cacheRoot, relative, `pagina-${page}.json`) : null
  const result = cached && existsSync(cached)
    ? { bytes: readFileSync(cached), contentType: "application/json" }
    : await fetchRaw(url)
  const path = join(destination, relative, `pagina-${page}.json`)
  mkdirSync(resolve(path, ".."), { recursive: true, mode: 0o700 })
  writeFileSync(path, result.bytes, { mode: 0o600, flag: "wx" })
  const value = JSON.parse(result.bytes.toString("utf8")) as unknown
  const rows = rowsOf(value).length
  return { page, url, path, bytes: result.bytes.length, sha256: sha256(result.bytes), rows, complete: !hasNext(value, rows), value }
}

type CeapsSafeRow = { ANO: string; MES: string; SENADOR: string; TIPO_DESPESA: string; FORNECEDOR: string; DATA: string; VALOR_REEMBOLSADO: string }

export function parseCeapsRows(bytes: Buffer, year: number): CeapsSafeRow[] {
  const { header, rows } = parseCeapsCsvRecords(decodeCeapsCsv(bytes))
  const required = ["ANO", "MES", "SENADOR", "TIPO_DESPESA", "FORNECEDOR", "DATA", "VALOR_REEMBOLSADO"]
  if (required.some((column) => !header.includes(column))) throw new Error(`CSV CEAPS ${year}: esquema ausente`)
  if (rows.length === 0) throw new Error(`CSV CEAPS ${year}: sem linhas; escopo não comprovado`)
  return rows.map((row, index) => {
    const amount = normalizeCeapsCsvAmount(row.VALOR_REEMBOLSADO)
    if (Number(row.ANO) !== year || !row.SENADOR?.trim() || parseCsvMoney(amount) === null) {
      throw new Error(`CSV CEAPS ${year}: registro ${index + 1} inválido; nenhum vazio confirmado`)
    }
    // The untouched source is hashed in memory; private captures contain only these non-document columns.
    return { ANO: row.ANO, MES: row.MES, SENADOR: row.SENADOR, TIPO_DESPESA: row.TIPO_DESPESA, FORNECEDOR: row.FORNECEDOR, DATA: row.DATA, VALOR_REEMBOLSADO: amount }
  })
}

function parseCsvMoney(value: string | undefined): number | null {
  if (!value?.trim()) return null
  let normalized = value.trim()
  if (normalized.includes(",")) {
    if (!/^-?(?:(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{0,2})?|,\d{1,2})$/.test(normalized)) return null
    normalized = normalized.replace(/\./g, "")
    if (normalized.startsWith(",")) normalized = `0${normalized}`
    else if (normalized.startsWith("-,")) normalized = normalized.replace("-,", "-0,")
    if (normalized.endsWith(",")) normalized += "0"
    normalized = normalized.replace(",", ".")
  }
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : null
}

async function captureCeapsCsv(destination: string, year: number): Promise<Page & { value: unknown }> {
  const url = `${CEAPS}_${year}.csv`
  const response = await fetch(officialUrl(url), { signal: AbortSignal.timeout(120_000), headers: { Accept: "text/csv, application/octet-stream" } })
  const sourceBytes = Buffer.from(await response.arrayBuffer())
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  if (sourceBytes.length > MAX_BYTES) throw new Error(`${url}: resposta excede ${MAX_BYTES} bytes`)
  const sourceSha256 = sha256(sourceBytes)
  const rows = parseCeapsRows(sourceBytes, year)
  const sanitizedBytes = Buffer.from(`${JSON.stringify({ CeapsRows: rows })}\n`, "utf8")
  const path = join(destination, `fontes/ceaps/${year}/pagina-1.json`)
  mkdirSync(resolve(path, ".."), { recursive: true, mode: 0o700 })
  writeFileSync(path, sanitizedBytes, { mode: 0o600, flag: "wx" })
  return { page: 1, url, path, bytes: sanitizedBytes.length, sha256: sha256(sanitizedBytes), source_sha256: sourceSha256, rows: rows.length, complete: true, value: { CeapsRows: rows } }
}

function senatorNameFromRoster(value: unknown, officialId: string): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) { const found = senatorNameFromRoster(entry, officialId); if (found) return found }
    return null
  }
  const record = value && typeof value === "object" ? value as Record<string, unknown> : null
  if (!record) return null
  if (String(record.CodigoParlamentar ?? "") === officialId && typeof record.NomeParlamentar === "string" && record.NomeParlamentar.trim()) return record.NomeParlamentar.trim()
  for (const child of Object.values(record)) { const found = senatorNameFromRoster(child, officialId); if (found) return found }
  return null
}

function senateRecordFromRoster(value: unknown, officialId: string): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const entry of value) { const found = senateRecordFromRoster(entry, officialId); if (found) return found }
    return null
  }
  const record = value && typeof value === "object" ? value as Record<string, unknown> : null
  if (!record) return null
  if (String(record.CodigoParlamentar ?? "") === officialId) return record
  for (const child of Object.values(record)) { const found = senateRecordFromRoster(child, officialId); if (found) return found }
  return null
}

function parseSenateMandateYears(value: unknown): { years: string[]; uf?: string } {
  const top = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const root = top.MandatoParlamentar && typeof top.MandatoParlamentar === "object" ? top.MandatoParlamentar as Record<string, unknown> : {}
  const parliamentarian = root.Parlamentar && typeof root.Parlamentar === "object" ? root.Parlamentar as Record<string, unknown> : {}
  const mandateContainer = parliamentarian.Mandatos && typeof parliamentarian.Mandatos === "object" ? parliamentarian.Mandatos as Record<string, unknown> : {}
  const raw = mandateContainer.Mandato
  const mandates = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : []
  const periods = mandates.flatMap((entry) => {
    const mandate = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}
    return [mandate.PrimeiraLegislaturaDoMandato, mandate.SegundaLegislaturaDoMandato].flatMap((legislature) => {
      const term = legislature && typeof legislature === "object" ? legislature as Record<string, unknown> : {}
      const start = typeof term.DataInicio === "string" ? term.DataInicio.slice(0, 4) : ""
      const end = typeof term.DataFim === "string" ? term.DataFim.slice(0, 4) : ""
      return /^\d{4}$/.test(start) && /^\d{4}$/.test(end) ? [`${start}-${end}`] : []
    })
  })
  const uf = typeof mandates[0]?.UfParlamentar === "string" && mandates[0].UfParlamentar.trim() ? mandates[0].UfParlamentar.trim() : undefined
  return { years: [...new Set(periods)], ...(uf ? { uf } : {}) }
}

async function jevIdentityContext(
  candidate: Candidate,
  officialId: string,
  roster: Page & { value: unknown },
  readbacks: ReadbackIndex,
): Promise<JevIdentityContext> {
  const profileReadback = Object.entries(readbacks).find(([key]) => key.startsWith(`senado:${officialId}:`))?.[1]
  let profile: Record<string, unknown> = {}
  const fontes: JevIdentityContext["fontes"] = { roster_url: roster.url, roster_sha256: roster.sha256 }
  let mandatoAnos: string[] | undefined
  if (profileReadback) {
    const bytes = readFileSync(profileReadback.profile_path)
    const parsed = JSON.parse(bytes.toString("utf8")) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) profile = parsed as Record<string, unknown>
    fontes.perfil_url_local = profileReadback.dto_readback_url
    fontes.profile_sha256 = sha256(bytes)
  }
  let mandatoUf: string | undefined
  try {
    const mandatosUrl = `${SENADO}/senador/${officialId}/mandatos.json`
    const response = await fetch(officialUrl(mandatosUrl), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) })
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const mandates = parseSenateMandateYears(JSON.parse(bytes.toString("utf8")) as unknown)
    fontes.mandatos_url = mandatosUrl
    fontes.mandatos_sha256 = sha256(bytes)
    if (mandates.years.length) mandatoAnos = mandates.years
    mandatoUf = mandates.uf
  } catch (error) {
    fontes.mandatos_error = error instanceof Error ? error.message : String(error)
  }
  const official = senateRecordFromRoster(roster.value, officialId)
  const chooseText = (...values: unknown[]): string | undefined => values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim()
  const identity = {
    nome_completo: chooseText(profile.nome_completo, official?.NomeCompletoParlamentar, candidate.nome_completo),
    uf: chooseText(profile.estado, profile.uf, official?.UfParlamentar, mandatoUf),
    partido: chooseText(profile.partido_sigla, profile.partido_atual, official?.SiglaPartidoParlamentar),
    mandato_anos: mandatoAnos,
    fontes,
  }
  return Object.fromEntries(Object.entries(identity).filter(([, value]) => value !== undefined)) as JevIdentityContext
}

function normalizedName(value: string): string {
  return normalizeForMatch(value).replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}

function jevSamePerson(rosterName: string, candidate: Candidate, officialId: string, destination: string, identity: JevIdentityContext): number | null {
  const state = {
    registro: { senador: rosterName },
    candidato: {
      slug: candidate.slug,
      nome_completo: identity.nome_completo ?? candidate.nome_completo ?? "",
      id_senado: officialId,
      ...(identity.uf ? { uf: identity.uf } : {}),
      ...(identity.partido ? { partido: identity.partido } : {}),
      ...(identity.mandato_anos ? { mandato_anos: identity.mandato_anos } : {}),
    },
  }
  const questions = JSON.parse(readFileSync("scripts/data/ceaps-senado-identity-questions.json", "utf8")) as Record<string, unknown>
  const result = spawnSync("python3", [resolve(process.env.HOME ?? "", ".claude/scripts/jev.py"), "ask"], { input: JSON.stringify({ state, questions }), encoding: "utf8", timeout: 30_000 })
  if (result.status !== 0) return null
  try {
    const parsed = JSON.parse(result.stdout) as { answers?: { mesma_pessoa?: { noul?: number } } }
    const p = parsed.answers?.mesma_pessoa?.noul
    if (typeof p !== "number" || !Number.isFinite(p)) return null
    const line = `${JSON.stringify({ routine: "ceaps-senado-coverage", slug: candidate.slug, official_id: officialId, roster_name: rosterName, identity_context: state.candidato, identity_context_sources: identity.fontes, p_same_person: p, checked_at: new Date().toISOString() })}\n`
    appendFileSync(join(destination, "jev-shadow.jsonl"), line, { mode: 0o600 })
    chmodSync(join(destination, "jev-shadow.jsonl"), 0o600)
    if (p >= 0.35 && p <= 0.65) {
      appendFileSync(join(destination, "jev-review.jsonl"), line, { mode: 0o600 })
      chmodSync(join(destination, "jev-review.jsonl"), 0o600)
    }
    return p
  } catch { return null }
}

async function capturePaginated(destination: string, relative: string, baseUrl: string, params: Record<string, string>): Promise<Page[]> {
  const pages: Page[] = []
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({ ...params, itens: "100", pagina: String(page) })
    const captured = await capturePage(destination, relative, page, `${baseUrl}?${query}`)
    pages.push(captured)
    if (captured.complete) return pages
  }
}

function writeBundle(destination: string, relative: string, pages: Array<Page & { value: unknown }>): { path: string; sha256: string; bytes: number } {
  const rows = pages.flatMap((page) => rowsOf(page.value))
  const groups = new Map<string, Array<Page & { value: unknown }>>()
  for (const page of pages) {
    const url = new URL(page.url)
    url.searchParams.delete("pagina")
    const key = url.href
    groups.set(key, [...(groups.get(key) ?? []), page])
  }
  const complete = groups.size > 0 && [...groups.values()].every((group) =>
    group[group.length - 1]?.complete === true && group.slice(0, -1).every((page) => page.complete === false))
  // O total do bundle é derivado somente depois de todas as páginas de cada
  // consulta terminarem. O coletor ainda compara cada linha com o DTO público.
  const declaredTotal = complete ? rows.length : null
  const bundle = { schema_version: 1, complete, total: declaredTotal ?? (complete ? rows.length : null), derived_from_pages: pages.map(({ page, url, path, bytes, sha256: digest, complete: pageComplete, source_sha256 }) => ({ page, url, path, bytes, sha256: digest, complete: pageComplete, ...(source_sha256 ? { source_sha256 } : {}) })), dados: rows }
  const bytes = Buffer.from(`${JSON.stringify(bundle)}\n`, "utf8")
  const path = join(destination, relative, "bundle.json")
  mkdirSync(resolve(path, ".."), { recursive: true, mode: 0o700 })
  writeFileSync(path, bytes, { mode: 0o600, flag: "wx" })
  return { path, sha256: sha256(bytes), bytes: bytes.length }
}

function rowContainsId(row: unknown, officialId: string): boolean {
  if (Array.isArray(row)) return row.some((item) => rowContainsId(item, officialId))
  if (!row || typeof row !== "object") return false
  const record = row as Record<string, unknown>
  const deputy = record.deputado_ && typeof record.deputado_ === "object" ? record.deputado_ as Record<string, unknown> : null
  if (String(deputy?.id ?? "").trim() === officialId) return true
  for (const key of ["idDeputado", "idDeputadoAutor", "idParlamentar", "codSenador", "CodigoParlamentar", "codigoParlamentar", "idSenador"]) {
    if (String(record[key] ?? "").trim() === officialId) return true
  }
  for (const value of Object.values(record)) if (value && typeof value === "object" && rowContainsId(value, officialId)) return true
  return false
}

export function filterBundlePages(pages: Array<Page & { value: unknown }>, officialId: string): Array<Page & { value: unknown }> {
  return pages.map((page) => {
    if (Array.isArray(page.value)) return { ...page, value: page.value.filter((row) => rowContainsId(row, officialId)) }
    const value = page.value && typeof page.value === "object" ? { ...(page.value as Record<string, unknown>) } : page.value
    if (!value || typeof value !== "object") return page
    const root = value as Record<string, unknown>
    const voteIdMatch = page.url.match(/\/votacoes\/(\d+-\d+)\/votos/)
    for (const key of ["dados", "rows", "VotacaoParlamentar", "DespesasSenador"]) {
      if (Array.isArray(root[key])) root[key] = root[key].filter((row) => rowContainsId(row, officialId)).map((row) => voteIdMatch && row && typeof row === "object" ? { ...(row as Record<string, unknown>), vote_id_api: voteIdMatch[1] } : row)
    }
    return { ...page, value }
  })
}

export function familySource(house: House, family: Family, officialId: string): string {
  if (house === "camara") {
    if (family === "projetos_lei") return `${CAMARA}/proposicoes?idDeputadoAutor=${officialId}`
    if (family === "votos_candidato") return `${CAMARA}/votacoes/{votacao_id}/votos`
    return CAMARA_COTA_CSV_URL(2008)
  }
  if (family === "projetos_lei") return `${SENADO}/senador/${officialId}/autorias.json`
  if (family === "votos_candidato") return `${SENADO}/senador/${officialId}/votacoes.json`
  return `${CEAPS}/{ano}`
}

async function main(): Promise<void> {
  const destinationArg = option("destino")
  const candidatesPath = option("candidatos") ?? "data/candidatos.json"
  if (!destinationArg) throw new Error("uso: --destino=<pasta privada> [--candidatos=data/candidatos.json] --public-profiles=<snapshot-privado.json> [--slugs-file=<lista-privada.txt>] [--anos-ceaps=2008,2026] [--camara-votacoes=arquivo.json] [--senado-votacoes=arquivo.json]")
  const destination = privateDestination(destinationArg)
  cacheRoot = option("cache-dir") ? privateDestination(option("cache-dir")!) : null
  let candidates = readCandidates(candidatesPath)
  const slugsFile = option("slugs-file")
  if (slugsFile) candidates = filterCandidatesBySlugs(candidates, parseSlugList(readFileSync(slugsFile, "utf8")))
  const ceapsYears = (option("anos-ceaps") ?? Array.from({ length: 19 }, (_, index) => 2008 + index).join(",")).split(",").map(Number).filter((year) => Number.isInteger(year) && year >= 2008 && year <= 2026)
  const camaraVoteIds = readVoteIds(option("camara-votacoes"))
  const senadoVoteIdsPath = option("senado-votacoes")
  const senadoVoteIds = senadoVoteIdsPath ? parseSenadoVoteIds(readFileSync(senadoVoteIdsPath, "utf8")) : null
  const publicProfilesPath = option("public-profiles")
  const readbackPath = option("readback")
  if (Boolean(publicProfilesPath) === Boolean(readbackPath)) throw new Error("forneça exatamente um de --public-profiles ou --readback")
  const readbacks = publicProfilesPath
    ? readbackFromPublicProfiles(publicProfilesPath, destination, candidates)
    : readReadbacks(readbackPath)
  const observations: Array<Record<string, unknown>> = []
  const pending: Pending[] = []
  const ceapsByYear = new Map<number, Page & { value: unknown }>()
  const ceapsFailuresByYear = new Map<number, string>()
  const senateRosters = new Map<number, { page: Page & { value: unknown }; ids: ReadonlySet<string> }>()
  const senateRosterFailures = new Map<number, string>()
  if (candidates.some((candidate) => id(candidate.ids?.senado))) {
    for (const legislature of [53, 54, 55, 56, 57]) {
      try {
        const page = await capturePage(destination, `rosters/senado/legislatura-${legislature}`, 1, senadoLegislatureRosterUrl(legislature))
        const roster = parseSenadoLegislatureRoster(Buffer.from(JSON.stringify(page.value)), legislature)
        senateRosters.set(legislature, { page, ids: roster.ids })
      } catch (error) {
        senateRosterFailures.set(legislature, error instanceof Error ? error.message : String(error))
      }
    }
  }
  const addObservation = (input: { house: House; family: Family; officialId: string; sourceUrl: string; sourcePath: string; rowsPath: string[]; roster: Record<string, unknown>; rawPages: unknown[]; bundleSha256: string; extra?: Record<string, unknown> }): void => {
    const key = `${input.house}:${input.officialId}:${input.family}`
    const readback = readbacks[key]
    if (!readback) {
      pending.push({ house: input.house, family: input.family, official_id: input.officialId, reason: "readback DTO/perfil não fornecido; captura não pode virar recibo positivo", source: input.sourceUrl })
      return
    }
  observations.push({ house: input.house, family: input.family, official_id: input.officialId, roster: input.roster, source: { source_url: input.sourceUrl, source_path: input.sourcePath, rows_path: input.rowsPath, source_revisions: input.extra?.source_revisions, source_filter: input.extra?.source_filter, scope_evidence: input.extra?.scope_evidence, source_kind: input.extra?.source_kind, selected_vote_ids: input.extra?.selected_vote_ids, vote_catalog: input.extra?.vote_catalog }, readback, raw_pages: input.rawPages, source_bundle_sha256: input.bundleSha256, ...input.extra })
  }

  for (const candidate of candidates) {
    if (publicProfilesPath && !candidate.candidato_id) continue
    for (const house of ["camara", "senado"] as const) {
      const officialId = id(candidate.ids?.[house])
      if (!officialId) continue
      try {
      const rosterUrl = house === "camara" ? `${CAMARA}/deputados/${officialId}` : `${SENADO}/senador/${officialId}.json`
      const roster = await capturePage(destination, `rosters/${house}/${officialId}`, 1, rosterUrl)
      const rosterRef = { roster_url: rosterUrl, roster_revision: `captured:${roster.sha256}`, roster_path: roster.path, scope: "cohort_id_identity_only", historical_completeness: "unresolved" }

      if (house === "camara") {
        const projects = await capturePaginated(destination, `familias/${house}/${officialId}/projetos_lei`, `${CAMARA}/proposicoes`, { idDeputadoAutor: officialId, ordem: "DESC", ordenarPor: "id" })
        const projectsBundle = writeBundle(destination, `familias/${house}/${officialId}/projetos_lei`, projects as Array<Page & { value: unknown }>)
        addObservation({ house, family: "projetos_lei", officialId, sourceUrl: familySource(house, "projetos_lei", officialId), sourcePath: projectsBundle.path, rowsPath: ["dados"], roster: rosterRef, rawPages: (projects as Array<Page & { value: unknown }>).map(stripValue), bundleSha256: projectsBundle.sha256 })

        const revisions: Array<{ url: string; sha256: string; year: number }> = []
        const aggregates: Record<string, unknown>[] = []
        const cotaYears = Array.from({ length: 19 }, (_, index) => 2008 + index)
        for (const year of cotaYears) {
          const url = CAMARA_COTA_CSV_URL(year)
          let annual = camaraCotaCache.get(year)
          if (!annual) {
            const zip = await fetchZip(url)
            const digest = sha256(zip)
            const parsed = aggregateCamaraCotaCsv(unzipCsv(zip).toString("utf8"), year)
            annual = { digest, parsed }
            camaraCotaCache.set(year, annual)
          }
          revisions.push({ url, sha256: annual.digest, year })
          const aggregate = annual.parsed.get(officialId)
          if (aggregate) aggregates.push({ ideCadastro: officialId, ano: year, source_rows: aggregate.rowCount, total_gasto: aggregate.totalLiquido, categorias: [...aggregate.categories].map(([categoria, valor]) => ({ categoria, valor })) })
        }
        const csvPages = await writeCotaAggregatePages(destination, officialId, aggregates, revisions)
        const expensesBundle = writeBundle(destination, `familias/${house}/${officialId}/gastos_parlamentares`, csvPages)
        addObservation({ house, family: "gastos_parlamentares", officialId, sourceUrl: CAMARA_COTA_CSV_URL(cotaYears[0]!), sourcePath: expensesBundle.path, rowsPath: ["dados"], roster: rosterRef, rawPages: csvPages.map(stripValue), bundleSha256: expensesBundle.sha256, extra: { years: cotaYears, source_revisions: revisions, source_kind: "camara-cota-csv" } })
        if (camaraVoteIds.length === 0) {
          pending.push({ house, family: "votos_candidato", official_id: officialId, reason: "IDs exatos de votações-chave da Câmara não foram fornecidos", source: familySource(house, "votos_candidato", officialId) })
        } else {
          const pages: Array<Page & { value: unknown }> = []
          const voteCatalog: Array<{ vote_id_api: string; url: string; path: string; sha256: string }> = []
          for (const voteId of camaraVoteIds) {
            const base = `${CAMARA}/votacoes/${voteId}/votos`
            const collection = await capturePaginated(destination, `familias/${house}/${officialId}/votos_candidato/${voteId}`, base, {}) as Array<Page & { value: unknown }>
            if (collection.length === 0 || collection.some((page) => {
              const rows = (page.value as Record<string, unknown>)?.dados
              return !Array.isArray(rows)
            })) throw new Error(`lista nominal oficial vazia/inválida para votação ${voteId}`)
            // A lista nominal é a fonte da presença/ausência. Uma lista completa
            // sem a linha do deputado prova que ele não aparece naquela votação.
            pages.push(...filterBundlePages(collection, officialId))
            const metaUrl = `${CAMARA}/votacoes/${voteId}`
            const meta = await capturePage(destination, `familias/${house}/${officialId}/votos_candidato/${voteId}-metadata`, 1, metaUrl)
            const metaDados = (meta.value as Record<string, unknown>)?.dados as Record<string, unknown> | undefined
            if (!metaDados || String(metaDados.id) !== voteId || typeof metaDados.data !== "string") throw new Error(`metadados oficiais inválidos para votação ${voteId}`)
            voteCatalog.push({ vote_id_api: voteId, url: metaUrl, path: meta.path, sha256: meta.sha256 })
          }
          const filteredPages = pages
          const bundle = writeBundle(destination, `familias/${house}/${officialId}/votos_candidato`, filteredPages)
          const sourceRevisions = [
            ...filteredPages.map((page) => ({ url: page.url, sha256: page.sha256 })),
            ...voteCatalog.map(({ url, sha256 }) => ({ url, sha256 })),
          ]
          addObservation({ house, family: "votos_candidato", officialId, sourceUrl: `${CAMARA}/votacoes/{votacao_id}/votos`, sourcePath: bundle.path, rowsPath: ["dados"], roster: rosterRef, rawPages: filteredPages.map(stripValue), bundleSha256: bundle.sha256, extra: { vote_ids: camaraVoteIds, vote_catalog: voteCatalog, source_revisions: sourceRevisions } })
        }
      } else {
        for (const [family, url] of [["projetos_lei", `${SENADO}/senador/${officialId}/autorias.json`], ["votos_candidato", `${SENADO}/senador/${officialId}/votacoes.json`]] as const) {
          try {
            const page = await capturePage(destination, `familias/${house}/${officialId}/${family}`, 1, url)
            if (family === "projetos_lei") {
              const authorships = senateAuthorshipRows(page.value, officialId)
              const completePage = { ...page, rows: authorships.length, complete: true, value: { dados: authorships } }
              const bundle = writeBundle(destination, `familias/${house}/${officialId}/${family}`, [completePage])
              addObservation({ house, family, officialId, sourceUrl: url, sourcePath: bundle.path, rowsPath: ["dados"], roster: rosterRef, rawPages: [stripValue(page)], bundleSha256: bundle.sha256, extra: { source_kind: "senado-complete-authorship-single-response", source_revisions: [{ url: page.url, sha256: page.sha256 }] } })
            } else if (family === "votos_candidato" && senadoVoteIds) {
              const selected = selectSenadoVoteRows(page.value, officialId, senadoVoteIds)
              const filtered = { ...page, value: { dados: selected }, rows: selected.length, complete: true }
              const bundle = writeBundle(destination, `familias/${house}/${officialId}/${family}`, [filtered])
              addObservation({ house, family, officialId, sourceUrl: url, sourcePath: bundle.path, rowsPath: ["dados"], roster: rosterRef, rawPages: [stripValue(page)], bundleSha256: bundle.sha256, extra: { source_kind: "senado-selected-votes", selected_vote_ids: senadoVoteIds, source_revisions: [{ url: page.url, sha256: page.sha256 }] } })
            } else {
              const bundle = writeBundle(destination, `familias/${house}/${officialId}/${family}`, [page])
              addObservation({ house, family, officialId, sourceUrl: url, sourcePath: bundle.path, rowsPath: ["dados"], roster: rosterRef, rawPages: [((stripValue)(page))], bundleSha256: bundle.sha256 })
            }
          } catch (error) {
            pending.push({ house, family, official_id: officialId, reason: error instanceof Error ? error.message : String(error), source: url })
          }
        }
        try {
          const rosterName = senatorNameFromRoster(roster.value, officialId)
          if (!rosterName) throw new Error("roster Senado não confirmou NomeParlamentar para o ID consultado")
          const identity = await jevIdentityContext(candidate, officialId, roster, readbacks)
          const identityP = jevSamePerson(rosterName, candidate, officialId, destination, identity)
          if (identityP === null) throw new Error("Jev indisponível; identidade Senado/seed não confirmada")
          if (identityP >= 0.35 && identityP <= 0.65) throw new Error(`Jev Noul p=${identityP.toFixed(2)} enviado para revisão; sem atribuir dados CEAPS`)
          if (identityP < 0.35) throw new Error(`Jev Noul rejeitou identidade entre roster Senado e candidato (p=${identityP.toFixed(2)})`)
          const expensePages: Array<Page & { value: unknown }> = []
          const scopeRosters = [53, 54, 55, 56, 57].map((legislature) => {
            const roster = senateRosters.get(legislature)
            return {
              legislature,
              url: roster?.page.url ?? senadoLegislatureRosterUrl(legislature),
              path: roster?.page.path ?? null,
              sha256: roster?.page.sha256 ?? null,
              membership: roster ? roster.ids.has(officialId) : "unverified",
              years: [...SENADO_EXPENSE_LEGISLATURES[legislature]!],
              failure: senateRosterFailures.get(legislature) ?? null,
            }
          })
          const candidateCeapsYears = ceapsYears.filter((year) => {
            const roster = senateRosters.get(senadoExpenseLegislatureForYear(year))
            return !roster || roster.ids.has(officialId)
          })
          const excludedYears = ceapsYears.filter((year) => !candidateCeapsYears.includes(year))
          const scopeEvidence = { rosters: scopeRosters, scope_years: candidateCeapsYears, excluded_years: excludedYears }
          if (candidateCeapsYears.length === 0) {
            pending.push({
              house,
              family: "gastos_parlamentares",
              official_id: officialId,
              reason: ceapsYears.length
                ? `escopo CEAPS indeterminado: ID ausente nos rosters para todos os anos solicitados (${excludedYears.join(",")})`
                : "escopo CEAPS indeterminado: nenhum ano válido solicitado",
              source: ceapsYears.length ? `${CEAPS}_${ceapsYears[0]}.csv` : `${CEAPS}_{ano}.csv`,
            })
            continue
          }
          for (const year of candidateCeapsYears) {
            const priorFailure = ceapsFailuresByYear.get(year)
            if (priorFailure) throw new Error(priorFailure)
            let page = ceapsByYear.get(year)
            if (!page) {
              try {
                page = await captureCeapsCsv(destination, year)
              } catch (error) {
                const reason = error instanceof Error ? error.message : String(error)
                ceapsFailuresByYear.set(year, reason)
                throw error
              }
              ceapsByYear.set(year, page)
            }
            const data = page.value as { CeapsRows?: CeapsSafeRow[] }
            if (!Array.isArray(data.CeapsRows)) throw new Error(`CSV CEAPS ${year} sem linhas sanitizadas`)
            const matching = data.CeapsRows.filter((row) => normalizedName(row.SENADOR) === normalizedName(rosterName))
              .map((row) => ({ ...row, CodigoParlamentar: officialId }))
            expensePages.push({ ...page, value: { CeapsRows: matching }, rows: matching.length })
          }
          if (expensePages.length === 0) {
            pending.push({
              house,
              family: "gastos_parlamentares",
              official_id: officialId,
              reason: `escopo CEAPS indeterminado: nenhum CSV capturado para os anos elegíveis (${candidateCeapsYears.join(",")})`,
              source: candidateCeapsYears.length ? `${CEAPS}_${candidateCeapsYears[0]}.csv` : `${CEAPS}_{ano}.csv`,
            })
            continue
          }
          const expenseBundle = writeBundle(destination, `familias/${house}/${officialId}/gastos_parlamentares`, expensePages)
          const revisions = expensePages.map((page) => ({ url: page.url, sha256: page.source_sha256, year: Number(new URL(page.url).pathname.match(/(\d{4})\.csv$/)?.[1]) }))
          if (revisions.some((revision) => !revision.sha256 || !Number.isInteger(revision.year))) throw new Error("CSV CEAPS sem SHA de origem ou ano comprovado")
          const sourceUrl = expensePages.at(-1)!.url
          addObservation({ house, family: "gastos_parlamentares", officialId, sourceUrl, sourcePath: expenseBundle.path, rowsPath: ["dados"], roster: rosterRef, rawPages: expensePages.map(stripValue), bundleSha256: expenseBundle.sha256, extra: { years: candidateCeapsYears, scope_evidence: scopeEvidence, source_filter: { field: "SENADOR", value: rosterName, method: "official-roster-id-plus-Jev-Noul" }, jev_noul: identityP, source_revisions: revisions } })
        } catch (error) {
          pending.push({ house, family: "gastos_parlamentares", official_id: officialId, reason: error instanceof Error ? error.message : String(error), source: `${CEAPS}_{ano}.csv` })
        }
      }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        for (const family of ["projetos_lei", "votos_candidato", "gastos_parlamentares"] as const) {
          pending.push({ house, family, official_id: officialId, reason, source: familySource(house, family, officialId) })
        }
      }
    }
  }

  const cohortCandidates = publicProfilesPath ? candidates.filter((candidate) => Boolean(candidate.candidato_id)) : candidates
  const manifest = { schema_version: 1, generated_at: new Date().toISOString(), candidates_path: resolve(candidatesPath), candidates: cohortCandidates, observations, pending, limitations: ["roster atual/histórico não é usado como completude histórica", "CSV CEAPS não fornece ID; a atribuição nominal exige roster oficial do Senado e Jev Noul >= 0,65", "votos Câmara exigem lista local de IDs exatos"] }
  const manifestPath = join(destination, "parliamentary-family-sources.json")
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  console.log(JSON.stringify({ manifest: manifestPath, observations: observations.length, pending: pending.length, candidates: cohortCandidates.length }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
}
