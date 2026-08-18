import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { describe, it } from "node:test"
import { buildContentSecurityPolicy } from "../src/lib/content-security-policy"
import { extractTrustedClientIp } from "../src/lib/client-ip"
import { createFixedWindowIpRateLimiter } from "../src/lib/request-rate-limit"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const { NextRequest } = require("next/server") as typeof import("next/server")
const { createAnalyticsEventPostHandler } = require("../src/app/api/analytics/event/route")
const { createCardGetHandler } = require("../src/app/api/card/[slug]/route")

function read(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf-8")
}

describe("production CSP contract", () => {
  it("removes unsafe-inline from production scripts and keeps allowlists explicit", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "nonce-test",
      frameAncestors: "'none'",
      isDevelopment: false,
      applyProductionHttpsHeaders: true,
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SENTRY_DSN: "https://public@o123.ingest.sentry.io/456",
      },
    })

    const scriptSrc = csp.match(/script-src ([^;]+)/)?.[1] ?? ""
    const connectSrc = csp.match(/connect-src ([^;]+)/)?.[1] ?? ""
    const imgSrc = csp.match(/img-src ([^;]+)/)?.[1] ?? ""

    assert.match(scriptSrc, /'nonce-nonce-test'/)
    assert.match(scriptSrc, /'strict-dynamic'/)
    assert.doesNotMatch(scriptSrc, /'unsafe-inline'/)
    assert.doesNotMatch(scriptSrc, /\shttps:\s?/)

    assert.match(connectSrc, /https:\/\/project\.supabase\.co/)
    assert.match(connectSrc, /wss:\/\/project\.supabase\.co/)
    assert.match(connectSrc, /https:\/\/o123\.ingest\.sentry\.io/)
    assert.doesNotMatch(connectSrc, /(^|\s)https:(\s|$)/)

    assert.match(imgSrc, /https:\/\/upload\.wikimedia\.org/)
    assert.match(imgSrc, /https:\/\/i0\.wp\.com/)
    assert.match(imgSrc, /http:\/\/www\.senado\.leg\.br/)
    assert.doesNotMatch(imgSrc, /(^|\s)https:(\s|$)/)
  })
})

describe("Sentry source map build contract", () => {
  it("configures upload env keys and deletes generated maps after upload without requiring a local token", () => {
    const nextConfig = read("next.config.ts")

    assert.match(nextConfig, /org:\s*process\.env\.SENTRY_ORG/)
    assert.match(nextConfig, /project:\s*process\.env\.SENTRY_PROJECT/)
    assert.match(nextConfig, /authToken:\s*process\.env\.SENTRY_AUTH_TOKEN/)
    assert.match(nextConfig, /widenClientFileUpload:\s*true/)
    assert.match(nextConfig, /deleteSourcemapsAfterUpload:\s*true/)
    assert.match(nextConfig, /filesToDeleteAfterUpload:\s*\[/)
  })
})

describe("Dependabot critical dependency contract", () => {
  it("adds weekly npm groups without changing GitHub Actions automatic triggers", () => {
    const dependabotPath = ".github/dependabot.yml"
    assert.equal(existsSync(dependabotPath), true)

    const dependabot = read(dependabotPath)
    assert.match(dependabot, /package-ecosystem:\s*"npm"/)
    assert.match(dependabot, /interval:\s*"weekly"/)
    assert.match(dependabot, /open-pull-requests-limit:\s*4/)
    assert.match(dependabot, /next-react:/)
    assert.match(dependabot, /sentry:/)
    assert.match(dependabot, /supabase:/)
    assert.match(dependabot, /tooling:/)
    assert.doesNotMatch(dependabot, /pull_request:|workflow_dispatch:/)
  })
})

describe("fixed-window IP rate limit", () => {
  it("allows requests below the limit and blocks repeated bursts from the same IP", () => {
    const limiter = createFixedWindowIpRateLimiter({
      namespace: "unit-test",
      max: 2,
      windowMs: 60_000,
    })
    const headers = new Headers({ "x-real-ip": "203.0.113.42" })

    assert.equal(limiter.check(headers, 1_000).allowed, true)
    assert.equal(limiter.check(headers, 2_000).allowed, true)
    assert.equal(limiter.check(headers, 3_000).allowed, false)
    assert.equal(limiter.check(headers, 62_000).allowed, true)
  })

  it("rate-limits analytics/event before writing an event", async () => {
    const limiter = createFixedWindowIpRateLimiter({
      namespace: "analytics-route-test",
      max: 1,
      windowMs: 60_000,
    })
    let writes = 0
    const handler = createAnalyticsEventPostHandler({
      rateLimiter: limiter,
      recordAnalyticsLaunchEvent: async () => {
        writes += 1
      },
      countRecentAnalyticsEventsByIpHash: async () => ({ status: "ok", count: 0 }),
      now: () => Date.now(),
    })
    const request = () =>
      new Request("http://localhost/api/analytics/event", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": "203.0.113.43",
          origin: "http://localhost",
        },
        body: JSON.stringify({ eventName: "Candidate Click", payload: { surface: "test" } }),
      })

    assert.equal((await handler(request())).status, 200)
    assert.equal((await handler(request())).status, 429)
    assert.equal(writes, 1)
  })

  it("fails closed when analytics/event cannot evaluate the rate limit", async () => {
    let writes = 0
    const handler = createAnalyticsEventPostHandler({
      rateLimiter: {
        check: () => {
          throw new Error("rate backend unavailable")
        },
        reset: () => {},
      },
      recordAnalyticsLaunchEvent: async () => {
        writes += 1
      },
      countRecentAnalyticsEventsByIpHash: async () => ({ status: "ok", count: 0 }),
      now: () => Date.now(),
    })

    const originalConsoleError = console.error
    let response: Response
    try {
      console.error = () => {}
      response = await handler(
        new Request("http://localhost/api/analytics/event", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-real-ip": "203.0.113.143",
            origin: "http://localhost",
          },
          body: JSON.stringify({ eventName: "Candidate Click", payload: { surface: "test" } }),
        }),
      )
    } finally {
      console.error = originalConsoleError
    }

    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { ok: false, reason: "rate_limit_failed" })
    assert.equal(writes, 0)
  })

  it("rejects cross-site analytics/event writes before storing payloads", async () => {
    let writes = 0
    const handler = createAnalyticsEventPostHandler({
      rateLimiter: createFixedWindowIpRateLimiter({
        namespace: "analytics-cross-site-test",
        max: 10,
        windowMs: 60_000,
      }),
      recordAnalyticsLaunchEvent: async () => {
        writes += 1
      },
      countRecentAnalyticsEventsByIpHash: async () => ({ status: "ok", count: 0 }),
      now: () => Date.now(),
    })

    const response = await handler(
      new Request("http://localhost/api/analytics/event", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        body: JSON.stringify({ eventName: "Candidate Click", payload: { surface: "test" } }),
      }),
    )

    assert.equal(response.status, 403)
    assert.equal(response.headers.get("x-pf-block-reason"), "csrf_origin_not_allowed")
    assert.equal(writes, 0)
  })

  it("rejects oversized analytics/event bodies before storing payloads", async () => {
    let writes = 0
    const handler = createAnalyticsEventPostHandler({
      rateLimiter: createFixedWindowIpRateLimiter({
        namespace: "analytics-large-body-test",
        max: 10,
        windowMs: 60_000,
      }),
      recordAnalyticsLaunchEvent: async () => {
        writes += 1
      },
      countRecentAnalyticsEventsByIpHash: async () => ({ status: "ok", count: 0 }),
      now: () => Date.now(),
    })

    const response = await handler(
      new Request("http://localhost/api/analytics/event", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": "203.0.113.145",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          eventName: "Candidate Click",
          payload: { surface: "x".repeat(20_000) },
        }),
      }),
    )

    assert.equal(response.status, 413)
    assert.equal(writes, 0)
  })

  it("rate-limits api/card/[slug] before generating the image", async () => {
    const limiter = createFixedWindowIpRateLimiter({
      namespace: "card-route-test",
      max: 1,
      windowMs: 60_000,
    })
    let generated = 0
    const handler = createCardGetHandler({
      rateLimiter: limiter,
      getCandidatoBySlugResource: async () => ({ data: { foto_url: null } }),
      fetchPhotoAsBase64: async () => null,
      extractCardData: () => ({}),
      buildSocialCard: async () => {
        generated += 1
        return new Response("card", { headers: { "content-type": "image/png" } })
      },
      startSpan: (_context: unknown, callback: () => Promise<Response>) => callback(),
    })
    const request = () =>
      new NextRequest("http://localhost/api/card/lula", {
        headers: { "x-real-ip": "203.0.113.44" },
      })
    const params = { params: Promise.resolve({ slug: "lula" }) }

    assert.equal((await handler(request(), params)).status, 200)
    assert.equal((await handler(request(), params)).status, 429)
    assert.equal(generated, 1)
  })
})

describe("trusted client IP extraction", () => {
  it("fails closed outside Vercel production instead of trusting x-forwarded-for", () => {
    const savedNodeEnv = process.env.NODE_ENV
    const savedVercelEnv = process.env.VERCEL_ENV
    const mutableEnv = process.env as Record<string, string | undefined>

    try {
      mutableEnv.NODE_ENV = "production"
      delete mutableEnv.VERCEL_ENV

      const headers = new Headers({
        "x-forwarded-for": "198.51.100.1, 198.51.100.2",
        "x-real-ip": "198.51.100.3",
      })

      assert.equal(extractTrustedClientIp(headers), "unknown")
    } finally {
      if (savedNodeEnv === undefined) delete mutableEnv.NODE_ENV
      else mutableEnv.NODE_ENV = savedNodeEnv

      if (savedVercelEnv === undefined) delete mutableEnv.VERCEL_ENV
      else mutableEnv.VERCEL_ENV = savedVercelEnv
    }
  })
})

describe("alerts subscribe scope guard", () => {
  /**
   * Ate 2026-07-26 este guard exigia que o teto de banco fosse o UNICO
   * limitador do subscribe. A regra foi invertida porque deixava um buraco: o
   * teto de banco so roda quando o email ainda nao existe
   * (`if (!existingSubscriber)`), entao o caminho de assinante ja verificado,
   * que dispara email de link de gestao, ficava coberto apenas pelo cooldown
   * de 15 min por assinante. Com uma lista de emails validos dava para tirar um
   * email por endereco sem nunca esbarrar em teto de IP.
   *
   * O invariante agora e que os DOIS convivem, cada um cobrindo o que o outro
   * nao cobre.
   */
  it("mantem os dois limitadores do subscribe: teto de banco e janela por IP", () => {
    const subscribeRoute = read("src/app/api/alerts/subscribe/route.ts")

    assert.match(
      subscribeRoute,
      /rate_limit_new_subscribers_hour/,
      "teto de banco por hora para assinante novo",
    )
    assert.match(
      subscribeRoute,
      /createFixedWindowIpRateLimiter/,
      "janela por IP no processo, aplicada a todos os caminhos",
    )
  })

  it("nao devolve estado do assinante no corpo do subscribe", () => {
    const subscribeRoute = read("src/app/api/alerts/subscribe/route.ts")
    const corpoDoHandler = subscribeRoute.slice(subscribeRoute.indexOf("createSubscribeHandler"))

    for (const chave of ["manageLinkSent", "requiresVerification", "cooldownActive:"]) {
      assert.doesNotMatch(
        corpoDoHandler,
        new RegExp(`${chave}\\s*:\\s*true`),
        `${chave} no corpo transforma o endpoint em oraculo de enumeracao`,
      )
    }
  })
})
