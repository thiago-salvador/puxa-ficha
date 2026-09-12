import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { load } from "cheerio"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { SOURCES, consolidarFalas, naJanelaInicial, naJanela, sha256, type CandidatoFalas } from "./lib/falas-monitoramento"
import { verificarRevisao, type AchadoRevisado, type VideoDeApoio } from "./lib/falas-revisao"
import { medirCobertura, paginaCobertura, type BuscaIndividual } from "./lib/falas-cobertura"
import { periodoDaFala, type CatalogoFalas, type FalaCandidato } from "../src/lib/falas-candidatos"
import { lerEvidenciaWeb, type EvidenciaWeb } from "./lib/falas-evidencia-web"

interface ConsultaRss {
  attempt_status: string
  plan_query: { candidate_id: string; candidate_slug: string; query: string }
  rss_request_url?: string
  rss_results?: Array<{ rss_link?: string }>
  error?: string | null
}

interface Pesquisa {
  candidates: Array<{ candidato_id?: string; candidate_id?: string; slug: string; status: string; queries: Array<string | ConsultaRss>; urls_consultadas?: string[]; achados?: AchadoRevisado[]; review_notes?: string | string[]; errors?: string[] }>
}

export async function importarRevisao(input: { roster: CandidatoFalas[]; previous: CatalogoFalas; research: Pesquisa[]; now: Date;
  mode?: "recurring" | "initial_backfill";
  webEvidence?: Map<string, EvidenciaWeb>; liveVideos?: Map<string, VideoDeApoio>;
  getText: (url: string) => Promise<{ body: string }>; saveEvidence?: (hash: string, html: string) => void }) {
  const quotes: FalaCandidato[] = []
  const receipts: Array<{ slug: string; url: string; status: string; reason: string }> = []
  const searches: BuscaIndividual[] = []
  const pages = new Map<string, string>()
  for (const research of input.research) for (const entry of research.candidates) {
    const candidate = input.roster.find((c) => c.id === (entry.candidato_id ?? entry.candidate_id) && c.slug === entry.slug)
    if (!candidate) throw new Error(`Identidade divergente na pesquisa: ${entry.slug}`)
    const notes = typeof entry.review_notes === "string" ? [entry.review_notes] : entry.review_notes ?? []
    const rss = (entry.queries ?? []).filter((query): query is ConsultaRss => typeof query === "object" && query !== null && query.attempt_status === "executed")
    for (const receipt of rss) if (receipt.plan_query?.candidate_id !== candidate.id || receipt.plan_query?.candidate_slug !== candidate.slug
      || typeof receipt.plan_query.query !== "string" || !receipt.plan_query.query.trim()) throw new Error(`Identidade divergente no recibo RSS: ${entry.slug}`)
    const queries = [...(entry.queries ?? []).filter((query): query is string => typeof query === "string"), ...rss.map((receipt) => receipt.plan_query.query)]
    const rssUrls = rss.flatMap((receipt) => [receipt.rss_request_url, ...(receipt.rss_results ?? []).map((result) => result.rss_link)]).filter((url): url is string => typeof url === "string")
    const search: BuscaIndividual = { candidate_id: candidate.id, queries, urls: [...(entry.urls_consultadas ?? []), ...rssUrls],
      status: entry.status === "blocked" ? "blocked" : ["not_queried", "not_searched"].includes(entry.status) ? "not_searched" : queries.length ? "searched" : "not_searched",
      errors: [...(entry.errors ?? []), ...rss.map((receipt) => receipt.error), ...(!["verified", "validated"].includes(entry.status) ? notes : [])].filter((note): note is string => typeof note === "string" && note.trim().length > 0) }
    searches.push(search)
    if (!["verified", "validated"].includes(entry.status)) continue
    if (input.mode === "initial_backfill" && input.previous.quotes.some((quote) => quote.candidate_id === candidate.id && quote.candidate_slug === candidate.slug)) continue
    for (const finding of entry.achados ?? []) {
      try {
        const period = periodoDaFala(finding)
        const inWindow = input.mode === "initial_backfill" ? naJanelaInicial : naJanela
        if (!period || !inWindow(period.from, input.now) || !inWindow(period.to, input.now)) throw new Error("event_outside_window")
        if (!SOURCES.some((source) => source.origin === new URL(finding.article_url).origin)) throw new Error("source_not_approved")
        const webText = input.webEvidence?.get(finding.article_url)
        let html = webText ? "" : pages.get(finding.article_url)
        if (!webText && !html) { html = (await input.getText(finding.article_url)).body; pages.set(finding.article_url, html) }
        html ??= ""
        if (!webText) input.saveEvidence?.(sha256(html), html)
        const aliasUrls = (finding.evidence.identity_alias_evidence ?? []).map((proof) => proof.article_url)
        const supportingUrls = [finding.evidence.event_date_range?.anchor_url, finding.evidence.event_date_source?.article_url, finding.evidence.date_source_url, ...aliasUrls].filter((url): url is string => !!url)
        for (const url of new Set(supportingUrls)) {
          if (!SOURCES.some((source) => source.origin === new URL(url).origin)) throw new Error("supporting_source_not_approved")
          if (input.webEvidence?.has(url)) continue
          if (!pages.has(url)) pages.set(url, (await input.getText(url)).body)
          input.saveEvidence?.(sha256(pages.get(url)!), pages.get(url)!)
        }
        const result = verificarRevisao({ candidate, finding, html, webText, now: input.now, supporting: pages, supportingWeb: input.webEvidence, liveVideos: input.liveVideos, mode: input.mode })
        if (result.quote) quotes.push(result.quote)
        else search.errors.push(`${finding.article_url}: ${result.reason}`)
        receipts.push({ slug: candidate.slug, url: finding.article_url, status: result.quote ? "verified" : "pending", reason: result.reason })
      } catch (error) {
        const reason = error instanceof Error ? error.message : "source_unavailable"
        search.errors.push(`${finding.article_url}: ${reason}`)
        receipts.push({ slug: candidate.slug, url: finding.article_url, status: "pending", reason })
      }
    }
  }
  const proposal = consolidarFalas(input.previous, quotes, input.now)
  return { proposal, receipts, coverage: medirCobertura(input.roster, proposal, searches, input.now) }
}

async function main() {
  const offline = process.argv.includes("--offline")
  const mode = process.argv.includes("--backfill") ? "initial_backfill" : "recurring"
  const replay = offline || process.argv.includes("--replay-evidence")
  const webFiles = process.argv.slice(2).filter((arg) => arg.startsWith("--web-evidence=")).map((arg) => arg.slice("--web-evidence=".length))
  const liveFiles = process.argv.slice(2).filter((arg) => arg.startsWith("--live-evidence=")).map((arg) => arg.slice("--live-evidence=".length))
  const htmlFiles = process.argv.slice(2).filter((arg) => arg.startsWith("--html-evidence=")).map((arg) => arg.slice("--html-evidence=".length))
  const inputs = process.argv.slice(2).filter((arg) => !arg.startsWith("--web-evidence=") && !arg.startsWith("--html-evidence=") && !arg.startsWith("--live-evidence=") && !["--replay-evidence", "--offline", "--backfill"].includes(arg))
  if (!inputs.length) throw new Error("Informe um ou mais arquivos de pesquisa revisada")
  const output = resolve("reports/falas-monitoramento/review")
  mkdirSync(resolve(output, "evidence"), { recursive: true })
  const archive = new Map<string, string>()
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8")
    const $ = load(html)
    const canonical = $("link[rel=canonical]").attr("href")
    if (!canonical || !SOURCES.some((source) => new URL(canonical).origin === source.origin)) throw new Error("html_evidence_source_not_approved")
    archive.set(canonical, html)
    writeFileSync(resolve(output, "evidence", `${sha256(html)}.html`), html)
  }
  const webEvidence = new Map<string, EvidenciaWeb>()
  for (const file of [...(replay ? readdirSync(resolve(output, "evidence")).filter((file) => /^[a-f0-9]{64}\.web\.json$/.test(file)).map((file) => resolve(output, "evidence", file)) : []), ...webFiles]) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown
    for (const raw of Array.isArray(parsed) ? parsed : [parsed]) {
      const web = lerEvidenciaWeb(raw)
      if (!SOURCES.some((source) => new URL(web.url).origin === source.origin)) throw new Error("web_evidence_source_not_approved")
      const snapshot: EvidenciaWeb = { format: web.format, url: web.url, retrieved_at: web.retrieved_at, raw: web.raw }
      const hash = sha256(web.raw)
      if (/^[a-f0-9]{64}\.web\.json$/.test(file.split("/").at(-1)!) && !file.endsWith(`${hash}.web.json`)) throw new Error("Arquivo de evidência textual alterado")
      webEvidence.set(web.url, snapshot)
      writeFileSync(resolve(output, "evidence", `${hash}.web.json`), JSON.stringify(snapshot, null, 2) + "\n")
    }
  }
  const liveVideos = new Map<string, VideoDeApoio>()
  const liveArchives = replay ? readdirSync(resolve(output, "evidence")).filter((file) => /^[a-f0-9]{64}\.live\.json$/.test(file)).map((file) => resolve(output, "evidence", file)) : []
  for (const file of [...liveArchives, ...liveFiles]) {
    const fileText = readFileSync(file, "utf8")
    const parsed = JSON.parse(fileText)
    if (/^[a-f0-9]{64}\.live\.json$/.test(file.split("/").at(-1)!) && !file.endsWith(sha256(fileText) + ".live.json"))
      throw new Error("Arquivo de evidência ao vivo alterado")
    if (!["live_video_bundle", "live_video_snapshot"].includes(parsed.format)) throw new Error("Formato de vídeo inválido")
    const snapshot = parsed.format === "live_video_snapshot" ? parsed : {
      format: "live_video_snapshot", url: parsed.url,
      metadata: readFileSync(resolve(parsed.metadata_path), "utf8"),
      captions: readFileSync(resolve(parsed.captions_path), "utf8"),
      frame_base64: readFileSync(resolve(parsed.frame_path)).toString("base64"),
      frame_at_seconds: parsed.frame_at_seconds,
    }
    if (typeof snapshot.metadata !== "string" || typeof snapshot.captions !== "string" || typeof snapshot.frame_base64 !== "string"
      || !snapshot.frame_base64.length || !Number.isFinite(snapshot.frame_at_seconds)) throw new Error("Evidência ao vivo incompleta")
    const frame = Buffer.from(snapshot.frame_base64, "base64")
    const frameSha = createHash("sha256").update(frame).digest("hex")
    liveVideos.set(snapshot.url, { metadata: snapshot.metadata, captions: snapshot.captions, frame_sha256: frameSha, frame_at_seconds: snapshot.frame_at_seconds })
    const encoded = JSON.stringify(snapshot, null, 2) + "\n"
    writeFileSync(resolve(output, "evidence", sha256(encoded) + ".live.json"), encoded)
  }
  const previous = JSON.parse(readFileSync("scripts/data/falas-candidatos.json", "utf8")) as CatalogoFalas
  if (replay) for (const file of readdirSync(resolve(output, "evidence"))) {
    if (!/^[a-f0-9]{64}\.html$/.test(file)) continue
    const html = readFileSync(resolve(output, "evidence", file), "utf8")
    if (sha256(html) + ".html" !== file) throw new Error("Arquivo de evidência alterado")
    const $ = load(html)
    const canonical = $("link[rel=canonical]").attr("href") ?? $("meta[property='og:url']").attr("content")
    if (canonical) archive.set(canonical, html)
  }
  if (replay) for (const quote of previous.quotes) {
    const files = [{ url: quote.review_evidence?.fetched_url ?? quote.article_url, sha256: quote.source_sha256 }, ...(quote.review_evidence?.supporting_sources ?? [])]
    for (const file of files) {
      const path = resolve(output, "evidence", `${file.sha256}.html`)
      if (!existsSync(path)) continue
      const html = readFileSync(path, "utf8")
      if (sha256(html) !== file.sha256) throw new Error("Arquivo de evidência alterado")
      archive.set(file.url, html)
    }
  }
  const priorFailures = new Map<string, string>()
  if (offline && existsSync(resolve(output, "receipts.json"))) {
    for (const receipt of JSON.parse(readFileSync(resolve(output, "receipts.json"), "utf8")) as Array<{ url: string; status: string; reason: string }>) {
      if (receipt.status === "pending") priorFailures.set(receipt.url, receipt.reason)
    }
  }
  const { criarClienteHttpMonitoramento } = await import("./lib/pesquisas-monitoramento-rede")
  const client = criarClienteHttpMonitoramento({ allowedOrigins: SOURCES.map((s) => s.origin), maxBytes: 8_000_000, maxAttempts: 1, timeoutMs: 15_000 })
  const result = await importarRevisao({ roster: JSON.parse(readFileSync("reports/falas-monitoramento/roster.json", "utf8")),
    previous, mode, webEvidence, liveVideos, research: inputs.map((file) => JSON.parse(readFileSync(file, "utf8"))), now: new Date(),
    getText: async (url) => {
      const html = archive.get(url)
      if (html) return { body: html }
      if (offline) throw new Error(priorFailures.get(url) ?? "Evidência original não arquivada; necessário acesso à fonte")
      return client.getText(url)
    }, saveEvidence: (hash, html) => writeFileSync(resolve(output, "evidence", `${hash}.html`), html) })
  for (const key of ["proposal", "receipts", "coverage"] as const) writeFileSync(resolve(output, `${key}.json`), JSON.stringify(result[key], null, 2) + "\n")
  writeFileSync(resolve(output, "cobertura.html"), paginaCobertura(result.coverage, result.proposal))
  console.log(JSON.stringify({ verified: result.receipts.filter((r) => r.status === "verified").length, pending: result.receipts.filter((r) => r.status !== "verified"),
    covered: result.coverage.covered, total: result.coverage.total }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
