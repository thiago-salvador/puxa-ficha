import "server-only"

import { resolveConfiguredFromEmail } from "@/lib/email-from"
import { resolveConfiguredReplyToEmail } from "@/lib/email-reply-to"
import { logAlertsEvent } from "@/lib/alerts-log"

export interface SendEmailInput {
  to: string | string[]
  subject: string
  html: string
  text?: string
  headers?: Record<string, string>
  /**
   * Chave de idempotência da Resend. Quando presente, uma segunda requisição com
   * a mesma chave não envia um segundo email: a Resend devolve o resultado da
   * primeira.
   *
   * Existe por causa de uma janela real: o `send-digest` tem prazo de 10s no
   * fetch, e a Resend pode ACEITAR o envio e ainda assim estourar o prazo do
   * lado de cá. O `catch` trata isso como falha, o log fica `failed`, e a
   * próxima execução do cron reprocessa o mesmo assinante, agora com o email já
   * a caminho. Sem chave, o assinante recebe o digest duas vezes.
   *
   * Contrato da Resend (docs de 2026-08-30): header `Idempotency-Key`, no
   * máximo 256 caracteres, expira em 24 horas. A janela de 24h cobre o cron
   * diário com folga; a chave precisa ser estável entre tentativas e única por
   * envio lógico.
   */
  idempotencyKey?: string
}

/** Limite da Resend. Estourar não é erro do lado dela: a chave é ignorada. */
const IDEMPOTENCY_KEY_MAX_LENGTH = 256

/**
 * Nao exportada de proposito: ninguem fora deste modulo precisa distinguir esta
 * falha das outras do transporte, e um export sem consumidor e o que o knip
 * cobra. O que importa e o comportamento, e ele esta travado em
 * tests/email-idempotency.test.ts: chave longa demais NAO envia.
 */
class IdempotencyKeyTooLongError extends Error {}

function idempotencyHeader(key: string | undefined): Record<string, string> {
  if (!key) return {}
  const trimmed = key.trim()
  if (!trimmed) return {}
  if (trimmed.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    // Falha alto em vez de mandar sem chave: enviar sem idempotência quando o
    // chamador pediu idempotência é exatamente o duplo envio que se quer evitar,
    // e passaria despercebido.
    throw new IdempotencyKeyTooLongError(
      `Idempotency-Key tem ${trimmed.length} caracteres, acima do limite de ${IDEMPOTENCY_KEY_MAX_LENGTH}`,
    )
  }
  return { "Idempotency-Key": trimmed }
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

function resolveAlertsReplyToEmail(): string {
  try {
    return resolveConfiguredReplyToEmail(process.env.PF_ALERTS_REPLY_TO_EMAIL)
  } catch (error) {
    logAlertsEvent({
      route: "email-transport",
      event: "resend_reply_to_configuration_error",
      level: "error",
      detail: { message: error instanceof Error ? error.message : String(error) },
    })
    throw error
  }
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

  const replyToEmail = resolveAlertsReplyToEmail()
  // Antes do try do fetch de proposito: dentro dele, o catch converteria o erro
  // tipado em "Resend request failed" generico e a causa real sumiria do log.
  const idempotency = idempotencyHeader(input.idempotencyKey)

  let response: Response
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Resend blocks requests without User-Agent (403, error 1010). SDKs set this; raw fetch must too.
        "User-Agent": "PuxaFicha/1.0 (+https://puxaficha.com.br)",
        ...idempotency,
      },
      body: JSON.stringify({
        from: resolveAlertsFromEmail(),
        to: Array.isArray(input.to) ? input.to : [input.to],
        reply_to: replyToEmail,
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
