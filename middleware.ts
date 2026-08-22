import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import type { AccessCookieScope } from "@/lib/access-cookie-digest"
import {
  accessCookieMatches,
  constantTimeEqual,
  deriveAccessCookieValue,
} from "@/lib/access-cookie-digest"
import { resolveEstadoUf } from "@/lib/br-uf"
import { buildContentSecurityPolicy } from "@/lib/content-security-policy"
import { getRankingDefinitionBySlug } from "@/data/ranking-definitions"
import {
  findRouteGuard,
  INTERNAL_COOKIE_NAME,
  PREVIEW_COOKIE_NAME,
  resolveInternalRouteAccessPolicy,
  resolvePreviewToken,
} from "@/lib/route-guards"
const applyProductionHttpsHeaders =
  process.env.VERCEL === "1" || process.env.PF_FORCE_PRODUCTION_SECURITY_HEADERS === "1"

function createCspNonce() {
  return Buffer.from(crypto.randomUUID()).toString("base64")
}

function frameAncestorsForPath(pathname: string): "'none'" | "*" {
  return pathname === "/embed" || pathname.startsWith("/embed/") ? "*" : "'none'"
}

function contentSecurityPolicyForRequest(request: NextRequest, nonce: string): string {
  return buildContentSecurityPolicy({
    nonce,
    frameAncestors: frameAncestorsForPath(request.nextUrl.pathname),
    applyProductionHttpsHeaders,
  })
}

function withContentSecurityPolicy(request: NextRequest, response: Response): Response {
  const nonce = createCspNonce()
  response.headers.set("Content-Security-Policy", contentSecurityPolicyForRequest(request, nonce))
  return response
}

function nextWithContentSecurityPolicy(request: NextRequest) {
  const nonce = createCspNonce()
  const csp = contentSecurityPolicyForRequest(request, nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
  response.headers.set("Content-Security-Policy", csp)
  return response
}

function notFoundResponse() {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  })
}

const CANDIDATO_NOT_FOUND_BODY = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>404 - Candidato nao encontrado - Puxa Ficha</title>
<meta name="robots" content="noindex, nofollow">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#fafafa;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}
.wrap{max-width:640px}
h1{font-size:clamp(4rem,15vw,9rem);margin:0;letter-spacing:-0.02em;line-height:0.9;text-transform:uppercase}
p{color:#a3a3a3;font-size:1rem;margin:1.5rem 0 0}
a{display:inline-block;margin-top:2rem;color:#fafafa;text-decoration:none;border:1px solid #fafafa;padding:0.6rem 1.2rem;border-radius:9999px;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em}
a:hover{opacity:0.7}
</style>
</head>
<body>
<main class="wrap">
<h1>404</h1>
<p>Candidato nao encontrado. O slug informado nao corresponde a nenhuma ficha publica.</p>
<a href="/">Voltar para a home</a>
</main>
</body>
</html>`

function candidatoNotFoundResponse() {
  return new NextResponse(CANDIDATO_NOT_FOUND_BODY, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=300",
      "x-robots-tag": "noindex, nofollow",
    },
  })
}

const CANDIDATO_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/

async function isValidCandidatoSlug(request: NextRequest, slug: string): Promise<boolean> {
  if (!CANDIDATO_SLUG_PATTERN.test(slug) || slug.length > 80) {
    return false
  }
  try {
    const url = new URL("/api/candidato-slugs", request.nextUrl.origin)
    // Sem `next: { revalidate, tags }` de proposito. Dentro do middleware essas
    // duas opcoes NAO fazem nada: o Next monta um work unit store do tipo
    // `request`, e o fetch instrumentado so acumula tag e revalidate quando o
    // store e de cache ou de prerender (packages/next/src/server/lib/patch-fetch.ts).
    // Sem config explicita de fetchCache, o mesmo arquivo ainda liga
    // `autoNoCache`. Ou seja: nao havia cache de Data Cache aqui para 300s
    // governar, e `revalidateTag("public-candidatos")` nunca alcancou esta
    // chamada. Ter as opcoes escritas dava a impressao contraria.
    //
    // A frescura real vem de duas coisas, as duas continuam valendo:
    //   1. o `cache-control` da propria resposta
    //      (`s-maxage=300, stale-while-revalidate=600`), respeitado pelo CDN,
    //      que e quem atende esta chamada;
    //   2. o `export const revalidate = 300` da rota, que governa o ISR dela.
    // Teto de 1500ms porque este fetch está no caminho de TODA requisição a
    // /candidato/*: sem ele, uma conexão pendurada segura a rota mais quente do
    // site até o limite do runtime. O TimeoutError cai no catch abaixo, que já é
    // fail-open, então o pior caso vira "o page render decide", não indisponibilidade.
    const res = await fetch(url, {
      headers: { "x-middleware-internal": "candidato-slugs" },
      signal: AbortSignal.timeout(1500),
    })
    if (!res.ok) {
      // Fail-open: se o endpoint interno falhou, deixa o page render decidir.
      // Isso evita que um incidente no Supabase transforme todo mundo em 404.
      return true
    }
    const payload = (await res.json()) as { slugs?: unknown }
    // Fail-open tambem em lista vazia: uma leitura falha/degradada nunca pode
    // 404-ar toda ficha. Lista legitimamente vazia => nao ha /candidato/* mesmo,
    // e o page render emite o proprio 404 (review 2026-06-09).
    if (!Array.isArray(payload.slugs) || payload.slugs.length === 0) return true
    return payload.slugs.includes(slug)
  } catch {
    return true
  }
}

async function guardCandidatoRoute(request: NextRequest): Promise<NextResponse | null> {
  const segments = request.nextUrl.pathname.split("/")
  // ["", "candidato", "<slug>", ...optional subpath]
  const slugSegment = segments[2]
  if (!slugSegment) return null

  const slug = decodeURIComponent(slugSegment)
  const isValid = await isValidCandidatoSlug(request, slug)
  if (!isValid) return candidatoNotFoundResponse()
  return null
}

function buildSoftNotFoundResponse(title: string, message: string) {
  const body = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>404 - ${title} - Puxa Ficha</title>
<meta name="robots" content="noindex, nofollow">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#fafafa;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}
.wrap{max-width:640px}
h1{font-size:clamp(4rem,15vw,9rem);margin:0;letter-spacing:-0.02em;line-height:0.9;text-transform:uppercase}
p{color:#a3a3a3;font-size:1rem;margin:1.5rem 0 0}
a{display:inline-block;margin-top:2rem;color:#fafafa;text-decoration:none;border:1px solid #fafafa;padding:0.6rem 1.2rem;border-radius:9999px;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em}
a:hover{opacity:0.7}
</style>
</head>
<body>
<main class="wrap">
<h1>404</h1>
<p>${message}</p>
<a href="/">Voltar para a home</a>
</main>
</body>
</html>`
  return new NextResponse(body, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=300",
      "x-robots-tag": "noindex, nofollow",
    },
  })
}

function guardRankingRoute(request: NextRequest): NextResponse | null {
  const segments = request.nextUrl.pathname.split("/")
  // ["", "rankings"] (listing page) ou ["", "rankings", "<slug>", ...]
  const slugSegment = segments[2]
  if (!slugSegment) return null // /rankings (listing) passa direto
  const slug = decodeURIComponent(slugSegment)
  if (getRankingDefinitionBySlug(slug)) return null
  return buildSoftNotFoundResponse(
    "Ranking nao encontrado",
    "Ranking nao encontrado. O slug informado nao corresponde a nenhuma lista publica.",
  )
}

function guardUfRoute(request: NextRequest): NextResponse | null {
  const segments = request.nextUrl.pathname.split("/")
  // ["", "uf", "<uf>", ...]
  const ufSegment = segments[2]
  if (!ufSegment) return null
  const uf = decodeURIComponent(ufSegment)
  if (resolveEstadoUf(uf)) return null
  return buildSoftNotFoundResponse(
    "UF nao encontrada",
    "UF nao encontrada. Use a sigla de duas letras do estado brasileiro (ex.: sp, rj, mg).",
  )
}

function buildCleanRedirect(request: NextRequest) {
  const cleanUrl = request.nextUrl.clone()
  cleanUrl.searchParams.delete("token")
  return NextResponse.redirect(cleanUrl)
}

function hasBootstrapToken(request: NextRequest, expectedToken: string) {
  const queryToken = request.nextUrl.searchParams.get("token")
  return Boolean(queryToken && constantTimeEqual(queryToken, expectedToken))
}

/**
 * O cookie guarda a derivação (HMAC do token), nunca o token cru, então quem
 * copiar o valor do jar não leva o segredo de bootstrap junto.
 */
function hasCookieToken(
  request: NextRequest,
  cookieName: string,
  expectedToken: string,
  scope: AccessCookieScope,
) {
  const cookieToken = request.cookies.get(cookieName)?.value
  return accessCookieMatches(cookieToken, expectedToken, scope)
}

async function setAccessCookie(
  response: NextResponse,
  name: string,
  expectedToken: string,
  scope: AccessCookieScope,
  path: string,
) {
  response.cookies.set({
    name,
    value: await deriveAccessCookieValue(expectedToken, scope),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV !== "development",
    path,
  })
}

/**
 * Cookie interno limitado à superfície que fez o bootstrap, em vez de path "/",
 * que mandava o cookie em toda requisição do site (inclusive nas públicas, que
 * não têm nada a ver com ele). As duas superfícies compartilham nome e valor
 * derivado, mudando só o path, então um jar com as duas entradas nunca fica
 * ambíguo na leitura.
 */
async function protectInternalRoute(
  request: NextRequest,
  cookiePath: string,
): Promise<NextResponse | Response | null> {
  const policy = resolveInternalRouteAccessPolicy()
  if (policy.mode === "allow") return null
  if (policy.mode === "deny") {
    return notFoundResponse()
  }

  const expectedToken = policy.token

  if (await hasCookieToken(request, INTERNAL_COOKIE_NAME, expectedToken, "internal")) {
    if (request.nextUrl.searchParams.has("token")) {
      const response = buildCleanRedirect(request)
      await setAccessCookie(response, INTERNAL_COOKIE_NAME, expectedToken, "internal", cookiePath)
      return response
    }

    return null
  }

  if (!hasBootstrapToken(request, expectedToken)) {
    return notFoundResponse()
  }

  const response = buildCleanRedirect(request)
  await setAccessCookie(response, INTERNAL_COOKIE_NAME, expectedToken, "internal", cookiePath)
  return response
}

async function protectPreviewRoute(request: NextRequest): Promise<NextResponse | Response | null> {
  const expectedToken = resolvePreviewToken()
  if (!expectedToken) {
    return notFoundResponse()
  }

  if (await hasCookieToken(request, PREVIEW_COOKIE_NAME, expectedToken, "preview")) {
    if (request.nextUrl.searchParams.has("token")) {
      const response = buildCleanRedirect(request)
      await setAccessCookie(response, PREVIEW_COOKIE_NAME, expectedToken, "preview", "/preview")
      return response
    }

    return null
  }

  if (!hasBootstrapToken(request, expectedToken)) {
    return notFoundResponse()
  }

  const response = buildCleanRedirect(request)
  await setAccessCookie(response, PREVIEW_COOKIE_NAME, expectedToken, "preview", "/preview")
  return response
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const match = findRouteGuard(pathname)

  switch (match?.guard.id) {
    case "preview-access": {
      const response = await protectPreviewRoute(request)
      return response
        ? withContentSecurityPolicy(request, response)
        : nextWithContentSecurityPolicy(request)
    }
    case "internal-access": {
      const response = await protectInternalRoute(request, match.prefix)
      return response
        ? withContentSecurityPolicy(request, response)
        : nextWithContentSecurityPolicy(request)
    }
    case "candidate-slug": {
      const response = await guardCandidatoRoute(request)
      if (response) return withContentSecurityPolicy(request, response)
      break
    }
    case "ranking-slug": {
      const response = guardRankingRoute(request)
      if (response) return withContentSecurityPolicy(request, response)
      break
    }
    case "uf-slug": {
      const response = guardUfRoute(request)
      if (response) return withContentSecurityPolicy(request, response)
      break
    }
  }

  return nextWithContentSecurityPolicy(request)
}

export const config = {
  matcher: [
    "/internaltest/:path*",
    "/styleguide/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)",
  ],
}
