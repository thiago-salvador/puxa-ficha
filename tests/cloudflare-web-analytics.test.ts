import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"

function read(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8")
}

test("Cloudflare beacon keeps its production, privacy and CSP contract without network I/O", () => {
  const component = read("src/components/CloudflareWebAnalytics.tsx")
  const beacon = read("src/components/CloudflareWebAnalyticsBeacon.tsx")
  const layout = read("src/app/(site)/layout.tsx")
  const csp = read("src/lib/content-security-policy.ts")

  assert.match(component, /VERCEL_ENV !== "production"/)
  // Sem request: ler headers() aqui deixava o layout inteiro dinâmico.
  assert.doesNotMatch(component, /headers\(\)|x-nonce/)
  assert.doesNotMatch(beacon, /headers\(\)|nonce/)
  // A colinha continua sem beacon (a query contém escolhas), agora pelo pathname.
  assert.match(beacon, /^"use client"/)
  assert.match(beacon, /usePathname\(\)/)
  assert.match(beacon, /PRIVATE_PATHNAMES = new Set\(\["\/colinha"\]\)/)
  assert.doesNotMatch(read("middleware.ts"), /x-pf-private-colinha/)
  assert.match(beacon, /type="module"/)
  assert.match(beacon, /crossOrigin="anonymous"/)
  assert.match(beacon, /static\.cloudflareinsights\.com\/beacon\.min\.js/)
  assert.match(beacon, /data-cf-beacon=/)
  assert.match(layout, /<CloudflareWebAnalytics\s*\/>/)
  assert.match(csp, /"https:\/\/cloudflareinsights\.com"/)
  assert.match(csp, /"https:\/\/static\.cloudflareinsights\.com"/)
  for (const source of [component, beacon]) {
    assert.doesNotMatch(source, /\bfetch\s*\(|\bsendBeacon\s*\(/)
    assert.doesNotMatch(source, /API_KEY|AUTH_TOKEN|PASSWORD|SECRET/)
  }
})
