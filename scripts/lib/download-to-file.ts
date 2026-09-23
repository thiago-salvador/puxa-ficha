import { createWriteStream, existsSync, renameSync, rmSync } from "node:fs"

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
 * O corpo é gravado em `<dest>.part` e só vira `dest` por rename depois do fim do
 * stream. Falha ou timeout apagam o parcial, para que ele nunca vire cache hit.
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
  const partial = `${dest}.part`
  const signal = AbortSignal.timeout(hooks.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS)
  let fileStream: ReturnType<typeof createWriteStream> | undefined
  try {
    const response = await (hooks.fetcher ?? fetch)(url, { signal })
    if (!response.ok) {
      hooks.onHttpError?.(response.status, url)
      return false
    }

    const reader = response.body?.getReader()
    if (!reader) return false
    // Um fetcher injetado pode ignorar o signal; cancelar o reader garante o teto
    // também na leitura do corpo.
    const cancelOnAbort = () => void reader.cancel(signal.reason).catch(() => {})
    signal.addEventListener("abort", cancelOnAbort, { once: true })
    try {
      fileStream = createWriteStream(partial)
      while (true) {
        const { done, value } = await reader.read()
        // reader.cancel() encerra a leitura como "done"; sem esta checagem o
        // parcial passaria por arquivo completo.
        signal.throwIfAborted()
        if (done) break
        fileStream.write(value)
      }
      const finished = new Promise<void>((resolve, reject) => {
        fileStream!.on("finish", resolve)
        fileStream!.on("error", reject)
      })
      fileStream.end()
      await finished
    } finally {
      signal.removeEventListener("abort", cancelOnAbort)
    }
    renameSync(partial, dest)
    return true
  } catch (error) {
    fileStream?.destroy()
    rmSync(partial, { force: true })
    hooks.onError?.(error)
    return false
  }
}
