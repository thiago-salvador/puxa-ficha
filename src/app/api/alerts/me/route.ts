import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import {
  createAlertsServiceRoleClient,
  findSubscriberByManageToken,
  maskAlertEmail,
  normalizeOpaqueToken,
} from "@/lib/alerts"
import { alertBodyStringField, applyAlertsNoStoreHeaders } from "@/lib/alerts-shared"
import { readAlertManageTokenCookie, resolveAlertManageToken } from "@/lib/alerts-session"
import { logAlertsApiExit } from "@/lib/alerts-log"
import {
  createFixedWindowIpRateLimiter,
  rateLimitExceededResponse,
} from "@/lib/request-rate-limit"
import {
  isRequestBodyTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const alertsMeRateLimiter = createFixedWindowIpRateLimiter({
  namespace: "alerts-me",
  max: 120,
  windowMs: 60_000,
})

function jsonNoStore(
  body: Record<string, unknown>,
  init?: ResponseInit,
): NextResponse {
  return applyAlertsNoStoreHeaders(NextResponse.json(body, init))
}

function checkAlertsMeRateLimit(req: NextRequest): NextResponse | null {
  try {
    const decision = alertsMeRateLimiter.check(req.headers)
    if (!decision.allowed) return applyAlertsNoStoreHeaders(rateLimitExceededResponse(decision))
  } catch (error) {
    console.warn("alerts/me rate limit failed open", error)
  }
  return null
}

async function handleAlertsMe(manageTokenRaw: string | null): Promise<NextResponse> {
  const manageToken = normalizeOpaqueToken(manageTokenRaw ?? "")
  if (!manageToken) {
    logAlertsApiExit("me", 400, "missing_manage_token")
    return jsonNoStore({ error: "Invalid manage token" }, { status: 400 })
  }

  const subscriber = await findSubscriberByManageToken(manageToken)
  if (!subscriber) {
    logAlertsApiExit("me", 403, "subscriber_not_found")
    return jsonNoStore({ error: "Invalid manage token" }, { status: 403 })
  }

  const supabase = createAlertsServiceRoleClient()
  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("alert_subscriptions")
    .select("candidato_id")
    .eq("subscriber_id", subscriber.id)

  if (subscriptionsError) {
    logAlertsApiExit("me", 503, "db_load_subscriptions_failed")
    return jsonNoStore({ error: "Could not load subscriptions" }, { status: 503 })
  }

  const candidateIds = (subscriptions ?? []).map((row) => row.candidato_id).filter(Boolean)
  let candidates: Array<{
    id: string
    slug: string
    nome_urna: string
    partido_sigla: string
    cargo_disputado: string
  }> = []

  if (candidateIds.length > 0) {
    const { data: rows, error: candidatesError } = await supabase
      .from("candidatos_publico")
      .select("id, slug, nome_urna, partido_sigla, cargo_disputado")
      .in("id", candidateIds)

    if (candidatesError) {
      logAlertsApiExit("me", 503, "db_load_candidates_failed")
      return jsonNoStore({ error: "Could not load candidate details" }, { status: 503 })
    }

    candidates = (rows ?? []).sort((a, b) => a.nome_urna.localeCompare(b.nome_urna, "pt-BR"))
  }

  logAlertsApiExit("me", 200, "ok", { subscriptionCount: candidates.length })
  return jsonNoStore({
    ok: true,
    subscriber: {
      verified: subscriber.verified,
      canalEmail: subscriber.canal_email,
      emailMasked: maskAlertEmail(subscriber.email),
      lastDigestSentAt: subscriber.last_digest_sent_at,
    },
    subscriptions: candidates,
  })
}

/** Preferir POST com corpo JSON — evita token em query string (logs de proxy, Referer). */
export async function POST(req: NextRequest) {
  const limited = checkAlertsMeRateLimit(req)
  if (limited) return limited

  let body: unknown
  try {
    body = await readJsonBodyWithLimit(req)
  } catch (error) {
    if (isRequestBodyTooLargeError(error)) {
      logAlertsApiExit("me", 413, "body_too_large")
      return jsonNoStore({ error: "Payload too large" }, { status: 413 })
    }
    logAlertsApiExit("me", 400, "invalid_json")
    return jsonNoStore({ error: "Invalid JSON" }, { status: 400 })
  }

  const token = resolveAlertManageToken([
    alertBodyStringField(body, "manageToken"),
    readAlertManageTokenCookie(req),
  ])
  return handleAlertsMe(token)
}

/** Alternativa para ferramentas: `Authorization: Bearer <manageToken>`. Query `?token=` não é suportada. */
export async function GET(req: NextRequest) {
  const limited = checkAlertsMeRateLimit(req)
  if (limited) return limited

  const auth = req.headers.get("authorization")?.trim()
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null
  const token = resolveAlertManageToken([bearer, readAlertManageTokenCookie(req)])
  if (token) {
    return handleAlertsMe(token)
  }

  // Visitantes sem cookie de gestão: resposta anónima (evita 400 + warn em cada vista de ficha).
  return jsonNoStore({
    ok: false,
    anonymous: true,
    subscriptions: [],
  })
}
