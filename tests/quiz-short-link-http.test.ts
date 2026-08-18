import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { afterEach, beforeEach, describe, it } from "node:test"
import { NextRequest } from "next/server"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const { POST } = require("../src/app/api/quiz/short-link/route")
const { resolveQuizShortToken } = require("../src/lib/quiz-short-link-resolve")
const { QUIZ_SHORT_LINK_TTL_MS } = require("../src/lib/quiz-short-link-store")

const VALID_QUERY = new URLSearchParams({
  r: "REREREREREA",
  v: "3",
  cargo: "Governador",
  uf: "SP",
}).toString()

const ENV_KEYS = [
  "PF_QUIZ_SHORT_LINKS_FILE",
  "PF_QUIZ_SHORT_LINK_SALT",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "VERCEL_ENV",
  "NODE_ENV",
] as const

// @types/node>=20 declara process.env.NODE_ENV como readonly. Para mutar
// NODE_ENV em testes (cenarios de production/test) usamos um alias cast para
// Record<string, string | undefined> que respeita a propria index signature
// de NodeJS.ProcessEnv (Dict<string>) sem violar nenhuma garantia de runtime.
const mutableEnv = process.env as Record<string, string | undefined>

const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}
let tempDir: string | null = null

function request(queryString: string, headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/quiz/short-link", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ queryString }),
  })
}

async function readJson<T>(response: Response) {
  return response.json() as Promise<T>
}

async function enableFileStore() {
  tempDir = await mkdtemp(path.join(tmpdir(), "pf-quiz-short-link-"))
  process.env.PF_QUIZ_SHORT_LINKS_FILE = path.join(tempDir, "short-links.json")
  process.env.PF_QUIZ_SHORT_LINK_SALT = "quiz-short-link-test-salt"
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.VERCEL_ENV
  mutableEnv.NODE_ENV = "test"
}

describe("quiz short-link HTTP route", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key]
    }
  })

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      const value = savedEnv[key]
      // mutableEnv tem index signature writeable; o acesso direto a process.env[key]
      // colide com o readonly de NODE_ENV quando key e' o literal "NODE_ENV".
      if (value === undefined) delete mutableEnv[key]
      else mutableEnv[key] = value
    }

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
      tempDir = null
    }
  })

  it("returns path/url and persists the token so it can be resolved", async () => {
    await enableFileStore()

    const response = await POST(
      request(VALID_QUERY, {
        "x-forwarded-for": "203.0.113.41",
      }),
    )

    assert.equal(response.status, 200)
    const body = await readJson<{ path: string; url: string }>(response)
    assert.match(body.path, /^\/quiz\/r\/[A-Za-z0-9_-]{8,16}$/)
    assert.equal(body.url, `http://localhost${body.path}`)

    const token = body.path.split("/").at(-1)
    assert.ok(token)
    assert.equal(await resolveQuizShortToken(token), VALID_QUERY)
  })

  it("persists expires_at ~90 days in the future when inserting a new token", async () => {
    await enableFileStore()

    const before = Date.now()
    const response = await POST(
      request(VALID_QUERY, {
        "x-forwarded-for": "203.0.113.42",
      }),
    )
    const after = Date.now()
    assert.equal(response.status, 200)

    const raw = await readFile(process.env.PF_QUIZ_SHORT_LINKS_FILE!, "utf8")
    const persisted = JSON.parse(raw) as {
      rows: Array<{ token: string; expires_at: string; created_at: string }>
    }
    assert.equal(persisted.rows.length, 1)
    const row = persisted.rows[0]!
    const expiresAt = Date.parse(row.expires_at)
    assert.ok(expiresAt > after)
    assert.ok(expiresAt - before >= QUIZ_SHORT_LINK_TTL_MS - 1000)
    assert.ok(expiresAt - after <= QUIZ_SHORT_LINK_TTL_MS + 1000)
  })

  it("resolves to null when the short-link has expired", async () => {
    await enableFileStore()

    const response = await POST(
      request(VALID_QUERY, {
        "x-forwarded-for": "203.0.113.43",
      }),
    )
    assert.equal(response.status, 200)
    const body = await readJson<{ path: string }>(response)
    const token = body.path.split("/").at(-1)!

    // Simula expiração: reescreve a linha colocando expires_at no passado.
    const file = process.env.PF_QUIZ_SHORT_LINKS_FILE!
    const raw = await readFile(file, "utf8")
    const parsed = JSON.parse(raw) as {
      rows: Array<{
        token: string
        query_string: string
        ip_hash: string | null
        created_at: string
        expires_at: string
      }>
    }
    parsed.rows[0]!.expires_at = new Date(Date.now() - 60_000).toISOString()
    await writeFile(file, `${JSON.stringify(parsed, null, 2)}\n`, "utf8")

    assert.equal(await resolveQuizShortToken(token), null)
  })

  it("returns 429 after the per-IP hourly cap is reached", async () => {
    await enableFileStore()

    for (let index = 0; index < 24; index += 1) {
      const response = await POST(
        request(VALID_QUERY, {
          "x-forwarded-for": "203.0.113.55",
        }),
      )
      assert.equal(response.status, 200)
    }

    const limited = await POST(
      request(VALID_QUERY, {
        "x-forwarded-for": "203.0.113.55",
      }),
    )

    assert.equal(limited.status, 429)
    assert.deepEqual(await readJson(limited), { error: "Too many requests" })
  })

  it("rejects oversized JSON body before parsing/storing", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/quiz/short-link", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": "203.0.113.155",
        },
        body: JSON.stringify({ queryString: "x".repeat(20_000) }),
      }),
    )

    assert.equal(response.status, 413)
  })

  it("rejects cross-site browser writes before creating a short link", async () => {
    await enableFileStore()

    const response = await POST(
      request(VALID_QUERY, {
        origin: "https://evil.example",
      }),
    )

    assert.equal(response.status, 403)
    assert.equal(response.headers.get("x-pf-block-reason"), "csrf_origin_not_allowed")
    assert.deepEqual(await readJson(response), { error: "Cross-site request blocked" })
  })

  it("uses x-vercel-forwarded-for over x-forwarded-for when both are present", async () => {
    await enableFileStore()

    // Hit the same bucket 24 times via x-vercel-forwarded-for — x-forwarded-for (spoofable)
    // varia mas não pode permitir bypass do rate limit quando o header confiável existe.
    for (let index = 0; index < 24; index += 1) {
      const response = await POST(
        request(VALID_QUERY, {
          "x-vercel-forwarded-for": "198.51.100.9",
          "x-forwarded-for": `10.0.0.${index + 1}`,
        }),
      )
      assert.equal(response.status, 200)
    }

    const limited = await POST(
      request(VALID_QUERY, {
        "x-vercel-forwarded-for": "198.51.100.9",
        "x-forwarded-for": "10.0.0.99",
      }),
    )

    assert.equal(limited.status, 429)
  })

  it("returns 503 when no Supabase config or controlled fixture store is available", async () => {
    delete process.env.PF_QUIZ_SHORT_LINKS_FILE
    process.env.PF_QUIZ_SHORT_LINK_SALT = "quiz-short-link-test-salt"
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.VERCEL_ENV
    mutableEnv.NODE_ENV = "test"

    const response = await POST(request(VALID_QUERY))

    assert.equal(response.status, 503)
    assert.deepEqual(await readJson(response), { error: "Short links unavailable" })
  })

  it("returns 503 misconfigured in NODE_ENV=production when salt is missing", async () => {
    delete process.env.PF_QUIZ_SHORT_LINKS_FILE
    delete process.env.PF_QUIZ_SHORT_LINK_SALT
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.VERCEL_ENV
    mutableEnv.NODE_ENV = "production"

    const response = await POST(request(VALID_QUERY))

    assert.equal(response.status, 503)
    assert.deepEqual(await readJson(response), { error: "Short links misconfigured" })
  })
})
