import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  fetchWikiCategories,
  finalizarCategoriasWikiHistorico,
  interpretarWikiCategoriesPayload,
} from "../scripts/lib/enrich-wiki-historico"
import type { IngestResult } from "../scripts/lib/types"

function resultado(): IngestResult {
  return {
    source: "wiki-historico",
    candidato: "candidato-teste",
    tables_updated: [],
    rows_upserted: 0,
    errors: [],
    duration_ms: 1,
  }
}

describe("wiki-historico: desfecho explicito", () => {
  it("distingue pagina ausente, categorias vazias e payload invalido", () => {
    assert.deepEqual(
      interpretarWikiCategoriesPayload({ query: { pages: { "-1": { missing: "" } } } }),
      { categories: [], error: null },
    )
    assert.deepEqual(
      interpretarWikiCategoriesPayload({ query: { pages: { "1": { title: "Teste" } } } }),
      { categories: [], error: null },
    )
    assert.match(
      interpretarWikiCategoriesPayload({ results: {} }).error ?? "",
      /query\.pages/,
    )
  })

  it("cargo retornado e encontrado mesmo sem escrita local", () => {
    const r = resultado()
    const cargos = finalizarCategoriasWikiHistorico(r, ["Governadores de Sao Paulo"])

    assert.equal(cargos.length, 1)
    assert.equal(r.rows_upserted, 0)
    assert.equal(r.coleta_resultado, "encontrado")
    assert.equal(r.coleta_volume, 1)
  })

  it("resposta valida sem categoria de cargo vira vazio_confirmado", () => {
    for (const categories of [[], ["Pessoas vivas"]]) {
      const r = resultado()
      finalizarCategoriasWikiHistorico(r, categories)
      assert.equal(r.coleta_resultado, "vazio_confirmado")
      assert.equal(r.coleta_volume, undefined)
    }
  })

  it("HTTP nao-2xx vira erro", async () => {
    const resposta = await fetchWikiCategories("Teste", {
      fetchImpl: async () => new Response("", { status: 503 }),
      sleepImpl: async () => {},
      tentativas: 1,
    })
    assert.equal(resposta.categories.length, 0)
    assert.match(resposta.error ?? "", /HTTP 503/)
  })

  it("limita Retry-After ao mesmo teto do backoff", async () => {
    const delays: number[] = []
    let chamadas = 0
    const resposta = await fetchWikiCategories("Teste", {
      fetchImpl: async () => {
        chamadas++
        if (chamadas === 1) {
          return new Response("", {
            status: 429,
            headers: { "Retry-After": "86400" },
          })
        }
        return Response.json({ query: { pages: { "1": { title: "Teste" } } } })
      },
      sleepImpl: async (ms) => { delays.push(ms) },
      tentativas: 2,
    })

    assert.deepEqual(delays, [60_000])
    assert.deepEqual(resposta, { categories: [], error: null })
  })

  it("timeout vira erro", async () => {
    const abortError = new Error("aborted")
    abortError.name = "AbortError"
    const resposta = await fetchWikiCategories("Teste", {
      fetchImpl: async () => { throw abortError },
      sleepImpl: async () => {},
      tentativas: 1,
      timeoutMs: 5,
    })
    assert.match(resposta.error ?? "", /Timeout \(5ms\)/)
  })

  it("erro de parse nunca vira vazio_confirmado", async () => {
    const resposta = await fetchWikiCategories("Teste", {
      fetchImpl: async () => new Response("nao-e-json", { status: 200 }),
      sleepImpl: async () => {},
      tentativas: 1,
    })
    assert.ok(resposta.error)
    assert.equal(resposta.categories.length, 0)
  })
})
