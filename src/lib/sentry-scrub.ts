/**
 * O match e exato por Set (nao substring), entao cada nome de parâmetro que
 * carrega segredo precisa estar listado aqui literalmente.
 *
 * `manage`, `verify` e `unsubscribe` sao os nomes que os links de email usam de
 * verdade (buildAlertManageUrl e irmas em src/lib/alerts-shared.ts). Sem eles, o
 * token de gerenciamento de alertas ia integro para o Sentry dentro do
 * breadcrumb de navegacao. Review de 2026-08-03.
 */
const SENSITIVE_KEYS_SOURCE = [
  "token",
  "manage",
  "manageToken",
  "manage_token",
  "verify",
  "verifyToken",
  "verify_token",
  "unsubscribe",
  "previewToken",
  "preview_token",
  "bypass",
  "secret",
  "apiKey",
  "api_key",
  "email",
  "access_token",
  "refresh_token",
] as const

const SENSITIVE_KEYS_NORMALIZED = new Set(SENSITIVE_KEYS_SOURCE.map((k) => k.toLowerCase()))

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS_NORMALIZED.has(key.toLowerCase())
}

const REDACTED = "[REDACTED]"

export function redactSensitiveUrl(input: string | undefined | null): string | undefined {
  if (!input) return input ?? undefined
  const raw = input
  const qIndex = raw.indexOf("?")
  if (qIndex === -1) return raw
  const head = raw.slice(0, qIndex)
  const rest = raw.slice(qIndex + 1)
  const hashIndex = rest.indexOf("#")
  const queryPart = hashIndex === -1 ? rest : rest.slice(0, hashIndex)
  const hashPart = hashIndex === -1 ? "" : rest.slice(hashIndex)
  if (!queryPart) return raw

  const pairs = queryPart.split("&").map((pair) => {
    const eq = pair.indexOf("=")
    if (eq === -1) return pair
    const key = pair.slice(0, eq)
    const decodedKey = safeDecode(key)
    if (isSensitiveKey(decodedKey)) {
      return `${key}=${REDACTED}`
    }
    return pair
  })

  return `${head}?${pairs.join("&")}${hashPart}`
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

type ScrubbableEvent = {
  request?: {
    url?: string | undefined
    query_string?: string | Record<string, string> | undefined
  } | undefined
  breadcrumbs?: Array<{ data?: Record<string, unknown> | undefined } | null | undefined> | undefined
  tags?: Record<string, unknown> | undefined
  extra?: Record<string, unknown> | undefined
}

export function scrubSentryEvent<T>(event: T | null | undefined): T | null {
  if (!event) return event ?? null
  const target = event as unknown as ScrubbableEvent

  if (target.request?.url) {
    target.request.url = redactSensitiveUrl(target.request.url)
  }
  if (target.request && target.request.query_string !== undefined) {
    target.request.query_string = scrubQueryString(target.request.query_string)
  }

  if (Array.isArray(target.breadcrumbs)) {
    for (const crumb of target.breadcrumbs) {
      if (crumb && crumb.data && typeof crumb.data === "object") {
        const data = crumb.data as Record<string, unknown>
        if (typeof data.url === "string") data.url = redactSensitiveUrl(data.url)
        if (typeof data.to === "string") data.to = redactSensitiveUrl(data.to)
        if (typeof data.from === "string") data.from = redactSensitiveUrl(data.from)
      }
    }
  }

  scrubBagInPlace(target.tags)
  scrubBagInPlace(target.extra)

  return event
}

function scrubBagInPlace(bag: Record<string, unknown> | undefined) {
  if (!bag || typeof bag !== "object") return
  for (const key of Object.keys(bag)) {
    if (isSensitiveKey(key)) {
      bag[key] = REDACTED
    }
  }
}

function scrubQueryString(
  value: string | Record<string, string> | undefined
): string | Record<string, string> | undefined {
  if (value === undefined) return value
  if (typeof value === "string") {
    const parts = value.split("&").map((pair) => {
      const eq = pair.indexOf("=")
      if (eq === -1) return pair
      const key = pair.slice(0, eq)
      if (isSensitiveKey(safeDecode(key))) return `${key}=${REDACTED}`
      return pair
    })
    return parts.join("&")
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = isSensitiveKey(k) ? REDACTED : v
  }
  return out
}
