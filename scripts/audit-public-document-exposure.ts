import { readFileSync } from "node:fs"
import { resolve } from "node:path"

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

async function fetchPage(
  url: string,
  key: string,
  table: string,
  columns: string,
  offset: number
): Promise<Record<string, unknown>[]> {
  const endpoint = new URL(`${url}/rest/v1/${table}`)
  endpoint.searchParams.set("select", columns)
  endpoint.searchParams.set("offset", String(offset))
  endpoint.searchParams.set("limit", String(PAGE_SIZE))

  let response: Response | null = null
  let lastError: unknown = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(endpoint, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      })
      if (response.ok || response.status < 500) break
    } catch (error) {
      lastError = error
    }
    if (attempt < 3) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 250))
    }
  }

  if (!response) {
    throw new Error(
      `${table}: request failed after 3 attempts${lastError instanceof Error ? `: ${lastError.message}` : ""}`
    )
  }
  if (!response.ok) {
    throw new Error(`${table}: HTTP ${response.status}`)
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

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const rows = await fetchPage(url, key, target.table, target.columns, offset)
      tableRows += rows.length
      tableFindings += rows.reduce(
        (total, row) => total + countDocumentLikeSequences(row),
        0
      )
      if (rows.length < PAGE_SIZE) break
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      "audit:public-document-exposure:gate FAILED:",
      error instanceof Error ? error.message : error
    )
    process.exit(1)
  })
}
