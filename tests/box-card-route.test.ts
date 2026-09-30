import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import type { BoxCardRouteDeps } from "../src/app/api/card/box/[tipo]/[chave]/route"
import type { BoxCardModel } from "../src/lib/box-card-model"
import type { CandidatoComparavel, FichaCandidato } from "../src/lib/types"
import { buildCandidateBoxCard, buildComparatorBoxCard } from "../src/lib/box-card-model"
import { toPublicCandidatoProfileDto } from "../src/lib/public-profile-dto"
import { buildBoxCardUrl } from "../src/lib/box-card-url"
import { makeBoxCardCandidate, makeBoxCardComparables } from "./fixtures/box-card"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never
const { createBoxCardGetHandler } = require("../src/app/api/card/box/[tipo]/[chave]/route") as typeof import("../src/app/api/card/box/[tipo]/[chave]/route")

const model: BoxCardModel = {
  kind: "patrimonio-resumo",
  title: "Patrimônio declarado",
  key: "ana-silva",
  identity: "ana-silva",
  rows: [{ label: "2022", value: "R$ 100,00" }],
  warnings: [],
  sources: [],
  deepLink: "/candidato/ana-silva",
  revision: "abc123",
}

function candidate(slug: string, cargo = "Governador", estado: string | null = "SP"): FichaCandidato {
  return { slug, cargo_disputado: cargo, estado } as FichaCandidato
}

function comparable(slug: string, cargo = "Governador", estado: string | null = "SP"): CandidatoComparavel {
  return { slug, cargo_disputado: cargo, estado, id: slug, nome_urna: slug.toUpperCase() } as CandidatoComparavel
}

function fixture(overrides: Partial<BoxCardRouteDeps> = {}) {
  let candidateReads = 0
  const comparatorReads: Array<[string | undefined, string | undefined]> = []
  let selectedForCard: string[] = []
  const deps: BoxCardRouteDeps = {
    getCandidatoBySlugResource: async (slug) => {
      candidateReads += 1
      return { data: candidate(slug, "Governador", slug === "bia-souza" ? "RJ" : "SP"), sourceStatus: "live" }
    },
    getCandidatosComparaveisResource: async (cargo, uf) => {
      comparatorReads.push([cargo, uf])
      return { data: [comparable("ana-silva", cargo, "SP"), comparable("bia-souza", cargo, "RJ")], sourceStatus: "live" }
    },
    buildCandidateBoxCard: () => model,
    buildComparatorBoxCard: (candidates, context) => {
      selectedForCard = context?.slugs ? [...context.slugs] : candidates.map((row) => row.slug)
      return { ...model, kind: "comparador", key: selectedForCard.join("~"), identity: selectedForCard.join(", "), deepLink: "/comparar" }
    },
    buildBoxCard: async () => new Response(new Uint8Array([137, 80, 78, 71])) as never,
    rateLimiter: { check: () => ({ allowed: true, remaining: 1, resetAt: Date.now() + 60_000 }), reset() {} },
    startSpan: (async (_options: unknown, callback: () => Promise<unknown>) => callback()) as typeof import("@sentry/nextjs").startSpan,
    ...overrides,
  }
  return { handler: createBoxCardGetHandler(deps), reads: () => candidateReads, comparatorReads: () => comparatorReads, selectedForCard: () => selectedForCard }
}

function request(url: string): Request {
  return new Request(`http://localhost${url}`)
}

function params(tipo: string, chave: string) {
  return { params: Promise.resolve({ tipo, chave }) }
}

test("box card route rejects malformed identities, recuts, revisions, and unknown parameters before loading data", async () => {
  const fx = fixture()
  const cases: Array<[string, string, string]> = [
    ["inventado", "ana-silva", "?v=abc123"],
    ["patrimonio-resumo", "../ana-silva", "?v=abc123"],
    ["patrimonio-resumo", "ana-silva", "?v=abc123&uf=SP"],
    ["comparador", "ana-silva~ana-silva", "?v=abc123&eixo=patrimonio"],
    ["comparador", "ana-silva~bia-souza", "?v=abc123&eixo=patrimônio"],
    ["comparador", "ana-silva~bia-souza", "?v=abc123&eixo=patrimonio&extra=forged"],
    ["patrimonio-resumo", "ana-silva", "?v=abc123&v=abc123"],
    ["patrimonio-resumo", "ana-silva", ""],
  ]
  for (const [tipo, chave, query] of cases) {
    const response = await fx.handler(request(`/api/card/box/${tipo}/${chave}${query}`), params(tipo, chave))
    assert.equal(response.status, 404, `${tipo}/${chave}${query}`)
    assert.equal(response.headers.get("cache-control"), "no-store")
  }
  assert.equal(fx.reads(), 0)
})

test("candidate route distinguishes a missing live record from a degraded source and returns no-store errors", async () => {
  const missing = fixture({ getCandidatoBySlugResource: async () => ({ data: null, sourceStatus: "live" }) })
  const absentResponse = await missing.handler(request("/api/card/box/patrimonio-resumo/ana-silva?v=abc123"), params("patrimonio-resumo", "ana-silva"))
  assert.equal(absentResponse.status, 404)
  assert.equal(absentResponse.headers.get("cache-control"), "no-store")

  const degraded = fixture({ getCandidatoBySlugResource: async () => ({ data: null, sourceStatus: "degraded" }) })
  const degradedResponse = await degraded.handler(request("/api/card/box/patrimonio-resumo/ana-silva?v=abc123"), params("patrimonio-resumo", "ana-silva"))
  assert.equal(degradedResponse.status, 503)
  assert.equal(degradedResponse.headers.get("cache-control"), "no-store")

  const partial = fixture({ getCandidatoBySlugResource: async () => ({ data: candidate("ana-silva"), sourceStatus: "degraded" }) })
  const partialResponse = await partial.handler(request("/api/card/box/patrimonio-resumo/ana-silva?v=abc123"), params("patrimonio-resumo", "ana-silva"))
  assert.equal(partialResponse.status, 503)
  assert.equal(partialResponse.headers.get("cache-control"), "no-store")

  const emptyBox = fixture({ buildCandidateBoxCard: () => null })
  const emptyResponse = await emptyBox.handler(request("/api/card/box/patrimonio-resumo/ana-silva?v=abc123"), params("patrimonio-resumo", "ana-silva"))
  assert.equal(emptyResponse.status, 404)
  assert.equal(emptyResponse.headers.get("cache-control"), "no-store")
})

test("candidate card serves a versioned PNG with the profile success cache headers", async () => {
  const fx = fixture()
  const response = await fx.handler(request("/api/card/box/patrimonio-resumo/ana-silva?format=feed&v=abc123&retry=1"), params("patrimonio-resumo", "ana-silva"))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("content-type"), "image/png")
  assert.equal(response.headers.get("cache-control"), "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600")
  assert.equal(response.headers.get("etag"), '"abc123"')
  assert.equal(fx.reads(), 1)
})

test("candidate boxes apply the same public profile projection before building the model", async () => {
  const base = makeBoxCardCandidate({ slug: "ana-silva" })
  const row = base.gastos_parlamentares[0]!
  const rawDetails = [{ categoria: "TRANSPORTE", valor: 5000 }]
  const rawFicha = makeBoxCardCandidate({
    ...base,
    slug: "ana-silva",
    gastos_parlamentares: [{ ...row, fonte: "Camara", ano: 2025, total_gasto: 5000, detalhamento: rawDetails }],
  })

  const raw = fixture({
    getCandidatoBySlugResource: async () => ({ data: rawFicha, sourceStatus: "live" }),
    buildCandidateBoxCard,
  })
  const omitted = await raw.handler(
    request("/api/card/box/cota-resumo/ana-silva?v=deadbeef"),
    params("cota-resumo", "ana-silva"),
  )
  assert.equal(omitted.status, 404)
  assert.equal(omitted.headers.get("cache-control"), "no-store")

  const years = Array.from({ length: 19 }, (_, index) => index + 2008)
  const snapshotDetails = {
    categorias: rawDetails,
    proveniencia: {
      tipo: "camara-cota-csv",
      identity_field: "ideCadastro",
      id_camara: 123,
      ano: 2025,
      source_rows: 1,
      source_revisions: years.map((year) => ({
        year,
        url: `https://www.camara.leg.br/cotas/Ano-${year}.csv.zip`,
        sha256: String(year).padStart(64, "a"),
      })),
      scope_complete: true,
      years,
    },
  }
  const publishedFicha = makeBoxCardCandidate({
    ...base,
    slug: "ana-silva",
    gastos_parlamentares: [{
      ...row,
      fonte: "Camara",
      ano: 2025,
      total_gasto: 5000,
      detalhamento: snapshotDetails as unknown as typeof row.detalhamento,
    }],
  })
  const publicUiModel = buildCandidateBoxCard(
    "cota-resumo",
    toPublicCandidatoProfileDto(publishedFicha) as unknown as FichaCandidato,
  )!
  const published = fixture({
    getCandidatoBySlugResource: async () => ({ data: publishedFicha, sourceStatus: "live" }),
    buildCandidateBoxCard,
  })
  const response = await published.handler(
    request(`/api/card/box/cota-resumo/ana-silva?v=${publicUiModel.revision}`),
    params("cota-resumo", "ana-silva"),
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("etag"), `"${publicUiModel.revision}"`)
})

test("comparator requires every selected slug in the current public cohort and preserves selection order", async () => {
  const forged = fixture({
    getCandidatosComparaveisResource: async () => ({ data: [comparable("ana-silva")], sourceStatus: "live" }),
  })
  const forgedResponse = await forged.handler(
    request("/api/card/box/comparador/ana-silva~bia-souza?eixo=patrimonio&cargo=Governador&v=abc123"),
    params("comparador", "ana-silva~bia-souza"),
  )
  assert.equal(forgedResponse.status, 404)
  assert.equal(forgedResponse.headers.get("cache-control"), "no-store")

  const valid = fixture()
  const validResponse = await valid.handler(
    request("/api/card/box/comparador/bia-souza~ana-silva?eixo=patrimonio&cargo=Governador&v=abc123"),
    params("comparador", "bia-souza~ana-silva"),
  )
  assert.equal(validResponse.status, 200)
  assert.deepEqual(valid.comparatorReads(), [["Governador", undefined]])
  assert.deepEqual(valid.selectedForCard(), ["bia-souza", "ana-silva"])
})

test("degraded comparator source is 503 no-store and explicit UF must match the selected cohort", async () => {
  const degraded = fixture({
    getCandidatosComparaveisResource: async () => ({ data: [], sourceStatus: "degraded" }),
  })
  const failed = await degraded.handler(
    request("/api/card/box/comparador/ana-silva~bia-souza?eixo=gastos&cargo=Governador&v=abc123"),
    params("comparador", "ana-silva~bia-souza"),
  )
  assert.equal(failed.status, 503)
  assert.equal(failed.headers.get("cache-control"), "no-store")

  const wrongUf = fixture()
  const invalid = await wrongUf.handler(
    request("/api/card/box/comparador/ana-silva~bia-souza?eixo=patrimonio&cargo=Governador&uf=SP&v=abc123"),
    params("comparador", "ana-silva~bia-souza"),
  )
  assert.equal(invalid.status, 404)
  assert.equal(wrongUf.comparatorReads().length, 0)
})

test("comparator route revision matches the UI model for national presidents and global governors from one UF", async () => {
  const scenarios = [
    { cargo: "Presidente", states: ["SP", "RJ"], expectedLoaderScope: ["Presidente", undefined] as const },
    { cargo: "Governador", states: ["SP", "SP"], expectedLoaderScope: ["Governador", "SP"] as const },
  ]

  for (const scenario of scenarios) {
    const slugs = ["fixture-alfa", "fixture-beta"]
    const axis = "patrimonio" as const
    const comparableRows = makeBoxCardComparables().slice(0, 2).map((row, index) => ({
      ...row,
      cargo_disputado: scenario.cargo,
      estado: scenario.states[index],
    }))
    const uiModel = buildComparatorBoxCard(comparableRows, { slugs, axis })!
    const path = buildBoxCardUrl(uiModel, "feed", { axis })
    let loaderScope: [string | undefined, string | undefined] | null = null
    const renderedModels: BoxCardModel[] = []
    const fx = fixture({
      getCandidatoBySlugResource: async (slug) => {
        const index = slugs.indexOf(slug)
        return {
          data: candidate(slug, scenario.cargo, scenario.states[index] ?? null),
          sourceStatus: "live",
        }
      },
      getCandidatosComparaveisResource: async (cargo, uf) => {
        loaderScope = [cargo, uf]
        return { data: comparableRows, sourceStatus: "live" }
      },
      buildComparatorBoxCard,
      buildBoxCard: async (rendered) => {
        renderedModels.push(rendered)
        return new Response(new Uint8Array([137, 80, 78, 71])) as never
      },
    })

    const key = uiModel.key
    const response = await fx.handler(request(path), params("comparador", key))
    assert.equal(response.status, 200, scenario.cargo)
    assert.deepEqual(loaderScope, scenario.expectedLoaderScope)
    assert.equal(renderedModels[0]?.revision, uiModel.revision)
    assert.equal(renderedModels[0]?.deepLink, uiModel.deepLink)
  }
})
