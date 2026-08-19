import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  fetchWikiPage,
  finalizarResultadoWikipedia,
  interpretarWikiPagePayload,
} from "../scripts/lib/enrich-wikipedia"
import type { IngestResult } from "../scripts/lib/types"

function resultado(over: Partial<IngestResult> = {}): IngestResult {
  return {
    source: "wikipedia",
    candidato: "candidato-teste",
    tables_updated: [],
    rows_upserted: 0,
    errors: [],
    duration_ms: 1,
    ...over,
  }
}

describe("Wikipedia: desfecho explicito", () => {
  it("interpreta verbete existente com foto e QID", () => {
    const page = interpretarWikiPagePayload({
      query: {
        pages: {
          "1": {
            title: "Candidato Teste",
            thumbnail: { source: "https://upload.wikimedia.org/teste.jpg" },
            pageprops: { wikibase_item: "Q123" },
          },
        },
      },
    })

    assert.deepEqual(page, {
      status: "encontrado",
      photoUrl: "https://upload.wikimedia.org/teste.jpg",
      wikidataId: "Q123",
    })
  })

  it("verbete encontrado continua encontrado com e sem UPDATE", () => {
    for (const rowsUpserted of [0, 1]) {
      const r = resultado({ rows_upserted: rowsUpserted })
      finalizarResultadoWikipedia(r, "encontrado", "verbete confirmado")
      assert.equal(r.coleta_resultado, "encontrado")
      assert.equal(r.coleta_volume, 1)
    }
  })

  it("page.missing valido vira vazio_confirmado", () => {
    const page = interpretarWikiPagePayload({
      query: { pages: { "-1": { title: "Ausente", missing: "" } } },
    })
    assert.equal(page.status, "vazio_confirmado")

    const r = resultado()
    finalizarResultadoWikipedia(r, page.status, "verbete ausente")
    assert.equal(r.coleta_resultado, "vazio_confirmado")
  })

  it("sem titulo com fallback local continua nao_aplicavel", () => {
    const r = resultado({ rows_upserted: 1, tables_updated: ["candidatos"] })
    finalizarResultadoWikipedia(
      r,
      "nao_aplicavel",
      "fallback local aplicado; nenhuma consulta Wikipedia realizada",
    )
    assert.equal(r.coleta_resultado, "nao_aplicavel")
    assert.equal(r.rows_upserted, 1)
  })

  it("HTTP, timeout e parse/schema invalido viram erro, nunca vazio", async () => {
    for (const failure of [
      new Error("HTTP 503"),
      new Error("Timeout (15000ms)"),
      { query: { pages: [] } },
    ]) {
      const page = await fetchWikiPage("Candidato Teste", async () => {
        if (failure instanceof Error) throw failure
        return failure
      })
      assert.equal(page.status, "erro")
      assert.notEqual(page.status, "vazio_confirmado")
    }
  })

  it("erro parcial sempre ganha de encontrado", () => {
    const r = resultado({ errors: ["links externos Wikipedia: HTTP 500"] })
    finalizarResultadoWikipedia(r, "encontrado", "verbete confirmado")
    assert.equal(r.coleta_resultado, "erro")
    assert.match(r.coleta_detalhe ?? "", /HTTP 500/)
  })

  it("P69, resumo e fallback de educação não escrevem grau TSE em formacao", () => {
    const fonte = readFileSync("scripts/lib/enrich-wikipedia.ts", "utf8")
    assert.match(fonte, /formacao_instituicao: "Instituto Presbiteriano Mackenzie"/)
    assert.doesNotMatch(fonte, /formacao: "Instituto Presbiteriano Mackenzie"/)
    assert.doesNotMatch(fonte, /updates\.formacao = educacao/)
    assert.doesNotMatch(fonte, /pendingUpdates\.formacao = fb\.formacao/)
    assert.doesNotMatch(fonte, /updates\.formacao = fb\.formacao/)
  })
})
