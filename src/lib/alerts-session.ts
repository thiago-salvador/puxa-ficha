import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { normalizeOpaqueToken } from "@/lib/alerts-shared"

export const ALERT_MANAGE_TOKEN_COOKIE_NAME = "pf_alerts_manage"

function shouldUseSecureCookie(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production"
}

export function resolveAlertManageToken(rawValues: Array<string | null | undefined>): string | null {
  for (const raw of rawValues) {
    const normalized = normalizeOpaqueToken(raw ?? "")
    if (normalized) return normalized
  }
  return null
}

export function readAlertManageTokenCookie(
  req: Pick<NextRequest, "cookies"> | { cookies: { get(name: string): { value: string } | undefined } },
): string | null {
  return normalizeOpaqueToken(req.cookies.get(ALERT_MANAGE_TOKEN_COOKIE_NAME)?.value ?? "")
}

export function setAlertManageTokenCookie(response: NextResponse, manageToken: string): NextResponse {
  response.cookies.set({
    name: ALERT_MANAGE_TOKEN_COOKIE_NAME,
    value: manageToken,
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  })
  return response
}

export function clearAlertManageTokenCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: ALERT_MANAGE_TOKEN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: "/",
    expires: new Date(0),
  })
  return response
}

/**
 * Troca de identidade pendente em /alertas/acesso.
 *
 * Quando o navegador ja tem uma sessao de alertas e abre um link de gestao que
 * pertence a OUTRO assinante, o GET nao troca a sessao: guarda o token do link
 * aqui e manda para uma pagina de confirmacao. So o POST de confirmacao, vindo da
 * propria origem, promove este valor a cookie de sessao. Validar o token prova
 * que o link existe, nao que a pessoa quis trocar de conta.
 *
 * SameSite=Lax, nao Strict: a pessoa chega do cliente de email, e a cadeia de
 * redirects que comeca cross-site faz o navegador tratar o GET da pagina de
 * confirmacao como cross-site para cookies Strict, que entao mostraria "nenhuma
 * troca pendente". A protecao contra CSRF e o check de Origin/Sec-Fetch-Site no
 * POST, nao o SameSite deste cookie. Path restrito a /alertas/acesso: so a pagina
 * de confirmacao e o POST precisam dele.
 */
export const ALERT_PENDING_MANAGE_TOKEN_COOKIE_NAME = "pf_alerts_manage_pending"
const ALERT_PENDING_MANAGE_TOKEN_COOKIE_PATH = "/alertas/acesso"
const ALERT_PENDING_MANAGE_TOKEN_MAX_AGE_SECONDS = 60 * 10

export function readAlertPendingManageTokenCookie(
  req: Pick<NextRequest, "cookies"> | { cookies: { get(name: string): { value: string } | undefined } },
): string | null {
  return normalizeOpaqueToken(req.cookies.get(ALERT_PENDING_MANAGE_TOKEN_COOKIE_NAME)?.value ?? "")
}

export function setAlertPendingManageTokenCookie(response: NextResponse, manageToken: string): NextResponse {
  response.cookies.set({
    name: ALERT_PENDING_MANAGE_TOKEN_COOKIE_NAME,
    value: manageToken,
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: ALERT_PENDING_MANAGE_TOKEN_COOKIE_PATH,
    maxAge: ALERT_PENDING_MANAGE_TOKEN_MAX_AGE_SECONDS,
  })
  return response
}

export function clearAlertPendingManageTokenCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: ALERT_PENDING_MANAGE_TOKEN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: ALERT_PENDING_MANAGE_TOKEN_COOKIE_PATH,
    expires: new Date(0),
  })
  return response
}
