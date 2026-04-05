import "server-only"

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import {
  hashAlertToken,
  normalizeCandidateSlug,
  normalizeOpaqueToken,
} from "@/lib/alerts-shared"
import { createServiceRoleSupabaseClient } from "@/lib/supabase"

export * from "@/lib/alerts-shared"

const DEV_ALERTS_TOKEN_ENCRYPTION_KEY = Buffer.from("11".repeat(32), "hex")

export interface AlertPublicCandidate {
  id: string
  slug: string
  nome_urna: string
  partido_sigla: string
  cargo_disputado: string
}

export interface AlertSubscriberRecord {
  id: string
  email: string
  nome: string | null
  verified: boolean
  verified_at: string | null
  verify_token_expires_at: string | null
  manage_token_hash: string
  canal_email: boolean
  last_verification_email_sent_at: string | null
  last_digest_sent_at: string | null
}

function resolveManageTokenEncryptionKey(): Buffer {
  const raw = process.env.PF_ALERTS_TOKEN_ENCRYPTION_KEY?.trim()
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Missing PF_ALERTS_TOKEN_ENCRYPTION_KEY")
    }
    return DEV_ALERTS_TOKEN_ENCRYPTION_KEY
  }

  const key = Buffer.from(raw, "hex")
  if (key.length !== 32) {
    throw new Error("PF_ALERTS_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as hex")
  }

  return key
}

export function encryptAlertManageToken(token: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", resolveManageTokenEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`
}

export function decryptAlertManageToken(ciphertext: string): string {
  const [ivPart, authTagPart, payloadPart] = ciphertext.split(".")
  if (!ivPart || !authTagPart || !payloadPart) {
    throw new Error("Invalid manage token ciphertext")
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    resolveManageTokenEncryptionKey(),
    Buffer.from(ivPart, "base64url"),
  )
  decipher.setAuthTag(Buffer.from(authTagPart, "base64url"))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadPart, "base64url")),
    decipher.final(),
  ])

  return decrypted.toString("utf8")
}

export function createAlertsServiceRoleClient() {
  return createServiceRoleSupabaseClient({ cacheMode: "no-store" })
}

export async function findPublicCandidateBySlug(
  slug: string,
): Promise<AlertPublicCandidate | null> {
  const normalized = normalizeCandidateSlug(slug)
  if (!normalized) return null

  const supabase = createAlertsServiceRoleClient()
  const { data, error } = await supabase
    .from("candidatos_publico")
    .select("id, slug, nome_urna, partido_sigla, cargo_disputado")
    .eq("slug", normalized)
    .maybeSingle()

  if (error || !data) return null
  return data as AlertPublicCandidate
}

export async function findSubscriberByEmailHash(
  emailHash: string,
): Promise<AlertSubscriberRecord | null> {
  const supabase = createAlertsServiceRoleClient()
  const { data, error } = await supabase
    .from("alert_subscribers")
    .select(
      "id, email, nome, verified, verified_at, verify_token_expires_at, manage_token_hash, canal_email, last_verification_email_sent_at, last_digest_sent_at",
    )
    .eq("email_hash", emailHash)
    .maybeSingle()

  if (error || !data) return null
  return data as AlertSubscriberRecord
}

export async function findSubscriberByManageToken(
  manageToken: string,
): Promise<AlertSubscriberRecord | null> {
  const normalized = normalizeOpaqueToken(manageToken)
  if (!normalized) return null

  const supabase = createAlertsServiceRoleClient()
  const { data, error } = await supabase
    .from("alert_subscribers")
    .select(
      "id, email, nome, verified, verified_at, verify_token_expires_at, manage_token_hash, canal_email, last_verification_email_sent_at, last_digest_sent_at",
    )
    .eq("manage_token_hash", hashAlertToken(normalized))
    .maybeSingle()

  if (error || !data) return null
  return data as AlertSubscriberRecord
}

export async function findSubscriberByVerifyAndManageToken(
  verifyToken: string,
  manageToken: string,
): Promise<AlertSubscriberRecord | null> {
  const normalizedVerifyToken = normalizeOpaqueToken(verifyToken)
  const normalizedManageToken = normalizeOpaqueToken(manageToken)
  if (!normalizedVerifyToken || !normalizedManageToken) return null

  const supabase = createAlertsServiceRoleClient()
  const { data, error } = await supabase
    .from("alert_subscribers")
    .select(
      "id, email, nome, verified, verified_at, verify_token_expires_at, manage_token_hash, canal_email, last_verification_email_sent_at, last_digest_sent_at",
    )
    .eq("verify_token_hash", hashAlertToken(normalizedVerifyToken))
    .eq("manage_token_hash", hashAlertToken(normalizedManageToken))
    .maybeSingle()

  if (error || !data) return null
  return data as AlertSubscriberRecord
}
