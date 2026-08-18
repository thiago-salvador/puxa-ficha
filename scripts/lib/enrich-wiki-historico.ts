import { supabase } from "./supabase"
import { loadCandidatosPublicos } from "./helpers-db"
import { sleep } from "./helpers"
import { log, warn } from "./logger"
import { canonicalizeEstadoForStorage } from "@/lib/br-uf"
import { finalizarColeta, registrarErroColeta } from "./coleta-resultado"
import type { IngestResult } from "./types"

// Slug → Portuguese Wikipedia article title (reuse from enrich-wikipedia.ts)
// We import only the titles we need by re-reading the main file
const WIKI_API = "https://pt.wikipedia.org/w/api.php"
const slugArg = process.argv.find((arg) => arg.startsWith("--slug="))
const filterSlugs = slugArg
  ? new Set(
      slugArg
        .slice("--slug=".length)
        .split(",")
        .map((slug) => slug.trim())
        .filter(Boolean),
    )
  : null

// Category patterns that indicate political positions
const CARGO_PATTERNS: Array<{
  pattern: RegExp
  cargo: string
  extractEstado?: boolean
}> = [
  { pattern: /^Deputados federais do Brasil por (.+)$/i, cargo: "Deputado Federal", extractEstado: true },
  { pattern: /^Senadores do Brasil por (.+)$/i, cargo: "Senador", extractEstado: true },
  { pattern: /^Governadores d[eoa] (.+)$/i, cargo: "Governador", extractEstado: true },
  { pattern: /^Vice-governadores d[eoa] (.+)$/i, cargo: "Vice-Governador", extractEstado: true },
  { pattern: /^Prefeitos d[eoa] (.+)$/i, cargo: "Prefeito", extractEstado: true },
  { pattern: /^Vice-prefeitos d[eoa] (.+)$/i, cargo: "Vice-Prefeito", extractEstado: true },
  { pattern: /^Deputados estaduais d[eoa] (.+)$/i, cargo: "Deputado Estadual", extractEstado: true },
  { pattern: /^Vereadores d[eoa] (.+)$/i, cargo: "Vereador", extractEstado: true },
  { pattern: /^Ministros d[eoa] (.+) do Brasil$/i, cargo: "Ministro" },
  { pattern: /^Presidentes da C[aâ]mara dos Deputados do Brasil$/i, cargo: "Presidente da Câmara dos Deputados" },
  { pattern: /^Presidentes do Senado Federal do Brasil$/i, cargo: "Presidente do Senado Federal" },
  { pattern: /^Secretários estaduais/i, cargo: "Secretário Estadual" },
]

// State name normalization delegated to br-uf.ts (single source of truth)

function normalizeEstado(name: string): string {
  return canonicalizeEstadoForStorage(name) ?? name
}

type WikiCategoriesResult =
  | { categories: string[]; error: null }
  | { categories: []; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Test seam: `missing` e lista vazia sao zeros validos; schema quebrado e erro. */
export function interpretarWikiCategoriesPayload(payload: unknown): WikiCategoriesResult {
  if (!isRecord(payload) || !isRecord(payload.query) || !isRecord(payload.query.pages)) {
    return { categories: [], error: "payload Wikipedia invalido: query.pages ausente" }
  }
  const pages = Object.values(payload.query.pages)
  if (pages.length !== 1 || !isRecord(pages[0])) {
    return { categories: [], error: "payload Wikipedia invalido: pagina unica ausente" }
  }
  const page = pages[0]
  if (Object.prototype.hasOwnProperty.call(page, "missing")) {
    return { categories: [], error: null }
  }
  if (typeof page.title !== "string" || page.title.trim() === "") {
    return { categories: [], error: "payload Wikipedia invalido: title da pagina ausente" }
  }
  if (page.categories === undefined) return { categories: [], error: null }
  if (!Array.isArray(page.categories)) {
    return { categories: [], error: "payload Wikipedia invalido: categories nao e lista" }
  }

  const categories: string[] = []
  for (const category of page.categories) {
    if (!isRecord(category) || typeof category.title !== "string") {
      return { categories: [], error: "payload Wikipedia invalido: categoria sem title" }
    }
    const title = category.title.replace("Categoria:", "").trim()
    if (title) categories.push(title)
  }
  return { categories, error: null }
}

interface WikiCategoriesFetchOptions {
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>
  sleepImpl?: (ms: number) => Promise<void>
  tentativas?: number
  timeoutMs?: number
}

export async function fetchWikiCategories(
  title: string,
  options: WikiCategoriesFetchOptions = {},
): Promise<WikiCategoriesResult> {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "categories",
    cllimit: "100",
    format: "json",
    origin: "*",
  })

  const fetchImpl = options.fetchImpl ?? fetch
  const sleepImpl = options.sleepImpl ?? sleep
  const tentativas = options.tentativas ?? 5
  const timeoutMs = options.timeoutMs ?? 15_000
  let ultimoErro = "erro desconhecido"
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetchImpl(`${WIKI_API}?${params}`, {
        headers: { "User-Agent": "PuxaFicha/1.0 (puxaficha.com.br)" },
        signal: controller.signal,
      })
      if (!res.ok) {
        ultimoErro = `HTTP ${res.status}`
        if ((res.status === 429 || res.status >= 500) && tentativa < tentativas) {
          const retryAfter = Number.parseInt(res.headers.get("retry-after") ?? "", 10)
          const esperaMs = Number.isFinite(retryAfter)
            ? Math.min(60_000, Math.max(1_000, retryAfter * 1_000))
            : Math.min(60_000, 5_000 * 2 ** (tentativa - 1))
          await sleepImpl(esperaMs)
          continue
        }
        return { categories: [], error: ultimoErro }
      }
      const json = await res.json() as unknown
      return interpretarWikiCategoriesPayload(json)
    } catch (err) {
      ultimoErro = err instanceof Error && err.name === "AbortError"
        ? `Timeout (${timeoutMs}ms)`
        : err instanceof Error ? err.message : String(err)
      if (tentativa < tentativas) {
        await sleepImpl(Math.min(60_000, 5_000 * 2 ** (tentativa - 1)))
        continue
      }
    } finally {
      clearTimeout(timeout)
    }
  }
  return { categories: [], error: ultimoErro }
}

function extractCargosFromCategories(categories: string[]): Array<{
  cargo: string
  estado: string
}> {
  const cargos: Array<{ cargo: string; estado: string }> = []

  for (const cat of categories) {
    for (const p of CARGO_PATTERNS) {
      const match = cat.match(p.pattern)
      if (match) {
        const estado = p.extractEstado && match[1]
          ? normalizeEstado(match[1])
          : ""
        cargos.push({ cargo: p.cargo, estado })
        break
      }
    }
  }

  return cargos
}

export function finalizarCategoriasWikiHistorico(
  resultado: IngestResult,
  categories: string[],
): Array<{ cargo: string; estado: string }> {
  const cargos = extractCargosFromCategories(categories)
  finalizarColeta(resultado, {
    aplicavel: true,
    volumeFonte: cargos.length,
    detalhe: categories.length === 0
      ? "Wikipedia respondeu sem categorias"
      : cargos.length === 0
        ? `${categories.length} categoria(s), nenhuma categoria de cargo reconhecida`
        : `${cargos.length} cargo(s) na categoria, nenhum com periodo_inicio utilizavel`,
  })
  return cargos
}

export async function enrichWikiHistorico(): Promise<IngestResult[]> {
  const candidatos = await loadCandidatosPublicos()
  const results: IngestResult[] = []
  const selecionados = candidatos.filter((cand) => !filterSlugs || filterSlugs.has(cand.slug))
  const comTitulo = selecionados.filter((cand) => Boolean(cand.wikipedia_title?.trim()))

  log("wiki-historico", `Titulos Wikipedia carregados: ${comTitulo.length}`)

  const totalInserted = 0
  let totalSkipped = 0

  // Categoria da Wikipedia nao traz `periodo_inicio`, e o banco recusa cargo
  // sem data. A fonte, portanto, serve aqui para confirmar que a busca ocorreu e
  // explicar por que nao existe escrita. O desfecho fica no IngestResult para o
  // orquestrador registrar toda consulta aplicavel, inclusive resposta vazia e
  // falha de rede, sem confundir as duas.
  for (const cand of selecionados) {
    const result: IngestResult = {
      source: "wiki-historico",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }
    const start = Date.now()
    const wikiTitle = cand.wikipedia_title?.trim()

    if (!wikiTitle) {
      finalizarColeta(result, {
        aplicavel: false,
        volumeFonte: 0,
        detalhe: "candidato sem wikipedia_title; nenhuma consulta de historico realizada",
      })
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }

    // Get candidate ID from DB
    let dbCand: { id: string; partido_sigla?: string | null } | null = null
    try {
      const consulta = await supabase
        .from("candidatos")
        .select("id, partido_sigla")
        .eq("slug", cand.slug)
        .single()
      if (consulta.error || !consulta.data) {
        throw new Error(consulta.error?.message ?? "candidato nao encontrado no banco")
      }
      dbCand = consulta.data as { id: string; partido_sigla?: string | null }
    } catch (err) {
      registrarErroColeta(result, err, "consulta do candidato no banco")
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }

    // Check existing historico
    let existing: Array<{ cargo: string; estado: string }> = []
    try {
      const consulta = await supabase
        .from("historico_politico")
        .select("cargo, estado")
        .eq("candidato_id", dbCand.id)
      if (consulta.error) throw new Error(consulta.error.message)
      existing = (consulta.data ?? []) as Array<{ cargo: string; estado: string }>
    } catch (err) {
      registrarErroColeta(result, err, "consulta do historico no banco")
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }

    const existingSet = new Set(
      existing.map((h) => `${h.cargo}|${h.estado}`)
    )

    // Fetch Wikipedia categories
    const resposta = await fetchWikiCategories(wikiTitle)
    await sleep(1_100)

    if (resposta.error) {
      registrarErroColeta(result, resposta.error, "consulta de categorias Wikipedia")
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }

    const cargos = finalizarCategoriasWikiHistorico(result, resposta.categories)

    log("wiki-historico", `${cand.slug}: ${cargos.length} cargos encontrados via categorias`)

    for (const c of cargos) {
      const key = `${c.cargo}|${c.estado}`
      if (existingSet.has(key)) {
        totalSkipped++
        continue
      }

      // Guard: do not insert records without a valid periodo_inicio (> 1900).
      // Wikipedia categories do not provide dates, so skip instead of inserting placeholder 0.
      warn("wiki-historico", `${cand.slug}: skipping ${c.cargo} (no periodo_inicio from categories)`)
      totalSkipped++
    }
    result.duration_ms = Date.now() - start
    results.push(result)
  }

  console.log(`\n=== Wikipedia Historico ===`)
  console.log(`Cargos inseridos: ${totalInserted}`)
  console.log(`Duplicatas ignoradas: ${totalSkipped}`)
  console.log(`Erros: ${results.reduce((sum, result) => sum + result.errors.length, 0)}`)
  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  enrichWikiHistorico().then((r) => console.log(JSON.stringify(r, null, 2)))
}
