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
    // 7 checagens originais mais as 13 tabelas internas, que o linter do Supabase
    // marca como rls_enabled_no_policy e que precisam continuar negando anon.
    assert.equal(results.length, 20)
    const internas = results.filter((result) => result.name.startsWith("interna-negada-"))
    assert.equal(internas.length, 13)
    assert.ok(internas.every((result) => result.passed))
    assert.ok(results.every((result) => result.passed))
    const patch = seen.find((entry) => entry.method === "PATCH")
    assert.match(patch?.body ?? "", /ano_eleicao/)
  })

  test("reprova se uma tabela interna passar a responder para anon", async () => {
    // Gate verde so vale se ele souber ficar vermelho. Aqui o coleta_log responde
    // 200 para anon, que e exatamente o que aconteceria se alguem criasse
    // `POLICY ... USING (true)` para zerar os lints INFO do painel do Supabase.
    const fetchImpl: typeof fetch = async (input) => {
      const path = String(input)
      const isView = path.includes("candidatos_publico") || path.includes("financiamento_publico")
      const vazou = path.includes("coleta_log")
      return new Response(null, { status: isView || vazou ? 200 : 401 })
    }
    const results = await auditPublicSecuritySurface(
      { url: "https://example.supabase.co", anonKey: "anon-test" },
      fetchImpl,
    )
    const vazada = results.find((result) => result.name === "interna-negada-coleta_log")
    assert.equal(vazada?.status, 200)
    assert.equal(vazada?.passed, false, "o gate precisa reprovar tabela interna legivel por anon")
    assert.equal(
      results.filter((result) => result.name.startsWith("interna-negada-") && !result.passed).length,
      1,
    )
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
