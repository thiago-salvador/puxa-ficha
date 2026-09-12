import { load } from "cheerio"
import { INITIAL_SEARCH_START, SOURCES, urlAprovada, type CandidatoFalas, type FonteFalas } from "./falas-monitoramento"
import type { ClienteHttpMonitoramento } from "./pesquisas-monitoramento-rede"

export const GOOGLE_NEWS_ORIGIN = "https://news.google.com"
export interface ConsultaFalas { name: string; query: string; url: string }
export interface OriginalFalas { title: string; url: string }
export interface ResultadoDescoberta {
  title: string; search_url: string; article_url: string | null; published_hint: string
  source_origin: string | null; reason: "original_url" | "original_title_match" | "google_opaque" | "source_unapproved" | "invalid_url"
}
export interface ReciboConsultaFalas {
  name: string; url: string; status: "queried" | "no_results" | "blocked" | "not_queried"
  attempts: number; result_count: number; discarded_date_count: number; truncated: boolean
  error: string | null; results: ResultadoDescoberta[]
}
export interface ReciboCandidatoFalas {
  candidate_id: string; candidate_slug: string; candidate_name: string
  status: ReciboConsultaFalas["status"]; attempts: number; urls: string[]; pending_count: number
  queries: ReciboConsultaFalas[]
}
const normalizar = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

function janela(now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error("Data de descoberta inválida")
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  const start = new Date(`${today}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - 13)
  if (start.toISOString().slice(0, 10) < INITIAL_SEARCH_START) start.setTime(Date.parse(`${INITIAL_SEARCH_START}T00:00:00Z`))
  if (INITIAL_SEARCH_START > today) throw new Error("Campanha ainda não iniciada")
  const after = new Date(start); after.setUTCDate(after.getUTCDate() - 1)
  const before = new Date(`${today}T00:00:00Z`); before.setUTCDate(before.getUTCDate() + 1)
  return { start: start.toISOString().slice(0, 10), end: today, after: after.toISOString().slice(0, 10), before: before.toISOString().slice(0, 10) }
}

/** Each observed name receives its own query; aliases are never invented. */
export function construirConsultas(candidate: CandidatoFalas, now: Date): ConsultaFalas[] {
  const range = janela(now)
  const names = [...new Map([candidate.nome_urna, candidate.nome_completo].map((name) => [normalizar(name), name.trim()])).values()].filter(Boolean)
  return names.map((name) => {
    const quotedName = name.replace(/["\r\n]/g, " ")
    const query = `"${quotedName}" (debate OR entrevista OR sabatina OR rádio OR podcast OR "disse à" OR "afirmou à") after:${range.after} before:${range.before}`
    const url = new URL("/rss/search", GOOGLE_NEWS_ORIGIN)
    url.search = new URLSearchParams({ q: query, hl: "pt-BR", gl: "BR", ceid: "BR:pt-419" }).toString()
    return { name, query, url: url.href }
  })
}

function originalAprovado(raw: string, sources: readonly FonteFalas[]): string | null {
  // A relative path must never be reinterpreted against an arbitrary publisher.
  if (!/^https:\/\//i.test(raw)) return null
  for (const source of sources) {
    const url = urlAprovada(raw, source)
    if (url && new URL(url).pathname.includes(source.articlePath) && new URL(url).pathname !== "/" && new URL(url).pathname !== source.listing) return url
  }
  return null
}

/** Literal original links from the publisher's own listing or news sitemap. */
export function extrairIndiceOriginais(body: string, source: FonteFalas): OriginalFalas[] {
  const xml = /<(?:\w+:)?(?:urlset|sitemapindex)\b/i.test(body)
  const $ = load(body, xml ? { xmlMode: true } : undefined)
  const rows: OriginalFalas[] = []
  if (xml) {
    $("url").each((_, el) => {
      const title = $(el).find("news\\:title,title").first().text().trim()
      const url = originalAprovado($(el).find("loc").first().text().trim(), [source])
      if (title && url) rows.push({ title, url })
    })
  } else {
    $("script,style,nav,aside,footer,template,noscript").remove()
    $("a[href]").each((_, el) => {
      const title = $(el).text().replace(/\s+/g, " ").trim()
      const raw = urlAprovada($(el).attr("href") ?? "", source)
      const url = raw ? originalAprovado(raw, [source]) : null
      if (title && url) rows.push({ title, url })
    })
  }
  return [...new Map(rows.map((row) => [`${row.url}:${normalizar(row.title)}`, row])).values()]
}

function resolverOriginal(raw: string, title: string, sourceOrigin: string | null, index: readonly OriginalFalas[], sources: readonly FonteFalas[]) {
  const direct = originalAprovado(raw, sources)
  if (direct && (!sourceOrigin || new URL(direct).origin === sourceOrigin)) return { url: direct, reason: "original_url" as const }
  let google: URL
  try { google = new URL(raw) } catch { return { url: null, reason: "invalid_url" as const } }
  if (google.origin !== GOOGLE_NEWS_ORIGIN || google.username || google.password || !/^\/(?:rss\/)?articles\/[A-Za-z0-9_-]+$/.test(google.pathname)) return { url: null, reason: "invalid_url" as const }
  const source = sources.find((candidate) => candidate.origin === sourceOrigin)
  if (!source) return { url: null, reason: "source_unapproved" as const }
  // Older Google News IDs contain a literal original URL. Modern opaque IDs do
  // not; never infer a URL from a slug or call Google's private decoding RPC.
  const decoded = Buffer.from(google.pathname.split("/").at(-1)!, "base64url").toString("utf8")
  const embedded = decoded.match(/https:\/\/[^\s\x00-\x20\x7f"<>]+/g) ?? []
  const literals = [...new Set(embedded.map((url) => originalAprovado(url, [source])).filter((url): url is string => Boolean(url)))]
  if (literals.length === 1) return { url: literals[0], reason: "original_url" as const }
  const titleKey = normalizar(title)
  const exact = [...new Set(index.filter((row) => normalizar(row.title) === titleKey).map((row) => originalAprovado(row.url, [source])).filter((url): url is string => Boolean(url)))]
  return exact.length === 1 ? { url: exact[0], reason: "original_title_match" as const } : { url: null, reason: "google_opaque" as const }
}

export async function descobrirPorCandidato(input: {
  roster: readonly CandidatoFalas[]; now: Date; client: Pick<ClienteHttpMonitoramento, "getText">
  sources?: readonly FonteFalas[]; originals?: readonly OriginalFalas[]; maxQueries?: number
  maxResultsPerQuery?: number; onReceipt?: (receipt: ReciboCandidatoFalas) => void | Promise<void>
}) {
  const { roster, now, client } = input
  const sources = input.sources ?? SOURCES
  const originals = input.originals ?? []
  const maxQueries = input.maxQueries ?? Number.POSITIVE_INFINITY
  const maxResults = input.maxResultsPerQuery ?? 100
  if (!(maxQueries >= 0) || (Number.isFinite(maxQueries) && !Number.isInteger(maxQueries)) || !Number.isInteger(maxResults) || maxResults < 1) throw new Error("Limite de descoberta inválido")
  if (new Set(roster.map((candidate) => candidate.id)).size !== roster.length) throw new Error("Candidato duplicado na descoberta")
  const range = janela(now)
  const receipts: ReciboCandidatoFalas[] = roster.map((candidate) => ({ candidate_id: candidate.id, candidate_slug: candidate.slug, candidate_name: candidate.nome_urna,
    status: "not_queried", attempts: 0, urls: [], pending_count: 0,
    queries: construirConsultas(candidate, now).map((query) => ({ name: query.name, url: query.url, status: "not_queried", attempts: 0,
      result_count: 0, discarded_date_count: 0, truncated: false, error: null, results: [] })) }))
  let queriesAttempted = 0
  // Round robin gives every candidate's primary name priority over aliases.
  for (let round = 0; round < Math.max(0, ...receipts.map((receipt) => receipt.queries.length)); round++) {
    for (const receipt of receipts) {
      const query = receipt.queries[round]
      if (!query || queriesAttempted >= maxQueries) continue
      query.attempts++; receipt.attempts++; queriesAttempted++
      try {
        const response = await client.getText(query.url)
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`)
        const $ = load(response.body, { xmlMode: true })
        if (!$("rss > channel").length) throw new Error("Resposta não contém feed RSS; possível bloqueio")
        const items = $("rss > channel > item").toArray()
        query.result_count = items.length
        query.truncated = items.length >= 100 || items.length > maxResults
        for (const item of items.slice(0, maxResults)) {
          const published = new Date($(item).find("pubDate").first().text())
          if (!Number.isFinite(published.getTime()) || published > now || published.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) < range.start || published.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) > range.end) { query.discarded_date_count++; continue }
          const publisher = $(item).find("source").first().text().trim()
          let title = $(item).find("title").first().text().trim()
          if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -publisher.length - 3)
          const raw = $(item).find("link").first().text().trim()
          let origin: string | null = null
          try { const u = new URL($(item).find("source").attr("url") ?? ""); if (!u.username && !u.password && u.protocol === "https:") origin = u.origin } catch { /* Receipt preserves absent source. */ }
          const resolution = resolverOriginal(raw, title, origin, originals, sources)
          query.results.push({ title, search_url: raw, article_url: resolution.url, published_hint: published.toISOString(), source_origin: origin, reason: resolution.reason })
        }
        query.status = items.length ? "queried" : "no_results"
      } catch (error) {
        query.status = "blocked"
        query.error = (error instanceof Error ? error.message : String(error)).slice(0, 300)
      }
      receipt.urls = [...new Set(receipt.queries.flatMap((q) => q.results.flatMap((r) => r.article_url ? [r.article_url] : [])))]
      receipt.pending_count = receipt.queries.reduce((sum, q) => sum + q.results.filter((r) => r.article_url === null).length, 0)
      receipt.status = receipt.queries.some((q) => q.status === "queried") ? "queried"
        : receipt.queries.some((q) => q.status === "blocked") ? "blocked"
        : receipt.queries.every((q) => q.status === "no_results") ? "no_results" : "not_queried"
      await input.onReceipt?.(receipt)
    }
  }
  return { observed_at: now.toISOString(), window_start: range.start, window_end: range.end,
    coverage_complete: false as const, queries_attempted: queriesAttempted,
    all_candidates_attempted: receipts.every((receipt) => receipt.attempts > 0),
    all_candidates_queried: receipts.every((receipt) => receipt.queries.some((query) => query.status === "queried" || query.status === "no_results")),
    urls: [...new Set(receipts.flatMap((receipt) => receipt.urls))], candidates: receipts }
}
