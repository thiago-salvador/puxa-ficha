import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"
import { NextRequest } from "next/server"

import { REVALIDATE_ALLOWED_TAGS } from "../src/lib/revalidate-cache"
import { createRevalidatePublicCacheHandler } from "../src/app/api/internal/revalidate-public-cache/route"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const SECRET = "cron-revalidate-public-cache-secret"
const ROUTE_URL = "https://puxaficha.com.br/api/internal/revalidate-public-cache"

function request(secret?: string) {
  const headers = secret ? { authorization: `Bearer ${secret}` } : undefined
  return new NextRequest(ROUTE_URL, { headers })
}

describe("cron GET /api/internal/revalidate-public-cache", () => {
  it("vercel.json agenda a rota a cada 15 minutos", () => {
    const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>
    }
    const entry = vercel.crons.find((cron) => cron.path === "/api/internal/revalidate-public-cache")
    assert.ok(entry, "faltou o cron /api/internal/revalidate-public-cache em vercel.json")
    assert.equal(entry.schedule, "*/15 * * * *")
  })

  it("Settings documenta o cron de 15 minutos", () => {
    const settings = readFileSync(
      join(root, "Settings/AUTOMATIONS_AND_ENVIRONMENTS.md"),
      "utf8",
    )
    assert.match(settings, /\/api\/internal\/revalidate-public-cache/)
    assert.match(settings, /\*\/15/)
  })

  it("reprova sem CRON_SECRET", async () => {
    const tags: string[] = []
    const handler = createRevalidatePublicCacheHandler({
      expectedSecret: SECRET,
      revalidateFn: (tag) => tags.push(tag),
    })
    const response = await handler(request())
    assert.equal(response.status, 401)
    assert.deepEqual(tags, [])
  })

  it("reprova secret errado", async () => {
    const tags: string[] = []
    const handler = createRevalidatePublicCacheHandler({
      expectedSecret: SECRET,
      revalidateFn: (tag) => tags.push(tag),
    })
    const response = await handler(request("wrong-secret"))
    assert.equal(response.status, 401)
    assert.deepEqual(tags, [])
  })

  it("reprova se o secret de ambiente estiver vazio", async () => {
    const tags: string[] = []
    const handler = createRevalidatePublicCacheHandler({
      expectedSecret: undefined,
      revalidateFn: (tag) => tags.push(tag),
    })
    const response = await handler(request(SECRET))
    assert.equal(response.status, 401)
    assert.deepEqual(tags, [])
  })

  it("revalida a whitelist inteira quando o cron autentica", async () => {
    const tags: string[] = []
    const handler = createRevalidatePublicCacheHandler({
      expectedSecret: SECRET,
      revalidateFn: (tag) => tags.push(tag),
    })
    const response = await handler(request(SECRET))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("cache-control"), "no-store")
    const body = (await response.json()) as { ok: boolean; revalidated: string[] }
    assert.equal(body.ok, true)
    assert.deepEqual(body.revalidated, [...REVALIDATE_ALLOWED_TAGS])
    assert.deepEqual(tags, [...REVALIDATE_ALLOWED_TAGS])
  })

  it("POST nao revalida", async () => {
    const src = readFileSync(
      join(root, "src/app/api/internal/revalidate-public-cache/route.ts"),
      "utf8",
    )
    assert.match(src, /export async function POST/)
    const { POST } = await import("../src/app/api/internal/revalidate-public-cache/route")
    const response = await POST()
    assert.equal(response.status, 405)
  })
})

describe("contrato da rota de cron de revalidate", () => {
  const routePath = join(root, "src/app/api/internal/revalidate-public-cache/route.ts")

  it("usa CRON_SECRET, runtime nodejs e expire imediato", () => {
    const src = readFileSync(routePath, "utf8")
    assert.match(src, /export const runtime = "nodejs"/)
    assert.match(src, /export const dynamic = "force-dynamic"/)
    assert.match(src, /process\.env\.CRON_SECRET/)
    assert.match(src, /revalidateTag\(tag,\s*\{\s*expire:\s*0\s*\}\)/)
    assert.doesNotMatch(src, /searchParams\.get\(\s*["'][^"']*secret/i)
    assert.doesNotMatch(
      src,
      /console\.(log|warn|error)\([^)]*CRON_SECRET/,
    )
  })
})
