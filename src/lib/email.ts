import "server-only"

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
  error?: {
    message?: string
    name?: string
  }
}

function resolveAlertsFromEmail(): string {
  return (
    process.env.PF_ALERTS_FROM_EMAIL?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    "Puxa Ficha <alertas@puxaficha.com.br>"
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

  const response = await fetch("https://api.resend.com/emails", {
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
  })

  const data = (await response.json().catch(() => null)) as ResendSendEmailResponse | null
  if (!response.ok || !data?.id) {
    const message = data?.error?.message || `Resend responded with ${response.status}`
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
    detail: { messageId: data.id },
  })

  return { id: data.id }
}
