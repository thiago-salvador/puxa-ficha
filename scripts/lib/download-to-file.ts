import { randomUUID } from "node:crypto"
import { createWriteStream, existsSync, linkSync, rmSync } from "node:fs"
import { pipeline } from "node:stream/promises"

/** Teto padrão de um download inteiro (conexão e corpo), igual ao que o ingest 2026 já usava. */
export const DEFAULT_DOWNLOAD_TIMEOUT_MS = 300_000

export interface DownloadToFileHooks {
  onCacheHit?: (dest: string) => void
  onStart?: (url: string) => void
  onHttpError?: (status: number, url: string) => void
  onError?: (error: unknown) => void
  fetcher?: typeof fetch
  timeoutMs?: number
}

/**
 * Implementação única do streaming usado pelos ingests de arquivos do TSE.
 *
 * Cada chamada grava um parcial próprio. Só publica depois do fim da escrita,
 * sem substituir um destino já publicado por outra chamada.
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

  hooks.onStart?.(url)
  const partial = `${dest}.${randomUUID()}.part`
  const signal = AbortSignal.timeout(hooks.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS)
  try {
    const response = await (hooks.fetcher ?? fetch)(url, { signal })
    if (!response.ok) {
      hooks.onHttpError?.(response.status, url)
      return false
    }

    const reader = response.body?.getReader()
    if (!reader) return false
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
      const fileStream = createWriteStream(partial, { flags: "wx" })
      // Se a escrita falhar durante reader.read(), interrompa a leitura também.
      fileStream.once("error", (error) => void reader.cancel(error).catch(() => {}))
      // pipeline registra erros do arquivo antes da primeira leitura e destrói
      // a escrita se o timeout disparar enquanto aguarda o flush.
      await pipeline(chunks(reader), fileStream, { signal })
    } finally {
      signal.removeEventListener("abort", cancelOnAbort)
    }
    signal.throwIfAborted()
    try {
      // O hard link publica o arquivo completo atomicamente, sem sobrescrever
      // a publicação válida de outra chamada ou processo.
      linkSync(partial, dest)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }
    rmSync(partial, { force: true })
    return true
  } catch (error) {
    rmSync(partial, { force: true })
    hooks.onError?.(error)
    return false
  }
}
