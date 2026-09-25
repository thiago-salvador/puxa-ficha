import { CloudflareWebAnalyticsBeacon } from "@/components/CloudflareWebAnalyticsBeacon"

/**
 * Não lê o request de propósito: fazer isso aqui deixava todo o layout do site
 * dinâmico. A CSP deixou de usar nonce (host explícito em script-src) e a
 * exclusão da colinha passou para o client, pelo pathname.
 */
export function CloudflareWebAnalytics() {
  if (process.env.VERCEL_ENV !== "production") return null
  return <CloudflareWebAnalyticsBeacon />
}
