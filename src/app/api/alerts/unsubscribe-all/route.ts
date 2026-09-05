import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { alertBodyStringField, createAlertsServiceRoleClient, findSubscriberByManageToken } from "@/lib/alerts"
import { readAlertManageTokenCookie, resolveAlertManageToken } from "@/lib/alerts-session"
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
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Ver o comentario em src/app/api/alerts/session/route.ts: as quatro rotas de
// mutacao de alertas faziam SELECT com service role sem nenhum teto.
const unsubscribeAllRateLimiter = createDistributedIpRateLimiter({
  namespace: "alerts-unsubscribe-all",
  max: 120,
  windowMs: 60_000,
})

interface UnsubscribeAllDeps {
  createAlertsServiceRoleClient: typeof createAlertsServiceRoleClient
  findSubscriberByManageToken: typeof findSubscriberByManageToken
  logAlertsApiExit: typeof logAlertsApiExit
}

const defaultUnsubscribeAllDeps: UnsubscribeAllDeps = {
  createAlertsServiceRoleClient,
  findSubscriberByManageToken,
  logAlertsApiExit,
}

export function createUnsubscribeAllHandler(deps: UnsubscribeAllDeps = defaultUnsubscribeAllDeps) {
  return async function POST(req: NextRequest) {
    const csrfResponse = rejectCrossSiteAlertsMutation(req, "unsubscribe-all", deps.logAlertsApiExit)
    if (csrfResponse) return csrfResponse

    const decision = await unsubscribeAllRateLimiter.check(req.headers)
    if (!decision.allowed) {
      deps.logAlertsApiExit("unsubscribe-all", decision.unavailable ? 503 : 429, "rate_limited")
      return rateLimitExceededResponse(decision)
    }

    const oneClickManageToken = req.nextUrl.searchParams.get("manage")
    let manageToken: string | null

    if (oneClickManageToken !== null) {
      // RFC 8058 envia corpo form-urlencoded. O token opaco fica na URL do
      // header List-Unsubscribe, então este caminho não tenta interpretar JSON.
      manageToken = resolveAlertManageToken([oneClickManageToken])
    } else {
      let body: unknown
      try {
        body = await readJsonBodyWithLimit(req)
      } catch (error) {
        if (isRequestBodyTooLargeError(error)) {
          deps.logAlertsApiExit("unsubscribe-all", 413, "body_too_large")
          return NextResponse.json({ error: "Payload too large" }, { status: 413 })
        }
        deps.logAlertsApiExit("unsubscribe-all", 400, "invalid_json")
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
      }

      manageToken = resolveAlertManageToken([
        alertBodyStringField(body, "manageToken"),
        readAlertManageTokenCookie(req),
      ])
    }
    if (!manageToken) {
      deps.logAlertsApiExit("unsubscribe-all", 400, "invalid_payload")
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const subscriber = await deps.findSubscriberByManageToken(manageToken)
    if (!subscriber) {
      deps.logAlertsApiExit("unsubscribe-all", 403, "subscriber_not_found")
      return NextResponse.json({ error: "Invalid manage token" }, { status: 403 })
    }

    const supabase = deps.createAlertsServiceRoleClient()
    const { error } = await supabase
      .from("alert_subscriptions")
      .delete()
      .abortSignal(supabaseQueryTimeoutSignal())
      .eq("subscriber_id", subscriber.id)
    if (error) {
      deps.logAlertsApiExit("unsubscribe-all", 503, "db_delete_subscriptions_failed")
      return NextResponse.json({ error: "Could not cancel all subscriptions" }, { status: 503 })
    }

    deps.logAlertsApiExit("unsubscribe-all", 200, "all_unsubscribed")
    return NextResponse.json({ ok: true })
  }
}

export const POST = createUnsubscribeAllHandler()
