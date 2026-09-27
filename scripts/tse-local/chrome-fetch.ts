import { createHash } from "node:crypto"
import { createReadStream, createWriteStream, existsSync, lstatSync, openSync, readSync, closeSync, chmodSync, statSync, rmSync, renameSync, truncateSync } from "node:fs"
import { dirname } from "node:path"
import { pipeline } from "node:stream/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { chromium, type Browser, type BrowserContext, type Download, type Page, type Response } from "playwright"

const execFileAsync = promisify(execFile)
const MAX_JSON_BYTES = 25 * 1024 * 1024
const MAX_ZIP_BYTES = 2_000_000_000
const MAX_ZIP_CHUNK_BYTES = 4 * 1024 * 1024
const ALLOWED_JSON_HOSTS = new Set(["dadosabertos.tse.jus.br", "divulgacandcontas.tse.jus.br"])
const MAX_ATTEMPTS = 4
const REQUEST_INTERVAL_MS = 1_200

export type DownloadReceipt = { sha256: string; bytes: number }
export type TseChromeClient = {
  getJson(url: string): Promise<unknown>
  downloadZip(url: string, destination: string): Promise<DownloadReceipt>
}

type FetchResponse = Pick<Response, "status" | "url" | "headers" | "text">
type FetchPage = Pick<Page, "goto" | "on" | "off" | "evaluate" | "route" | "unroute">
type FetchContext = Pick<BrowserContext, "newPage" | "close">
type FetchBrowser = Pick<Browser, "newContext" | "close">

export type VisibleTseChromeOptions = {
  /** Dependency seam for tests; production always uses visible system Chrome. */
  launch?: () => Promise<FetchBrowser>
  minIntervalMs?: number
  retryDelayMs?: number
  timeoutMs?: number
  maxAttempts?: number
  sleep?: (ms: number) => Promise<void>
}

function officialUrl(value: string, hosts: ReadonlySet<string>): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new Error("URL oficial inválida") }
  if (url.protocol !== "https:" || !hosts.has(url.hostname) || url.username || url.password) {
    throw new Error("URL fora dos endpoints oficiais permitidos do TSE")
  }
  return url
}

function denied(status: number, text = ""): boolean {
  return status === 401 || status === 403 || /access denied|request blocked|acesso negado|temporarily blocked/i.test(text)
}

function retryable(status: number, text = ""): boolean {
  return status === 429 || status >= 500 || denied(status, text)
}

function retryDelay(response: FetchResponse, baseMs: number, attempt: number): number {
  const raw = response.headers()["retry-after"]
  if (raw && /^\d+(?:\.\d+)?$/.test(raw)) return Math.min(60_000, Number(raw) * 1_000)
  const date = raw ? Date.parse(raw) : NaN
  if (Number.isFinite(date)) return Math.max(0, Math.min(60_000, date - Date.now()))
  return Math.min(30_000, baseMs * 2 ** (attempt - 1))
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs) }),
    ])
  } finally { if (timer) clearTimeout(timer) }
}

async function checkZip(path: string): Promise<DownloadReceipt> {
  const stat = statSync(path)
  if (stat.size < 22 || stat.size > MAX_ZIP_BYTES) throw new Error("ZIP vazio ou acima do limite local")
  const fd = openSync(path, "r")
  try {
    const magic = Buffer.alloc(4)
    readSync(fd, magic, 0, magic.length, 0)
    if (!magic.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new Error("Resposta oficial não tem assinatura ZIP")
  } finally { closeSync(fd) }

  // unzip validates the central directory, compressed members, and CRCs without
  // loading a package in Node memory. Quiet mode prevents filenames/payloads in logs.
  try {
    await execFileAsync("unzip", ["-tqq", path], { timeout: 15 * 60_000, maxBuffer: 64 * 1024 })
  } catch {
    throw new Error("ZIP baixado falhou na verificação de integridade")
  }

  const hash = createHash("sha256")
  let bytes = 0
  for await (const chunk of createReadStream(path)) {
    bytes += (chunk as Buffer).length
    hash.update(chunk as Buffer)
  }
  chmodSync(path, 0o600)
  return { sha256: hash.digest("hex"), bytes }
}

function boundedJson(contentType: string, text: string): unknown {
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) throw new Error("Resposta JSON excede limite local")
  if (!/json/i.test(contentType)) throw new Error("Endpoint oficial não respondeu JSON")
  try { return JSON.parse(text) as unknown } catch { throw new Error("JSON oficial inválido") }
}

/** Opens one visible Chrome context and reuses one page for the whole callback. */
export async function withVisibleTseChrome<T>(
  run: (client: TseChromeClient) => Promise<T>,
  options: VisibleTseChromeOptions = {},
): Promise<T> {
  const launch = options.launch ?? (() => chromium.launch({ channel: "chrome", headless: false }))
  const browser = await launch()
  let context: FetchContext | undefined
  try {
    context = await browser.newContext({ acceptDownloads: true })
    const page = await context.newPage() as FetchPage
    const minIntervalMs = Math.max(0, options.minIntervalMs ?? REQUEST_INTERVAL_MS)
    const retryDelayMs = Math.max(0, options.retryDelayMs ?? 1_500)
    const timeoutMs = Math.max(1, options.timeoutMs ?? 90_000)
    const maxAttempts = Math.max(1, options.maxAttempts ?? MAX_ATTEMPTS)
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
    let nextRequestAt = 0
    let queue = Promise.resolve()

    async function polite<TValue>(operation: () => Promise<TValue>): Promise<TValue> {
      const previous = queue
      let release!: () => void
      queue = new Promise<void>((resolve) => { release = resolve })
      await previous
      try {
        const waitMs = nextRequestAt - Date.now()
        if (waitMs > 0) await sleep(waitMs)
        return await operation()
      } finally {
        nextRequestAt = Date.now() + minIntervalMs
        release()
      }
    }

    const client: TseChromeClient = {
      getJson: (value) => polite(async () => {
        const url = officialUrl(value, ALLOWED_JSON_HOSTS).toString()
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          let response: Response | null = null
          try { response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs }) }
          catch {
            if (attempt === maxAttempts) throw new Error("Falha de rede ao consultar endpoint JSON oficial")
            await sleep(Math.min(30_000, retryDelayMs * 2 ** (attempt - 1)))
            continue
          }
          if (!response) throw new Error("Endpoint JSON oficial não retornou resposta")
          if (new URL(response.url()).hostname !== new URL(url).hostname) throw new Error("Endpoint JSON redirecionou para host não autorizado")
          const status = response.status()
          const headers = response.headers()
          const length = Number(headers["content-length"] ?? 0)
          if (length > MAX_JSON_BYTES) throw new Error("Resposta JSON excede limite local")
          const body = await response.text().catch(() => "")
          if (retryable(status, body)) {
            if (attempt === maxAttempts) throw new Error(`Endpoint JSON oficial temporariamente indisponível (HTTP ${status})`)
            await sleep(Math.max(minIntervalMs, retryDelay(response, retryDelayMs, attempt)))
            continue
          }
          if (status < 200 || status >= 300) throw new Error(`Endpoint JSON oficial respondeu HTTP ${status}`)
          return boundedJson(headers["content-type"] ?? "", body)
        }
        throw new Error("Endpoint JSON oficial excedeu tentativas")
      }),
      downloadZip: (value, destination) => polite(async () => {
        const url = officialUrl(value, new Set(["cdn.tse.jus.br"]))
        if (!url.pathname.toLowerCase().endsWith(".zip")) throw new Error("Download oficial precisa apontar para ZIP")
        if (existsSync(destination)) throw new Error("Destino do ZIP já existe")
        const parent = dirname(destination)
        const parentStat = lstatSync(parent)
        if (parentStat.isSymbolicLink() || !parentStat.isDirectory() || (parentStat.mode & 0o077) !== 0) {
          throw new Error("Diretório de destino precisa ser privado e sem links simbólicos")
        }
        const partial = `${destination}.part`
        const fullPartial = `${partial}.full`
        const requestUrl = url.toString()
        let rangeStart = 0
        let expectedTotal: number | null = null
        await page.route(requestUrl, async (route) => {
          const rangeEnd = Math.min(expectedTotal === null ? MAX_ZIP_BYTES - 1 : expectedTotal - 1, rangeStart + MAX_ZIP_CHUNK_BYTES - 1)
          const headers = { ...route.request().headers(), Range: `bytes=${rangeStart}-${rangeEnd}` }
          await route.continue({ headers })
        })
        try {
          while (expectedTotal === null || rangeStart < expectedTotal) {
            let completed = false
            for (let attempt = 1; attempt <= maxAttempts && !completed; attempt += 1) {
              let currentDownload: Download | undefined
              let resolveDownload!: (event: Download) => void
              let resolveResponse!: (event: Response) => void
              const downloadEvent = new Promise<Download>((resolve) => { resolveDownload = resolve })
              const responseEvent = new Promise<Response>((resolve) => { resolveResponse = resolve })
              const onDownload = (event: Download) => { currentDownload = event; resolveDownload(event) }
              const onResponse = (event: Response) => {
                if (event.url() === requestUrl) resolveResponse(event)
              }
              page.on("download", onDownload)
              page.on("response", onResponse)
              const navigation = page.goto(requestUrl, { waitUntil: "commit", timeout: timeoutMs }).catch(() => null)
              let response: Response
              try {
                response = await withTimeout(responseEvent, timeoutMs, "Tempo esgotado ao aguardar resposta Range")
              } catch {
                page.off("download", onDownload)
                page.off("response", onResponse)
                await navigation
                if (attempt === maxAttempts) throw new Error("Falha de rede ao solicitar trecho ZIP oficial")
                await sleep(Math.max(minIntervalMs, Math.min(30_000, retryDelayMs * 2 ** (attempt - 1))))
                continue
              }
              await navigation
              page.off("response", onResponse)
              if (new URL(response.url()).hostname !== url.hostname) {
                page.off("download", onDownload)
                await currentDownload?.cancel().catch(() => {})
                throw new Error("Download ZIP redirecionou para host não autorizado")
              }
              const status = response.status()
              if (retryable(status)) {
                page.off("download", onDownload)
                await currentDownload?.cancel().catch(() => {})
                if (attempt === maxAttempts) throw new Error(`Download ZIP oficial temporariamente indisponível (HTTP ${status})`)
                await sleep(Math.max(minIntervalMs, retryDelay(response, retryDelayMs, attempt)))
                continue
              }
              if (status === 200) {
                page.off("download", onDownload)
                if (rangeStart !== 0 || existsSync(partial)) {
                  await currentDownload?.cancel().catch(() => {})
                  throw new Error("Resposta ZIP completa inesperada após início de trechos")
                }
                const headers = response.headers()
                const contentType = (headers["content-type"] ?? "").split(";", 1)[0]!.trim().toLowerCase()
                const declaredBytes = Number(headers["content-length"])
                if (!new Set(["application/zip", "application/x-zip-compressed", "application/octet-stream"]).has(contentType) ||
                    !Number.isSafeInteger(declaredBytes) || declaredBytes < 22 || declaredBytes > MAX_ZIP_BYTES) {
                  await currentDownload?.cancel().catch(() => {})
                  throw new Error("Cabeçalhos do ZIP completo inválidos ou acima do limite local")
                }
                const download = currentDownload ?? await withTimeout(downloadEvent, Math.min(timeoutMs, 10_000), "Tempo esgotado ao aguardar download ZIP completo").catch(() => undefined)
                if (!download) throw new Error("Resposta ZIP completa não iniciou download")
                const stream = await download.createReadStream()
                if (!stream) throw new Error("Chrome não disponibilizou o fluxo do ZIP completo")
                let receivedBytes = 0
                const bounded = async function* () {
                  for await (const part of stream) {
                    const chunk = Buffer.from(part as Uint8Array)
                    receivedBytes += chunk.length
                    if (receivedBytes > MAX_ZIP_BYTES || receivedBytes > declaredBytes) throw new Error("ZIP completo excede limite ou Content-Length")
                    yield chunk
                  }
                }
                try {
                  await pipeline(bounded(), createWriteStream(partial, { flags: "wx", mode: 0o600 }))
                } catch {
                  throw new Error("Fluxo do ZIP completo foi interrompido ou excedeu o limite local")
                }
                if (receivedBytes !== declaredBytes) throw new Error("Tamanho do ZIP completo diverge de Content-Length")
                const receipt = await checkZip(partial)
                if (receipt.bytes !== declaredBytes) throw new Error("Tamanho verificado do ZIP diverge de Content-Length")
                renameSync(partial, destination)
                return receipt
              }
              if (status !== 206) {
                page.off("download", onDownload)
                await currentDownload?.cancel().catch(() => {})
                throw new Error(`Download ZIP oficial respondeu HTTP ${status}; resposta Range 206 obrigatória`)
              }

              const contentRange = response.headers()["content-range"] ?? ""
              const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange)
              const start = Number(match?.[1])
              const end = Number(match?.[2])
              const total = Number(match?.[3])
              if (!match || start !== rangeStart || end < start || total < 22 || total > MAX_ZIP_BYTES || end >= total || end - start + 1 > MAX_ZIP_CHUNK_BYTES || (expectedTotal !== null && total !== expectedTotal)) {
                page.off("download", onDownload)
                await currentDownload?.cancel().catch(() => {})
                throw new Error("Cabeçalho Content-Range do ZIP inválido")
              }
              expectedTotal = total
              const download = currentDownload ?? await withTimeout(downloadEvent, Math.min(timeoutMs, 10_000), "Tempo esgotado ao aguardar download Range").catch(() => undefined)
              page.off("download", onDownload)
              if (!download) throw new Error("Resposta Range oficial não iniciou download")
              const stream = await download.createReadStream()
              if (!stream) throw new Error("Chrome não disponibilizou o fluxo do trecho ZIP")
              const iterator = stream[Symbol.asyncIterator]()
              const first = await iterator.next()
              const firstChunk = first.done ? Buffer.alloc(0) : Buffer.from(first.value as Uint8Array)
              const streamParts = async function* () {
                if (firstChunk.length) yield firstChunk
                while (true) {
                  const next = await iterator.next()
                  if (next.done) return
                  yield Buffer.from(next.value as Uint8Array)
                }
              }
              if (rangeStart > 0 && firstChunk.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
                let fullBytes = 0
                const boundedFull = async function* () {
                  for await (const chunk of streamParts()) {
                    fullBytes += chunk.length
                    if (fullBytes > MAX_ZIP_BYTES || fullBytes > total) throw new Error("ZIP completo excede limite ou tamanho oficial")
                    yield chunk
                  }
                }
                try {
                  await pipeline(boundedFull(), createWriteStream(fullPartial, { flags: "wx", mode: 0o600 }))
                } catch {
                  throw new Error("Fluxo do ZIP completo foi interrompido ou excedeu o limite local")
                }
                if (fullBytes !== total) throw new Error("Tamanho do ZIP completo diverge do total oficial")
                const receipt = await checkZip(fullPartial)
                if (receipt.bytes !== total) throw new Error("Tamanho verificado do ZIP diverge do total oficial")
                renameSync(fullPartial, destination)
                rmSync(partial, { force: true })
                return receipt
              }
              const offset = rangeStart
              let chunkBytes = 0
              const measured = async function* () {
                for await (const chunk of streamParts()) {
                  chunkBytes += chunk.length
                  if (chunkBytes > end - start + 1) throw new Error("Trecho ZIP excede Content-Range")
                  yield chunk
                }
              }
              try {
                await pipeline(measured(), createWriteStream(partial, { flags: offset === 0 && !existsSync(partial) ? "wx" : "a", mode: 0o600 }))
              } catch {
                if (existsSync(partial)) truncateSync(partial, offset)
                if (attempt === maxAttempts) throw new Error("Fluxo do trecho ZIP foi interrompido")
                await sleep(Math.max(minIntervalMs, Math.min(30_000, retryDelayMs * 2 ** (attempt - 1))))
                continue
              }
              if (chunkBytes !== end - start + 1 || Number(response.headers()["content-length"] ?? chunkBytes) !== chunkBytes) {
                truncateSync(partial, offset)
                throw new Error("Tamanho do trecho ZIP diverge de Content-Range")
              }
              rangeStart = end + 1
              completed = true
            }
            if (!completed) throw new Error("Trecho ZIP excedeu tentativas")
            if (expectedTotal !== null && rangeStart < expectedTotal) await sleep(minIntervalMs)
          }
          const receipt = await checkZip(partial)
          if (receipt.bytes !== expectedTotal) throw new Error("Tamanho final do ZIP diverge do Content-Range")
          renameSync(partial, destination)
          return receipt
        } catch (error) {
          rmSync(partial, { force: true })
          rmSync(fullPartial, { force: true })
          if (error instanceof Error && /ZIP|Content-Range|integridade|assinatura|limite/.test(error.message)) throw error
          throw new Error("Falha ao baixar ou verificar ZIP oficial")
        } finally {
          await page.unroute(requestUrl).catch(() => undefined)
        }
      }),
    }

    return await run(client)
  } finally {
    await context?.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}
