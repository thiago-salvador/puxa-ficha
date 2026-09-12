import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { SOURCES, consolidarFalas, descobrirLinks, extrairArtigo, sha256, type CandidatoFalas, type EvidenciaArtigo } from "./lib/falas-monitoramento"
import type { CatalogoFalas } from "../src/lib/falas-candidatos"
import { medirCobertura } from "./lib/falas-cobertura"

export async function carregarCandidatos(): Promise<CandidatoFalas[]> {
  for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file)
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Configuração pública do Supabase ausente")
  // Public view and public key only. This collector has no database write path.
  const client = createClient(url, key, { auth: { persistSession: false } })
  const roster: CandidatoFalas[] = []
  for (let page = 0; page < 20; page++) {
    const result = await client.from("candidatos_publico")
      .select("id,slug,nome_urna,nome_completo,cargo_disputado,estado")
      .in("cargo_disputado", ["Presidente", "Governador"]).order("id")
      .range(page * 500, page * 500 + 499).abortSignal(AbortSignal.timeout(15_000))
    if (result.error) throw new Error(`Cadastro público indisponível: ${result.error.message}`)
    roster.push(...result.data as CandidatoFalas[])
    if (result.data.length < 500) {
      if (!roster.length) throw new Error("Cadastro público vazio; coleta bloqueada")
      return roster
    }
  }
  throw new Error("Cadastro excedeu limite de paginação; coleta bloqueada")
}

export async function executarMonitoramento(input: {
  roster: CandidatoFalas[]; previous: CatalogoFalas; now: Date
  getText: (url: string) => Promise<{ body: string }>
  sources?: typeof SOURCES; maxPages?: number; maxArticles?: number; budgetMs?: number
  saveEvidence?: (hash: string, html: string) => void
}) {
  const sources = input.sources ?? SOURCES
  const started = Date.now()
  const maxPages = input.maxPages ?? 2
  const maxArticles = input.maxArticles ?? 12
  const budget = input.budgetMs ?? 360_000
  if (!input.roster.length) throw new Error("Nenhuma candidatura para monitorar")
  for (const candidate of input.roster) {
    if (!candidate.id || !candidate.slug || !candidate.nome_urna || !candidate.nome_completo || !["Presidente", "Governador"].includes(candidate.cargo_disputado)) throw new Error("Identidade de candidatura inválida")
  }
  const sourcesReport: Array<{ id: string; status: string; pages: number; discovered: number; inspected: number; errors: string[]; listing_hashes: string[] }> = []
  const articles: EvidenciaArtigo[] = []
  const visitedArticles = new Set<string>()
  for (const source of sources) {
    const sourceStarted = Date.now()
    const overBudget = () => Date.now() - started >= budget || Date.now() - sourceStarted >= budget / sources.length
    const receipt = { id: source.id, status: "not_queried", pages: 0, discovered: 0, inspected: 0, errors: [] as string[], listing_hashes: [] as string[] }
    sourcesReport.push(receipt)
    let next: string | null = source.origin + source.listing
    const visitedPages = new Set<string>()
    const urls = new Set<string>()
    for (let page = 0; next && page < maxPages; page++) {
      if (overBudget()) { receipt.errors.push("Orçamento de tempo esgotado"); break }
      if (visitedPages.has(next)) { receipt.errors.push("Ciclo na paginação"); break }
      visitedPages.add(next)
      try {
        const response = await input.getText(next)
        const hash = sha256(response.body)
        input.saveEvidence?.(hash, response.body)
        receipt.listing_hashes.push(hash)
        receipt.pages++
        const discovery = descobrirLinks(response.body, source, input.roster)
        for (const url of discovery.urls) urls.add(url)
        next = discovery.next
        receipt.status = "partial"
        if (!next) receipt.errors.push("Paginação histórica não exposta; 14 dias não comprovados integralmente")
      } catch (error) {
        receipt.errors.push(error instanceof Error ? error.message : "Falha na fonte")
        receipt.status = "unavailable"
        break
      }
    }
    receipt.discovered = urls.size
    if (next && receipt.pages >= maxPages) receipt.errors.push("Limite de páginas atingido")
    if (urls.size > maxArticles) receipt.errors.push("Limite de matérias atingido")
    for (const url of [...urls].slice(0, maxArticles)) {
      if (visitedArticles.has(url)) continue
      if (overBudget()) { receipt.errors.push("Orçamento de tempo esgotado"); break }
      visitedArticles.add(url)
      try {
        const response = await input.getText(url)
        const hash = sha256(response.body)
        input.saveEvidence?.(hash, response.body)
        articles.push(extrairArtigo({ html: response.body, url, source, roster: input.roster, now: input.now }))
      } catch (error) {
        articles.push({ url, status: "unavailable", reason: error instanceof Error ? error.message : "Falha na matéria", sha256: null, quotes: [] })
      }
      receipt.inspected++
    }
  }
  const quotes = articles.flatMap((article) => article.quotes)
  const proposal = consolidarFalas(input.previous, quotes, input.now)
  const count = proposal.quotes.length - input.previous.quotes.length
  return {
    schema_version: "falas-monitoramento-v1", observed_at: input.now.toISOString(), lookback_days: 14,
    status: sourcesReport.some((r) => r.pages) ? "partial" : "blocked",
    coverage_complete: false, quote_coverage: medirCobertura(input.roster, proposal, [], input.now), publication_status: "review_required", change_count: count,
    source_policy: "scripts/data/falas-fontes.json", sources: sourcesReport, articles,
    candidates: input.roster.map((candidate) => ({ id: candidate.id, slug: candidate.slug, office: candidate.cargo_disputado, uf: candidate.estado,
      status: quotes.some((q) => q.candidate_id === candidate.id) ? "quotes_found" : sourcesReport.some((r) => r.pages) ? "not_found_in_consulted_pages" : "not_queried",
      coverage_complete: false })), proposal,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const options = new Map<string, string>()
  for (let i = 0; i < args.length; i += 2) {
    if (!["--out", "--source"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Opção inválida; use --out ou --source")
    options.set(args[i], args[i + 1])
  }
  const output = resolve(options.get("--out") ?? "reports/falas-monitoramento")
  const sources = options.has("--source") ? SOURCES.filter((source) => source.id === options.get("--source")) : SOURCES
  if (!sources.length) throw new Error("Fonte não aprovada")
  mkdirSync(resolve(output, "evidence"), { recursive: true })
  try {
    const { criarClienteHttpMonitoramento } = await import("./lib/pesquisas-monitoramento-rede")
    const roster = await carregarCandidatos()
    writeFileSync(resolve(output, "roster.json"), JSON.stringify(roster, null, 2) + "\n")
    const client = criarClienteHttpMonitoramento({ allowedOrigins: sources.map((source) => source.origin), maxBytes: 5_000_000, maxAttempts: 2, timeoutMs: 10_000 })
    const previous = JSON.parse(readFileSync("scripts/data/falas-candidatos.json", "utf8")) as CatalogoFalas
    const report = await executarMonitoramento({ roster, previous, now: new Date(), sources, getText: (url) => client.getText(url),
      saveEvidence: (hash, html) => writeFileSync(resolve(output, "evidence", `${hash}.html`), html) })
    writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n")
    writeFileSync(resolve(output, "proposal.json"), JSON.stringify(report.proposal, null, 2) + "\n")
    const summary = `Falas: ${report.status}. ${roster.length} candidaturas; ${report.articles.length} matérias; ${report.change_count} novas aspas verificadas. Cobertura parcial; publicação exige revisão.\n`
    writeFileSync(resolve(output, "summary.txt"), summary)
    console.log(summary)
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `status=${report.status}\nchange_count=${report.change_count}\n`)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
    if (report.status === "blocked") process.exitCode = 1
  } catch (error) {
    writeFileSync(resolve(output, "report.json"), JSON.stringify({ status: "blocked", coverage_complete: false, error: error instanceof Error ? error.message : "Falha na coleta" }, null, 2) + "\n")
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
}
