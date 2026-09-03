import "server-only"

import { NextRequest, NextResponse } from "next/server"

import { createAlertsServiceRoleClient } from "@/lib/alerts"
import { logAlertsEvent } from "@/lib/alerts-log"
import { hashAlertEmail } from "@/lib/alerts-shared"
import {
  resendEventDesligaCanal,
  resendEventDestinatarios,
  verifyResendWebhook,
  type ResendWebhookEvent,
} from "@/lib/resend-webhook"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ROUTE = "/api/webhooks/resend"

/**
 * Bounce e reclamação de spam da Resend (achado M17 do master-review de
 * 01/09/2026). Até aqui nada escrevia `canal_email = false`: um endereço que
 * devolvia hard bounce continuava recebendo tentativas de digest todo dia.
 *
 * Fail-closed: sem `RESEND_WEBHOOK_SECRET` a rota responde 503 e não lê o
 * corpo; assinatura inválida ou fora da tolerância responde 401. Depois de
 * verificado, todo evento recebe 200 (a Resend reenvia em qualquer outro
 * status), e só `email.bounced` permanente e `email.complained` desligam o
 * canal. O email nunca vai ao log: só o hash truncado e a contagem.
 */
export type ResendWebhookDeps = {
  secret: string | null | undefined
  desligarCanal: (emailHash: string) => Promise<number>
  now?: () => Date
}

export async function desligarCanalEmailNoSupabase(emailHash: string): Promise<number> {
  const client = createAlertsServiceRoleClient()
  const { data, error } = await client
    .from("alert_subscribers")
    .update({ canal_email: false })
    .eq("email_hash", emailHash)
    .eq("canal_email", true)
    .select("id")
    .abortSignal(supabaseQueryTimeoutSignal())
  if (error) throw new Error(`alert_subscribers: ${error.message}`)
  return data?.length ?? 0
}

export function createResendWebhookHandler(deps: ResendWebhookDeps) {
  return async function handler(request: NextRequest): Promise<NextResponse> {
    if (!deps.secret?.trim()) {
      logAlertsEvent({ route: ROUTE, event: "resend_webhook_sem_segredo", level: "error", httpStatus: 503 })
      return NextResponse.json({ ok: false, error: "webhook nao configurado" }, { status: 503 })
    }
    const payload = await request.text()
    const verification = verifyResendWebhook({
      payload,
      headers: {
        id: request.headers.get("svix-id"),
        timestamp: request.headers.get("svix-timestamp"),
        signature: request.headers.get("svix-signature"),
      },
      secret: deps.secret,
      now: deps.now,
    })
    if (!verification.ok) {
      logAlertsEvent({ route: ROUTE, event: "resend_webhook_assinatura_recusada", level: "warn", httpStatus: 401, detail: { reason: verification.reason } })
      return NextResponse.json({ ok: false, error: "assinatura invalida" }, { status: 401 })
    }

    let event: ResendWebhookEvent
    try {
      event = JSON.parse(payload) as ResendWebhookEvent
    } catch {
      logAlertsEvent({ route: ROUTE, event: "resend_webhook_json_invalido", level: "warn", httpStatus: 400 })
      return NextResponse.json({ ok: false, error: "json invalido" }, { status: 400 })
    }
    if (!event || typeof event.type !== "string") {
      return NextResponse.json({ ok: false, error: "evento sem tipo" }, { status: 400 })
    }

    if (!resendEventDesligaCanal(event)) {
      logAlertsEvent({ route: ROUTE, event: "resend_webhook_ignorado", detail: { type: event.type, bounceType: event.data?.bounce?.type ?? null } })
      return NextResponse.json({ ok: true, acao: "ignorado", type: event.type })
    }

    const destinatarios = resendEventDestinatarios(event)
    let desligados = 0
    for (const email of destinatarios) {
      const emailHash = hashAlertEmail(email)
      try {
        desligados += await deps.desligarCanal(emailHash)
      } catch (error) {
        logAlertsEvent({
          route: ROUTE,
          event: "resend_webhook_falha_supabase",
          level: "error",
          httpStatus: 500,
          detail: { type: event.type, emailHashPrefix: emailHash.slice(0, 12), message: error instanceof Error ? error.message : String(error) },
        })
        // 500 faz a Resend reenviar: o desligamento nao pode se perder por falha transitoria.
        return NextResponse.json({ ok: false, error: "falha ao registrar" }, { status: 500 })
      }
    }
    logAlertsEvent({
      route: ROUTE,
      event: "resend_webhook_canal_email_desligado",
      detail: { type: event.type, bounceType: event.data?.bounce?.type ?? null, destinatarios: destinatarios.length, desligados },
    })
    return NextResponse.json({ ok: true, acao: "canal_email_desligado", type: event.type, destinatarios: destinatarios.length, desligados })
  }
}

export const POST = createResendWebhookHandler({
  secret: process.env.RESEND_WEBHOOK_SECRET,
  desligarCanal: desligarCanalEmailNoSupabase,
})
