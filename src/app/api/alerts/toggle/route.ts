import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import {
  alertBodyStringField,
  createAlertsServiceRoleClient,
  findPublicCandidateBySlug,
  findSubscriberByManageToken,
  normalizeCandidateSlug,
} from "@/lib/alerts"
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
const toggleRateLimiter = createDistributedIpRateLimiter({
  namespace: "alerts-toggle",
  max: 120,
  windowMs: 60_000,
})

interface ToggleDeps {
  createAlertsServiceRoleClient: typeof createAlertsServiceRoleClient
  findPublicCandidateBySlug: typeof findPublicCandidateBySlug
  findSubscriberByManageToken: typeof findSubscriberByManageToken
  logAlertsApiExit: typeof logAlertsApiExit
}

const defaultToggleDeps: ToggleDeps = {
  createAlertsServiceRoleClient,
  findPublicCandidateBySlug,
  findSubscriberByManageToken,
  logAlertsApiExit,
}

export function createToggleHandler(deps: ToggleDeps = defaultToggleDeps) {
  return async function POST(req: NextRequest) {
    const csrfResponse = rejectCrossSiteAlertsMutation(req, "toggle", deps.logAlertsApiExit)
    if (csrfResponse) return csrfResponse

    const decision = await toggleRateLimiter.check(req.headers)
    if (!decision.allowed) {
      deps.logAlertsApiExit("toggle", decision.unavailable ? 503 : 429, "rate_limited")
      return rateLimitExceededResponse(decision)
    }

    let body: unknown
    try {
      body = await readJsonBodyWithLimit(req)
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        deps.logAlertsApiExit("toggle", 413, "body_too_large")
        return NextResponse.json({ error: "Payload too large" }, { status: 413 })
      }
      deps.logAlertsApiExit("toggle", 400, "invalid_json")
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const manageToken = resolveAlertManageToken([
      alertBodyStringField(body, "manageToken"),
      readAlertManageTokenCookie(req),
    ])
    const candidateSlug = normalizeCandidateSlug(alertBodyStringField(body, "candidateSlug"))
    if (!manageToken || !candidateSlug) {
      deps.logAlertsApiExit("toggle", 400, "invalid_payload")
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const subscriber = await deps.findSubscriberByManageToken(manageToken)
    if (!subscriber) {
      deps.logAlertsApiExit("toggle", 403, "subscriber_not_found")
      return NextResponse.json({ error: "Invalid manage token" }, { status: 403 })
    }
    if (!subscriber.verified) {
      deps.logAlertsApiExit("toggle", 409, "email_not_verified")
      return NextResponse.json({ error: "Email verification required" }, { status: 409 })
    }

    const candidate = await deps.findPublicCandidateBySlug(candidateSlug)
    if (!candidate) {
      deps.logAlertsApiExit("toggle", 404, "candidate_not_found", { candidateSlug })
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 })
    }

    const supabase = deps.createAlertsServiceRoleClient()
    const { data: existingSubscription, error: selectError } = await supabase
      .from("alert_subscriptions")
      .select("id")
      .abortSignal(supabaseQueryTimeoutSignal())
      .eq("subscriber_id", subscriber.id)
      .eq("candidato_id", candidate.id)
      .maybeSingle()

    if (selectError) {
      deps.logAlertsApiExit("toggle", 503, "db_select_subscription_failed")
      return NextResponse.json({ error: "Could not load subscription" }, { status: 503 })
    }

    if (existingSubscription?.id) {
      const { error: deleteError } = await supabase
        .from("alert_subscriptions")
        .delete()
        .abortSignal(supabaseQueryTimeoutSignal())
        .eq("id", existingSubscription.id)

      if (deleteError) {
        deps.logAlertsApiExit("toggle", 503, "db_delete_subscription_failed")
        return NextResponse.json({ error: "Could not remove subscription" }, { status: 503 })
      }

      deps.logAlertsApiExit("toggle", 200, "unfollow_ok", { candidateSlug: candidate.slug })
      return NextResponse.json({ ok: true, following: false, candidateSlug: candidate.slug })
    }

    // Upsert idempotente: um duplo-clique (ou request concorrente) reincide no
    // UNIQUE (subscriber_id, candidato_id) e virava 503 espurio. ignoreDuplicates
    // trata a segunda escrita como no-op e mantem o resultado "seguindo".
    const { error: insertError } = await supabase
      .from("alert_subscriptions")
      .upsert(
        {
          subscriber_id: subscriber.id,
          candidato_id: candidate.id,
        },
        { onConflict: "subscriber_id,candidato_id", ignoreDuplicates: true },
      ).abortSignal(supabaseQueryTimeoutSignal())

    if (insertError) {
      deps.logAlertsApiExit("toggle", 503, "db_insert_subscription_failed")
      return NextResponse.json({ error: "Could not create subscription" }, { status: 503 })
    }

    deps.logAlertsApiExit("toggle", 200, "follow_ok", { candidateSlug: candidate.slug })
    return NextResponse.json({ ok: true, following: true, candidateSlug: candidate.slug })
  }
}

export const POST = createToggleHandler()
