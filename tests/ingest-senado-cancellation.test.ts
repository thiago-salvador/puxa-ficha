import assert from "node:assert/strict"
import test from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import { ingestSenado } from "../scripts/lib/ingest-senado"
import { __resetSupabaseParaTeste } from "../scripts/lib/supabase"
import { fetchJSON } from "../scripts/lib/helpers"
import { readFileSync } from "node:fs"

test("Senado mantém orçamento limitado com margem para o acervo de 124s observado", () => {
  const source = readFileSync(new URL("../scripts/lib/ingest-senado.ts", import.meta.url), "utf8")
  assert.match(source, /SENADO_CANDIDATE_TIMEOUT_MS = 3 \* 60 \* 1000/)
})

for (const candidateTimeoutMs of [5000, 8000]) {
test(`Senado: recibo e cancelamento com orçamento ${candidateTimeoutMs}ms`, async () => {
  const previousFetch = globalThis.fetch
  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_URL = "http://127.0.0.1:9"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only"
  __resetSupabaseParaTeste()
  let writes = 0
  let aborted = false
  const storedProjects = new Map<string, Record<string, unknown>>()
  const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    if (url.hostname === "legis.senado.leg.br") {
      if (url.pathname.endsWith("/635.json")) return response({ DetalheParlamentar: { Parlamentar: { IdentificacaoParlamentar: { NomeParlamentar: "Ricardo Ferraco", UfParlamentar: "ES" } } } })
      if (url.pathname.endsWith("/mandatos.json")) return response({})
      if (url.pathname.endsWith("/autorias.json")) return response({ MateriasAutoriaParlamentar: { Parlamentar: { Codigo: "635", Autorias: { Autoria: [1, 2, 3].map(n => ({ IndicadorAutorPrincipal: "Sim", Materia: { Codigo: String(n), Sigla: "PL", Numero: String(n), Ano: 2020, Ementa: "Teste" } })) } } } })
      throw new Error(`Unexpected Senate request: ${url.pathname}`)
    }
    if (url.pathname.endsWith("/candidaturas_fase_2026_publico")) return new Response(JSON.stringify({ code: "PGRST205", message: "Could not find the table candidaturas_fase_2026_publico in the schema cache" }), { status: 404 })
    if (url.pathname.endsWith("/candidatos_publico")) return response([{ slug: "ricardo-ferraco" }])
    if (url.pathname.endsWith("/votacoes_chave")) return response([])
    if (url.pathname.endsWith("/candidatos")) {
      if (init?.method === "PATCH") return response(null)
      if (url.searchParams.get("select")?.includes("verificacao_campos")) return response([{ slug: "ricardo-ferraco", verificacao_campos: null }])
      return response({ id: "candidate-test" })
    }
    if (url.pathname.endsWith("/coleta_log")) return response(init?.method === "POST" ? null : [{ id: "audit-log" }])
    if (url.pathname.endsWith("/projetos_lei")) {
      if (init?.method !== "POST" && init?.method !== "PATCH") {
        const matterFilter = url.searchParams.get("proposicao_id_api")
        const matterId = matterFilter?.startsWith("eq.") ? matterFilter.slice(3) : null
        const inFilter = matterFilter?.startsWith("in.(") ? matterFilter.slice(4, -1).split(",") : []
        const ids = matterId ? [matterId] : inFilter
        return response(ids.flatMap((id) => storedProjects.has(id) ? [storedProjects.get(id)!] : []))
      }
      writes++
      if (writes === 1) {
        try { await delay(4500, undefined, { signal: init?.signal ?? undefined }) }
        catch (error) { aborted = true; throw error }
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> | Array<Record<string, unknown>>
      const batch = Array.isArray(body) ? body : [body]
      const persisted = batch.map((row) => {
        const matterId = String(row.proposicao_id_api ?? "")
        const item = { id: `project-${matterId}`, ...row }
        storedProjects.set(matterId, item)
        return item
      })
      return response(persisted)
    }
    throw new Error(`Unexpected database request: ${url.pathname}`)
  }
  try {
    const [receipt] = await ingestSenado({ targetSlugs: ["ricardo-ferraco"], forceFrozen: true, candidateTimeoutMs })
    const snapshot = JSON.stringify(receipt)
    await delay(1000)
    if (candidateTimeoutMs === 5000) {
      assert.equal(aborted, true, "deadline must abort the in-flight write")
      assert.equal(writes, 1, "later chunks must not start after timeout")
      assert.equal(receipt.rows_upserted, 1, "only the profile stays confirmed when the in-flight chunk is unresolved")
      assert.match(receipt.errors.join(" "), /excedeu 5000ms/)
    } else {
      assert.equal(aborted, false, "bounded extra budget permits the same workload to finish")
      assert.equal(writes, 1)
      assert.equal(receipt.rows_upserted, 4)
      assert.deepEqual(receipt.errors, [])
    }
    if (candidateTimeoutMs === 5000) assert.equal(receipt.tables_updated.includes("projetos_lei"), false)
    else assert.ok(receipt.tables_updated.includes("projetos_lei"))
    assert.equal(JSON.stringify(receipt), snapshot, "returned receipt must not mutate after timeout")
  } finally {
    globalThis.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey
    __resetSupabaseParaTeste()
  }
})
}

test("fetchJSON propaga cancelamento da fonte sem retry nem resposta tardia", async () => {
  const original = globalThis.fetch
  const controller = new AbortController()
  let attempts = 0
  let sourceAborted = false
  globalThis.fetch = async (_url, init) => {
    attempts++
    try { await delay(500, undefined, { signal: init?.signal ?? undefined }) }
    catch (error) { sourceAborted = true; throw error }
    return new Response("{}")
  }
  try {
    const task = fetchJSON("https://example.invalid/test", undefined, 4, 1000, { signal: controller.signal })
    controller.abort(new Error("candidate deadline"))
    await assert.rejects(task, /candidate deadline/)
    assert.equal(sourceAborted, true)
    assert.equal(attempts, 1)
  } finally { globalThis.fetch = original }
})

test("fetchJSON cancela espera de retry sem iniciar nova tentativa", async () => {
  const original = globalThis.fetch
  const controller = new AbortController()
  let attempts = 0
  globalThis.fetch = async () => {
    attempts++
    return new Response("{}", { status: 503 })
  }
  try {
    const task = fetchJSON("https://example.invalid/test", undefined, 4, 1000, { signal: controller.signal })
    await delay(20)
    controller.abort(new Error("candidate deadline"))
    await assert.rejects(task, /candidate deadline/)
    assert.equal(attempts, 1)
  } finally { globalThis.fetch = original }
})

test("fetchJSON descarta resposta de transporte que ignora cancelamento", async () => {
  const original = globalThis.fetch
  const controller = new AbortController()
  globalThis.fetch = async () => {
    await delay(20)
    return new Response("{}")
  }
  try {
    const task = fetchJSON("https://example.invalid/test", undefined, 4, 1000, { signal: controller.signal })
    controller.abort(new Error("candidate deadline"))
    await assert.rejects(task, /candidate deadline/)
  } finally { globalThis.fetch = original }
})
