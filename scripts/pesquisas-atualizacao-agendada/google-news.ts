import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, extname, resolve } from "node:path"
import { getEstadoNome, getEstadoUFs } from "../../src/lib/br-uf"
import { SaxesParser } from "saxes"

export const GOOGLE_NEWS_DISCOVERY_SCHEMA_VERSION = "google-news-discovery-v1"
export const GOOGLE_NEWS_RSS_ORIGIN = "https://news.google.com/rss/search"
export const INITIAL_DISCOVERY_DAYS = 14
export const CHECKPOINT_OVERLAP_DAYS = 2
export const DEFAULT_CONCURRENCY = 3
export const DEFAULT_TIMEOUT_MS = 15_000

export const GOOGLE_NEWS_SCOPES = [
  { code: "BR", label: "Brasil", kind: "national" as const },
  ...getEstadoUFs().map((uf) => ({ code: uf.toUpperCase(), label: getEstadoNome(uf)!, kind: "state" as const })),
] as const

export type GoogleNewsScope = (typeof GOOGLE_NEWS_SCOPES)[number]
export type DiscoveryWindow = "initial14days" | "checkpoint2days"

export interface GoogleNewsDiscoveryItem {
  identity_hash: string
  scope: string
  scopes: string[]
  title: string
  url: string
  source: string
  published_at: string | null
  discovered_at: string
  discovery_window: DiscoveryWindow
  date_basis: "published_at" | "unknown"
  status: "pending" | "received"
  evidence_status: "rss_discovery_only"
  raw_path: string
}

export interface GoogleNewsKnownItem extends GoogleNewsDiscoveryItem {
  first_seen_at: string
}

export interface GoogleNewsDiscoveryState {
  schema_version: typeof GOOGLE_NEWS_DISCOVERY_SCHEMA_VERSION
  checkpoints: Record<string, string>
  known: Record<string, GoogleNewsKnownItem>
  latest_by_url: Record<string, string>
}

export interface GoogleNewsScopeResult {
  scope: string
  label: string
  query_url: string
  status: "ok" | "error"
  window: DiscoveryWindow
  since: string
  checked_at: string | null
  raw_path: string | null
  rss_items: number
  queue_items: number
  error: string | null
}

export interface GoogleNewsDiscoveryQueue {
  schema_version: typeof GOOGLE_NEWS_DISCOVERY_SCHEMA_VERSION
  generated_at: string
  source: "google-news-rss"
  queue: {
    new: GoogleNewsDiscoveryItem[]
    changed: GoogleNewsDiscoveryItem[]
    pending: GoogleNewsDiscoveryItem[]
    pending_unchanged: GoogleNewsDiscoveryItem[]
  }
  summary: { new_count: number; changed_count: number; pending_count: number; pending_unchanged_count: number; error_count: number }
  scopes: GoogleNewsScopeResult[]
}

export interface GoogleNewsRunResult {
  state: GoogleNewsDiscoveryState
  queue: GoogleNewsDiscoveryQueue
}

export interface GoogleNewsDiscoverySummary {
  schema_version: typeof GOOGLE_NEWS_DISCOVERY_SCHEMA_VERSION
  generated_at: string
  source: "google-news-rss"
  queue_path: string
  counts: GoogleNewsDiscoveryQueue["summary"]
  scope_errors: Array<{ scope: string; error: string }>
}

export interface GoogleNewsRunOptions {
  statePath?: string
  outDir: string
  now?: string | Date
  offlineFixturePath?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  concurrency?: number
  scopes?: readonly GoogleNewsScope[]
}

export interface ParsedGoogleNewsDiscoveryItem {
  title: string
  url: string
  source: string
  published_at: string | null
}

interface ScopeFetchResult {
  scope: GoogleNewsScope
  queryUrl: string
  window: DiscoveryWindow
  since: Date
  checkedAt: string
  rawPath: string | null
  items: ParsedGoogleNewsDiscoveryItem[]
  error: string | null
}

interface OpenItem {
  title: string
  url: string
  source: string
  pubDate: string
}

function isoDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error(`data inválida: ${String(value)}`)
  return date.toISOString()
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000)
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "https:") return null
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function parsePublishedAt(value: string): string | null {
  const date = new Date(value.trim())
  return value.trim() && Number.isFinite(date.getTime()) ? date.toISOString() : null
}

/** Parse RSS with a real XML parser so CDATA, entities and malformed XML stay distinct. */
export function parseGoogleNewsDiscoveryRss(xml: string): ParsedGoogleNewsDiscoveryItem[] {
  if (!xml.trim()) throw new Error("invalidfeed: corpo vazio")
  const items: ParsedGoogleNewsDiscoveryItem[] = []
  const parser = new SaxesParser({ xmlns: false })
  let depth = 0
  let root: string | null = null
  let channelDepth: number | null = null
  let failed = false
  let current: OpenItem | null = null
  let field: keyof OpenItem | null = null

  parser.on("opentag", (tag) => {
    depth += 1
    const name = tag.name.toLowerCase()
    if (depth === 1) root = name
    if (name === "channel" && channelDepth === null) channelDepth = depth
    if (name === "item" && current === null) current = { title: "", url: "", source: "", pubDate: "" }
    if (current && field === null && (name === "title" || name === "link" || name === "source" || name === "pubdate")) {
      field = name === "link" ? "url" : name === "pubdate" ? "pubDate" : name
    }
  })
  const append = (value: string) => {
    if (current && field) current[field] += value
  }
  parser.on("text", append)
  parser.on("cdata", append)
  parser.on("closetag", (tag) => {
    const name = (typeof tag === "string" ? tag : tag.name).toLowerCase()
    if (current && field && ((field === "url" && name === "link") || (field === "pubDate" && name === "pubdate") || name === field.toLowerCase())) field = null
    if (name === "item" && current) {
      const title = normalizeTitle(current.title)
      const url = safeUrl(current.url)
      if (title && url) items.push({ title, url, source: normalizeTitle(current.source), published_at: parsePublishedAt(current.pubDate) })
      current = null
      field = null
    }
    depth -= 1
  })
  parser.on("error", () => { failed = true })
  try {
    parser.write(xml).close()
  } catch {
    failed = true
  }
  if (failed || root !== "rss" || channelDepth === null || depth !== 0) throw new Error("invalidfeed: XML RSS inválido")
  return items
}

export function buildGoogleNewsScopeUrl(scope: GoogleNewsScope, since: Date): string {
  const query = scope.kind === "national"
    ? `pesquisa de voto presidente Brasil after:${dateOnly(since)}`
    : `pesquisa de voto governo governador ${scope.label} after:${dateOnly(since)}`
  return `${GOOGLE_NEWS_RSS_ORIGIN}?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`
}

function stableIdentity(item: ParsedGoogleNewsDiscoveryItem): string {
  return createHash("sha256")
    .update([item.url, item.title, item.published_at ?? "", item.source].join("\u0000"))
    .digest("hex")
}

function normalizeState(value: unknown): GoogleNewsDiscoveryState {
  if (!value || typeof value !== "object") return { schema_version: GOOGLE_NEWS_DISCOVERY_SCHEMA_VERSION, checkpoints: {}, known: {}, latest_by_url: {} }
  const input = value as Partial<GoogleNewsDiscoveryState>
  if (input.schema_version !== GOOGLE_NEWS_DISCOVERY_SCHEMA_VERSION) throw new Error("estado Google News inválido: schema_version")
  if (!input.checkpoints || typeof input.checkpoints !== "object" || !input.known || typeof input.known !== "object" || !input.latest_by_url || typeof input.latest_by_url !== "object") throw new Error("estado Google News inválido: campos obrigatórios")
  const known = input.known
  return {
    schema_version: GOOGLE_NEWS_DISCOVERY_SCHEMA_VERSION,
    checkpoints: input.checkpoints && typeof input.checkpoints === "object" ? input.checkpoints : {},
    known,
    latest_by_url: input.latest_by_url && typeof input.latest_by_url === "object" ? input.latest_by_url : {},
  }
}

function readState(path: string | undefined): GoogleNewsDiscoveryState {
  if (!path || !existsSync(path)) return normalizeState(null)
  return normalizeState(JSON.parse(readFileSync(path, "utf8")))
}

export function writeAtomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  renameSync(temp, path)
}

function fixtureForScope(path: string, scope: GoogleNewsScope): string {
  const statPath = resolve(path)
  if (!existsSync(statPath)) throw new Error(`fixture ausente: ${path}`)
  if (extname(statPath).toLowerCase() === ".xml") return readFileSync(statPath, "utf8")
  if (!existsSync(statPath)) throw new Error(`fixture ausente: ${path}`)
  if (extname(statPath).toLowerCase() === ".json") {
    const parsed = JSON.parse(readFileSync(statPath, "utf8")) as Record<string, unknown>
    const value = parsed[scope.code] ?? parsed[scope.code.toLowerCase()] ?? parsed.default ?? parsed.all
    if (typeof value === "string") return value
    if (value && typeof value === "object" && typeof (value as { xml?: unknown }).xml === "string") return (value as { xml: string }).xml
    throw new Error(`fixture sem XML para ${scope.code}`)
  }
  const candidates = [resolve(statPath, `${scope.code}.xml`), resolve(statPath, `${scope.code.toLowerCase()}.xml`), resolve(statPath, "all.xml"), resolve(statPath, "fixture.xml")]
  const candidate = candidates.find((entry) => existsSync(entry))
  if (!candidate) throw new Error(`fixture sem XML para ${scope.code}`)
  return readFileSync(candidate, "utf8")
}

async function fetchScope(input: {
  scope: GoogleNewsScope
  queryUrl: string
  window: DiscoveryWindow
  since: Date
  checkedAt: string
  rawPath: string
  options: GoogleNewsRunOptions
}): Promise<ScopeFetchResult> {
  let xml: string
  try {
    if (input.options.offlineFixturePath) {
      xml = fixtureForScope(input.options.offlineFixturePath, input.scope)
    } else {
      const fetchImpl = input.options.fetchImpl ?? fetch
      const controller = new AbortController()
      let timedOut = false
      const timeoutMs = input.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
      let rejectTimeout: ((reason?: unknown) => void) | null = null
      const timeout = new Promise<never>((_, reject) => { rejectTimeout = reject })
      const timer = setTimeout(() => { timedOut = true; controller.abort(); rejectTimeout?.(new Error("timeout")) }, timeoutMs)
      try {
        const response = await Promise.race([
          fetchImpl(input.queryUrl, { signal: controller.signal, headers: { accept: "application/rss+xml, application/xml, text/xml" } }),
          timeout,
        ])
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        xml = await response.text()
      } catch (error) {
        if (timedOut || (error instanceof Error && error.name === "AbortError")) throw new Error("timeout")
        throw error
      } finally {
        clearTimeout(timer)
      }
    }
    writeFileSync(input.rawPath, xml, "utf8")
    const parsed = parseGoogleNewsDiscoveryRss(xml)
    const filtered = parsed.filter((item) => {
      if (!item.published_at) return true
      const published = Date.parse(item.published_at)
      return published >= input.since.getTime() && published <= Date.parse(input.checkedAt)
    })
    return { scope: input.scope, queryUrl: input.queryUrl, window: input.window, since: input.since, checkedAt: input.checkedAt, rawPath: input.rawPath, items: filtered, error: null }
  } catch (error) {
    return { scope: input.scope, queryUrl: input.queryUrl, window: input.window, since: input.since, checkedAt: input.checkedAt, rawPath: existsSync(input.rawPath) ? input.rawPath : null, items: [], error: error instanceof Error ? error.message : String(error) }
  }
}

async function mapLimit<T>(values: readonly T[], limit: number, worker: (value: T) => Promise<void>): Promise<void> {
  let next = 0
  const run = async () => {
    while (next < values.length) {
      const index = next++
      await worker(values[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run))
}

export async function runGoogleNewsDiscovery(options: GoogleNewsRunOptions): Promise<GoogleNewsRunResult> {
  const now = isoDate(options.now ?? new Date())
  const nowDate = new Date(now)
  const outDir = resolve(options.outDir)
  mkdirSync(resolve(outDir, "raw"), { recursive: true })
  const statePath = options.statePath ? resolve(options.statePath) : undefined
  const state = readState(statePath)
  const scopes = options.scopes ?? GOOGLE_NEWS_SCOPES
  const results: ScopeFetchResult[] = []
  const runTag = now.replace(/[:.]/g, "-")

  await mapLimit(scopes, Math.max(1, Math.min(20, options.concurrency ?? DEFAULT_CONCURRENCY)), async (scope) => {
    const previous = state.checkpoints[scope.code]
    const previousDate = previous ? new Date(previous) : null
    const validPrevious = previousDate && Number.isFinite(previousDate.getTime()) && previousDate.getTime() <= nowDate.getTime()
    const since = validPrevious
      ? startOfUtcDay(addDays(previousDate!, -CHECKPOINT_OVERLAP_DAYS))
      : startOfUtcDay(addDays(nowDate, -INITIAL_DISCOVERY_DAYS))
    const window: DiscoveryWindow = validPrevious ? "checkpoint2days" : "initial14days"
    const queryUrl = buildGoogleNewsScopeUrl(scope, since)
    const rawPath = resolve(outDir, "raw", `${scope.code}-${runTag}.xml`)
    results.push(await fetchScope({ scope, queryUrl, window, since, checkedAt: now, rawPath, options }))
  })
  results.sort((left, right) => left.scope.code.localeCompare(right.scope.code))

  const newItems: GoogleNewsDiscoveryItem[] = []
  const changedItems: GoogleNewsDiscoveryItem[] = []
  for (const result of results) {
    if (result.error) continue
    const sortedItems = [...result.items].sort((left, right) => stableIdentity(left).localeCompare(stableIdentity(right)))
    for (const item of sortedItems) {
      const identityHash = stableIdentity(item)
      const existing = state.known[identityHash]
      if (existing) {
        existing.scopes = [...new Set([...existing.scopes, result.scope.code])].sort()
        continue
      }
      const previousHash = state.latest_by_url[item.url]
      const previousItem = previousHash ? state.known[previousHash] : undefined
      const queueItem: GoogleNewsDiscoveryItem = {
        identity_hash: identityHash,
        scope: result.scope.code,
        scopes: [result.scope.code],
        title: item.title,
        url: item.url,
        source: item.source,
        published_at: item.published_at,
        discovered_at: now,
        discovery_window: result.window,
        date_basis: item.published_at ? "published_at" : "unknown",
        status: "pending",
        evidence_status: "rss_discovery_only",
        raw_path: result.rawPath!,
      }
      state.known[identityHash] = { ...queueItem, first_seen_at: now }
      state.latest_by_url[item.url] = identityHash
      if (previousItem) changedItems.push(queueItem)
      else newItems.push(queueItem)
    }
    state.checkpoints[result.scope.code] = now
  }
  const pending = Object.values(state.known).filter((item) => item.status === "pending").sort((left, right) => left.identity_hash.localeCompare(right.identity_hash))
  const changedOrNewIds = new Set([...newItems, ...changedItems].map((item) => item.identity_hash))
  const pendingUnchanged = pending.filter((item) => !changedOrNewIds.has(item.identity_hash))
  const errorCount = results.filter((result) => result.error).length
  const queue: GoogleNewsDiscoveryQueue = {
    schema_version: GOOGLE_NEWS_DISCOVERY_SCHEMA_VERSION,
    generated_at: now,
    source: "google-news-rss",
    queue: { new: newItems, changed: changedItems, pending, pending_unchanged: pendingUnchanged },
    summary: {
      new_count: newItems.length,
      changed_count: changedItems.length,
      pending_count: pending.length,
      pending_unchanged_count: pendingUnchanged.length,
      error_count: errorCount,
    },
    scopes: results.map((result) => ({
      scope: result.scope.code,
      label: result.scope.label,
      query_url: result.queryUrl,
      status: result.error ? "error" : "ok",
      window: result.window,
      since: result.since.toISOString(),
      checked_at: result.error ? null : result.checkedAt,
      raw_path: result.rawPath,
      rss_items: result.items.length,
      queue_items: [...newItems, ...changedItems].filter((item) => item.scope === result.scope.code).length,
      error: result.error,
    })),
  }
  if (statePath) writeAtomicJson(statePath, state)
  const queuePath = resolve(outDir, "discovery-queue.json")
  writeAtomicJson(queuePath, queue)
  const summary: GoogleNewsDiscoverySummary = {
    schema_version: GOOGLE_NEWS_DISCOVERY_SCHEMA_VERSION,
    generated_at: now,
    source: "google-news-rss",
    queue_path: queuePath,
    counts: queue.summary,
    scope_errors: queue.scopes.filter((scope) => scope.error).map((scope) => ({ scope: scope.scope, error: scope.error! })),
  }
  writeAtomicJson(resolve(outDir, "summary.json"), summary)
  return { state, queue }
}

function parseOptions(argv: string[]): Map<string, string> {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith("--")) throw new Error(`argumento inesperado: ${argument}`)
    const separator = argument.indexOf("=")
    const key = separator >= 0 ? argument.slice(0, separator) : argument
    const value = separator >= 0 ? argument.slice(separator + 1) : argv[++index]
    if (!value || value.startsWith("--")) throw new Error(`valor ausente para ${key}`)
    values.set(key, value)
  }
  return values
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseOptions(argv)
  const state = options.get("--state")
  const out = options.get("--out")
  if (!state || !out) throw new Error("uso: google-news.ts --state PATH --out DIR [--now ISO] [--offline-fixture PATH]")
  const result = await runGoogleNewsDiscovery({ statePath: state, outDir: out, now: options.get("--now"), offlineFixturePath: options.get("--offline-fixture") })
  process.stdout.write(`${JSON.stringify({ queue: resolve(out, "discovery-queue.json"), summary: resolve(out, "summary.json"), counts: result.queue.summary, scopes_checked: result.queue.scopes.length, scope_errors: result.queue.scopes.filter(scope => scope.status === "error").map(scope => ({ scope: scope.scope, error: scope.error })) }, null, 2)}\n`)
  if (result.queue.scopes.some((scope) => scope.status === "error")) process.exitCode = 1
}

if (process.argv[1] && basename(process.argv[1]).startsWith("google-news.")) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
