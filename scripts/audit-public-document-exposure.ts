import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const PAGE_SIZE = 1000
const DOCUMENT_LIKE_SEQUENCE_RE =
  /(?:\b(?:CPF|CNPJ)\b[^\d\n]{0,30}(?:(?:\d[. /-]?){13}\d|(?:\d[. /-]?){10}\d)(?!\d))|(?:\d{3}\.\d{3}\.\d{3}-\d{2})|(?:\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/gi
const ALREADY_MASKED_DOCUMENT_LABEL_RE =
  /\b(?:CPF|CNPJ)\b[^\d\n]{0,30}\[documento (?:mascarado|removido)\]/gi
/**
 * Sequência de 11 dígitos ou mais sem rótulo nem pontuação: CPF colado no fim
 * da razão social de MEI. Só vale para alvos cujo texto nunca deveria ter
 * número longo (nomes de fornecedor e destinatário); ementa e observação têm
 * número de processo e ficam fora.
 */
const BARE_DIGIT_RUN_RE = /(?<!\d)\d{11,}(?!\d)/g

export interface ExposureTarget {
  table: string
  columns: string
  /** Conta também sequências de 11+ dígitos sem rótulo. */
  bareDigits?: boolean
  /** HTTP 404 na primeira página = migration ainda não aplicada, não falha. */
  pendingOn404?: boolean
}

export const TARGETS: readonly ExposureTarget[] = [
  { table: "historico_politico", columns: "observacoes" },
  { table: "patrimonio", columns: "bens" },
  { table: "projetos_lei", columns: "ementa" },
  { table: "legislacao_mandato_executivo", columns: "ementa,metadata" },
  { table: "mudancas_partido", columns: "contexto" },
  {
    table: "financiamento_despesas_publico",
    columns: "concentracao_despesas,maiores_fornecedores,doacoes_a_terceiros",
    bareDigits: true,
    pendingOn404: true,
  },
]

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

export function countDocumentLikeSequences(value: unknown, options: { bareDigits?: boolean } = {}): number {
  if (typeof value === "string") {
    // Evita atravessar uma marca de sanitização e combinar uma data ou outro
    // número posterior como se ainda fosse o documento rotulado.
    const unmaskedOnly = value.replace(ALREADY_MASKED_DOCUMENT_LABEL_RE, "[documento mascarado]")
    const labeled = [...unmaskedOnly.matchAll(DOCUMENT_LIKE_SEQUENCE_RE)].length
    if (!options.bareDigits) return labeled
    // O que já contou acima sai antes, para a mesma sequência não contar duas vezes.
    const rest = unmaskedOnly.replace(DOCUMENT_LIKE_SEQUENCE_RE, " ")
    return labeled + [...rest.matchAll(BARE_DIGIT_RUN_RE)].length
  }
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countDocumentLikeSequences(item, options), 0)
  }
  if (value && typeof value === "object") {
    return Object.values(value).reduce(
      (total: number, item) => total + countDocumentLikeSequences(item, options),
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

export interface TargetScan {
  rows: number
  findings: number
  pendingApply: boolean
}

export async function scanTarget(
  url: string,
  key: string,
  target: ExposureTarget,
  fetcher: typeof fetch = fetch,
  sleep?: (ms: number) => Promise<void>
): Promise<TargetScan> {
  let tableRows = 0
  let tableFindings = 0

  let afterId: string | null = null
  for (;;) {
    let rows: Record<string, unknown>[]
    try {
      rows = await fetchPage(url, key, target.table, target.columns, afterId, fetcher, sleep)
    } catch (error) {
      // 404 só é "pendente" na primeira página: no meio da leitura é falha.
      const notFound = error instanceof Error && error.message.startsWith(`${target.table}: HTTP 404`)
      if (target.pendingOn404 && afterId === null && notFound) {
        return { rows: 0, findings: 0, pendingApply: true }
      }
      throw error
    }
    tableRows += rows.length
    // O id é chave técnica, não texto publicado: fica fora da varredura.
    tableFindings += rows.reduce(
      (total, row) =>
        total + countDocumentLikeSequences({ ...row, id: undefined }, { bareDigits: target.bareDigits }),
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

  return { rows: tableRows, findings: tableFindings, pendingApply: false }
}

async function main(): Promise<void> {
  const { url, key } = loadEnv()
  let totalRows = 0
  let totalFindings = 0

  for (const target of TARGETS) {
    const scan = await scanTarget(url, key, target)
    if (scan.pendingApply) {
      console.log(`${target.table}: pending apply (HTTP 404, migration ainda nao aplicada)`)
      continue
    }
    totalRows += scan.rows
    totalFindings += scan.findings
    console.log(`${target.table}: rows=${scan.rows} document_like=${scan.findings}`)
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
