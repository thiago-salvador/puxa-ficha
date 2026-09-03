import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Verificação de assinatura dos webhooks da Resend (esquema Svix).
 *
 * A Resend assina cada entrega com HMAC-SHA256 sobre `${id}.${timestamp}.${corpo}`
 * usando o segredo `whsec_<base64>` da página do webhook, e manda o resultado em
 * `svix-signature` como uma lista separada por espaço de `v1,<base64>` (pode
 * haver mais de uma durante rotação de segredo). O `svix-timestamp` é Unix em
 * segundos e serve contra replay: fora da tolerância, a entrega é recusada
 * mesmo com assinatura válida.
 *
 * Módulo puro (sem Next, sem Supabase, sem `server-only`) para o teste rodar
 * no `tsx --test` e para a rota só orquestrar.
 */

export type ResendWebhookHeaders = {
  id: string | null
  timestamp: string | null
  signature: string | null
}

export type ResendWebhookVerification =
  | { ok: true }
  | { ok: false; reason: "headers_ausentes" | "segredo_invalido" | "timestamp_invalido" | "fora_da_tolerancia" | "assinatura_invalida" }

const SECRET_PREFIX = "whsec_"
export const RESEND_WEBHOOK_TOLERANCE_SECONDS = 300

export function verifyResendWebhook(params: {
  payload: string
  headers: ResendWebhookHeaders
  secret: string | null | undefined
  now?: () => Date
  toleranceSeconds?: number
}): ResendWebhookVerification {
  const { payload, headers } = params
  const id = headers.id?.trim() ?? ""
  const timestamp = headers.timestamp?.trim() ?? ""
  const signatureHeader = headers.signature?.trim() ?? ""
  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: "headers_ausentes" }

  const secret = (params.secret ?? "").trim()
  if (!secret.startsWith(SECRET_PREFIX) || secret.length <= SECRET_PREFIX.length) {
    return { ok: false, reason: "segredo_invalido" }
  }
  let key: Buffer
  try {
    key = Buffer.from(secret.slice(SECRET_PREFIX.length), "base64")
  } catch {
    return { ok: false, reason: "segredo_invalido" }
  }
  if (key.length === 0) return { ok: false, reason: "segredo_invalido" }

  if (!/^\d+$/u.test(timestamp)) return { ok: false, reason: "timestamp_invalido" }
  const sentAt = Number(timestamp)
  const nowSeconds = Math.floor((params.now?.() ?? new Date()).getTime() / 1000)
  const tolerance = params.toleranceSeconds ?? RESEND_WEBHOOK_TOLERANCE_SECONDS
  if (Math.abs(nowSeconds - sentAt) > tolerance) return { ok: false, reason: "fora_da_tolerancia" }

  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest()
  const candidates = signatureHeader
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .map((part) => part.slice(3))
  for (const candidate of candidates) {
    let provided: Buffer
    try {
      provided = Buffer.from(candidate, "base64")
    } catch {
      continue
    }
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) return { ok: true }
  }
  return { ok: false, reason: "assinatura_invalida" }
}

/** Assina um corpo do jeito que a Resend assina; usado só em teste. */
export function signResendWebhookForTest(params: { payload: string; id: string; timestamp: string; secret: string }): string {
  const key = Buffer.from(params.secret.slice(SECRET_PREFIX.length), "base64")
  const digest = createHmac("sha256", key).update(`${params.id}.${params.timestamp}.${params.payload}`).digest("base64")
  return `v1,${digest}`
}

export type ResendWebhookEvent = {
  type: string
  data?: {
    email_id?: string
    to?: string[] | string
    bounce?: { type?: string; subType?: string; message?: string }
    tags?: Record<string, string>
  }
}

/** Eventos que desligam o canal de email do assinante. Bounce transitório só registra. */
export function resendEventDesligaCanal(event: ResendWebhookEvent): boolean {
  if (event.type === "email.complained") return true
  if (event.type === "email.bounced") {
    const tipo = (event.data?.bounce?.type ?? "").trim().toLowerCase()
    return tipo === "permanent" || tipo === ""
  }
  return false
}

export function resendEventDestinatarios(event: ResendWebhookEvent): string[] {
  const to = event.data?.to
  const lista = Array.isArray(to) ? to : typeof to === "string" ? [to] : []
  return lista.map((item) => item.trim()).filter(Boolean)
}
