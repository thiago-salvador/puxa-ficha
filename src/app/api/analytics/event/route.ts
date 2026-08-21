import { NextResponse } from "next/server"
import {
  isAnalyticsEventName,
  sanitizeAnalyticsPayload,
} from "@/lib/analytics-events"
import {
  recordAnalyticsLaunchEvent,
  recordAnalyticsLaunchEventUnderQuota,
} from "@/lib/analytics-launch-store"
import { hashTrustedClientIp } from "@/lib/client-ip"
import {
  createFixedWindowIpRateLimiter,
  rateLimitExceededResponse,
  type RequestRateLimiter,
} from "@/lib/request-rate-limit"
import { rejectCrossSitePublicWrite } from "@/lib/public-write-origin-guard"
import {
  isRequestBodyTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const RATE_LIMIT_MAX = 120
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_NAMESPACE = "analytics-event"

const analyticsEventRateLimiter = createFixedWindowIpRateLimiter({
  namespace: RATE_LIMIT_NAMESPACE,
  max: RATE_LIMIT_MAX,
  windowMs: RATE_LIMIT_WINDOW_MS,
})

interface AnalyticsEventDeps {
  recordAnalyticsLaunchEvent: typeof recordAnalyticsLaunchEvent
  recordAnalyticsLaunchEventUnderQuota: typeof recordAnalyticsLaunchEventUnderQuota
  rateLimiter: RequestRateLimiter
  now: () => number
}

const defaultAnalyticsEventDeps: AnalyticsEventDeps = {
  recordAnalyticsLaunchEvent,
  recordAnalyticsLaunchEventUnderQuota,
  rateLimiter: analyticsEventRateLimiter,
  now: () => Date.now(),
}

let avisouColunaAusente = false

function avisarColunaAusenteUmaVez() {
  if (avisouColunaAusente) return
  avisouColunaAusente = true
  console.error(
    "analytics event rate limit: coluna ip_hash ausente, limite durável desligado até a migration ser aplicada",
  )
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await readJsonBodyWithLimit(req)
  } catch (error) {
    if (isRequestBodyTooLargeError(error)) throw error
    return null
  }
}
export function createAnalyticsEventPostHandler(deps: AnalyticsEventDeps = defaultAnalyticsEventDeps) {
  return async function POST(req: Request) {
    // `requireOrigin` porque esta rota só é chamada por `fetch` e por
    // `navigator.sendBeacon` do próprio site (src/lib/analytics-client.ts), e o
    // navegador anexa `Origin` em todo POST. Antes de 2026-08-03 o guard liberava
    // quando o header não vinha, então qualquer cliente de linha de comando
    // entrava direto. Isso não impede quem forja o header de propósito: contra
    // abuso deliberado, quem responde é o limite durável abaixo.
    const blocked = rejectCrossSitePublicWrite(req, { requireOrigin: true })
    if (blocked) return blocked

    // Primeiro portão, em memória: é de graça e corta enxurrada de uma instância
    // só antes de gastar round-trip de banco. Não é o teto, é o pré-filtro.
    try {
      const decision = deps.rateLimiter.check(req.headers)
      if (!decision.allowed) return rateLimitExceededResponse(decision)
    } catch (error) {
      console.error("analytics event rate limit failed closed", error)
      return NextResponse.json(
        { ok: false, reason: "rate_limit_failed" },
        { status: 503, headers: { "cache-control": "no-store" } },
      )
    }

    let body: unknown
    try {
      body = await readJson(req)
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        return NextResponse.json({ ok: false, reason: "body_too_large" }, { status: 413 })
      }
      throw error
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 })
    }

    const eventName = (body as { eventName?: unknown }).eventName
    if (!isAnalyticsEventName(eventName)) {
      return NextResponse.json({ ok: false, reason: "invalid_event" }, { status: 400 })
    }

    const payload = sanitizeAnalyticsPayload((body as { payload?: unknown }).payload)

    // Segundo portão, durável: reserva e grava na mesma transação. O contador
    // em memória é por instância e não é o teto. Sem a coluna, o evento ainda
    // entra, só sem ip_hash, até a migration ser aplicada.
    const now = deps.now()
    const ipHash = hashTrustedClientIp(req.headers, RATE_LIMIT_NAMESPACE)
    const sinceIso = new Date(now - RATE_LIMIT_WINDOW_MS).toISOString()

    try {
      const durable = await deps.recordAnalyticsLaunchEventUnderQuota({
        eventName,
        payload,
        ipHash,
        sinceIso,
        max: RATE_LIMIT_MAX,
      })
      if (durable.status === "quota_exceeded") {
        return rateLimitExceededResponse(
          { allowed: false, remaining: 0, resetAt: now + RATE_LIMIT_WINDOW_MS },
          now,
        )
      }
      if (durable.status === "coluna_ausente") {
        avisarColunaAusenteUmaVez()
        await deps.recordAnalyticsLaunchEvent({ eventName, payload, ipHash: null })
      }
      return NextResponse.json(
        { ok: true },
        { headers: { "cache-control": "no-store" } },
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("quota insert failed") || message.includes("rate count failed")) {
        console.error("analytics event durable rate limit failed closed", error)
        return NextResponse.json(
          { ok: false, reason: "rate_limit_failed" },
          { status: 503, headers: { "cache-control": "no-store" } },
        )
      }
      console.error("analytics event ingest failed", error)
      return NextResponse.json({ ok: false, reason: "store_failed" }, { status: 503 })
    }
  }
}

export const POST = createAnalyticsEventPostHandler()
