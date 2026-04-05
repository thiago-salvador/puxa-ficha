import "server-only"

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
    throw new Error("Missing RESEND_API_KEY")
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
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
    throw new Error(message)
  }

  return { id: data.id }
}
