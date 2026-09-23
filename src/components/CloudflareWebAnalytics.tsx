import Script from "next/script"
import { headers } from "next/headers"

const CLOUDFLARE_WEB_ANALYTICS_TOKEN = "f47edf88957444dc83600ce372955b50"

export async function CloudflareWebAnalytics() {
  if (process.env.VERCEL_ENV !== "production") return null

  const requestHeaders = await headers()
  if (requestHeaders.get("x-pf-private-colinha") === "1") return null
  const nonce = requestHeaders.get("x-nonce") ?? undefined

  return (
    <Script
      id="cf-web-analytics"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      strategy="afterInteractive"
      // Script clássico, como o snippet oficial: com type="module" o navegador busca
      // em modo CORS e descarta o preload que o Next injeta (aviso no console e
      // download duplicado).
      nonce={nonce}
      data-cf-beacon={JSON.stringify({ token: CLOUDFLARE_WEB_ANALYTICS_TOKEN })}
    />
  )
}
