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

/**
 * Structured logs for the email alerts feature (server only).
 * Single JSON line per event — safe for Vercel / platform log drains.
 * Never pass raw emails, tokens, or API keys in `detail`.
 */
export function logAlertsEvent(payload: AlertsLogPayload): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    service: "pf-alerts",
    route: payload.route,
    event: payload.event,
    httpStatus: payload.httpStatus,
    level: payload.level ?? "info",
    detail: payload.detail && Object.keys(payload.detail).length > 0 ? payload.detail : undefined,
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
