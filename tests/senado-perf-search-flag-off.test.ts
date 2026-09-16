/**
 * Com a flag do Senado desligada, os loaders enxutos continuam escondendo o
 * Senado: o índice de busca filtra `cargo_disputado=neq.Senador` na própria
 * query, a contagem por UF de "Senador" nem consulta o banco e as chaves de
 * cache ficam na variante `senado-off`, separadas das entradas `senado-on` que
 * sobrevivem entre deployments no Data Cache.
 */

import assert from "node:assert/strict"
import Module from "node:module"
import { afterEach, describe, it } from "node:test"

type Loader = typeof Module & {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown
}

// Env antes do import: api.ts congela USE_MOCK e SENADO_CACHE_VARIANT no load.
process.env.SUPABASE_URL = "https://senado-perf-flag-off.supabase.co"
process.env.SUPABASE_ANON_KEY = "test-anon-key"
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://senado-perf-flag-off.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key"
delete process.env.SENADO_ENABLED

const cacheKeys: string[][] = []

let apiPromise: Promise<typeof import("../src/lib/api")> | null = null

function loadApi() {
  if (apiPromise) return apiPromise
  const moduleLoader = Module as Loader
  const originalLoad = moduleLoader._load
  moduleLoader._load = function loadWithNextServerMocks(request, parent, isMain) {
    if (request === "server-only") return {}
    if (request === "next/cache") {
      return {
        unstable_cache:
          (fn: (...args: unknown[]) => Promise<unknown>, keys: string[]) =>
          async (...args: unknown[]) => {
            cacheKeys.push(keys)
            return fn(...args)
          },
        unstable_noStore: () => {},
      }
    }
    if (request === "next/headers") {
      return { headers: async () => new Headers() }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  apiPromise = import("../src/lib/api").finally(() => {
    moduleLoader._load = originalLoad
  })
  return apiPromise
}

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  cacheKeys.length = 0
})

interface Row {
  slug: string
  nome_urna: string
  cargo_disputado: string
  estado: string
}

const rows: Row[] = [
  { slug: "pessoa-sintetica-governador-1", nome_urna: "Pessoa Um", cargo_disputado: "Governador", estado: "SP" },
  { slug: "pessoa-sintetica-senador-2", nome_urna: "Pessoa Dois", cargo_disputado: "Senador", estado: "SP" },
  { slug: "pessoa-sintetica-presidente-3", nome_urna: "Pessoa Três", cargo_disputado: "Presidente", estado: "BR" },
]

/** PostgREST mínimo: honra `select=` e os filtros `eq.`/`neq.` de `cargo_disputado`. */
function stubPostgrest(): URL[] {
  const urls: URL[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    if (url.pathname.endsWith("/rest/v1/candidatos_publico")) {
      urls.push(url)
      const columns = (url.searchParams.get("select") ?? "*").split(",").map((column) => column.trim())
      const cargoFilters = url.searchParams.getAll("cargo_disputado")
      const filtered = rows.filter((row) =>
        cargoFilters.every((filter) => {
          if (filter.startsWith("eq.")) return row.cargo_disputado === filter.slice(3)
          if (filter.startsWith("neq.")) return row.cargo_disputado !== filter.slice(4)
          return true
        }),
      )
      const projected = filtered.map((row) =>
        Object.fromEntries(columns.map((column) => [column, (row as unknown as Record<string, unknown>)[column] ?? null])),
      )
      return new Response(JSON.stringify(projected), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
  }) as typeof fetch
  return urls
}

describe("loaders enxutos com a flag do Senado desligada", () => {
  it("o índice de busca exclui Senador na query e usa a variante senado-off", async () => {
    const api = await loadApi()
    const urls = stubPostgrest()

    const resource = await api.getGlobalSearchIndexResource()

    // Lista enxuta do índice e lista de slugs da coorte pública: as duas excluem Senador.
    assert.ok(
      urls.some((url) => (url.searchParams.get("select") ?? "").split(",").includes("nome_urna")),
      "o índice precisa consultar a lista enxuta de candidatos",
    )
    for (const url of urls) {
      assert.ok(
        url.searchParams.getAll("cargo_disputado").includes("neq.Senador"),
        `query sem neq.Senador: ${url.search}`,
      )
    }
    assert.deepEqual(
      resource.data.map((item) => item.href).sort(),
      ["/candidato/pessoa-sintetica-governador-1", "/candidato/pessoa-sintetica-presidente-3"],
    )
    const keys = cacheKeys.find((k) => k[0] === "global-search-index")
    assert.ok(keys, "camada de cache do índice não foi exercitada")
    assert.ok(keys.includes("senado-off"), `chaves: ${keys.join(", ")}`)
    assert.ok(!keys.includes("senado-on"))
  })

  it("a contagem por UF de Senador degrada sem consultar o banco", async () => {
    const api = await loadApi()
    const urls = stubPostgrest()

    const resource = await api.getCandidatoCountByEstadoResource("Senador")

    assert.equal(resource.sourceStatus, "degraded")
    assert.deepEqual(resource.data, {})
    assert.equal(urls.length, 0)
  })

  it("a contagem por UF de Governador segue live, na variante senado-off", async () => {
    const api = await loadApi()
    stubPostgrest()

    const resource = await api.getCandidatoCountByEstadoResource("Governador")

    assert.equal(resource.sourceStatus, "live")
    assert.deepEqual(resource.data, { SP: 1 })
    const keys = cacheKeys.find((k) => k[0] === "public-candidato-count-by-estado")
    assert.ok(keys)
    assert.ok(keys.includes("senado-off"), `chaves: ${keys.join(", ")}`)
  })
})
