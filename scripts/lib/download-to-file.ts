import { createWriteStream, existsSync } from "node:fs"

export interface DownloadToFileHooks {
  onCacheHit?: (dest: string) => void
  onStart?: (url: string) => void
  onHttpError?: (status: number, url: string) => void
  onError?: (error: unknown) => void
  fetcher?: typeof fetch
}

/** Implementação única do streaming usado pelos ingests de arquivos do TSE. */
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
  try {
    const response = await (hooks.fetcher ?? fetch)(url)
    if (!response.ok) {
      hooks.onHttpError?.(response.status, url)
      return false
    }

    const reader = response.body?.getReader()
    if (!reader) return false
    const fileStream = createWriteStream(dest)
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fileStream.write(value)
    }
    fileStream.end()
    await new Promise<void>((resolve, reject) => {
      fileStream.on("finish", resolve)
      fileStream.on("error", reject)
    })
    return true
  } catch (error) {
    hooks.onError?.(error)
    return false
  }
}
