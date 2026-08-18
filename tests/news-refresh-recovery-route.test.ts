import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { afterEach, beforeEach, describe, it } from "node:test"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const { NextRequest } = require("next/server") as typeof import("next/server")
const { createNewsRefreshRecoveryHandler } = require("../src/app/api/news/refresh/recover/route") as typeof import("../src/app/api/news/refresh/recover/route")
const { NEWS_REFRESH_EXECUTION_HEADER } = require("../src/lib/news/refresh-run-store") as typeof import("../src/lib/news/refresh-run-store")
type NewsRefreshRecoverable = import("../src/lib/news/refresh-run-store").NewsRefreshRecoverable

const CRON_SECRET = "recovery-secret-never-log"
const ROUTE_URL = "http://localhost:3000/api/news/refresh/recover"

const recoverable: NewsRefreshRecoverable[] = [
  {
    executionId: "11111111-1111-4111-8111-111111111111",
    cursor: 25,
    limit: 5,
    chainDepth: 2,
    revalidateRequested: false,
    kind: "batch_lease_expired",
  },
  {
    executionId: "22222222-2222-4222-8222-222222222222",
    cursor: 40,
    limit: 6,
    chainDepth: 4,
    revalidateRequested: true,
    kind: "continuation_pending",
  },
]

function request(secret: string | null = CRON_SECRET) {
  const headers: Record<string, string> = {}
  if (secret !== null) headers.Authorization = `Bearer ${secret}`
  return new NextRequest(ROUTE_URL, { method: "GET", headers })
}

describe("news refresh recovery sweeper", () => {
  const savedSecret = process.env.CRON_SECRET
  const savedOrigin = process.env.PF_CRON_CHAIN_ORIGIN

  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET
    delete process.env.PF_CRON_CHAIN_ORIGIN
  })

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = savedSecret
    if (savedOrigin === undefined) delete process.env.PF_CRON_CHAIN_ORIGIN
    else process.env.PF_CRON_CHAIN_ORIGIN = savedOrigin
  })

  it("rejects unauthenticated calls before scanning", async () => {
    let scans = 0
    const handler = createNewsRefreshRecoveryHandler({
      listRecoverable: async () => {
        scans += 1
        return recoverable
      },
      fetchImpl: fetch,
      log: () => undefined,
    })

    assert.equal((await handler(request(null))).status, 401)
    assert.equal(scans, 0)
  })

  it("redrives every recoverable key with stable execution id and no secret in URLs", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
    const logs: Array<{ event: string; detail: Record<string, unknown> }> = []
    let requestedLimit = 0
    const handler = createNewsRefreshRecoveryHandler({
      listRecoverable: async (limit) => {
        requestedLimit = limit
        return recoverable
      },
      fetchImpl: (async (url: string | URL, init?: RequestInit) => {
        fetchCalls.push({ url: String(url), init })
        const requestUrl = new URL(String(url))
        const headers = init?.headers as Record<string, string>
        return Response.json(
          {
            accepted: true,
            alreadyAccepted: false,
            workScheduled: true,
            state: "processing",
            executionId: headers[NEWS_REFRESH_EXECUTION_HEADER],
            cursor: Number(requestUrl.searchParams.get("cursor")),
          },
          { status: 202 },
        )
      }) as unknown as typeof fetch,
      log: (event, detail) => logs.push({ event, detail }),
    })

    const response = await handler(request())
    const body = (await response.json()) as Record<string, unknown>
    assert.equal(response.status, 200)
    assert.deepEqual(body, { ok: true, scanned: 2, redriven: 2, failed: 0 })
    assert.equal(requestedLimit, 12)
    assert.equal(fetchCalls.length, 2)

    for (const [index, call] of fetchCalls.entries()) {
      const expected = recoverable[index]
      const url = new URL(call.url)
      const headers = call.init?.headers as Record<string, string>
      assert.equal(url.pathname, "/api/news/refresh")
      assert.equal(url.searchParams.get("cursor"), String(expected.cursor))
      assert.equal(url.searchParams.get("limit"), String(expected.limit))
      assert.equal(url.searchParams.get("chain"), "1")
      assert.equal(url.searchParams.get("depth"), String(expected.chainDepth))
      assert.equal(headers[NEWS_REFRESH_EXECUTION_HEADER], expected.executionId)
      assert.equal(headers.Authorization, `Bearer ${CRON_SECRET}`)
      assert.ok(!call.url.includes(CRON_SECRET))
    }
    assert.ok(!JSON.stringify(logs).includes(CRON_SECRET))
  })

  it("fails the cron visibly and redacts the secret when a redrive fails", async () => {
    const logs: Array<{ event: string; detail: Record<string, unknown> }> = []
    const handler = createNewsRefreshRecoveryHandler({
      listRecoverable: async () => [recoverable[0]],
      fetchImpl: (async () => {
        throw new Error(`socket closed after Bearer ${CRON_SECRET}`)
      }) as unknown as typeof fetch,
      log: (event, detail) => logs.push({ event, detail }),
    })

    const response = await handler(request())
    const body = (await response.json()) as Record<string, unknown>
    assert.equal(response.status, 503)
    assert.deepEqual(body, { ok: false, scanned: 1, redriven: 0, failed: 1 })
    assert.ok(!JSON.stringify(logs).includes(CRON_SECRET))
    assert.match(JSON.stringify(logs), /\[REDACTED\]/)
  })

  it("bounds concurrent redrives", async () => {
    const many = Array.from({ length: 9 }, (_, index): NewsRefreshRecoverable => ({
      ...recoverable[0],
      executionId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      cursor: index,
    }))
    let active = 0
    let maxActive = 0
    const handler = createNewsRefreshRecoveryHandler({
      listRecoverable: async () => many,
      fetchImpl: (async (url: string | URL, init?: RequestInit) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise<void>((resolve) => setImmediate(resolve))
        active -= 1
        const requestUrl = new URL(String(url))
        const headers = init?.headers as Record<string, string>
        return Response.json(
          {
            accepted: true,
            alreadyAccepted: false,
            workScheduled: true,
            state: "processing",
            executionId: headers[NEWS_REFRESH_EXECUTION_HEADER],
            cursor: Number(requestUrl.searchParams.get("cursor")),
          },
          { status: 202 },
        )
      }) as unknown as typeof fetch,
      log: () => undefined,
    })

    const response = await handler(request())
    assert.equal(response.status, 200)
    assert.equal(maxActive, 4)
  })

  it("fails visibly when a 2xx ACK does not prove scheduled work", async () => {
    const logs: Array<{ event: string; detail: Record<string, unknown> }> = []
    const item = recoverable[0]
    const handler = createNewsRefreshRecoveryHandler({
      listRecoverable: async () => [item],
      fetchImpl: (async () =>
        Response.json(
          {
            accepted: true,
            alreadyAccepted: true,
            workScheduled: false,
            state: "processing",
            executionId: item.executionId,
            cursor: item.cursor,
          },
          { status: 202 },
        )) as unknown as typeof fetch,
      log: (event, detail) => logs.push({ event, detail }),
    })

    const response = await handler(request())
    assert.equal(response.status, 503)
    assert.ok(logs.some((entry) => entry.event === "recovery_redrive_failed"))
  })

  it("accepts a matching completed ACK because the duplicate route rearms its continuation", async () => {
    const item = recoverable[1]
    const handler = createNewsRefreshRecoveryHandler({
      listRecoverable: async () => [item],
      fetchImpl: (async () =>
        Response.json(
          {
            accepted: true,
            alreadyAccepted: true,
            workScheduled: false,
            state: "completed",
            executionId: item.executionId,
            cursor: item.cursor,
          },
          { status: 200 },
        )) as unknown as typeof fetch,
      log: () => undefined,
    })

    assert.equal((await handler(request())).status, 200)
  })
})
