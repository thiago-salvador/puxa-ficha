import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { alertBodyStringField, findSubscriberByManageToken, normalizeOpaqueToken } from "@/lib/alerts"
import { clearAlertManageTokenCookie, setAlertManageTokenCookie } from "@/lib/alerts-session"
import { rejectCrossSiteAlertsMutation } from "@/lib/alerts-csrf"
import { logAlertsApiExit } from "@/lib/alerts-log"
import {
  isRequestBodyTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body"
import {
  createDistributedIpRateLimiter,
  rateLimitExceededResponse,
} from "@/lib/request-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Sem limite, um POST com manageToken inventado custava um SELECT service_role em
// alert_subscribers e ocupava um slot do semaforo do Supabase, degradando a ficha
// publica junto. A irma /api/alerts/me ja tinha esse guard. Review de 2026-08-03.
const sessionRateLimiter = createDistributedIpRateLimiter({
  namespace: "alerts-session",
  max: 120,
  windowMs: 60_000,
})

interface SessionDeps {
  findSubscriberByManageToken: typeof findSubscriberByManageToken
  logAlertsApiExit: typeof logAlertsApiExit
}

const defaultSessionDeps: SessionDeps = {
  findSubscriberByManageToken,
  logAlertsApiExit,
}

export function createSessionPostHandler(deps: SessionDeps = defaultSessionDeps) {
  return async function POST(req: NextRequest) {
    const csrfResponse = rejectCrossSiteAlertsMutation(req, "session", deps.logAlertsApiExit)
    if (csrfResponse) return csrfResponse

    const decision = await sessionRateLimiter.check(req.headers)
    if (!decision.allowed) {
      deps.logAlertsApiExit("session", decision.unavailable ? 503 : 429, "rate_limited")
      return rateLimitExceededResponse(decision)
    }

    let body: unknown
    try {
      body = await readJsonBodyWithLimit(req)
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        deps.logAlertsApiExit("session", 413, "body_too_large")
        return NextResponse.json({ error: "Payload too large" }, { status: 413 })
      }
      deps.logAlertsApiExit("session", 400, "invalid_json")
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const manageToken = normalizeOpaqueToken(alertBodyStringField(body, "manageToken"))
    if (!manageToken) {
      deps.logAlertsApiExit("session", 400, "invalid_payload")
      return NextResponse.json({ error: "Invalid manage token" }, { status: 400 })
    }

    const subscriber = await deps.findSubscriberByManageToken(manageToken)
    if (!subscriber) {
      deps.logAlertsApiExit("session", 403, "subscriber_not_found")
      return NextResponse.json({ error: "Invalid manage token" }, { status: 403 })
    }

    deps.logAlertsApiExit("session", 200, "cookie_set")
    return setAlertManageTokenCookie(NextResponse.json({ ok: true }), manageToken)
  }
}

export function createSessionDeleteHandler(deps: Pick<SessionDeps, "logAlertsApiExit"> = defaultSessionDeps) {
  return async function DELETE(req: NextRequest) {
    const csrfResponse = rejectCrossSiteAlertsMutation(req, "session", deps.logAlertsApiExit)
    if (csrfResponse) return csrfResponse

    deps.logAlertsApiExit("session", 200, "cookie_cleared")
    return clearAlertManageTokenCookie(NextResponse.json({ ok: true }))
  }
}

export const POST = createSessionPostHandler()
export const DELETE = createSessionDeleteHandler()
