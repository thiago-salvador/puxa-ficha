import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import { quizShortLinkMisconfiguredResponse } from "../src/lib/quiz-short-link-env"

// @types/node>=20 declara process.env.NODE_ENV como readonly. Para mutar
// NODE_ENV em testes (cenarios de production/development/test) usamos um alias
// cast para Record<string, string | undefined> que respeita a propria index
// signature de NodeJS.ProcessEnv (Dict<string>) sem violar nenhuma garantia
// de runtime — apenas remove o readonly de tipo.
const mutableEnv = process.env as Record<string, string | undefined>

describe("quizShortLinkMisconfiguredResponse", () => {
  const saved: Partial<Record<string, string | undefined>> = {}

  beforeEach(() => {
    saved.VERCEL_ENV = process.env.VERCEL_ENV
    saved.NODE_ENV = process.env.NODE_ENV
    saved.PF_QUIZ_SHORT_LINK_SALT = process.env.PF_QUIZ_SHORT_LINK_SALT
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it("returns null when not production (no VERCEL_ENV, NODE_ENV dev/test)", () => {
    delete process.env.VERCEL_ENV
    mutableEnv.NODE_ENV = "development"
    assert.equal(quizShortLinkMisconfiguredResponse(), null)

    process.env.VERCEL_ENV = "preview"
    mutableEnv.NODE_ENV = "test"
    assert.equal(quizShortLinkMisconfiguredResponse(), null)
  })

  it("returns null in production when salt is set (either flag)", () => {
    process.env.VERCEL_ENV = "production"
    mutableEnv.NODE_ENV = "production"
    process.env.PF_QUIZ_SHORT_LINK_SALT = "any-non-empty-salt"
    assert.equal(quizShortLinkMisconfiguredResponse(), null)
  })

  it("returns 503 response when VERCEL_ENV=production but salt missing", async () => {
    process.env.VERCEL_ENV = "production"
    delete mutableEnv.NODE_ENV
    delete process.env.PF_QUIZ_SHORT_LINK_SALT
    const res = quizShortLinkMisconfiguredResponse()
    assert.ok(res)
    assert.equal(res.status, 503)
    const body = (await res.json()) as { error?: string }
    assert.equal(body.error, "Short links misconfigured")
  })

  it("returns 503 response when NODE_ENV=production but salt missing (non-Vercel hosts)", async () => {
    delete process.env.VERCEL_ENV
    mutableEnv.NODE_ENV = "production"
    delete process.env.PF_QUIZ_SHORT_LINK_SALT
    const res = quizShortLinkMisconfiguredResponse()
    assert.ok(res)
    assert.equal(res.status, 503)
    const body = (await res.json()) as { error?: string }
    assert.equal(body.error, "Short links misconfigured")
  })
})
