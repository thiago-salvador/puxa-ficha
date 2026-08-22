export type RouteGuardMatchMode = "exact-or-subpath" | "subpath-only"

export type RouteGuardDefinition = {
  id: "preview-access" | "internal-access" | "candidate-slug" | "ranking-slug" | "uf-slug"
  prefixes: readonly string[]
  match: RouteGuardMatchMode
  environments: string
  allow: string
  deny: string
}

export const INTERNAL_COOKIE_NAME = "pf_internal_token"
export const PREVIEW_COOKIE_NAME = "pf_preview_token"
export const MIN_PRODUCTION_INTERNAL_TOKEN_LENGTH = 24
export const MIN_DEPLOYED_PREVIEW_TOKEN_LENGTH = 24

/**
 * Canonical inventory for page-route guards dispatched by middleware.ts.
 * Route-handler guards under /api remain owned by their handlers and are not
 * part of this page dispatcher.
 */
export const ROUTE_GUARDS = [
  {
    id: "preview-access",
    prefixes: ["/preview"],
    match: "subpath-only",
    environments:
      "all; deployed Vercel requires PF_PREVIEW_TOKEN with at least 24 characters; local non-Vercel may use local-preview",
    allow: "matching bootstrap token or derived pf_preview_token cookie",
    deny: "404 Not Found",
  },
  {
    id: "internal-access",
    prefixes: ["/internaltest", "/styleguide"],
    match: "exact-or-subpath",
    environments:
      "NODE_ENV=development allows; otherwise PF_INTERNAL_TOKEN is required; VERCEL_ENV=production requires at least 24 characters",
    allow: "development pass-through or matching bootstrap token/derived surface-scoped cookie",
    deny: "404 Not Found",
  },
  {
    id: "candidate-slug",
    prefixes: ["/candidato"],
    match: "subpath-only",
    environments: "all",
    allow: "valid public candidate slug or fail-open when the internal slug list is unavailable",
    deny: "404 candidate response with noindex",
  },
  {
    id: "ranking-slug",
    prefixes: ["/rankings"],
    match: "subpath-only",
    environments: "all",
    allow: "registered ranking slug",
    deny: "404 ranking response with noindex",
  },
  {
    id: "uf-slug",
    prefixes: ["/uf"],
    match: "subpath-only",
    environments: "all",
    allow: "recognized Brazilian UF",
    deny: "404 UF response with noindex",
  },
] as const satisfies readonly RouteGuardDefinition[]

export type RouteGuard = (typeof ROUTE_GUARDS)[number]

function matchesRouteGuardPrefix(
  pathname: string,
  prefix: string,
  mode: RouteGuardMatchMode,
): boolean {
  if (mode === "exact-or-subpath" && pathname === prefix) return true
  return pathname.startsWith(`${prefix}/`)
}

export function findRouteGuard(pathname: string): { guard: RouteGuard; prefix: string } | null {
  for (const guard of ROUTE_GUARDS) {
    for (const prefix of guard.prefixes) {
      if (matchesRouteGuardPrefix(pathname, prefix, guard.match)) {
        return { guard, prefix }
      }
    }
  }

  return null
}

export type RouteGuardEnv = {
  NODE_ENV?: string
  PF_INTERNAL_TOKEN?: string
  PF_PREVIEW_TOKEN?: string
  VERCEL?: string
  VERCEL_ENV?: string
}

export type InternalRouteAccessPolicy =
  | { mode: "allow" }
  | { mode: "deny" }
  | { mode: "token"; token: string }

export function resolveInternalRouteAccessPolicy(
  env: RouteGuardEnv = process.env,
): InternalRouteAccessPolicy {
  if (env.NODE_ENV === "development") return { mode: "allow" }

  const configuredToken = env.PF_INTERNAL_TOKEN?.trim()
  if (!configuredToken) return { mode: "deny" }

  if (
    env.VERCEL_ENV === "production" &&
    configuredToken.length < MIN_PRODUCTION_INTERNAL_TOKEN_LENGTH
  ) {
    return { mode: "deny" }
  }

  return { mode: "token", token: configuredToken }
}

export function resolvePreviewToken(env: RouteGuardEnv = process.env): string | null {
  const configuredToken = env.PF_PREVIEW_TOKEN?.trim()
  const isDeployed =
    env.VERCEL === "1" || env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview"

  if (isDeployed) {
    if (!configuredToken || configuredToken.length < MIN_DEPLOYED_PREVIEW_TOKEN_LENGTH) {
      return null
    }
    return configuredToken
  }

  return configuredToken || "local-preview"
}
