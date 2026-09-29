/**
 * A seção "Evidências relacionadas" lê com fetch em cache (`force-cache` +
 * `revalidate`). Sem tag, `/api/revalidate` não alcança essas leituras e um
 * vínculo retirado segue visível até a hora do `revalidate`. Estes testes
 * garantem que a tag chega ao fetch e que ela é revalidável.
 */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { afterEach, describe, it } from "node:test"

import { REVALIDATE_ALLOWED_TAGS } from "../src/lib/revalidate-cache"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

type InitNext = RequestInit & { next?: { revalidate?: number; tags?: string[] } }

async function initCapturado(opcoes: Parameters<typeof import("../src/lib/supabase").createConfiguredFetch>[0], initChamada?: InitNext): Promise<InitNext> {
  const { createConfiguredFetch, createSupabaseFetchLimiter } = await import("../src/lib/supabase")
  let capturado: InitNext | undefined
  globalThis.fetch = (async (_input: unknown, init?: InitNext) => {
    capturado = init
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
  }) as unknown as typeof fetch
  const configurado = createConfiguredFetch(opcoes, createSupabaseFetchLimiter({ maxConcurrent: 1, queueTimeoutMs: 500 }))
  await configurado("https://exemplo.supabase.co/rest/v1/x", initChamada)
  assert.ok(capturado, "fetch global não foi chamado")
  return capturado
}

describe("tags do Data Cache no fetch do Supabase", () => {
  it("modo isr com tags entrega next.tags, revalidate e force-cache", async () => {
    const init = await initCapturado({ cacheMode: "isr", tags: ["public-candidato-ficha"] })
    assert.equal(init.cache, "force-cache")
    assert.deepEqual(init.next, { revalidate: 3600, tags: ["public-candidato-ficha"] })
  })

  it("junta as tags da chamada com as do cliente, sem duplicar", async () => {
    const init = await initCapturado({ tags: ["public-candidato-ficha"] }, { next: { tags: ["outra", "public-candidato-ficha"] } })
    assert.deepEqual(init.next?.tags, ["outra", "public-candidato-ficha"])
  })

  it("sem tags o comportamento anterior não muda", async () => {
    const init = await initCapturado({ cacheMode: "isr" })
    assert.deepEqual(init.next, { revalidate: 3600 })
  })

  it("no-store ignora as tags", async () => {
    const init = await initCapturado({ cacheMode: "no-store", tags: ["public-candidato-ficha"] })
    assert.equal(init.cache, "no-store")
    assert.deepEqual(init.next, { revalidate: 0 })
  })
})

describe("cliente da seção de evidências", () => {
  it("usa a tag da ficha, que está na whitelist de /api/revalidate", async () => {
    const { OPCOES_CLIENTE_EVIDENCIAS } = await import("../src/lib/compromisso-evidencia-server")
    assert.equal(OPCOES_CLIENTE_EVIDENCIAS.cacheMode, "isr")
    assert.ok(OPCOES_CLIENTE_EVIDENCIAS.tags.includes("public-candidato-ficha"))
    for (const tag of OPCOES_CLIENTE_EVIDENCIAS.tags) {
      assert.ok((REVALIDATE_ALLOWED_TAGS as readonly string[]).includes(tag), `tag ${tag} fora da whitelist`)
    }
  })

  it("a leitura pública da seção sai com a tag no fetch", async () => {
    const vistos: InitNext[] = []
    globalThis.fetch = (async (_input: unknown, init?: InitNext) => {
      vistos.push(init ?? {})
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
    }) as unknown as typeof fetch
    const { createServiceRoleSupabaseClient } = await import("../src/lib/supabase")
    const { getCompromissoEvidenciasEstado, OPCOES_CLIENTE_EVIDENCIAS } = await import("../src/lib/compromisso-evidencia-server")
    const antes = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }
    process.env.SUPABASE_URL = "https://exemplo.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste"
    try {
      await getCompromissoEvidenciasEstado(
        { candidatoId: "c1", slug: "s", programaChave: "2026:GOVERNADOR:AM:40000000001" },
        { criarCliente: () => createServiceRoleSupabaseClient(OPCOES_CLIENTE_EVIDENCIAS) },
      )
    } finally {
      if (antes.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = antes.url
      if (antes.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = antes.key
    }
    assert.ok(vistos.length >= 2, `esperava view e recibo, vi ${vistos.length} fetch(es)`)
    for (const init of vistos) assert.deepEqual(init.next?.tags, ["public-candidato-ficha"])
  })
})
