import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"

function read(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8")
}

test("Cloudflare beacon keeps its production, nonce and CSP contract without network I/O", () => {
  const component = read("src/components/CloudflareWebAnalytics.tsx")
  const layout = read("src/app/(site)/layout.tsx")
  const csp = read("src/lib/content-security-policy.ts")

  assert.match(component, /VERCEL_ENV !== "production"/)
  assert.match(component, /headers\(\)/)
  assert.match(component, /get\("x-nonce"\)/)
  assert.match(component, /nonce=\{nonce\}/)
  assert.match(component, /static\.cloudflareinsights\.com\/beacon\.min\.js/)
  assert.match(component, /data-cf-beacon=/)
  assert.match(layout, /<CloudflareWebAnalytics\s*\/>/)
  assert.match(csp, /"https:\/\/cloudflareinsights\.com"/)
  assert.match(csp, /"https:\/\/static\.cloudflareinsights\.com"/)
  assert.doesNotMatch(component, /\bfetch\s*\(|\bsendBeacon\s*\(/)
  assert.doesNotMatch(component, /API_KEY|AUTH_TOKEN|PASSWORD|SECRET/)
})
