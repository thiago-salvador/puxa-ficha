/**
 * Server-only by usage: import only from API routes, Route Handlers e `email.ts`.
 * Sem `import "server-only"` para permitir testes Node (`tsx --test`) no formato JSON.
 */
export type AlertsLogLevel = "info" | "warn" | "error"

export interface AlertsLogPayload {
  route: string
  event: string
  level?: AlertsLogLevel
  httpStatus?: number
  detail?: Record<string, unknown>
}

function isSensitiveDetailKey(key: string): boolean {
  const k = key.toLowerCase()
  if (k === "emailmasked" || k.includes("email_masked")) return false
  if (k === "email" || k === "to" || k === "cc" || k === "bcc" || k === "reply_to") return true
  if (k === "email_hash" || k.endsWith("_email_hash")) return true
  if (k.includes("email") && !k.includes("mask")) return true
  return false
}

/** Remove PII comum (email, hashes de email) de estruturas aninhadas em profundidade limitada. */
export function sanitizeAlertsLogDetail(
  value: unknown,
  depth = 4,
): unknown {
  if (depth <= 0) return value
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAlertsLogDetail(item, depth - 1))
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveDetailKey(key) ? "[REDACTED]" : sanitizeAlertsLogDetail(child, depth - 1)
    }
    return out
  }
  return value
}

/**
 * Structured logs for the email alerts feature (server only).
 * Single JSON line per event — safe for Vercel / platform log drains.
 * Never pass raw emails, tokens, or API keys in `detail` (valores sensíveis são redigidos).
 */
export function logAlertsEvent(payload: AlertsLogPayload): void {
  const rawDetail = payload.detail && Object.keys(payload.detail).length > 0 ? payload.detail : undefined
  const detail = rawDetail
    ? (sanitizeAlertsLogDetail(rawDetail) as Record<string, unknown>)
    : undefined

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    service: "pf-alerts",
    route: payload.route,
    event: payload.event,
    httpStatus: payload.httpStatus,
    level: payload.level ?? "info",
    detail: detail && Object.keys(detail).length > 0 ? detail : undefined,
  })

  switch (payload.level) {
    case "error":
      console.error(line)
      break
    case "warn":
      console.warn(line)
      break
    default:
      console.info(line)
  }
}

export function logAlertsApiExit(
  route: string,
  httpStatus: number,
  reason: string,
  detail?: Record<string, unknown>,
): void {
  const level: AlertsLogLevel = httpStatus >= 500 ? "error" : httpStatus >= 400 ? "warn" : "info"
  logAlertsEvent({
    route,
    event: "http_exit",
    level,
    httpStatus,
    detail: { reason, ...detail },
  })
}
