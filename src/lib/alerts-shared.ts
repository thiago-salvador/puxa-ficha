import { randomBytes } from "node:crypto"
import type { NextResponse } from "next/server"
import { extractTrustedClientIp } from "@/lib/client-ip"
import { sha256Hex } from "@/lib/crypto-utils"
import { buildAbsoluteUrl } from "@/lib/metadata"

const ALERT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ALERT_TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/
const ALERT_CANDIDATE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ALERT_TOKEN_SALT = process.env.PF_ALERTS_TOKEN_SALT?.trim() || "dev-alerts-token-salt"
const configuredAlertIpSalt = process.env.PF_ALERTS_IP_SALT?.trim()
if (!configuredAlertIpSalt && process.env.VERCEL_ENV === "production") {
  throw new Error("Missing PF_ALERTS_IP_SALT (required in production)")
}
const ALERT_IP_SALT =
  configuredAlertIpSalt ||
  process.env.PF_QUIZ_SHORT_LINK_SALT?.trim() ||
  "dev-alerts-ip-salt"

const ALERT_VERIFY_TOKEN_TTL_MS = 48 * 60 * 60 * 1000
export const ALERT_VERIFICATION_EMAIL_COOLDOWN_MS = 15 * 60 * 1000

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
  return sha256Hex(normalized ?? email.trim().toLowerCase())
}

export function hashAlertToken(token: string): string {
  return sha256Hex(`${ALERT_TOKEN_SALT}:${token}`)
}

export function hashAlertIp(ip: string): string {
  return sha256Hex(`${ALERT_IP_SALT}:${ip}`).slice(0, 48)
}

function buildAlertAccessUrl(params: Record<string, string>): string {
  const search = new URLSearchParams(params)
  return buildAbsoluteUrl(`/alertas/acesso?${search.toString()}`)
}

/**
 * `followSlug` carrega a intencao que originou o pedido.
 *
 * O caso: assinante ja verificado clica em "seguir" num navegador novo, sem
 * cookie de sessao. A rota nao tem como autorizar a inscricao ali, entao manda
 * o email de gestao. So que ela nunca criava a inscricao pedida, e a UI promete
 * que criou: a pessoa recebia o email, abria o link, e o candidato que ela quis
 * seguir nao estava la. O slug viaja junto e a rota de acesso efetiva o follow
 * DEPOIS de validar o token.
 */
export function buildAlertManageUrl(manageToken: string, followSlug?: string | null): string {
  const params: Record<string, string> = { manage: manageToken }
  const normalizado = normalizeCandidateSlug(followSlug ?? "")
  if (normalizado) params.follow = normalizado
  return buildAlertAccessUrl(params)
}

export function buildAlertVerifyUrl(verifyToken: string, manageToken: string): string {
  return buildAlertAccessUrl({ verify: verifyToken, manage: manageToken })
}

export function buildAlertDeleteDataUrl(manageToken: string): string {
  return buildAlertAccessUrl({ manage: manageToken, hash: "deletar-dados" })
}

export function buildAlertUnsubscribeUrl(manageToken: string): string {
  return buildAlertAccessUrl({ manage: manageToken, hash: "cancelar-tudo" })
}

export function buildAlertOneClickUnsubscribeUrl(manageToken: string): string {
  const search = new URLSearchParams({ manage: manageToken })
  return buildAbsoluteUrl(`/api/alerts/unsubscribe-all?${search.toString()}`)
}

export function extractClientIp(headers: Pick<Headers, "get">): string {
  return extractTrustedClientIp(headers)
}

/** Aplica os headers anti-cache recomendados a qualquer resposta de alertas (rotas /api/alerts/*). */
export function applyAlertsNoStoreHeaders<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate")
  response.headers.set("Pragma", "no-cache")
  return response
}

/* ─── Camada de apresentação dos emails ──────────────────────────────────────
 *
 * Os três emails de alertas dividem uma casca só. Ela existe porque o digest
 * saía como parágrafo empilhado sem hierarquia, e porque email não tem cascata
 * confiável: estilo que importa vai inline, e o bloco <style> serve só para o
 * que exige media query (modo escuro e telas estreitas).
 *
 * Modo escuro. A referência é o Gmail escuro, que ignora
 * `prefers-color-scheme` e inverte a mensagem por conta própria. Então o
 * desenho é claro por padrão, com cor de fundo E cor de texto declaradas em
 * todo bloco (superfície sem cor declarada é o que a inversão do Gmail
 * costuma quebrar), mais um bloco `prefers-color-scheme: dark` para os
 * clientes que respeitam o esquema, como Apple Mail e Outlook do macOS.
 */

/** Paleta espelhando `globals.css`, com o par escuro que a inversão do Gmail produz. */
const EMAIL_COLORS = {
  canvas: "#f5f5f5",
  canvasDark: "#0a0a0a",
  surface: "#ffffff",
  surfaceDark: "#161616",
  text: "#0a0a0a",
  textDark: "#fafafa",
  muted: "#666666",
  mutedDark: "#a3a3a3",
  border: "#e5e5e5",
  borderDark: "#2f2f2f",
} as const

/** Anton não carrega em cliente de email; o peso condensado vem de Arial Black. */
const EMAIL_FONT_HEADING =
  "'Arial Black','Arial Bold',Arial,Helvetica,sans-serif"
const EMAIL_FONT_BODY = "Arial,Helvetica,sans-serif"

/** Equivalente textual da hachura de `SlashDivider`, que é gradiente CSS e não sobrevive ao email. */
const EMAIL_SLASH_RULE = "/".repeat(60)

function emailWordmark(): string {
  return `<td class="pf-surface" bgcolor="${EMAIL_COLORS.surface}" style="padding:28px 28px 0;background-color:${EMAIL_COLORS.surface}">
    <p class="pf-text" style="margin:0;font-family:${EMAIL_FONT_HEADING};font-size:18px;line-height:22px;letter-spacing:0.08em;text-transform:uppercase;color:${EMAIL_COLORS.text}">Puxa Ficha</p>
    <p class="pf-muted" style="margin:10px 0 0;font-family:${EMAIL_FONT_BODY};font-size:9px;line-height:12px;letter-spacing:0.18em;color:${EMAIL_COLORS.muted};overflow:hidden;white-space:nowrap">${EMAIL_SLASH_RULE}</p>
  </td>`
}

/**
 * `<h1>` de verdade, não parágrafo grande. Leitor de tela e modo de leitura de
 * cliente de email navegam pela estrutura de heading; estilo inline existe
 * porque a margem padrão de heading varia entre clientes, não para substituir a
 * semântica.
 */
function emailHeading(text: string): string {
  return `<h1 class="pf-text" style="margin:0 0 12px;font-family:${EMAIL_FONT_HEADING};font-size:26px;line-height:30px;font-weight:normal;letter-spacing:-0.01em;text-transform:uppercase;color:${EMAIL_COLORS.text}">${escapeHtml(text)}</h1>`
}

function emailLead(html: string): string {
  return `<p class="pf-muted" style="margin:0 0 22px;font-family:${EMAIL_FONT_BODY};font-size:15px;line-height:23px;color:${EMAIL_COLORS.muted}">${html}</p>`
}

/**
 * Botão em tabela, com o padding no `<td>`. O Outlook do Windows renderiza via
 * Word: ignora padding em elemento inline e, mesmo com `display:block` no
 * `<a>`, não é o anchor que forma a caixa clicável. Quem tem que ter a área é a
 * célula; o anchor só preenche o que a célula abriu.
 */
function emailButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
    <tr>
      <td class="pf-invert" bgcolor="${EMAIL_COLORS.text}" style="padding:14px 26px;border-radius:10px;background-color:${EMAIL_COLORS.text}">
        <a href="${escapeHtml(href)}" class="pf-invert-text" style="font-family:${EMAIL_FONT_BODY};font-size:14px;font-weight:bold;letter-spacing:0.04em;text-transform:uppercase;text-decoration:none;color:${EMAIL_COLORS.surface}">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`
}

/** Link cru de fallback, para quando o cliente bloqueia o botão. */
function emailFallbackLink(prefixo: string, href: string): string {
  return `<p class="pf-muted" style="margin:0 0 20px;font-family:${EMAIL_FONT_BODY};font-size:13px;line-height:20px;color:${EMAIL_COLORS.muted};word-break:break-all">${escapeHtml(prefixo)}<br /><a href="${escapeHtml(href)}" class="pf-link" style="color:${EMAIL_COLORS.text};text-decoration:underline">${escapeHtml(href)}</a></p>`
}

function emailFooter(links: Array<{ label: string; href: string }>, nota: string): string {
  const linhaLinks = links
    .map(
      (link) =>
        `<a href="${escapeHtml(link.href)}" class="pf-link" style="color:${EMAIL_COLORS.text};text-decoration:underline">${escapeHtml(link.label)}</a>`,
    )
    .join(' <span class="pf-muted" style="color:' + EMAIL_COLORS.muted + '">·</span> ')

  return `<td class="pf-surface" bgcolor="${EMAIL_COLORS.surface}" style="padding:0 28px 28px;background-color:${EMAIL_COLORS.surface}">
    <p class="pf-muted" style="margin:0 0 14px;font-family:${EMAIL_FONT_BODY};font-size:9px;line-height:12px;letter-spacing:0.18em;color:${EMAIL_COLORS.muted};overflow:hidden;white-space:nowrap">${EMAIL_SLASH_RULE}</p>
    <p style="margin:0 0 8px;font-family:${EMAIL_FONT_BODY};font-size:13px;line-height:20px;font-weight:bold">${linhaLinks}</p>
    <p class="pf-muted" style="margin:0;font-family:${EMAIL_FONT_BODY};font-size:12px;line-height:18px;color:${EMAIL_COLORS.muted}">${escapeHtml(nota)}</p>
  </td>`
}

/** Documento completo. Resend entrega o `html` como veio, então o `<head>` chega ao cliente. */
function renderAlertEmailDocument(input: {
  title: string
  /** Primeira linha da prévia na caixa de entrada. Fica oculta no corpo. */
  preheader: string
  body: string
  footer: string
}): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(input.title)}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .pf-canvas { background-color: ${EMAIL_COLORS.canvasDark} !important; }
    .pf-surface { background-color: ${EMAIL_COLORS.surfaceDark} !important; }
    .pf-card { background-color: ${EMAIL_COLORS.surfaceDark} !important; border-color: ${EMAIL_COLORS.borderDark} !important; }
    .pf-text, .pf-link { color: ${EMAIL_COLORS.textDark} !important; }
    .pf-muted { color: ${EMAIL_COLORS.mutedDark} !important; }
    .pf-rule { background-color: ${EMAIL_COLORS.borderDark} !important; }
    .pf-invert { background-color: ${EMAIL_COLORS.textDark} !important; }
    .pf-invert-text { color: ${EMAIL_COLORS.canvasDark} !important; }
  }
  @media only screen and (max-width: 620px) {
    .pf-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .pf-card-pad { padding: 18px !important; }
  }
</style>
</head>
<body class="pf-canvas" bgcolor="${EMAIL_COLORS.canvas}" style="margin:0;padding:0;background-color:${EMAIL_COLORS.canvas}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="pf-canvas" bgcolor="${EMAIL_COLORS.canvas}" style="background-color:${EMAIL_COLORS.canvas}">
<tr>
<td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-radius:14px;overflow:hidden">
<tr>${emailWordmark()}</tr>
<tr><td class="pf-surface pf-pad" bgcolor="${EMAIL_COLORS.surface}" style="padding:24px 28px 4px;background-color:${EMAIL_COLORS.surface}">${input.body}</td></tr>
<tr>${input.footer}</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`
}

const NOTA_RODAPE_ALERTA =
  "Você recebe este email porque pediu alertas sobre fichas do Puxa Ficha. Dados públicos, sem recomendação de voto."

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

  const html = renderAlertEmailDocument({
    title: subject,
    preheader: `Falta um clique para acompanhar ${input.candidateName}.`,
    body: [
      emailHeading("Confirme seu email"),
      emailLead(
        `Você pediu para acompanhar <strong class="pf-text" style="color:${EMAIL_COLORS.text}">${escapeHtml(input.candidateName)}</strong> no Puxa Ficha. O alerta só começa a valer depois desta confirmação.`,
      ),
      emailButton("Confirmar email", input.verifyUrl),
      emailFallbackLink("Se o botão não abrir, use este link:", input.verifyUrl),
    ].join(""),
    footer: emailFooter(
      [
        { label: "Gerenciar alertas", href: input.manageUrl },
        { label: "Apagar meus dados", href: input.deleteDataUrl },
      ],
      NOTA_RODAPE_ALERTA,
    ),
  })

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

  const html = renderAlertEmailDocument({
    title: subject,
    preheader: "Seu link de acesso à gestão de alertas.",
    body: [
      emailHeading("Gerencie seus alertas"),
      emailLead(
        `Você pediu um novo link para gerenciar alertas sobre <strong class="pf-text" style="color:${EMAIL_COLORS.text}">${escapeHtml(input.candidateName)}</strong>.`,
      ),
      emailButton("Abrir gestão dos alertas", input.manageUrl),
      emailFallbackLink("Se o botão não abrir, use este link:", input.manageUrl),
    ].join(""),
    footer: emailFooter(
      [{ label: "Apagar meus dados", href: input.deleteDataUrl }],
      NOTA_RODAPE_ALERTA,
    ),
  })

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
    `${item.candidateName}: ${item.candidateMeta}`,
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

  // Um card por ficha, com a mesma ordem de leitura do site: rótulo do
  // candidato (partido e cargo) acima do nome. A tabela é só o container de
  // layout, que é o que Outlook entende; o conteúdo dentro dela é semântico,
  // com `<h2>` para o nome (abaixo do `<h1>` do documento) e `<ul>` para as
  // mudanças, que são de fato uma lista de itens irmãos.
  const htmlItems = input.items
    .map((item) => {
      const mudancas = item.changes
        .map(
          (change, index) =>
            `<li class="pf-text" style="margin:0 0 ${index === item.changes.length - 1 ? 0 : 12}px;padding-left:4px;font-family:${EMAIL_FONT_BODY};font-size:15px;line-height:21px;font-weight:bold;color:${EMAIL_COLORS.text}">${escapeHtml(change.title)}${
              change.description
                ? `<div class="pf-muted" style="margin-top:3px;font-family:${EMAIL_FONT_BODY};font-size:14px;line-height:21px;font-weight:normal;color:${EMAIL_COLORS.muted}">${escapeHtml(change.description)}</div>`
                : ""
            }</li>`,
        )
        .join("")

      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="pf-card" bgcolor="${EMAIL_COLORS.surface}" style="margin:0 0 16px;border:1px solid ${EMAIL_COLORS.border};border-radius:12px;background-color:${EMAIL_COLORS.surface}">
        <tr>
          <td class="pf-card-pad" style="padding:20px 22px">
            <p class="pf-muted" style="margin:0 0 4px;font-family:${EMAIL_FONT_BODY};font-size:11px;line-height:14px;font-weight:bold;letter-spacing:0.1em;text-transform:uppercase;color:${EMAIL_COLORS.muted}">${escapeHtml(item.candidateMeta)}</p>
            <h2 class="pf-text" style="margin:0 0 12px;font-family:${EMAIL_FONT_HEADING};font-size:20px;line-height:24px;font-weight:normal;letter-spacing:-0.01em;text-transform:uppercase;color:${EMAIL_COLORS.text}">${escapeHtml(item.candidateName)}</h2>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px">
              <tr><td class="pf-rule" bgcolor="${EMAIL_COLORS.border}" style="height:1px;line-height:1px;font-size:0;background-color:${EMAIL_COLORS.border};padding:0">&nbsp;</td></tr>
            </table>
            <ul style="margin:0;padding:0 0 0 18px">${mudancas}</ul>
          </td>
        </tr>
      </table>`
    })
    .join("")

  const totalMudancas = input.items.reduce((acc, item) => acc + item.changes.length, 0)
  const resumoLead =
    input.items.length === 1
      ? `${totalMudancas} ${totalMudancas === 1 ? "atualização" : "atualizações"} na ficha que você acompanha.`
      : `${totalMudancas} ${totalMudancas === 1 ? "atualização" : "atualizações"} em ${input.items.length} fichas que você acompanha.`

  const html = renderAlertEmailDocument({
    title: subject,
    preheader: resumoLead,
    body: [emailHeading("O que mudou"), emailLead(escapeHtml(resumoLead)), htmlItems].join(""),
    footer: emailFooter(
      [
        { label: "Gerenciar alertas", href: input.manageUrl },
        { label: "Cancelar todos os alertas", href: input.unsubscribeUrl },
      ],
      NOTA_RODAPE_ALERTA,
    ),
  })

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
