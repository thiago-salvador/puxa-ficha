const WAYBACK_ORIGIN = "https://web.archive.org"
const WAYBACK_SAVE_PREFIX = `${WAYBACK_ORIGIN}/save/`

export interface ArchiveUrlOptions {
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

function snapshotUrlFromResponse(response: Response): string | null {
  const candidates = [
    response.headers.get("content-location"),
    response.headers.get("location"),
    response.url,
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const resolved = new URL(candidate, WAYBACK_ORIGIN)
      if (resolved.origin === WAYBACK_ORIGIN && resolved.pathname.startsWith("/web/")) {
        return resolved.toString()
      }
    } catch {
      // Resposta malformada do serviço externo: segue best effort.
    }
  }
  return null
}

/**
 * Solicita um snapshot no Wayback sem transformar indisponibilidade do arquivo
 * em falha do pipeline de origem.
 */
export async function archiveUrl(
  originalUrl: string,
  options: ArchiveUrlOptions = {},
): Promise<string | null> {
  let parsed: URL
  try {
    parsed = new URL(originalUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
  if (parsed.origin === WAYBACK_ORIGIN && parsed.pathname.startsWith("/web/")) {
    return parsed.toString()
  }

  const timeoutMs = Math.max(1, options.timeoutMs ?? 2_500)
  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeout = Symbol("wayback-timeout")
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const responseOrTimeout = await Promise.race([
      fetchImpl(`${WAYBACK_SAVE_PREFIX}${parsed.toString()}`, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      }),
      new Promise<typeof timeout>((resolve) => {
        timer = setTimeout(() => {
          controller.abort()
          resolve(timeout)
        }, timeoutMs)
      }),
    ])

    if (responseOrTimeout === timeout || !responseOrTimeout.ok) return null
    return snapshotUrlFromResponse(responseOrTimeout)
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function archiveFonteReferences<T extends { url?: unknown }>(
  fontes: readonly T[],
  options: ArchiveUrlOptions = {},
): Promise<Array<T & { url_archive?: string }>> {
  return Promise.all(
    fontes.map(async (fonte) => {
      if (typeof fonte.url !== "string") return { ...fonte }
      const urlArchive = await archiveUrl(fonte.url, options)
      return urlArchive ? { ...fonte, url_archive: urlArchive } : { ...fonte }
    }),
  )
}
