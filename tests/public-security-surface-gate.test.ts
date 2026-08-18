import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { auditPublicSecuritySurface } from "../scripts/audit-public-security-surface"

describe("public security surface gate", () => {
  test("requires readable views while denying raw columns and real DML", async () => {
    const seen: { path: string; method: string; body?: string }[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      const path = new URL(String(input)).pathname + new URL(String(input)).search
      seen.push({ path, method: init?.method ?? "GET", body: init?.body?.toString() })
      const isView = path.includes("candidatos_publico") || path.includes("financiamento_publico")
      return new Response(null, { status: isView ? 200 : 401 })
    }
    const results = await auditPublicSecuritySurface(
      { url: "https://example.supabase.co", anonKey: "anon-test" },
      fetchImpl,
    )
    assert.equal(results.length, 7)
    assert.ok(results.every((result) => result.passed))
    const patch = seen.find((entry) => entry.method === "PATCH")
    assert.match(patch?.body ?? "", /ano_eleicao/)
  })

  test("fails a write check that returns 204", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const path = String(input)
      const isView = path.includes("candidatos_publico") || path.includes("financiamento_publico")
      const isPatch = path.includes("patrimonio?id=")
      return new Response(null, { status: isView ? 200 : isPatch ? 204 : 401 })
    }
    const results = await auditPublicSecuritySurface(
      { url: "https://example.supabase.co", anonKey: "anon-test" },
      fetchImpl,
    )
    assert.equal(results.find((result) => result.name === "anon-update-denied")?.passed, false)
  })
})
