/** Download local dos ZIPs eleitorais oficiais usados na prova de cobertura.
 *
 * Saída e manifesto ficam fora do repositório. O catálogo CKAN é consultado a
 * cada execução; recurso ausente ou ambíguo aborta antes do download.
 */
import { createHash } from "node:crypto"
import { createReadStream, createWriteStream, existsSync, mkdirSync, openSync, closeSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { pathToFileURL } from "node:url"
import { assertOutsideRepository } from "./lib/private-output"

type Family = "perfil_atual" | "historico_politico" | "patrimonio" | "financiamento"
type Resource = { name?: string; url?: string; format?: string }
type Catalog = { resources?: Resource[]; metadata_modified?: string }
type Asset = { family: Family; year: number; path: string; url: string; sha256: string; bytes: number; catalog_url: string; catalog_revision: string | null; reused_cache?: boolean }
type Pending = { family: Family; year: number; catalog_url: string; reason: string; diagnostic?: DownloadDiagnostic }

/** Fatos observados numa tentativa de download, sem interpretação de causa.
 *  `etapa` diz onde parou: resposta (antes do status), status (HTTP não ok),
 *  corpo (leitura interrompida) ou validacao (arquivo recebido, mas inválido). */
type DownloadAttempt = {
  tentativa: number
  etapa: "resposta" | "status" | "corpo" | "validacao"
  http_status: number | null
  content_length: number | null
  bytes_recebidos: number
  duracao_ms: number
  erro: string
  causa: Array<{ name: string; code: string | null; message: string }>
}
type DownloadDiagnostic = { url: string; tentativas: DownloadAttempt[] }

export class DownloadError extends Error {
  constructor(message: string, readonly diagnostic: DownloadDiagnostic) { super(message) }
}

export function assertCompleteAssets(assets: readonly Asset[], pending: readonly Pending[]): void {
  if (assets.length === 0 || pending.length > 0) {
    const faltantes = pending.map((item) => `${item.family}/${item.year} (${item.reason})`).join("; ")
    throw new Error(`pacotes oficiais incompletos: ${assets.length} asset(s), ${pending.length} pendente(s)${faltantes ? `: ${faltantes}` : ""}`)
  }
}

/** Pendência com o diagnóstico do download preservado no manifesto (0600, fora do repo). */
export function pendingFrom(family: Family, year: number, catalogUrl: string, error: unknown): Pending {
  const reason = error instanceof Error ? error.message : String(error)
  return error instanceof DownloadError
    ? { family, year, catalog_url: catalogUrl, reason, diagnostic: error.diagnostic }
    : { family, year, catalog_url: catalogUrl, reason }
}

const CATALOG_BASE = "https://dadosabertos.tse.jus.br/api/3/action/package_show?id="
const MAX_BYTES = 2_000_000_000

function option(name: string): string | null {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
}

function officialZip(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" && parsed.hostname === "cdn.tse.jus.br" && parsed.pathname.toLowerCase().endsWith(".zip")
  } catch { return false }
}

async function catalog(slug: string): Promise<{ url: string; data: Catalog }> {
  const url = `${CATALOG_BASE}${encodeURIComponent(slug)}`
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`${slug}: catálogo HTTP ${response.status}`)
  const body = await response.json() as { success?: boolean; result?: Catalog }
  if (body.success !== true || !Array.isArray(body.result?.resources)) throw new Error(`${slug}: catálogo sem recursos válidos`)
  return { url, data: body.result }
}

function select(resources: Resource[], family: Family, year: number): { name: string; url: string } {
  if (family === "financiamento") {
    const preferredNames = new Set([`prestacao_contas_${year}.zip`, `prestacao_final_${year}.zip`])
    const preferred = resources.filter((item) => typeof item.url === "string" && officialZip(item.url) && preferredNames.has(basename(new URL(item.url).pathname).toLowerCase()))
    if (preferred.length === 1) return { name: preferred[0]!.name ?? "", url: preferred[0]!.url! }
  }
  const exactPath = family === "financiamento"
    ? new RegExp(`/(?:prestacao_contas|prestacao_de_contas)[^/]*${year}[^/]*\\.zip$`, "i")
    : family === "patrimonio"
      ? new RegExp(`/bem_candidato_${year}\\.zip$`, "i")
      : new RegExp(`/consulta_cand_${year}\\.zip$`, "i")
  const matches = resources.filter((item) => typeof item.url === "string" && officialZip(item.url) && exactPath.test(new URL(item.url).pathname))
  const candidateNamed = family === "financiamento"
    ? matches.filter((item) => /candidat/i.test(item.name ?? "") || /candidat/i.test(item.url ?? ""))
    : []
  // Pleitos antigos publicam um único ZIP `prestacao_contas_<ano>.zip`, sem
  // a palavra candidato no nome do recurso. A seleção só é inequívoca quando
  // há exatamente esse único ZIP oficial no catálogo da eleição.
  const filtered = family === "financiamento" && candidateNamed.length === 0 && matches.length === 1
    ? matches
    : family === "financiamento" ? candidateNamed : matches
  if (filtered.length !== 1) throw new Error(`${family}/${year}: ${filtered.length} recursos oficiais inequívocos no catálogo`)
  return { name: filtered[0]!.name ?? "", url: filtered[0]!.url! }
}

/** Cadeia de `cause` como observada (undici põe o motivo real do "terminated"
 *  em `cause`, por exemplo UND_ERR_SOCKET). Limitada para não crescer sem fim. */
function causeChain(error: unknown): DownloadAttempt["causa"] {
  const chain: DownloadAttempt["causa"] = []
  let current: unknown = error instanceof Error ? error.cause : undefined
  while (current && chain.length < 4) {
    const item = current as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown }
    chain.push({
      name: typeof item.name === "string" ? item.name : typeof current,
      code: typeof item.code === "string" ? item.code : null,
      message: String(typeof item.message === "string" ? item.message : current).slice(0, 200),
    })
    current = item.cause
  }
  return chain
}

function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error).slice(0, 200)
  return `${error.name === "Error" ? "" : `${error.name}: `}${error.message}`.slice(0, 200)
}

function describeDownloadFailure(diagnostic: DownloadDiagnostic): string {
  const last = diagnostic.tentativas.at(-1)
  if (!last) return "download sem tentativa registrada"
  const of = last.content_length === null ? "" : ` de ${last.content_length}`
  const status = last.http_status === null ? "sem resposta HTTP" : `HTTP ${last.http_status}`
  const cause = last.causa.map((item) => [item.code, item.message].filter(Boolean).join(" ")).join(" <- ")
  return `${last.erro} na etapa ${last.etapa} (${status}, ${last.bytes_recebidos}${of} bytes, ${Math.round(last.duracao_ms / 1000)} s` +
    `${cause ? `, causa: ${cause}` : ""}; ${diagnostic.tentativas.length} tentativa(s))`
}

type DownloadOptions = {
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  attempts?: number
  backoffMs?: readonly number[]
  timeoutMs?: number
  now?: () => number
}

class AttemptFailure extends Error {
  constructor(readonly attempt: DownloadAttempt, readonly retryable: boolean) { super(attempt.erro) }
}

async function downloadOnce(url: string, path: string, attempt: number, options: Required<Pick<DownloadOptions, "fetchImpl" | "timeoutMs" | "now">>): Promise<{ sha256: string; bytes: number }> {
  const started = options.now()
  let bytes = 0
  let status: number | null = null
  let contentLength: number | null = null
  const fail = (etapa: DownloadAttempt["etapa"], error: unknown, retryable: boolean): AttemptFailure => new AttemptFailure({
    tentativa: attempt, etapa, http_status: status, content_length: contentLength, bytes_recebidos: bytes,
    duracao_ms: options.now() - started, erro: errorText(error), causa: causeChain(error),
  }, retryable)
  let response: Response
  try {
    response = await options.fetchImpl(url, { signal: AbortSignal.timeout(options.timeoutMs) })
  } catch (error) {
    throw fail("resposta", error, true)
  }
  status = response.status
  // Com content-encoding, o tamanho declarado é do corpo comprimido; não compara.
  const encoding = (response.headers.get("content-encoding") ?? "identity").toLowerCase()
  const declared = Number(response.headers.get("content-length"))
  contentLength = encoding === "identity" && Number.isFinite(declared) && declared > 0 ? declared : null
  if (!response.ok || !response.body) {
    // 4xx (salvo 429) não muda repetindo; 5xx e 429 podem ser transitórios.
    throw fail("status", new Error(`${basename(path)}: HTTP ${response.status}`), status === 429 || status >= 500)
  }
  const hash = createHash("sha256")
  // Lê direto do corpo: Readable.fromWeb descarta o buffer quando o fluxo
  // falha, e os bytes recebidos antes do erro sumiriam do diagnóstico.
  const reader = response.body.getReader()
  let overLimit = false
  async function* measured() {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      const chunk = Buffer.from(value)
      bytes += chunk.length
      if (bytes > MAX_BYTES) { overLimit = true; throw new Error(`${basename(path)} excede limite local de 2 GB`) }
      hash.update(chunk)
      yield chunk
    }
  }
  try {
    await pipeline(Readable.from(measured()), createWriteStream(path, { mode: 0o600, flags: "wx" }))
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw fail("corpo", error, !overLimit)
  }
  if (contentLength !== null && bytes !== contentLength) {
    throw fail("corpo", new Error(`${basename(path)}: corpo com ${bytes} de ${contentLength} bytes declarados`), true)
  }
  if (bytes < 4) throw fail("validacao", new Error(`${basename(path)} vazio/incompleto`), false)
  const fd = openSync(path, "r")
  try {
    const magic = Buffer.alloc(4)
    readSync(fd, magic, 0, 4, 0)
    if (magic[0] !== 0x50 || magic[1] !== 0x4b || magic[2] !== 0x03 || magic[3] !== 0x04) throw fail("validacao", new Error(`${basename(path)} não é ZIP`), false)
  } finally { closeSync(fd) }
  return { sha256: hash.digest("hex"), bytes }
}

/** Baixa com retry limitado da leitura. Cada tentativa recomeça do zero em
 *  arquivo novo; o diagnóstico de todas as tentativas segue no erro final. */
export async function download(url: string, path: string, options: DownloadOptions = {}): Promise<{ sha256: string; bytes: number; tentativas: number }> {
  const attempts = options.attempts ?? 3
  const backoff = options.backoffMs ?? [15_000, 60_000]
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)))
  const once = { fetchImpl: options.fetchImpl ?? fetch, timeoutMs: options.timeoutMs ?? 600_000, now: options.now ?? Date.now }
  const history: DownloadAttempt[] = []
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await downloadOnce(url, path, attempt, once)
      return { ...result, tentativas: attempt }
    } catch (error) {
      rmSync(path, { force: true })
      if (!(error instanceof AttemptFailure)) throw error
      history.push(error.attempt)
      console.error(JSON.stringify({ download: basename(new URL(url).pathname), ...error.attempt }))
      if (!error.retryable || attempt === attempts) break
      await sleep(backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 0)
    }
  }
  const diagnostic = { url, tentativas: history }
  throw new DownloadError(describeDownloadFailure(diagnostic), diagnostic)
}

async function fileSha256(path: string): Promise<string> {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}

async function localCache(url: string, directory: string | null): Promise<{ path: string; sha256: string; bytes: number; reused_cache: true } | null> {
  if (!directory) return null
  const root = assertOutsideRepository(directory, "--cache-dir")
  const path = join(root, basename(new URL(url).pathname))
  if (!existsSync(path)) return null
  const fd = openSync(path, "r")
  try {
    const magic = Buffer.alloc(4)
    readSync(fd, magic, 0, 4, 0)
    if (magic[0] !== 0x50 || magic[1] !== 0x4b || magic[2] !== 0x03 || magic[3] !== 0x04) throw new Error(`cache não é ZIP: ${path}`)
  } finally { closeSync(fd) }
  return { path, sha256: await fileSha256(path), bytes: statSync(path).size, reused_cache: true }
}

async function main(): Promise<void> {
  const destination = option("destino")
  const years = option("years")?.split(",").map(Number) ?? []
  const selectedFamilies = new Set((option("families") ?? "perfil_atual,historico_politico,patrimonio,financiamento").split(","))
  if (!destination || !years.length || years.some((year) => !Number.isInteger(year) || year < 1996 || year > 2026) || new Set(years).size !== years.length) {
    throw new Error("uso: --destino=<pasta privada> --years=2018,2020,2022,2024,2026")
  }
  if (selectedFamilies.size === 0 || [...selectedFamilies].some((family) => !["perfil_atual", "historico_politico", "patrimonio", "financiamento"].includes(family))) {
    throw new Error("--families aceita perfil_atual,historico_politico,patrimonio,financiamento")
  }
  const out = assertOutsideRepository(destination, "destino")
  mkdirSync(out, { recursive: true, mode: 0o700 })
  const cacheDirectory = option("cache-dir")
  const assets: Asset[] = []
  const pending: Pending[] = []
  for (const year of years.sort((a, b) => a - b)) {
    const candidateSlug = year === 2020 ? "candidatos-2020-subtemas" : `candidatos-${year}`
    const candidateCatalog = await catalog(candidateSlug).catch(() => null)
    const financeCatalog = await catalog(`prestacao-de-contas-eleitorais-${year}`).catch(() => null)
    const requested: Array<{ family: Family; from: { url: string; data: Catalog } }> = []
    if (candidateCatalog) {
      requested.push(...(
        [
        { family: "perfil_atual", from: candidateCatalog },
        { family: "historico_politico", from: candidateCatalog },
        { family: "patrimonio", from: candidateCatalog },
        ] as Array<{ family: Family; from: { url: string; data: Catalog } }>
      ).filter((item) => selectedFamilies.has(item.family)))
    } else {
      for (const family of ["perfil_atual", "historico_politico", "patrimonio"] as const) {
        if (selectedFamilies.has(family)) pending.push({ family, year, catalog_url: `${CATALOG_BASE}${encodeURIComponent(candidateSlug)}`, reason: "catálogo oficial indisponível" })
      }
    }
    const downloaded = new Map<string, { path: string; sha256: string; bytes: number }>()
    for (const item of requested) {
      try {
        const resource = select(item.from.data.resources!, item.family, year)
        let local = downloaded.get(resource.url)
        if (!local) {
          local = await localCache(resource.url, cacheDirectory) ?? undefined
          if (local) downloaded.set(resource.url, local)
        }
        if (!local) {
          const filename = basename(new URL(resource.url).pathname)
          const temporary = join(out, `${filename}.${process.pid}.tmp`)
          try {
            const result = await download(resource.url, temporary)
            const path = join(out, `${filename.slice(0, -4)}-${result.sha256.slice(0, 12)}.zip`)
            if (existsSync(path)) {
              if (await fileSha256(path) !== result.sha256) throw new Error(`cache local diverge do SHA: ${path}`)
              rmSync(temporary, { force: true })
            } else renameSync(temporary, path)
            local = { path, ...result }
            downloaded.set(resource.url, local)
          } catch (error) {
            rmSync(temporary, { force: true })
            throw error
          }
        }
        assets.push({ family: item.family, year, path: local.path, url: resource.url, sha256: local.sha256, bytes: local.bytes, catalog_url: item.from.url, catalog_revision: item.from.data.metadata_modified ?? null, reused_cache: "reused_cache" in local ? true : undefined })
      } catch (error) {
        pending.push(pendingFrom(item.family, year, item.from.url, error))
      }
    }
    if (!selectedFamilies.has("financiamento")) continue
    if (!financeCatalog) {
      pending.push({ family: "financiamento", year, catalog_url: `${CATALOG_BASE}${encodeURIComponent(`prestacao-de-contas-eleitorais-${year}`)}`, reason: "catálogo oficial indisponível" })
    } else {
      try {
        const resource = select(financeCatalog.data.resources!, "financiamento", year)
        const filename = basename(new URL(resource.url).pathname)
        const temporary = join(out, `${filename}.${process.pid}.tmp`)
        let local: { path: string; sha256: string; bytes: number; reused_cache?: boolean } | null = await localCache(resource.url, cacheDirectory)
        if (!local) {
        try {
          const result = await download(resource.url, temporary)
          const path = join(out, `${filename.slice(0, -4)}-${result.sha256.slice(0, 12)}.zip`)
          if (existsSync(path)) {
            if (await fileSha256(path) !== result.sha256) throw new Error(`cache local diverge do SHA: ${path}`)
            rmSync(temporary, { force: true })
          } else renameSync(temporary, path)
          local = { path, ...result }
        } catch (error) {
          rmSync(temporary, { force: true })
          throw error
        }
        }
        assets.push({ family: "financiamento", year, path: local.path, url: resource.url, sha256: local.sha256, bytes: local.bytes, catalog_url: financeCatalog.url, catalog_revision: financeCatalog.data.metadata_modified ?? null, reused_cache: "reused_cache" in local ? true : undefined })
      } catch (error) {
        pending.push(pendingFrom("financiamento", year, financeCatalog.url, error))
      }
    }
  }
  const manifest = { schema_version: 1, generated_at: new Date().toISOString(), assets, pending }
  const manifestPath = join(out, "tse-family-assets.json")
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  console.log(JSON.stringify({ manifest: manifestPath, resources: new Set(assets.map((asset) => asset.path)).size, assets: assets.length, pending: pending.length, years }))
  assertCompleteAssets(assets, pending)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
}
