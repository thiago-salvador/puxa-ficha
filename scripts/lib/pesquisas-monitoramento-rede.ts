import "server-only"

export interface ClienteHttpMonitoramento {
  getText(url: string): Promise<{ body: string; observedAt: string; status: number }>
  getBytes(url: string): Promise<{ body: Uint8Array; observedAt: string; status: number }>
}

interface ClienteOptions {
  allowedOrigins: string[]
  fetchImpl?: typeof fetch
  logger?: (message: string) => void
  maxAttempts?: number
  maxBytes?: number
  maxRedirects?: number
  minIntervalMs?: number
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
  timeoutMs?: number
}

interface RobotsRule {
  allow: boolean
  path: string
}

const USER_AGENT = "PuxaFicha-Monitor/1.0 (+https://github.com/thiago-salvador/puxa-ficha)"

type RobotsGroup = { agents: string[]; rules: RobotsRule[] }

function parseRobotsDirective(rawLine: string): { key: string; value: string } | null {
  const line = rawLine.replace(/#.*$/, "").trim()
  const separator = line.indexOf(":")
  if (!line || separator < 0) return null
  return {
    key: line.slice(0, separator).trim().toLocaleLowerCase("en-US"),
    value: line.slice(separator + 1).trim(),
  }
}

function applyRobotsDirective(groups: RobotsGroup[], current: RobotsGroup | null, key: string, value: string): RobotsGroup | null {
  if (key === "user-agent") {
    const group = !current || current.rules.length > 0 ? { agents: [], rules: [] } : current
    if (group !== current) groups.push(group)
    group.agents.push(value.toLocaleLowerCase("en-US"))
    return group
  }
  if (current && (key === "allow" || key === "disallow") && !(key === "disallow" && value === "")) {
    current.rules.push({ allow: key === "allow", path: value })
  }
  return current
}

function parseRobots(robots: string): RobotsGroup[] {
  const groups: RobotsGroup[] = []
  let current: RobotsGroup | null = null

  for (const rawLine of robots.split(/\r?\n/)) {
    const directive = parseRobotsDirective(rawLine)
    if (directive) current = applyRobotsDirective(groups, current, directive.key, directive.value)
  }
  return groups
}

export function caminhoPermitidoPorRobots(
  robots: string,
  pathname: string,
  userAgent = "puxaficha-monitor",
): boolean {
  const groups = parseRobots(robots)
  const normalizedAgent = userAgent.toLocaleLowerCase("en-US")
  const exact = groups.filter((group) => group.agents.some((agent) => agent !== "*" && normalizedAgent.includes(agent)))
  const applicable = exact.length > 0
    ? exact
    : groups.filter((group) => group.agents.includes("*"))
  const rules = applicable
    .flatMap((group) => group.rules)
    .filter((rule) => rule.path !== "" && pathname.startsWith(rule.path))
    .sort((left, right) => right.path.length - left.path.length || Number(right.allow) - Number(left.allow))
  return rules[0]?.allow ?? true
}

export function redigirUrlParaLog(raw: string): string {
  const url = new URL(raw)
  url.username = ""
  url.password = ""
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "")
}

function retryable(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true
  return error instanceof Error && /timeout|network|fetch failed|ECONNRESET|ETIMEDOUT/i.test(error.message)
}

export function criarClienteHttpMonitoramento(options: ClienteOptions): ClienteHttpMonitoramento {
  const fetchImpl = options.fetchImpl ?? fetch
  const maxAttempts = options.maxAttempts ?? 3
  const maxBytes = options.maxBytes ?? 2_000_000
  const maxRedirects = options.maxRedirects ?? 3
  const minIntervalMs = options.minIntervalMs ?? 1_000
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  const timeoutMs = options.timeoutMs ?? 12_000
  const logger = options.logger ?? (() => undefined)
  const allowedOrigins = new Set(options.allowedOrigins)
  const robotsByOrigin = new Map<string, string>()
  let lastRequestAt = 0

  async function waitForRateLimit(): Promise<void> {
    const wait = Math.max(0, minIntervalMs - (now() - lastRequestAt))
    if (wait > 0) await sleep(wait)
    lastRequestAt = now()
  }

  async function fetchOnce(url: string): Promise<{ response: Response; release: () => void }> {
    await waitForRateLimit()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: "text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "user-agent": USER_AGENT,
        },
        redirect: "manual",
        signal: controller.signal,
      })
      return {
        response,
        release: () => clearTimeout(timeout),
      }
    } catch (error) {
      clearTimeout(timeout)
      throw error
    }
  }

  async function readLimited(response: Response, mode: "text" | "bytes"): Promise<string | Uint8Array> {
    const declaredLength = Number(response.headers.get("content-length"))
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await response.body?.cancel()
      throw new Error("resposta excede limite de bytes")
    }
    if (!response.body) return mode === "text" ? "" : new Uint8Array()

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        total += chunk.value.byteLength
        if (total > maxBytes) {
          await reader.cancel()
          throw new Error("resposta excede limite de bytes")
        }
        chunks.push(chunk.value)
      }
    } finally {
      reader.releaseLock()
    }
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total)
    return mode === "text" ? new TextDecoder().decode(bytes) : new Uint8Array(bytes)
  }

  async function loadRobots(url: URL): Promise<string> {
    const cached = robotsByOrigin.get(url.origin)
    if (cached !== undefined) return cached
    const robotsUrl = `${url.origin}/robots.txt`
    logger(`GET ${redigirUrlParaLog(robotsUrl)} para politica robots`)
    const pending = await fetchOnce(robotsUrl)
    try {
      if (pending.response.status >= 300 && pending.response.status < 400) {
        throw new Error(`robots redirecionou em ${redigirUrlParaLog(robotsUrl)}`)
      }
      if (!pending.response.ok) {
        throw new Error(`robots indisponivel em ${redigirUrlParaLog(robotsUrl)}: HTTP ${pending.response.status}`)
      }
      const body = await readLimited(pending.response, "text")
      if (typeof body !== "string") throw new Error("robots retornou corpo inesperado")
      robotsByOrigin.set(url.origin, body)
      return body
    } finally {
      pending.release()
    }
  }

  async function validateDestination(url: URL): Promise<void> {
    if (url.protocol !== "https:") throw new Error("somente HTTPS e permitido")
    if (!allowedOrigins.has(url.origin)) throw new Error(`origem nao aprovada: ${url.origin}`)
    const robots = await loadRobots(url)
    if (!caminhoPermitidoPorRobots(robots, url.pathname)) {
      throw new Error(`robots bloqueia ${redigirUrlParaLog(url.toString())}`)
    }
  }

  async function performRequest(rawUrl: string, mode: "text" | "bytes", attempt: number) {
    let current = new URL(rawUrl)
    for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
      await validateDestination(current)
      logger(`GET ${redigirUrlParaLog(current.toString())} tentativa ${attempt}/${maxAttempts}`)
      const pending = await fetchOnce(current.toString())
      const response = pending.response
      if (response.status >= 300 && response.status < 400) {
        try {
          await response.body?.cancel()
          const location = response.headers.get("location")
          if (!location) throw new Error("redirecionamento sem Location")
          if (redirect === maxRedirects) throw new Error("limite de redirecionamentos excedido")
          current = new URL(location, current)
        } finally {
          pending.release()
        }
        continue
      }
      try {
        if (!response.ok) return { status: response.status, body: null, observedAt: null }
        const body = await readLimited(response, mode)
        return { body, observedAt: new Date(now()).toISOString(), status: response.status }
      } finally {
        pending.release()
      }
    }
    throw new Error("limite de redirecionamentos excedido")
  }

  function normalizedFinalError(error: unknown, rawUrl: string): Error {
    if (error instanceof DOMException && error.name === "AbortError") {
      return new Error(`timeout ao consultar ${redigirUrlParaLog(rawUrl)}`)
    }
    if (error instanceof Error && /AbortError/i.test(error.message)) {
      return new Error(`timeout ao consultar ${redigirUrlParaLog(rawUrl)}`)
    }
    return error instanceof Error ? error : new Error("fonte indisponivel")
  }

  async function requestAttempt(rawUrl: string, mode: "text" | "bytes", attempt: number) {
    try {
      const result = await performRequest(rawUrl, mode, attempt)
      if (result.body !== null) return { result, error: null, shouldRetry: false }
      const error = new Error(`HTTP ${result.status} em ${redigirUrlParaLog(rawUrl)}`)
      const shouldRetry = result.status === 408 || result.status === 429 || result.status >= 500
      return { result: null, error, shouldRetry }
    } catch (error) {
      return { result: null, error, shouldRetry: retryable(error) }
    }
  }

  async function request(rawUrl: string, mode: "text" | "bytes") {
    let lastError: unknown = null
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const outcome = await requestAttempt(rawUrl, mode, attempt)
      if (outcome.result) return outcome.result
      lastError = outcome.error
      if (!outcome.shouldRetry) break
    }
    throw normalizedFinalError(lastError, rawUrl)
  }

  return {
    async getText(rawUrl) {
      const response = await request(rawUrl, "text")
      if (typeof response.body !== "string") throw new Error("resposta textual inesperada")
      return { ...response, body: response.body }
    },
    async getBytes(rawUrl) {
      const response = await request(rawUrl, "bytes")
      if (typeof response.body === "string") throw new Error("resposta binaria inesperada")
      return { ...response, body: response.body }
    },
  }
}
