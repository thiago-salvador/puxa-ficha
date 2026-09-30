import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import { extractTrustedClientIp, hashTrustedClientIp } from "../src/lib/client-ip"

const env = process.env as Record<string, string | undefined>
const keys = ["NODE_ENV", "VERCEL", "VERCEL_ENV"]
let saved: Record<string, string | undefined>

describe("client IP platform trust", () => {
  beforeEach(() => {
    saved = Object.fromEntries(keys.map((key) => [key, env[key]]))
    for (const key of keys) delete env[key]
  })
  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete env[key]
      else env[key] = saved[key]
    }
  })

  it("ignores forged Vercel headers in production outside Vercel", () => {
    env.NODE_ENV = "production"
    for (const value of [undefined, "0", "true", "preview"]) {
      if (value === undefined) delete env.VERCEL
      else env.VERCEL = value
      const first = new Headers({ "x-vercel-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.2" })
      const second = new Headers({ "x-vercel-forwarded-for": "198.51.100.3", "x-forwarded-for": "198.51.100.4" })
      assert.equal(extractTrustedClientIp(first), "unknown")
      assert.equal(extractTrustedClientIp(second), "unknown")
      assert.equal(hashTrustedClientIp(first, "test"), hashTrustedClientIp(second, "test"))
    }
  })

  it("uses the first Vercel IP only on the Vercel platform", () => {
    env.NODE_ENV = "production"
    env.VERCEL = "1"
    assert.equal(extractTrustedClientIp(new Headers({ "x-vercel-forwarded-for": " 198.51.100.1, 198.51.100.2 " })), "198.51.100.1")
    assert.equal(extractTrustedClientIp(new Headers({ "x-real-ip": "198.51.100.2" })), "unknown")
  })

  it("preserves local real-IP and forwarded-IP fixtures while ignoring a Vercel header", () => {
    env.NODE_ENV = "test"
    assert.equal(extractTrustedClientIp(new Headers({ "x-vercel-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.2" })), "198.51.100.2")
    assert.equal(extractTrustedClientIp(new Headers({ "x-vercel-forwarded-for": "198.51.100.1", "x-forwarded-for": "198.51.100.3, 198.51.100.4" })), "198.51.100.4")
    assert.equal(extractTrustedClientIp(new Headers({ "x-vercel-forwarded-for": "198.51.100.1" })), "unknown")
  })

  it("does not treat VERCEL_ENV as proof of the platform", () => {
    env.NODE_ENV = "test"
    env.VERCEL_ENV = "preview"
    assert.equal(extractTrustedClientIp(new Headers({ "x-vercel-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.2" })), "unknown")
  })
})
