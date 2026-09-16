/**
 * `senado_suplencias_publico` nasce na migration 20260914000000. Se o código
 * chegar antes dela, o PostgREST responde 42P01 (relação inexistente). O reader
 * precisa degradar para `unavailable`, sem lançar e sem afirmar ausência.
 */

import assert from "node:assert/strict"
import Module from "node:module"
import { afterEach, it } from "node:test"

type Loader = typeof Module & {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown
}

process.env.SUPABASE_URL = "https://senado-pre-migration.supabase.co"
process.env.SUPABASE_ANON_KEY = "test-anon-key"
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://senado-pre-migration.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key"

async function loadReader() {
  const moduleLoader = Module as Loader
  const originalLoad = moduleLoader._load
  moduleLoader._load = function loadWithServerOnlyMock(request, parent, isMain) {
    if (request === "server-only") return {}
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return await import("../src/lib/senado-running-mates")
  } finally {
    moduleLoader._load = originalLoad
  }
}

const originalFetch = globalThis.fetch
const originalError = console.error

afterEach(() => {
  globalThis.fetch = originalFetch
  console.error = originalError
})

it("42P01 em senado_suplencias_publico vira unavailable, sem lançar e sem ausência", async () => {
  const { loadSenadoRunningMates } = await loadReader()
  const errors: string[] = []
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "))
  }
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.includes("/rest/v1/senado_suplencias_publico")) {
      return new Response(
        JSON.stringify({
          code: "42P01",
          message: 'relation "public.senado_suplencias_publico" does not exist',
          details: null,
          hint: null,
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      )
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
  }) as typeof fetch

  const result = await loadSenadoRunningMates(["senadora-teste"], "SP")

  assert.deepEqual(result, { data: {}, absence: {}, unavailable: true })
  assert.ok(errors.some((line) => line.includes("Senado running mates could not be loaded")))
})
