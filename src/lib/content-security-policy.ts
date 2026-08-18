import { REMOTE_IMAGE_HOSTS } from "@/lib/remote-image-hosts"

interface ContentSecurityPolicyOptions {
  nonce?: string
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
  nonce,
  frameAncestors,
  isDevelopment = process.env.NODE_ENV !== "production",
  applyProductionHttpsHeaders = false,
  env = process.env,
}: ContentSecurityPolicyOptions): string {
  const supabaseOrigin = originFromUrl(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL)
  const supabaseHost = hostnameFromUrl(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL)
  const sentryOrigin = originFromUrl(env.NEXT_PUBLIC_SENTRY_DSN || env.SENTRY_DSN)

  const scriptSources = ["'self'"]
  if (nonce) {
    scriptSources.push(`'nonce-${nonce}'`, "'strict-dynamic'")
  }
  if (isDevelopment) {
    scriptSources.push("'unsafe-inline'", "'unsafe-eval'", "https://va.vercel-scripts.com")
  }

  const connectSources = [
    "'self'",
    "https://vitals.vercel-insights.com",
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
