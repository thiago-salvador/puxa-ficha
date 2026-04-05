import { createHash, randomBytes } from "node:crypto"
import { buildAbsoluteUrl } from "@/lib/metadata"

const ALERT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ALERT_TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/
const ALERT_CANDIDATE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ALERT_TOKEN_SALT = process.env.PF_ALERTS_TOKEN_SALT?.trim() || "dev-alerts-token-salt"
const ALERT_IP_SALT =
  process.env.PF_ALERTS_IP_SALT?.trim() ||
  process.env.PF_QUIZ_SHORT_LINK_SALT?.trim() ||
  "dev-alerts-ip-salt"

export const ALERT_MANAGE_TOKEN_STORAGE_KEY = "pf_manage_token"
export const ALERT_FOLLOWED_CANDIDATES_STORAGE_KEY = "pf_followed_candidates"
export const ALERT_VERIFY_TOKEN_TTL_MS = 48 * 60 * 60 * 1000
export const ALERT_VERIFICATION_EMAIL_COOLDOWN_MS = 15 * 60 * 1000

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

export function normalizeAlertEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase()
  if (!ALERT_EMAIL_RE.test(normalized)) return null
  return normalized
}

export function maskAlertEmail(email: string): string {
  const normalized = normalizeAlertEmail(email)
  if (!normalized) return "email inválido"
  const [localPart, domain] = normalized.split("@")
  const safeLocal =
    localPart.length <= 2
      ? `${localPart[0] ?? "*"}*`
      : `${localPart.slice(0, 2)}${"*".repeat(Math.max(1, localPart.length - 2))}`
  return `${safeLocal}@${domain}`
}

export function normalizeCandidateSlug(input: string): string | null {
  const normalized = input.trim().toLowerCase()
  if (!ALERT_CANDIDATE_SLUG_RE.test(normalized)) return null
  return normalized
}

export function normalizeOpaqueToken(input: string): string | null {
  const normalized = input.trim()
  if (!ALERT_TOKEN_RE.test(normalized)) return null
  return normalized
}

export function createAlertToken(): string {
  return randomBytes(24).toString("base64url").replace(/=+$/g, "")
}

export function createAlertVerifyExpiryDate(now = new Date()): Date {
  return new Date(now.getTime() + ALERT_VERIFY_TOKEN_TTL_MS)
}

export function hashAlertEmail(email: string): string {
  const normalized = normalizeAlertEmail(email)
  return sha256(normalized ?? email.trim().toLowerCase())
}

export function hashAlertToken(token: string): string {
  return sha256(`${ALERT_TOKEN_SALT}:${token}`)
}

export function hashAlertIp(ip: string): string {
  return sha256(`${ALERT_IP_SALT}:${ip}`).slice(0, 48)
}

export function buildAlertManageUrl(manageToken: string): string {
  return buildAbsoluteUrl(`/alertas/gerenciar?token=${encodeURIComponent(manageToken)}`)
}

export function buildAlertVerifyUrl(verifyToken: string, manageToken: string): string {
  const params = new URLSearchParams({ token: verifyToken, manage: manageToken })
  return buildAbsoluteUrl(`/alertas/verificar?${params.toString()}`)
}

export function buildAlertDeleteDataUrl(manageToken: string): string {
  return buildAbsoluteUrl(`/alertas/gerenciar?token=${encodeURIComponent(manageToken)}#deletar-dados`)
}

export function buildAlertUnsubscribeUrl(manageToken: string): string {
  return buildAbsoluteUrl(`/alertas/gerenciar?token=${encodeURIComponent(manageToken)}#cancelar-tudo`)
}

export function extractClientIp(headers: Pick<Headers, "get">): string {
  const xForwardedFor = headers.get("x-forwarded-for")
  if (xForwardedFor) {
    const first = xForwardedFor.split(",")[0]?.trim()
    if (first) return first
  }
  return headers.get("x-real-ip")?.trim() || "unknown"
}

export function buildAlertVerificationEmail(input: {
  candidateName: string
  verifyUrl: string
  manageUrl: string
  deleteDataUrl: string
}): { subject: string; text: string; html: string } {
  const subject = `Confirme seu alerta sobre ${input.candidateName} no Puxa Ficha`
  const text = [
    `Você pediu para acompanhar ${input.candidateName} no Puxa Ficha.`,
    "",
    `Confirme seu email: ${input.verifyUrl}`,
    "",
    `Depois da confirmação, você pode gerenciar seus alertas aqui: ${input.manageUrl}`,
    `Se preferir apagar tudo no futuro: ${input.deleteDataUrl}`,
  ].join("\n")
  const html = [
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">',
    '<p><strong>Puxa Ficha</strong></p>',
    `<p>Você pediu para acompanhar <strong>${escapeHtml(input.candidateName)}</strong> no Puxa Ficha.</p>`,
    `<p><a href="${escapeHtml(input.verifyUrl)}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700">Confirmar email</a></p>`,
    `<p>Se o botão não abrir, use este link: <br /><a href="${escapeHtml(input.verifyUrl)}">${escapeHtml(input.verifyUrl)}</a></p>`,
    `<p>Depois da confirmação, você pode gerenciar seus alertas aqui: <br /><a href="${escapeHtml(input.manageUrl)}">${escapeHtml(input.manageUrl)}</a></p>`,
    `<p>Para apagar seus dados quando quiser: <br /><a href="${escapeHtml(input.deleteDataUrl)}">${escapeHtml(input.deleteDataUrl)}</a></p>`,
    "</div>",
  ].join("")
  return { subject, text, html }
}

export function buildAlertManageAccessEmail(input: {
  candidateName: string
  manageUrl: string
  deleteDataUrl: string
}): { subject: string; text: string; html: string } {
  const subject = `Seu link de gestão de alertas do Puxa Ficha`
  const text = [
    `Você pediu um novo link para gerenciar alertas sobre ${input.candidateName} no Puxa Ficha.`,
    "",
    `Abrir gestão dos alertas: ${input.manageUrl}`,
    `Apagar seus dados quando quiser: ${input.deleteDataUrl}`,
  ].join("\n")
  const html = [
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">',
    '<p><strong>Puxa Ficha</strong></p>',
    `<p>Você pediu um novo link para gerenciar alertas sobre <strong>${escapeHtml(input.candidateName)}</strong>.</p>`,
    `<p><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700">Abrir gestão dos alertas</a></p>`,
    `<p>Se o botão não abrir, use este link: <br /><a href="${escapeHtml(input.manageUrl)}">${escapeHtml(input.manageUrl)}</a></p>`,
    `<p>Para apagar seus dados quando quiser: <br /><a href="${escapeHtml(input.deleteDataUrl)}">${escapeHtml(input.deleteDataUrl)}</a></p>`,
    "</div>",
  ].join("")
  return { subject, text, html }
}

export interface AlertDigestEmailCandidate {
  candidateName: string
  candidateMeta: string
  changes: Array<{
    title: string
    description?: string | null
  }>
}

export function buildAlertDigestEmail(input: {
  items: AlertDigestEmailCandidate[]
  manageUrl: string
  unsubscribeUrl: string
}): { subject: string; text: string; html: string } {
  const subject =
    input.items.length === 1
      ? `Novidades sobre ${input.items[0]?.candidateName} no Puxa Ficha`
      : `Seu digest de alertas do Puxa Ficha`

  const textSections = input.items.flatMap((item) => [
    `${item.candidateName} — ${item.candidateMeta}`,
    ...item.changes.map((change) =>
      change.description ? `- ${change.title}: ${change.description}` : `- ${change.title}`,
    ),
    "",
  ])

  const text = [
    "Aqui vai o resumo das atualizações relevantes nas fichas que você acompanha:",
    "",
    ...textSections,
    `Gerenciar alertas: ${input.manageUrl}`,
    `Cancelar todos os alertas: ${input.unsubscribeUrl}`,
  ].join("\n")

  const htmlItems = input.items
    .map(
      (item) => `
        <section style="margin-top:20px">
          <h2 style="margin:0 0 6px;font-size:18px;line-height:1.2">${escapeHtml(item.candidateName)}</h2>
          <p style="margin:0 0 10px;color:#6b7280;font-size:14px;font-weight:600">${escapeHtml(item.candidateMeta)}</p>
          <ul style="margin:0;padding-left:20px;color:#111827">
            ${item.changes
              .map(
                (change) => `
                  <li style="margin-bottom:8px">
                    <strong>${escapeHtml(change.title)}</strong>
                    ${change.description ? `<div style="margin-top:2px">${escapeHtml(change.description)}</div>` : ""}
                  </li>
                `,
              )
              .join("")}
          </ul>
        </section>
      `,
    )
    .join("")

  const html = [
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">',
    '<p><strong>Puxa Ficha</strong></p>',
    '<p>Aqui vai o resumo das atualizações relevantes nas fichas que você acompanha:</p>',
    htmlItems,
    `<p style="margin-top:24px"><a href="${escapeHtml(input.manageUrl)}">Gerenciar alertas</a> · <a href="${escapeHtml(input.unsubscribeUrl)}">Cancelar todos os alertas</a></p>`,
    "</div>",
  ].join("")

  return { subject, text, html }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function alertBodyStringField(body: unknown, key: string): string {
  const value = (body as Record<string, unknown> | null)?.[key]
  return typeof value === "string" ? value : ""
}
