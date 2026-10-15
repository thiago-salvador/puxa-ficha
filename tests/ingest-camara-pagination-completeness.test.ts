import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { coletarPaginasCamara, parseDeclaredCountFromLinks } from "../scripts/lib/ingest-camara"

const pageLink = (page: number) => [{ rel: "last", href: `https://dadosabertos.camara.leg.br/api/v2/proposicoes?pagina=${page}` }]
const response = (dados: unknown[], last: number) => ({ json: { dados, links: pageLink(last) } })

describe("completude de paginação da Câmara", () => {
  it("não infere cardinalidade quando a API omite rel=last", () => {
    assert.equal(parseDeclaredCountFromLinks(undefined, 0), null)
    assert.equal(parseDeclaredCountFromLinks([{ rel: "self", href: "?pagina=1" }], 2), null)
  })

  it("segue até a última página declarada depois de uma página cheia", async () => {
    let calls = 0
    const firstPage = Array.from({ length: 100 }, (_, index) => `first-${index}`)
    const rows = await coletarPaginasCamara("https://example.test/items", {}, async (url) => {
      calls += 1
      const page = Number(new URL(url).searchParams.get("pagina"))
      return page === 1 ? response(firstPage, 2) : response(["last"], 2)
    }, undefined, async () => {})
    assert.deepEqual(rows, [...firstPage, "last"])
    assert.equal(calls, 2)
  })

  it("rejeita uma página curta que contradiz a última página declarada", async () => {
    await assert.rejects(() => coletarPaginasCamara("https://example.test/items", {}, async () => response(["one"], 2)), /Página curta/)
  })

  it("aceita zero apenas após duas chamadas oficiais vazias e consistentes", async () => {
    let calls = 0
    const rows = await coletarPaginasCamara("https://example.test/items", {}, async () => {
      calls += 1
      return response([], 1)
    })
    assert.deepEqual(rows, [])
    assert.equal(calls, 2)
    calls = 0
    await assert.rejects(() => coletarPaginasCamara("https://example.test/items", {}, async () => {
      calls += 1
      return calls === 1 ? response([], 1) : response(["recovered"], 1)
    }), /não corroborada/)
    assert.equal(calls, 2)
  })

  it("trata página 1 vazia só com rel=self como conjunto vazio, após segunda chamada igual", async () => {
    let calls = 0
    const selfOnly = { json: { dados: [], links: [{ rel: "self", href: "https://dadosabertos.camara.leg.br/api/v2/deputados/1/despesas?pagina=1" }] } }
    const rows = await coletarPaginasCamara("https://example.test/items", {}, async () => {
      calls += 1
      return selfOnly
    })
    assert.deepEqual(rows, [])
    assert.equal(calls, 2)
  })

  it("rejeita vazio sem rel=last quando a segunda chamada não corrobora", async () => {
    const selfOnly = { json: { dados: [], links: [{ rel: "self", href: "?pagina=1" }] } }
    let calls = 0
    await assert.rejects(() => coletarPaginasCamara("https://example.test/items", {}, async () => {
      calls += 1
      return calls === 1 ? selfOnly : { json: { dados: ["x"], links: selfOnly.json.links } }
    }), /não corroborada/)
    calls = 0
    await assert.rejects(() => coletarPaginasCamara("https://example.test/items", {}, async () => {
      calls += 1
      return calls === 1 ? selfOnly : response([], 3)
    }), /não corroborada/)
    assert.equal(calls, 2)
  })

  it("rejeita vazio com links ausentes, vazios, sem href ou com rel de continuação", async () => {
    const variantes = [
      undefined,
      [],
      [{ rel: "self", href: "" }],
      [{ rel: "self", href: "?pagina=1" }, { rel: "next", href: "?pagina=2" }],
      [{ rel: "next", href: "?pagina=2" }],
      [{ rel: "self", href: "?pagina=1" }, { rel: "first", href: "?pagina=1" }],
    ]
    for (const links of variantes) {
      let calls = 0
      await assert.rejects(() => coletarPaginasCamara("https://example.test/items", {}, async () => {
        calls += 1
        return { json: { dados: [], links } } as never
      }), /sem rel=last válido/)
      assert.equal(calls, 1)
    }
    const selfOnly = { json: { dados: [], links: [{ rel: "self", href: "?pagina=1" }] } }
    let calls = 0
    await assert.rejects(() => coletarPaginasCamara("https://example.test/items", {}, async () => {
      calls += 1
      return calls === 1 ? selfOnly : { json: { dados: [], links: [{ rel: "self", href: "?pagina=1" }, { rel: "next", href: "?pagina=2" }] } }
    }), /não corroborada/)
    assert.equal(calls, 2)
  })

  it("mantém falha fechada para dados preenchidos sem rel=last ou com rel=last inválido", async () => {
    await assert.rejects(() => coletarPaginasCamara("https://example.test/items", {}, async () => (
      { json: { dados: ["x"], links: [{ rel: "self", href: "?pagina=1" }] } }
    )), /sem rel=last válido/)
    await assert.rejects(() => coletarPaginasCamara("https://example.test/items", {}, async () => (
      { json: { dados: [], links: [{ rel: "last", href: "https://dadosabertos.camara.leg.br/api/v2/x" }] } }
    )), /sem rel=last válido/)
  })
})
