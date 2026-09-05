import assert from "node:assert/strict"
import { test } from "node:test"
import * as rateLimit from "../src/lib/request-rate-limit"

test("independent instances share one atomic quota without exposing the IP", async () => {
  assert.equal(typeof rateLimit.createDistributedIpRateLimiter, "function")
  const counts = new Map<string, number>()
  const store: rateLimit.DistributedRateLimitStore = async ({ key, max, windowMs }) => {
    assert.match(key, /^[a-f0-9]{48}$/)
    const count = (counts.get(key) ?? 0) + 1
    counts.set(key, count)
    return { allowed: count <= max, remaining: Math.max(0, max - count), resetAt: Date.now() + windowMs }
  }
  const a = rateLimit.createDistributedIpRateLimiter({ namespace: "shared", max: 3, windowMs: 1000, store })
  const b = rateLimit.createDistributedIpRateLimiter({ namespace: "shared", max: 3, windowMs: 1000, store })
  const headers = new Headers({ "x-forwarded-for": "203.0.113.1", "x-vercel-forwarded-for": "203.0.113.1" })
  const results = await Promise.all([a.check(headers), b.check(headers), a.check(headers), b.check(headers)])
  assert.equal(results.filter(x => x.allowed).length, 3)
  a.reset()
  assert.equal((await a.check(headers)).allowed, false, "local resets do not reset distributed quota")
})

test("unavailable or malformed quota backend fails closed as 503", async () => {
  assert.equal(typeof rateLimit.createDistributedIpRateLimiter, "function")
  for (const store of [async () => { throw new Error("offline") }, async () => ({ allowed: true }) as never]) {
    const limiter = rateLimit.createDistributedIpRateLimiter({ namespace: "offline", max: 3, windowMs: 1000, store })
    const decision = await limiter.check(new Headers())
    assert.equal(decision.allowed, false)
    const response = rateLimit.rateLimitExceededResponse(decision)
    assert.equal(response.status, 503)
    assert.equal(response.headers.get("cache-control"), "no-store")
  }
})
