import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const PAGE_SIZE = 1000
const DOCUMENT_LIKE_SEQUENCE_RE =
  /(?:\b(?:CPF|CNPJ)\b[^\d\n]{0,30}(?:(?:\d[. /-]?){13}\d|(?:\d[. /-]?){10}\d)(?!\d))|(?:\d{3}\.\d{3}\.\d{3}-\d{2})|(?:\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/gi
const ALREADY_MASKED_DOCUMENT_LABEL_RE =
  /\b(?:CPF|CNPJ)\b[^\d\n]{0,30}\[documento (?:mascarado|removido)\]/gi

const TARGETS = [
  { table: "historico_politico", columns: "observacoes" },
  { table: "patrimonio", columns: "bens" },
  { table: "projetos_lei", columns: "ementa" },
  { table: "legislacao_mandato_executivo", columns: "ementa,metadata" },
  { table: "mudancas_partido", columns: "contexto" },
] as const

function loadEnv(): { url: string; key: string } {
  let url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  let key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

  if (!url || !key) {
    try {
      const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
      url ||= env.match(/(?:NEXT_PUBLIC_)?SUPABASE_URL=(.+)/)?.[1]?.trim().replace(/["']/g, "") ?? ""
      key ||=
        env.match(/(?:NEXT_PUBLIC_)?SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim().replace(/["']/g, "") ?? ""
    } catch {
      // Credentialed environments can provide process.env directly.
    }
  }

  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY (ou NEXT_PUBLIC_*) ausentes")
  }

  return { url, key }
}

export function countDocumentLikeSequences(value: unknown): number {
  if (typeof value === "string") {
    // Evita atravessar uma marca de sanitização e combinar uma data ou outro
    // número posterior como se ainda fosse o documento rotulado.
    const unmaskedOnly = value.replace(ALREADY_MASKED_DOCUMENT_LABEL_RE, "[documento mascarado]")
    return [...unmaskedOnly.matchAll(DOCUMENT_LIKE_SEQUENCE_RE)].length
  }
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countDocumentLikeSequences(item), 0)
  }
  if (value && typeof value === "object") {
    return Object.values(value).reduce(
      (total: number, item) => total + countDocumentLikeSequences(item),
      0
    )
  }
  return 0
}

const MAX_ATTEMPTS = 5

/**
 * Página por chave (`id > último id`, ordenado), não por OFFSET.
 *
 * Com OFFSET e sem ORDER BY, a página 137 de `projetos_lei` (~139 mil linhas)
 * custava ~2,6 s no papel anon, cujo statement_timeout é 3 s; no runner isso
 * virou HTTP 500 (run 36010547921). OFFSET sem ordem também não garante que
 * toda linha seja lida uma vez. A chave mantém cada página em tempo constante.
 */
export function buildPageUrl(url: string, table: string, columns: string, afterId: string | null): URL {
  const endpoint = new URL(`${url}/rest/v1/${table}`)
  const selected = columns.split(",").map((column) => column.trim()).filter(Boolean)
  endpoint.searchParams.set("select", ["id", ...selected.filter((column) => column !== "id")].join(","))
  endpoint.searchParams.set("order", "id.asc")
  endpoint.searchParams.set("limit", String(PAGE_SIZE))
  if (afterId !== null) endpoint.searchParams.set("id", `gt.${afterId}`)
  return endpoint
}

export async function fetchPage(
  url: string,
  key: string,
  table: string,
  columns: string,
  afterId: string | null,
  fetcher: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
): Promise<Record<string, unknown>[]> {
  const endpoint = buildPageUrl(url, table, columns, afterId)

  let response: Response | null = null
  let lastError: unknown = null
  let lastBody = ""
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    response = null
    try {
      response = await fetcher(endpoint, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      })
      if (response.ok || response.status < 500) break
      lastBody = (await response.text()).slice(0, 300)
    } catch (error) {
      lastError = error
    }
    if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1))
  }

  if (!response) {
    throw new Error(
      `${table}: request failed after ${MAX_ATTEMPTS} attempts${lastError instanceof Error ? `: ${lastError.message}` : ""}`
    )
  }
  if (!response.ok) {
    throw new Error(`${table}: HTTP ${response.status}${lastBody ? ` ${lastBody}` : ""}`)
  }
  return (await response.json()) as Record<string, unknown>[]
}

async function main(): Promise<void> {
  const { url, key } = loadEnv()
  let totalRows = 0
  let totalFindings = 0

  for (const target of TARGETS) {
    let tableRows = 0
    let tableFindings = 0

    let afterId: string | null = null
    for (;;) {
      const rows = await fetchPage(url, key, target.table, target.columns, afterId)
      tableRows += rows.length
      // O id é chave técnica, não texto publicado: fica fora da varredura.
      tableFindings += rows.reduce(
        (total, row) => total + countDocumentLikeSequences({ ...row, id: undefined }),
        0
      )
      if (rows.length < PAGE_SIZE) break
      const lastId = rows[rows.length - 1]?.id
      if (typeof lastId !== "string" && typeof lastId !== "number") {
        throw new Error(`${target.table}: página sem id para continuar a leitura`)
      }
      if (String(lastId) === afterId) throw new Error(`${target.table}: paginação não avançou`)
      afterId = String(lastId)
    }

    totalRows += tableRows
    totalFindings += tableFindings
    console.log(`${target.table}: rows=${tableRows} document_like=${tableFindings}`)
  }

  console.log(`public document exposure: rows=${totalRows} findings=${totalFindings}`)
  if (totalFindings > 0) {
    console.error("audit:public-document-exposure:gate FAILED: public document-like sequences remain")
    process.exit(1)
  }

  console.log("audit:public-document-exposure:gate PASSED")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      "audit:public-document-exposure:gate FAILED:",
      error instanceof Error ? error.message : error
    )
    process.exit(1)
  })
}
