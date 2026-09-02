import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { alertBodyStringField, createAlertsServiceRoleClient, findSubscriberByManageToken } from "@/lib/alerts"
import { clearAlertManageTokenCookie, readAlertManageTokenCookie, resolveAlertManageToken } from "@/lib/alerts-session"
import { rejectCrossSiteAlertsMutation } from "@/lib/alerts-csrf"
import { logAlertsApiExit } from "@/lib/alerts-log"
import {
  isRequestBodyTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body"
import {
  createFixedWindowIpRateLimiter,
  rateLimitExceededResponse,
} from "@/lib/request-rate-limit"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Ver o comentario em src/app/api/alerts/session/route.ts: as quatro rotas de
// mutacao de alertas faziam SELECT com service role sem nenhum teto.
const deleteDataRateLimiter = createFixedWindowIpRateLimiter({
  namespace: "alerts-delete-data",
  max: 120,
  windowMs: 60_000,
})

interface DeleteDataDeps {
  createAlertsServiceRoleClient: typeof createAlertsServiceRoleClient
  findSubscriberByManageToken: typeof findSubscriberByManageToken
  logAlertsApiExit: typeof logAlertsApiExit
}

const defaultDeleteDataDeps: DeleteDataDeps = {
  createAlertsServiceRoleClient,
  findSubscriberByManageToken,
  logAlertsApiExit,
}

export function createDeleteDataHandler(deps: DeleteDataDeps = defaultDeleteDataDeps) {
  return async function POST(req: NextRequest) {
    const csrfResponse = rejectCrossSiteAlertsMutation(req, "delete-data", deps.logAlertsApiExit)
    if (csrfResponse) return csrfResponse

    const decision = deleteDataRateLimiter.check(req.headers)
    if (!decision.allowed) {
      deps.logAlertsApiExit("delete-data", 429, "rate_limited")
      return rateLimitExceededResponse(decision)
    }

    let body: unknown
    try {
      body = await readJsonBodyWithLimit(req)
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        deps.logAlertsApiExit("delete-data", 413, "body_too_large")
        return NextResponse.json({ error: "Payload too large" }, { status: 413 })
      }
      deps.logAlertsApiExit("delete-data", 400, "invalid_json")
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const manageToken = resolveAlertManageToken([
      alertBodyStringField(body, "manageToken"),
      readAlertManageTokenCookie(req),
    ])
    if (!manageToken) {
      deps.logAlertsApiExit("delete-data", 400, "invalid_payload")
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const subscriber = await deps.findSubscriberByManageToken(manageToken)
    if (!subscriber) {
      deps.logAlertsApiExit("delete-data", 403, "subscriber_not_found")
      return NextResponse.json({ error: "Invalid manage token" }, { status: 403 })
    }

    const supabase = deps.createAlertsServiceRoleClient()
    const { error } = await supabase.from("alert_subscribers").delete().abortSignal(supabaseQueryTimeoutSignal()).eq("id", subscriber.id)
    if (error) {
      deps.logAlertsApiExit("delete-data", 503, "db_delete_failed")
      return NextResponse.json({ error: "Could not delete subscriber data" }, { status: 503 })
    }

    deps.logAlertsApiExit("delete-data", 200, "subscriber_deleted")
    return clearAlertManageTokenCookie(NextResponse.json({ ok: true }))
  }
}

export const POST = createDeleteDataHandler()
