import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import type { AccessCookieScope } from "@/lib/access-cookie-digest"
import {
  accessCookieMatches,
  constantTimeEqual,
  deriveAccessCookieValue,
} from "@/lib/access-cookie-digest"
import { resolveEstadoUf } from "@/lib/br-uf"
import { isSenadoEnabled } from "@/lib/senado-feature"
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

function frameAncestorsForPath(pathname: string): "'none'" | "*" {
  return pathname === "/embed" || pathname.startsWith("/embed/") ? "*" : "'none'"
}

/**
 * Só para respostas geradas aqui (404 de guarda, redirect de acesso). Páginas
 * servidas pelo Next recebem a mesma política estática via next.config.ts.
 * Não há mais nonce: ver src/lib/content-security-policy.ts.
 */
function withContentSecurityPolicy(request: NextRequest, response: Response): Response {
  response.headers.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy({
      frameAncestors: frameAncestorsForPath(request.nextUrl.pathname),
      applyProductionHttpsHeaders,
    }),
  )
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
<title>404 - Candidato não encontrado - Puxa Ficha</title>
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
<p>Candidato não encontrado. O endereço informado não corresponde a nenhuma ficha pública.</p>
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

/**
 * Lista de slugs em memória da instância, por 5 minutos. O `cache-control` da
 * rota interna não segurava na prática: `/api/candidato-slugs` rodou 45 mil
 * vezes em 3 dias, uma por visita a ficha. Com Fluid a instância é reusada
 * entre requests, então a lista é buscada poucas vezes por janela. Falha e
 * lista vazia não entram no cache (mesma regra fail-open de antes), e buscas
 * simultâneas dividem a mesma promise.
 */
const CANDIDATO_SLUGS_TTL_MS = 5 * 60 * 1000
let candidatoSlugsCache: { slugs: Set<string>; expiresAt: number } | null = null
let candidatoSlugsInFlight: Promise<Set<string> | null> | null = null

async function fetchCandidatoSlugs(request: NextRequest): Promise<Set<string> | null> {
  const url = new URL("/api/candidato-slugs", request.nextUrl.origin)
  const res = await fetch(url, {
    headers: { "x-middleware-internal": "candidato-slugs" },
    signal: AbortSignal.timeout(1500),
  })
  if (!res.ok) return null
  const payload = (await res.json()) as { slugs?: unknown }
  if (!Array.isArray(payload.slugs) || payload.slugs.length === 0) return null
  return new Set(payload.slugs.filter((value): value is string => typeof value === "string"))
}

/** Só para testes: o cache é por instância e atravessaria os casos. */
export function resetCandidatoSlugsCacheForTests() {
  candidatoSlugsCache = null
  candidatoSlugsInFlight = null
}

async function getCandidatoSlugs(request: NextRequest): Promise<Set<string> | null> {
  const now = Date.now()
  if (candidatoSlugsCache && candidatoSlugsCache.expiresAt > now) return candidatoSlugsCache.slugs
  if (!candidatoSlugsInFlight) {
    candidatoSlugsInFlight = fetchCandidatoSlugs(request)
      .then((slugs) => {
        if (slugs) candidatoSlugsCache = { slugs, expiresAt: Date.now() + CANDIDATO_SLUGS_TTL_MS }
        return slugs
      })
      .catch(() => null)
      .finally(() => {
        candidatoSlugsInFlight = null
      })
  }
  return candidatoSlugsInFlight
}

async function isValidCandidatoSlug(request: NextRequest, slug: string): Promise<boolean> {
  if (!CANDIDATO_SLUG_PATTERN.test(slug) || slug.length > 80) {
    return false
  }
  // Fail-open: endpoint interno falho, lento (teto de 1500ms, esta chamada fica
  // no caminho de toda /candidato/*) ou lista vazia deixam o page render
  // decidir, para um incidente no Supabase nunca virar 404 em toda ficha
  // (review 2026-06-09). Sem `next: { revalidate, tags }` no fetch: dentro do
  // middleware essas opções não fazem nada (patch-fetch.ts só acumula tag com
  // store de cache ou prerender).
  const slugs = await getCandidatoSlugs(request)
  if (!slugs) return true
  return slugs.has(slug)
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
    "Ranking não encontrado",
    "Ranking não encontrado. O endereço informado não corresponde a nenhuma lista pública.",
  )
}

function guardUfRoute(request: NextRequest): NextResponse | null {
  const segments = request.nextUrl.pathname.split("/")
  // ["", "uf", "<uf>", ...]
  const ufSegment = segments[2]
  if (!ufSegment) return null
  const uf = safeDecodePathSegment(ufSegment)
  if (resolveEstadoUf(uf)) return null
  return buildSoftNotFoundResponse(
    "UF não encontrada",
    "UF não encontrada. Use a sigla de duas letras do estado brasileiro (ex.: sp, rj, mg).",
  )
}

/** Decodifica um segmento sem lançar: percent-encoding inválido fica literal. */
function safeDecodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** O roteador do Next decodifica o pathname antes de casar a página; o guard
 * precisa ver o mesmo caminho, senão /uf/%73p/senado escapa da flag. */
function decodePathnameForGuard(pathname: string): string {
  return pathname.split("/").map(safeDecodePathSegment).join("/")
}

function guardSenadoRoute(request: NextRequest): Response | null {
  const pathname = decodePathnameForGuard(request.nextUrl.pathname).toLowerCase()
  if (/^\/senado\/?$/.test(pathname) || /^\/uf\/[a-z]{2}\/senado\/?$/.test(pathname)) {
    if (!isSenadoEnabled()) return notFoundResponse()
  }
  return null
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
  const senadoResponse = guardSenadoRoute(request)
  if (senadoResponse) return withContentSecurityPolicy(request, senadoResponse)
  const match = findRouteGuard(pathname)

  switch (match?.guard.id) {
    case "preview-access": {
      const response = await protectPreviewRoute(request)
      return response ? withContentSecurityPolicy(request, response) : NextResponse.next()
    }
    case "internal-access": {
      const response = await protectInternalRoute(request, match.prefix)
      return response ? withContentSecurityPolicy(request, response) : NextResponse.next()
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

  return NextResponse.next()
}

// Só as rotas com guarda. Até 2026-09-25 havia um catch-all aqui para pôr
// nonce de CSP em toda página: 287 mil execuções de middleware em 3 dias sem
// guarda nenhuma a aplicar. A CSP agora vem estática do next.config.ts.
export const config = {
  matcher: [
    "/preview/:path*",
    "/internaltest/:path*",
    "/styleguide/:path*",
    "/candidato/:path*",
    "/rankings/:path*",
    "/uf/:path*",
    // Guarda do Senado: /senado exato; /uf/xx/senado já cai em /uf/:path*.
    "/senado",
  ],
}
