import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import { NextRequest } from "next/server"
import { config, middleware } from "../middleware"
import { deriveAccessCookieValue } from "@/lib/access-cookie-digest"
import {
  findRouteGuard,
  MIN_PRODUCTION_INTERNAL_TOKEN_LENGTH,
  ROUTE_GUARDS,
  resolveInternalRouteAccessPolicy,
} from "@/lib/route-guards"

const ENV_KEYS = ["NODE_ENV", "VERCEL", "VERCEL_ENV", "PF_INTERNAL_TOKEN"] as const
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}
const env = process.env as Record<string, string | undefined>

function request(pathname: string, cookie?: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: cookie ? { cookie } : undefined,
  })
}

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) delete env[key]
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) env[key] = value
  }
}

describe("canonical guard inventory", () => {
  it("enumerates every middleware route guard and prefix", () => {
    assert.deepEqual(
      ROUTE_GUARDS.map(({ id, prefixes, match }) => ({ id, prefixes: [...prefixes], match })),
      [
        { id: "preview-access", prefixes: ["/preview"], match: "subpath-only" },
        {
          id: "internal-access",
          prefixes: ["/internaltest", "/styleguide"],
          match: "exact-or-subpath",
        },
        { id: "candidate-slug", prefixes: ["/candidato"], match: "subpath-only" },
        { id: "ranking-slug", prefixes: ["/rankings"], match: "subpath-only" },
        { id: "uf-slug", prefixes: ["/uf"], match: "subpath-only" },
      ],
    )
  })

  it("matches internal routes by segment, including dotted subpaths", () => {
    for (const surface of ["/internaltest", "/styleguide"]) {
      assert.equal(findRouteGuard(surface)?.guard.id, "internal-access")
      assert.equal(findRouteGuard(`${surface}/components/button`)?.guard.id, "internal-access")
      assert.equal(findRouteGuard(`${surface}/a.b`)?.guard.id, "internal-access")
    }

    assert.equal(findRouteGuard("/internaltesting"), null)
    assert.equal(findRouteGuard("/styleguides"), null)
  })

  it("keeps explicit middleware matchers for every internal surface subpath", () => {
    const internal = ROUTE_GUARDS.find(({ id }) => id === "internal-access")
    assert.ok(internal)
    assert.deepEqual(
      config.matcher.slice(0, internal.prefixes.length),
      internal.prefixes.map((prefix) => `${prefix}/:path*`),
    )
  })
})

describe("internal route environment policy", () => {
  it("allows development without a token", () => {
    assert.deepEqual(
      resolveInternalRouteAccessPolicy({
        NODE_ENV: "development",
        VERCEL_ENV: "production",
      }),
      { mode: "allow" },
    )
  })

  it("requires a configured token outside development", () => {
    assert.deepEqual(resolveInternalRouteAccessPolicy({ NODE_ENV: "test" }), { mode: "deny" })
    assert.deepEqual(
      resolveInternalRouteAccessPolicy({ NODE_ENV: "production", VERCEL_ENV: "preview" }),
      { mode: "deny" },
    )
    assert.deepEqual(
      resolveInternalRouteAccessPolicy({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        PF_INTERNAL_TOKEN: "preview-token",
      }),
      { mode: "token", token: "preview-token" },
    )
  })

  it("requires a strong token in Vercel production", () => {
    const tooShort = "x".repeat(MIN_PRODUCTION_INTERNAL_TOKEN_LENGTH - 1)
    const strong = "x".repeat(MIN_PRODUCTION_INTERNAL_TOKEN_LENGTH)

    assert.deepEqual(
      resolveInternalRouteAccessPolicy({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        PF_INTERNAL_TOKEN: tooShort,
      }),
      { mode: "deny" },
    )
    assert.deepEqual(
      resolveInternalRouteAccessPolicy({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        PF_INTERNAL_TOKEN: strong,
      }),
      { mode: "token", token: strong },
    )
  })
})

describe("internal route middleware behavior", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = env[key]
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = savedEnv[key]
      if (value === undefined) delete env[key]
      else env[key] = value
    }
  })

  it("allows exact routes and subpaths in development", async () => {
    setEnv({ NODE_ENV: "development" })

    for (const surface of ["/internaltest", "/styleguide"]) {
      for (const path of [surface, `${surface}/components/button`, `${surface}/a.b`]) {
        const response = await middleware(request(path))
        assert.equal(response.headers.get("x-middleware-next"), "1", path)
      }
    }
  })

  it("returns 404 for exact routes and subpaths without authorization", async () => {
    for (const environment of [
      { NODE_ENV: "test" },
      { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview" },
      { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production" },
    ]) {
      setEnv(environment)

      for (const surface of ["/internaltest", "/styleguide"]) {
        for (const path of [surface, `${surface}/components/button`, `${surface}/a.b`]) {
          const response = await middleware(request(path))
          assert.equal(response.status, 404, `${environment.VERCEL_ENV ?? "test"}: ${path}`)
        }
      }
    }
  })

  it("bootstraps exact routes and subpaths with a surface-scoped cookie", async () => {
    const token = "internal-secret-token-123456"
    setEnv({
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "production",
      PF_INTERNAL_TOKEN: token,
    })

    for (const surface of ["/internaltest", "/styleguide"]) {
      for (const path of [surface, `${surface}/components/button`, `${surface}/a.b`]) {
        const response = await middleware(request(`${path}?token=${token}`))
        assert.equal(response.status, 307, path)
        assert.equal(response.headers.get("location"), `http://localhost${path}`)
        assert.match(response.headers.get("set-cookie") ?? "", new RegExp(`Path=${surface}`))
      }
    }
  })

  it("allows exact routes and subpaths with the derived internal cookie", async () => {
    const token = "internal-secret-token-123456"
    const cookie = await deriveAccessCookieValue(token, "internal")
    setEnv({
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "production",
      PF_INTERNAL_TOKEN: token,
    })

    for (const surface of ["/internaltest", "/styleguide"]) {
      for (const path of [surface, `${surface}/components/button`, `${surface}/a.b`]) {
        const response = await middleware(request(path, `pf_internal_token=${cookie}`))
        assert.equal(response.headers.get("x-middleware-next"), "1", path)
      }
    }
  })

  it("keeps unrelated public routes outside the internal guard", async () => {
    setEnv({
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "production",
    })

    for (const path of ["/", "/sobre", "/internaltesting", "/styleguides", "/preview"]) {
      assert.notEqual(findRouteGuard(path)?.guard.id, "internal-access", path)
      const response = await middleware(request(path))
      assert.equal(response.headers.get("x-middleware-next"), "1", path)
    }
  })
})
