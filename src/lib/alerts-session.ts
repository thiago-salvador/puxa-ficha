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
