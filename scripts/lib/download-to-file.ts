import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createWriteStream, existsSync, linkSync, rmSync, statSync } from "node:fs"
import { pipeline } from "node:stream/promises"

/** Teto padrão de uma tentativa (conexão e corpo), igual ao que o ingest 2026 já usava. */
export const DEFAULT_DOWNLOAD_TIMEOUT_MS = 300_000
const DEFAULT_RETRY_BASE_DELAY_MS = 30_000
const DEFAULT_RETRY_MAX_DELAY_MS = 600_000

/**
 * Respostas que o CDN do TSE devolve de forma intermitente. O 403 entra aqui
 * porque cdn.tse.jus.br alterna 200 e 403 ao longo do dia para o mesmo arquivo
 * (medição de 26/09/2026); 404 continua definitivo.
 */
const RETRYABLE_HTTP_STATUS = new Set([403, 408, 425, 429, 500, 502, 503, 504])

/** Erros de sistema de arquivos não melhoram com outra tentativa. */
const NON_RETRYABLE_FS_CODES = new Set(["ENOENT", "ENOTDIR", "EISDIR", "EACCES", "EPERM", "EROFS", "ENOSPC"])

export interface DownloadRetryPolicy {
  /** Janela total, contada da primeira tentativa, dentro da qual uma nova tentativa ainda começa. 0 = uma tentativa só. */
  windowMs: number
  baseDelayMs?: number
  maxDelayMs?: number
}

export interface DownloadRetryInfo {
  attempt: number
  delayMs: number
  reason: string
  resumeFrom: number
}

export interface DownloadToFileHooks {
  onCacheHit?: (dest: string) => void
  onStart?: (url: string) => void
  onHttpError?: (status: number, url: string) => void
  onError?: (error: unknown) => void
  onRetry?: (info: DownloadRetryInfo) => void
  fetcher?: typeof fetch
  /** Teto de cada tentativa. Sem valor: PF_TSE_DOWNLOAD_TIMEOUT_MS ou o padrão. */
  timeoutMs?: number
  /** Sem valor: PF_TSE_DOWNLOAD_RETRY_WINDOW_MS (ausente = uma tentativa, comportamento anterior). */
  retry?: DownloadRetryPolicy
  /**
   * Prazo absoluto (epoch ms) para todos os downloads. Sem valor:
   * PF_TSE_DOWNLOAD_DEADLINE_MS contado do primeiro download do processo.
   */
  deadlineAt?: number
  /** Confere o arquivo completo antes de publicar; lançar descarta o parcial e conta como falha transitória. */
  verify?: (path: string) => void | Promise<void>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

/**
 * Prazo único do processo: um job que baixa vários pacotes não pode somar uma
 * janela por arquivo e estourar o timeout do job no meio do apply.
 */
let processDeadlineAt: number | null = null

function resolveDeadline(hooks: DownloadToFileHooks, envDeadlineMs: number | undefined, now: () => number): number {
  if (hooks.deadlineAt !== undefined) return hooks.deadlineAt
  if (envDeadlineMs === undefined) return Number.POSITIVE_INFINITY
  processDeadlineAt ??= now() + envDeadlineMs
  return processDeadlineAt
}

/** `unzip -tq`: CRC de todos os membros antes de qualquer uso do arquivo. */
export function verifyZip(path: string): void {
  execFileSync("unzip", ["-tq", path], { stdio: ["ignore", "ignore", "pipe"] })
}

type EnvLike = Record<string, string | undefined>

function positiveIntegerEnv(env: EnvLike, name: string): number | undefined {
  const raw = env[name]
  if (raw === undefined || raw.trim() === "") return undefined
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} deve ser um inteiro não negativo em milissegundos; recebido "${raw}"`)
  }
  return value
}

/**
 * Política de download lida do ambiente dos workflows do TSE. Valor inválido
 * derruba a execução antes de qualquer pedido: configuração errada não pode
 * virar uma janela de espera silenciosamente diferente.
 */
export function downloadPolicyFromEnv(env: EnvLike = process.env): {
  timeoutMs?: number
  retry?: DownloadRetryPolicy
  deadlineMs?: number
} {
  const timeoutMs = positiveIntegerEnv(env, "PF_TSE_DOWNLOAD_TIMEOUT_MS")
  const windowMs = positiveIntegerEnv(env, "PF_TSE_DOWNLOAD_RETRY_WINDOW_MS")
  const baseDelayMs = positiveIntegerEnv(env, "PF_TSE_DOWNLOAD_RETRY_BASE_MS")
  const deadlineMs = positiveIntegerEnv(env, "PF_TSE_DOWNLOAD_DEADLINE_MS")
  return {
    ...(deadlineMs ? { deadlineMs } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(windowMs ? { retry: { windowMs, ...(baseDelayMs ? { baseDelayMs } : {}) } } : {}),
  }
}

/** Espera exponencial: base, 2x base, 4x base..., com teto. */
export function retryDelayMs(attempt: number, policy: DownloadRetryPolicy): number {
  const base = policy.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS
  const max = policy.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS
  return Math.min(max, base * 2 ** Math.max(0, attempt - 1))
}

function isRetryableError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return !(typeof code === "string" && NON_RETRYABLE_FS_CODES.has(code))
}

function partialSize(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

/** `bytes 100-199/200` -> { start: 100, total: 200 }; total desconhecido (`*`) vira null. */
function parseContentRange(value: string | null): { start: number; total: number | null } | null {
  const match = value?.match(/^bytes\s+(\d+)-\d+\/(\d+|\*)$/i)
  if (!match) return null
  return { start: Number(match[1]), total: match[2] === "*" ? null : Number(match[2]) }
}

function expectedLength(response: Response, offset: number, partialContent: boolean): number | null {
  const encoding = response.headers.get("content-encoding")
  if (encoding && encoding.toLowerCase() !== "identity") return null
  if (partialContent) return parseContentRange(response.headers.get("content-range"))?.total ?? null
  const raw = response.headers.get("content-length")
  const length = raw === null ? NaN : Number(raw)
  return Number.isSafeInteger(length) ? offset + length : null
}

/** ETag forte ou, na falta dele, Last-Modified: o que amarra a retomada à mesma versão. */
function responseValidator(response: Response): string | null {
  const etag = response.headers.get("etag")
  return etag && !etag.startsWith("W/") ? etag : response.headers.get("last-modified")
}

type AttemptOutcome =
  | { ok: true }
  | { ok: false; retryable: boolean; reason: string; status?: number; error?: unknown }

/**
 * Implementação única do streaming usado pelos ingests de arquivos do TSE.
 *
 * Cada chamada grava um parcial próprio. Só publica depois do fim da escrita,
 * sem substituir um destino já publicado por outra chamada.
 *
 * Com política de retentativa, uma falha transitória (403 intermitente do CDN,
 * 5xx, rede, timeout) espera com recuo exponencial e tenta de novo dentro da
 * janela. O parcial é mantido entre tentativas e retomado por `Range`, amarrado
 * ao ETag/Last-Modified da primeira resposta via `If-Range`: se o arquivo mudou
 * no servidor, a resposta volta inteira (200) e o parcial é descartado; um 206
 * com validador diferente também recomeça do zero. Toda requisição pede
 * `Accept-Encoding: identity`, para que offset e tamanho sejam bytes do arquivo.
 * Nenhuma tentativa começa depois do prazo do processo e cada uma é cortada
 * nele. Esgotada a janela ou o prazo, a chamada falha fechado e apaga o parcial.
 */
export async function downloadToFile(
  url: string,
  dest: string,
  hooks: DownloadToFileHooks = {},
): Promise<boolean> {
  if (existsSync(dest)) {
    hooks.onCacheHit?.(dest)
    return true
  }

  const envPolicy = downloadPolicyFromEnv()
  const timeoutMs = hooks.timeoutMs ?? envPolicy.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS
  const retry = hooks.retry ?? envPolicy.retry ?? { windowMs: 0 }
  const now = hooks.now ?? Date.now
  const sleep = hooks.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const fetcher = hooks.fetcher ?? fetch
  const deadlineAt = resolveDeadline(hooks, envPolicy.deadlineMs, now)

  hooks.onStart?.(url)
  const partial = `${dest}.${randomUUID()}.part`
  let validator: string | null = null
  const startedAt = now()

  async function attempt(): Promise<AttemptOutcome> {
    const offset = validator ? partialSize(partial) : 0
    if (offset === 0) rmSync(partial, { force: true })
    const signal = AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, deadlineAt - now())))
    const headers: Record<string, string> = { "Accept-Encoding": "identity" }
    if (offset > 0 && validator) Object.assign(headers, { Range: `bytes=${offset}-`, "If-Range": validator })
    const init: RequestInit = { signal, headers }

    const response = await fetcher(url, init)
    if (response.status === 416) {
      await response.body?.cancel().catch(() => {})
      rmSync(partial, { force: true })
      validator = null
      return { ok: false, retryable: true, reason: "HTTP 416 ao retomar", status: 416 }
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      hooks.onHttpError?.(response.status, url)
      return {
        ok: false,
        retryable: RETRYABLE_HTTP_STATUS.has(response.status),
        reason: `HTTP ${response.status}`,
        status: response.status,
      }
    }

    const partialContent = response.status === 206
    if (partialContent) {
      const range = parseContentRange(response.headers.get("content-range"))
      const current = responseValidator(response)
      const reason =
        offset === 0 || !range || range.start !== offset
          ? "Content-Range inesperado"
          : current !== null && current !== validator
            ? "206 de outra versão do arquivo"
            : null
      if (reason) {
        await response.body?.cancel().catch(() => {})
        rmSync(partial, { force: true })
        validator = null
        return { ok: false, retryable: true, reason }
      }
    } else {
      // Resposta inteira: o parcial anterior (se houver) não vale mais.
      validator = responseValidator(response)
    }
    const append = partialContent
    const total = expectedLength(response, append ? offset : 0, partialContent)

    const reader = response.body?.getReader()
    if (!reader) return { ok: false, retryable: true, reason: "resposta sem corpo" }
    // Um fetcher injetado pode ignorar o signal; cancelar o reader libera a leitura.
    const cancelOnAbort = () => void reader.cancel(signal.reason).catch(() => {})
    signal.addEventListener("abort", cancelOnAbort, { once: true })
    try {
      async function* chunks(bodyReader: NonNullable<typeof reader>) {
        while (true) {
          const { done, value } = await bodyReader.read()
          signal.throwIfAborted()
          if (done) return
          yield value
        }
      }
      const fileStream = createWriteStream(partial, { flags: append ? "a" : "w" })
      // Se a escrita falhar durante reader.read(), interrompa a leitura também.
      fileStream.once("error", (error) => void reader.cancel(error).catch(() => {}))
      // pipeline registra erros do arquivo antes da primeira leitura e destrói
      // a escrita se o timeout disparar enquanto aguarda o flush.
      await pipeline(chunks(reader), fileStream, { signal })
    } finally {
      signal.removeEventListener("abort", cancelOnAbort)
    }
    signal.throwIfAborted()

    const size = partialSize(partial)
    if (total !== null && size !== total) {
      if (size > total) {
        rmSync(partial, { force: true })
        validator = null
      }
      return { ok: false, retryable: true, reason: `corpo com ${size} de ${total} bytes` }
    }
    if (hooks.verify) {
      try {
        await hooks.verify(partial)
      } catch (error) {
        rmSync(partial, { force: true })
        validator = null
        return { ok: false, retryable: true, reason: `arquivo reprovado na conferência: ${String(error).slice(0, 200)}` }
      }
    }

    try {
      // O hard link publica o arquivo completo atomicamente, sem sobrescrever
      // a publicação válida de outra chamada ou processo.
      linkSync(partial, dest)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }
    rmSync(partial, { force: true })
    return { ok: true }
  }

  for (let attemptNumber = 1; ; attemptNumber += 1) {
    if (now() >= deadlineAt) {
      rmSync(partial, { force: true })
      hooks.onError?.(new Error("prazo de download do processo esgotado"))
      return false
    }
    let outcome: AttemptOutcome
    try {
      outcome = await attempt()
    } catch (error) {
      hooks.onError?.(error)
      outcome = { ok: false, retryable: isRetryableError(error), reason: String(error), error }
    }
    if (outcome.ok) return true

    const delayMs = retryDelayMs(attemptNumber, retry)
    const elapsed = now() - startedAt
    if (
      !outcome.retryable ||
      retry.windowMs <= 0 ||
      elapsed + delayMs > retry.windowMs ||
      now() + delayMs >= deadlineAt
    ) {
      rmSync(partial, { force: true })
      return false
    }
    hooks.onRetry?.({
      attempt: attemptNumber,
      delayMs,
      reason: outcome.reason,
      resumeFrom: validator ? partialSize(partial) : 0,
    })
    await sleep(delayMs)
  }
}
