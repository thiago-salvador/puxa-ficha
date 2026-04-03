import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

const INTERNAL_COOKIE_NAME = "pf_internal_token"
const PREVIEW_COOKIE_NAME = "pf_preview_token"
const MIN_PRODUCTION_PREVIEW_TOKEN_LENGTH = 24

function notFoundResponse() {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  })
}

function buildCleanRedirect(request: NextRequest) {
  const cleanUrl = request.nextUrl.clone()
  cleanUrl.searchParams.delete("token")
  return NextResponse.redirect(cleanUrl)
}

function hasBootstrapToken(request: NextRequest, expectedToken: string) {
  const queryToken = request.nextUrl.searchParams.get("token")
  return Boolean(queryToken && queryToken === expectedToken)
}

function hasCookieToken(request: NextRequest, cookieName: string, expectedToken: string) {
  return request.cookies.get(cookieName)?.value === expectedToken
}

function setAccessCookie(response: NextResponse, name: string, value: string, path: string) {
  response.cookies.set({
    name,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV !== "development",
    path,
  })
}

function resolvePreviewToken() {
  const configuredToken = process.env.PF_PREVIEW_TOKEN?.trim()

  if (process.env.VERCEL_ENV === "production") {
    if (!configuredToken || configuredToken.length < MIN_PRODUCTION_PREVIEW_TOKEN_LENGTH) {
      return null
    }
    return configuredToken
  }

  if (configuredToken) return configuredToken
  return "local-preview"
}

function protectInternalRoute(request: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next()
  }

  const expectedToken = process.env.PF_INTERNAL_TOKEN?.trim()
  if (!expectedToken) {
    return notFoundResponse()
  }

  if (hasCookieToken(request, INTERNAL_COOKIE_NAME, expectedToken)) {
    if (request.nextUrl.searchParams.has("token")) {
      const response = buildCleanRedirect(request)
      setAccessCookie(response, INTERNAL_COOKIE_NAME, expectedToken, "/")
      return response
    }

    return NextResponse.next()
  }

  if (!hasBootstrapToken(request, expectedToken)) {
    return notFoundResponse()
  }

  const response = buildCleanRedirect(request)
  setAccessCookie(response, INTERNAL_COOKIE_NAME, expectedToken, "/")
  return response
}

function protectPreviewRoute(request: NextRequest) {
  const expectedToken = resolvePreviewToken()
  if (!expectedToken) {
    return notFoundResponse()
  }

  if (hasCookieToken(request, PREVIEW_COOKIE_NAME, expectedToken)) {
    if (request.nextUrl.searchParams.has("token")) {
      const response = buildCleanRedirect(request)
      setAccessCookie(response, PREVIEW_COOKIE_NAME, expectedToken, "/preview")
      return response
    }

    return NextResponse.next()
  }

  if (!hasBootstrapToken(request, expectedToken)) {
    return notFoundResponse()
  }

  const response = buildCleanRedirect(request)
  setAccessCookie(response, PREVIEW_COOKIE_NAME, expectedToken, "/preview")
  return response
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (pathname.startsWith("/preview/")) {
    return protectPreviewRoute(request)
  }

  if (pathname.startsWith("/internaltest") || pathname.startsWith("/styleguide")) {
    return protectInternalRoute(request)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/preview/:path*", "/internaltest/:path*", "/styleguide/:path*"],
}
