import Script from "next/script"
import { headers } from "next/headers"

const CLOUDFLARE_WEB_ANALYTICS_TOKEN = "f47edf88957444dc83600ce372955b50"

export async function CloudflareWebAnalytics() {
  if (process.env.VERCEL_ENV !== "production") return null

  const nonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <Script
      id="cf-web-analytics"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      strategy="afterInteractive"
      type="module"
      nonce={nonce}
      data-cf-beacon={JSON.stringify({ token: CLOUDFLARE_WEB_ANALYTICS_TOKEN })}
    />
  )
}
