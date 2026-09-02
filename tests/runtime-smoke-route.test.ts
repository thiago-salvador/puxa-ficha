import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { NextRequest } from "next/server"
import {
  createRuntimeSmokeHandler,
  RUNTIME_SMOKE_PUBLIC_CHECK_NAMES,
} from "../src/app/api/internal/runtime-smoke/route"

const SECRET = "runtime-smoke-secret"
const ROUTE_URL = "https://puxaficha.com.br/api/internal/runtime-smoke"

function runtimeDeps(
  fetchImpl: typeof fetch,
  deleteQuizShortLink: (token: string) => Promise<void> = async () => {},
) {
  return {
    fetchImpl,
    expectedSecret: SECRET,
    origin: "https://example.test",
    deleteQuizShortLink,
  }
}

function request(secret = SECRET) {
  return new NextRequest(ROUTE_URL, { headers: { authorization: `Bearer ${secret}` } })
}

describe("runtime smoke cron", () => {
  test("fails closed without the cron secret", async () => {
    const handler = createRuntimeSmokeHandler(runtimeDeps(fetch))
    const response = await handler(new NextRequest(ROUTE_URL))
    assert.equal(response.status, 401)
  })

  test("returns 200 only when every public canary matches", async () => {
    const deleted: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input))
      const path = url.pathname
      if (path === "/api/quiz/short-link") {
        return Response.json({ path: "/quiz/r/Runtime01" })
      }
      if (path === "/quiz/r/Runtime01") {
        return new Response(null, {
          status: 307,
          headers: { location: "https://example.test/quiz/resultado?r=runtime-smoke&v=1" },
        })
      }
      if (path === "/candidato/pf-runtime-smoke-inexistente") return new Response("", { status: 404 })
      if (path === "/api/candidato-profile/lula") {
        return new Response('{"data":{"slug":"lula"}}', { status: 200 })
      }
      return new Response(path === "/candidato/lula" ? "Lula" : "Puxa Ficha", { status: 200 })
    }
    const handler = createRuntimeSmokeHandler(runtimeDeps(fetchImpl, async (token) => {
      deleted.push(token)
    }))
    const response = await handler(request())
    assert.equal(response.status, 200)
    const body = (await response.json()) as { results: Array<{ name: string }> }
    // O contrato externo é a lista exportada pela rota mais o quiz-short-link:
    // uma checagem a menos na rota, ou a mais, reprova aqui sem depender de
    // alguém lembrar de editar a lista literal abaixo.
    assert.deepEqual(
      body.results.map((result) => result.name),
      [...RUNTIME_SMOKE_PUBLIC_CHECK_NAMES, "quiz-short-link"],
    )
    assert.deepEqual(body, {
      ok: true,
      total: 6,
      results: [
        { name: "home", ok: true, status: 200 },
        { name: "candidate", ok: true, status: 200 },
        { name: "profile-api", ok: true, status: 200 },
        { name: "deployment-info", ok: true, status: 200 },
        { name: "real-404", ok: true, status: 404 },
        { name: "quiz-short-link", ok: true, status: 307 },
      ],
    })
    assert.deepEqual(deleted, ["Runtime01"])
  })

  test("returns 500 with bounded evidence when one canary fails", async () => {
    const handler = createRuntimeSmokeHandler(
      runtimeDeps(async () => new Response("unexpected", { status: 200 })),
    )
    const response = await handler(request())
    assert.equal(response.status, 500)
    const body = (await response.json()) as { ok: boolean; failed: unknown[]; total: number }
    assert.equal(body.ok, false)
    assert.equal(body.total, 6)
    assert.ok(body.failed.length >= 1)
  })

  test("returns 500 when the short-link cleanup fails", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname
      if (path === "/api/quiz/short-link") return Response.json({ path: "/quiz/r/Runtime02" })
      if (path === "/quiz/r/Runtime02") {
        return new Response(null, {
          status: 307,
          headers: { location: "https://example.test/quiz/resultado?r=runtime-smoke&v=1" },
        })
      }
      if (path === "/candidato/pf-runtime-smoke-inexistente") return new Response("", { status: 404 })
      if (path === "/api/candidato-profile/lula") {
        return new Response('{"data":{"slug":"lula"}}', { status: 200 })
      }
      return new Response(path === "/candidato/lula" ? "Lula" : "Puxa Ficha", { status: 200 })
    }
    const handler = createRuntimeSmokeHandler(
      runtimeDeps(fetchImpl, async () => {
        throw new Error("delete failed")
      }),
    )

    const response = await handler(request())
    assert.equal(response.status, 500)
    const body = await response.json() as {
      failed: Array<{ name: string; error?: string }>
    }
    assert.deepEqual(body.failed, [
      { name: "quiz-short-link", ok: false, status: 307, error: "cleanup_failed" },
    ])
  })
})
