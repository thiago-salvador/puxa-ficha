import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import {
  alertBodyStringField,
  applyAlertsNoStoreHeaders,
  createAlertsServiceRoleClient,
  findSubscriberByManageToken,
  findSubscriberByVerifyAndManageToken,
  normalizeOpaqueToken,
} from "@/lib/alerts"
import {
  readAlertManageTokenCookie,
  resolveAlertManageToken,
  setAlertManageTokenCookie,
} from "@/lib/alerts-session"
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

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Mesmo motivo das irmas (ver src/app/api/alerts/session/route.ts): sem teto, um
// POST com par token/manageToken inventado custava dois SELECT service_role em
// alert_subscribers e ocupava slot do semaforo do Supabase. O verify era a unica
// rota de mutacao de alertas que tinha ficado sem o guard.
const verifyRateLimiter = createFixedWindowIpRateLimiter({
  namespace: "alerts-verify",
  max: 120,
  windowMs: 60_000,
})

/**
 * Resposta externa uniformizada para qualquer cenário "link não vale agora":
 *   - token inválido ou desconhecido;
 *   - token expirado;
 *   - usuário já verificado (verify_token_hash limpo, manage token válido).
 *
 * Razão: o comportamento antigo diferenciava cada caso (404 vs 410 vs 200 alreadyVerified),
 * permitindo a um atacante que possuísse um manage token enumerar seu estado sem conhecer
 * o verify token correspondente. Agora a distinção fica apenas no log interno (`reason`).
 */
const INVALID_VERIFICATION_BODY = {
  error: "Invalid or expired verification link",
  reason: "link_invalido_ou_expirado",
} as const
const INVALID_VERIFICATION_STATUS = 410

/**
 * Códigos estáveis de erro do verify.
 *
 * O campo `error` continua em inglês por compatibilidade com quem já lê o corpo,
 * mas nenhuma interface deve exibi-lo: o cliente traduz `reason` para uma frase
 * em português com saída acionável, e cai num texto genérico quando o código
 * for desconhecido.
 */
const VERIFY_ERROR_REASONS = {
  bodyTooLarge: "payload_grande",
  invalidJson: "json_invalido",
  invalidPayload: "payload_invalido",
  invalidVerification: "link_invalido_ou_expirado",
  crossSiteBlocked: "origem_bloqueada",
  rateLimited: "muitas_tentativas",
  updateFailed: "falha_ao_confirmar",
} as const

interface VerifyDeps {
  createAlertsServiceRoleClient: typeof createAlertsServiceRoleClient
  findSubscriberByManageToken: typeof findSubscriberByManageToken
  findSubscriberByVerifyAndManageToken: typeof findSubscriberByVerifyAndManageToken
  logAlertsApiExit: typeof logAlertsApiExit
  now: () => Date
}

const defaultVerifyDeps: VerifyDeps = {
  createAlertsServiceRoleClient,
  findSubscriberByManageToken,
  findSubscriberByVerifyAndManageToken,
  logAlertsApiExit,
  now: () => new Date(),
}

function invalidVerificationResponse(): NextResponse {
  return applyAlertsNoStoreHeaders(
    NextResponse.json(INVALID_VERIFICATION_BODY, { status: INVALID_VERIFICATION_STATUS }),
  )
}

/** Reemite a resposta acrescentando o código estável, preservando corpo e status originais. */
async function withErrorReason(response: NextResponse, reason: string): Promise<NextResponse> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return NextResponse.json(
    { ...body, reason },
    { status: response.status, headers: response.headers },
  )
}

export function createVerifyHandler(deps: VerifyDeps = defaultVerifyDeps) {
  return async function POST(req: NextRequest) {
    const csrfResponse = rejectCrossSiteAlertsMutation(req, "verify", deps.logAlertsApiExit)
    if (csrfResponse) {
      return applyAlertsNoStoreHeaders(
        await withErrorReason(csrfResponse, VERIFY_ERROR_REASONS.crossSiteBlocked),
      )
    }

    const decision = verifyRateLimiter.check(req.headers)
    if (!decision.allowed) {
      deps.logAlertsApiExit("verify", 429, "rate_limited")
      return applyAlertsNoStoreHeaders(
        await withErrorReason(
          rateLimitExceededResponse(decision),
          VERIFY_ERROR_REASONS.rateLimited,
        ),
      )
    }

    let body: unknown
    try {
      body = await readJsonBodyWithLimit(req)
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        deps.logAlertsApiExit("verify", 413, "body_too_large")
        return applyAlertsNoStoreHeaders(
          NextResponse.json(
            { error: "Payload too large", reason: VERIFY_ERROR_REASONS.bodyTooLarge },
            { status: 413 },
          ),
        )
      }
      deps.logAlertsApiExit("verify", 400, "invalid_json")
      return applyAlertsNoStoreHeaders(
        NextResponse.json(
          { error: "Invalid JSON", reason: VERIFY_ERROR_REASONS.invalidJson },
          { status: 400 },
        ),
      )
    }

    const verifyToken = normalizeOpaqueToken(alertBodyStringField(body, "token"))
    const manageToken = resolveAlertManageToken([
      alertBodyStringField(body, "manageToken"),
      readAlertManageTokenCookie(req),
    ])
    if (!verifyToken || !manageToken) {
      deps.logAlertsApiExit("verify", 400, "invalid_payload")
      return applyAlertsNoStoreHeaders(
        NextResponse.json(
          { error: "Invalid payload", reason: VERIFY_ERROR_REASONS.invalidPayload },
          { status: 400 },
        ),
      )
    }

    const subscriber = await deps.findSubscriberByVerifyAndManageToken(verifyToken, manageToken)
    if (!subscriber) {
      // Sondar o manage token só para diferenciar log — NUNCA para mudar a resposta externa.
      const alreadyVerified = await deps.findSubscriberByManageToken(manageToken)
      const reason = alreadyVerified?.verified
        ? "already_verified_generic"
        : "verification_link_unknown"
      deps.logAlertsApiExit("verify", INVALID_VERIFICATION_STATUS, reason)
      return invalidVerificationResponse()
    }

    if (subscriber.verify_token_expires_at) {
      const expiresAt = new Date(subscriber.verify_token_expires_at)
      if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < deps.now().getTime()) {
        deps.logAlertsApiExit("verify", INVALID_VERIFICATION_STATUS, "verification_link_expired")
        return invalidVerificationResponse()
      }
    }

    const supabase = deps.createAlertsServiceRoleClient()
    const { error } = await supabase
      .from("alert_subscribers")
      .update({
        verified: true,
        verified_at: deps.now().toISOString(),
        verify_token_hash: null,
        verify_token_expires_at: null,
      })
      .eq("id", subscriber.id)

    if (error) {
      deps.logAlertsApiExit("verify", 503, "db_verify_update_failed")
      return applyAlertsNoStoreHeaders(
        NextResponse.json(
          { error: "Could not verify subscriber", reason: VERIFY_ERROR_REASONS.updateFailed },
          { status: 503 },
        ),
      )
    }

    deps.logAlertsApiExit("verify", 200, "verified_ok")
    return applyAlertsNoStoreHeaders(
      setAlertManageTokenCookie(
        NextResponse.json({
          ok: true,
          verified: true,
        }),
        manageToken,
      ),
    )
  }
}

export const POST = createVerifyHandler()
