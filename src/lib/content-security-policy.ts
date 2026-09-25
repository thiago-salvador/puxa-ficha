// Import relativo: este módulo também é lido pelo next.config.ts, fora do alias `@/`.
import { REMOTE_IMAGE_HOSTS } from "./remote-image-hosts"

interface ContentSecurityPolicyOptions {
  frameAncestors: "'none'" | "*"
  isDevelopment?: boolean
  applyProductionHttpsHeaders?: boolean
  env?: NodeJS.ProcessEnv
}

function compactDirective(values: Iterable<string>): string {
  return Array.from(new Set(values)).filter(Boolean).join(" ")
}

function originFromUrl(value: string | null | undefined): string | null {
  if (!value || value.includes("placeholder")) return null
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`).origin
  } catch {
    return null
  }
}

function hostnameFromUrl(value: string | null | undefined): string | null {
  const origin = originFromUrl(value)
  if (!origin) return null
  try {
    return new URL(origin).hostname
  } catch {
    return null
  }
}

export function buildContentSecurityPolicy({
  frameAncestors,
  isDevelopment = process.env.NODE_ENV !== "production",
  applyProductionHttpsHeaders = false,
  env = process.env,
}: ContentSecurityPolicyOptions): string {
  const supabaseOrigin = originFromUrl(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL)
  const supabaseHost = hostnameFromUrl(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL)
  const sentryOrigin = originFromUrl(env.NEXT_PUBLIC_SENTRY_DSN || env.SENTRY_DSN)

  // Sem nonce desde 2026-09-25. O nonce por request obrigava o RootLayout a ler
  // `headers()`, o que tornava TODA página dinâmica: 408 mil execuções de função
  // contra 608 hits de cache em 3 dias de produção.
  // Com política estática as páginas voltam para a CDN. O App Router injeta
  // scripts inline (payload RSC) em cada HTML, e SRI só cobre arquivo externo,
  // então `'unsafe-inline'` é o preço de servir página estática. O resto da
  // política (object-src, base-uri, form-action, frame-ancestors, allowlists)
  // continua estrito, e o beacon da Cloudflare entra por host explícito.
  const scriptSources = ["'self'", "'unsafe-inline'", "https://static.cloudflareinsights.com"]
  if (isDevelopment) {
    scriptSources.push("'unsafe-eval'", "https://va.vercel-scripts.com")
  }

  const connectSources = [
    "'self'",
    "https://vitals.vercel-insights.com",
    "https://cloudflareinsights.com",
    "https://static.cloudflareinsights.com",
    supabaseOrigin,
    supabaseHost ? `wss://${supabaseHost}` : null,
    sentryOrigin,
  ].filter((value): value is string => Boolean(value))

  const imageSources = [
    "'self'",
    "data:",
    "blob:",
    ...REMOTE_IMAGE_HOSTS.map((hostname) => `https://${hostname}`),
    "http://www.senado.leg.br",
    supabaseOrigin,
  ].filter((value): value is string => Boolean(value))

  return [
    "default-src 'self'",
    `script-src ${compactDirective(scriptSources)}`,
    "worker-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src ${compactDirective(imageSources)}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src ${compactDirective(connectSources)}`,
    "media-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isDevelopment || !applyProductionHttpsHeaders ? [] : ["upgrade-insecure-requests"]),
    `frame-ancestors ${frameAncestors}`,
  ].join("; ")
}
