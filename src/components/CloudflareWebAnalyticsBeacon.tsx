"use client"

import Script from "next/script"
import { usePathname } from "next/navigation"

const CLOUDFLARE_WEB_ANALYTICS_TOKEN = "f47edf88957444dc83600ce372955b50"

/** A colinha contém escolhas na query; o beacon não carrega nessa rota. */
const PRIVATE_PATHNAMES = new Set(["/colinha"])

export function CloudflareWebAnalyticsBeacon() {
  const pathname = usePathname()
  if (PRIVATE_PATHNAMES.has(pathname)) return null

  return (
    <Script
      id="cf-web-analytics"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      strategy="afterInteractive"
      type="module"
      crossOrigin="anonymous"
      data-cf-beacon={JSON.stringify({ token: CLOUDFLARE_WEB_ANALYTICS_TOKEN })}
    />
  )
}
