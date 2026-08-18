import "server-only"

import { resolveConfiguredFromEmail } from "@/lib/email-from"
import { logAlertsEvent } from "@/lib/alerts-log"

export interface SendEmailInput {
  to: string | string[]
  subject: string
  html: string
  text?: string
  headers?: Record<string, string>
}

interface ResendSendEmailResponse {
  id?: string
  message?: string
  name?: string
  error?: {
    message?: string
    name?: string
  }
}

function resolveAlertsFromEmail(): string {
  return resolveConfiguredFromEmail(
    process.env.PF_ALERTS_FROM_EMAIL,
    process.env.SMTP_FROM,
  )
}

function resolveResendApiKey(): string | null {
  return process.env.RESEND_API_KEY?.trim() || null
}

export async function sendTransactionalEmail(input: SendEmailInput): Promise<{ id: string | null }> {
  const apiKey = resolveResendApiKey()
  if (!apiKey) {
    logAlertsEvent({
      route: "email-transport",
      event: "resend_missing_api_key",
      level: "error",
    })
    throw new Error("Missing RESEND_API_KEY")
  }

  let response: Response
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Resend blocks requests without User-Agent (403, error 1010). SDKs set this; raw fetch must too.
        "User-Agent": "PuxaFicha/1.0 (+https://puxaficha.com.br)",
      },
      body: JSON.stringify({
        from: resolveAlertsFromEmail(),
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: input.headers,
      }),
      cache: "no-store",
      // Sem timeout, uma conexao pendurada prende a rota sincrona de subscribe
      // e consome o orcamento do lote de send-digest. Aborta em 10s.
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    const aborted = error instanceof Error && error.name === "TimeoutError"
    const message = aborted
      ? "Resend request timed out after 10s"
      : `Resend request failed: ${error instanceof Error ? error.message : String(error)}`
    logAlertsEvent({
      route: "email-transport",
      event: aborted ? "resend_request_timeout" : "resend_request_error",
      level: "error",
      detail: { message: message.slice(0, 300) },
    })
    throw new Error(message)
  }

  const rawBody = await response.text()
  const parsed = (() => {
    if (!rawBody) return null
    try {
      return JSON.parse(rawBody) as ResendSendEmailResponse
    } catch {
      return null
    }
  })()
  if (!response.ok || !parsed?.id) {
    const message = (
      parsed?.error?.message ||
      parsed?.message ||
      rawBody.trim() ||
      `Resend responded with ${response.status}`
    ).slice(0, 500)
    logAlertsEvent({
      route: "email-transport",
      event: "resend_request_failed",
      level: "error",
      detail: { httpStatus: response.status, message: message.slice(0, 300) },
    })
    throw new Error(message)
  }

  logAlertsEvent({
    route: "email-transport",
    event: "resend_accepted",
    detail: { messageId: parsed.id },
  })

  return { id: parsed.id }
}
