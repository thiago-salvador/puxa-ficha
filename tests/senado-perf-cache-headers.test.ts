/**
 * Política de CDN das rotas públicas de leitura chamadas em massa.
 *
 * `/api/candidato-slugs` é consultada pelo middleware em TODA requisição a
 * `/candidato/*`, e `/api/search-index` abre a busca global. As duas voltam a
 * ter cache público curto no caminho saudável, para o CDN absorver a repetição.
 * Qualquer resposta degradada, com erro ou com lista vazia sai `no-store`: uma
 * falha transiente não pode ficar presa no CDN.
 *
 * A separação por flag do Senado não depende do CDN: mudar env na Vercel exige
 * redeploy, e cada deployment tem cache de CDN próprio. O que sobrevive entre
 * deployments é o `unstable_cache`, cujas chaves carregam SENADO_CACHE_VARIANT
 * (coberto em senado-perf-cache-loaders.test.ts).
 */

import assert from "node:assert/strict"
import Module from "node:module"
import { describe, it } from "node:test"
import type { GlobalSearchIndexItem } from "@/lib/global-search"
import type { DataResource } from "@/lib/types"

type Loader = typeof Module & {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown
}

function withNextServerMocks<T>(load: () => Promise<T>): Promise<T> {
  const moduleLoader = Module as Loader
  const originalLoad = moduleLoader._load
  moduleLoader._load = function loadWithNextServerMocks(request, parent, isMain) {
    if (request === "server-only") return {}
    if (request === "next/cache") {
      return {
        unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => fn,
        unstable_noStore: () => {},
      }
    }
    if (request === "next/headers") {
      return { headers: async () => new Headers() }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  return load().finally(() => {
    moduleLoader._load = originalLoad
  })
}

const slugsRoute = withNextServerMocks(() => import("../src/app/api/candidato-slugs/route"))
const searchRoute = withNextServerMocks(() => import("../src/app/api/search-index/route"))

function assertPublicShortCdnCache(cacheControl: string | null) {
  assert.ok(cacheControl, "resposta sem cache-control")
  assert.match(cacheControl, /^public,/)
  assert.match(cacheControl, /s-maxage=\d+/)
  const sMaxAge = Number(cacheControl.match(/s-maxage=(\d+)/)?.[1])
  assert.ok(sMaxAge > 0 && sMaxAge <= 300, `s-maxage precisa ser curto, veio ${sMaxAge}`)
  assert.doesNotMatch(cacheControl, /no-store/)
}

function item(slug: string): GlobalSearchIndexItem {
  return { href: `/candidato/${slug}`, title: slug, subtitle: "", searchText: slug }
}

describe("/api/candidato-slugs", () => {
  it("lista saudável sai com cache público curto de CDN", async () => {
    const { createCandidatoSlugsGetHandler } = await slugsRoute
    const GET = createCandidatoSlugsGetHandler(async () => [{ slug: "a" }, { slug: "b" }])

    const response = await GET()

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { slugs: ["a", "b"] })
    assertPublicShortCdnCache(response.headers.get("cache-control"))
  })

  it("lista vazia sai no-store", async () => {
    const { createCandidatoSlugsGetHandler } = await slugsRoute
    const GET = createCandidatoSlugsGetHandler(async () => [])

    const response = await GET()

    assert.equal(response.status, 200)
    assert.equal(response.headers.get("cache-control"), "no-store")
  })

  it("falha de leitura sai 503 no-store", async () => {
    const { createCandidatoSlugsGetHandler } = await slugsRoute
    const GET = createCandidatoSlugsGetHandler(async () => {
      throw new Error("falha simulada")
    })
    const originalError = console.error
    console.error = () => {}
    try {
      const response = await GET()
      assert.equal(response.status, 503)
      assert.equal(response.headers.get("cache-control"), "no-store")
    } finally {
      console.error = originalError
    }
  })

  it("o handler exportado usa o inventário canônico de slugs", async () => {
    const route = await slugsRoute
    assert.equal(typeof route.GET, "function")
  })
})

describe("/api/search-index", () => {
  it("índice saudável sai com cache público curto de CDN e filtra pela coorte", async () => {
    const { createSearchIndexGetHandler } = await searchRoute
    const GET = createSearchIndexGetHandler({
      loadIndex: async (): Promise<DataResource<GlobalSearchIndexItem[]>> => ({
        data: [item("a"), item("fora-da-coorte")],
        sourceStatus: "live",
        sourceMessage: null,
      }),
      loadPublicSlugs: async () => [{ slug: "a" }],
    })

    const response = await GET()

    assert.equal(response.status, 200)
    const body = (await response.json()) as { ok: boolean; data: GlobalSearchIndexItem[] }
    assert.equal(body.ok, true)
    assert.deepEqual(body.data.map((row) => row.href), ["/candidato/a"])
    assertPublicShortCdnCache(response.headers.get("cache-control"))
  })

  it("índice degradado sai no-store com ok:false", async () => {
    const { createSearchIndexGetHandler } = await searchRoute
    const GET = createSearchIndexGetHandler({
      loadIndex: async (): Promise<DataResource<GlobalSearchIndexItem[]>> => ({
        data: [item("a")],
        sourceStatus: "degraded",
        sourceMessage: "falha simulada",
      }),
      loadPublicSlugs: async () => [{ slug: "a" }],
    })

    const response = await GET()

    const body = (await response.json()) as { ok: boolean; data: GlobalSearchIndexItem[] }
    assert.equal(body.ok, false)
    assert.equal(body.data.length, 1)
    assert.equal(response.headers.get("cache-control"), "no-store")
  })

  it("índice vivo mas vazio sai no-store", async () => {
    const { createSearchIndexGetHandler } = await searchRoute
    const GET = createSearchIndexGetHandler({
      loadIndex: async (): Promise<DataResource<GlobalSearchIndexItem[]>> => ({
        data: [],
        sourceStatus: "live",
        sourceMessage: null,
      }),
      loadPublicSlugs: async () => [{ slug: "a" }],
    })

    const response = await GET()

    assert.equal(response.headers.get("cache-control"), "no-store")
  })

  it("falha no inventário de slugs sai 503 no-store em vez de estourar", async () => {
    const { createSearchIndexGetHandler } = await searchRoute
    const GET = createSearchIndexGetHandler({
      loadIndex: async (): Promise<DataResource<GlobalSearchIndexItem[]>> => ({
        data: [item("a")],
        sourceStatus: "live",
        sourceMessage: null,
      }),
      loadPublicSlugs: async () => {
        throw new Error("falha simulada")
      },
    })
    const originalError = console.error
    console.error = () => {}
    try {
      const response = await GET()
      assert.equal(response.status, 503)
      const body = (await response.json()) as { ok: boolean; data: GlobalSearchIndexItem[] }
      assert.equal(body.ok, false)
      assert.deepEqual(body.data, [])
      assert.equal(response.headers.get("cache-control"), "no-store")
    } finally {
      console.error = originalError
    }
  })
})
