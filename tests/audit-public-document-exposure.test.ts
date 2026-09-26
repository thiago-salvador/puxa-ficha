import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildPageUrl, countDocumentLikeSequences, fetchPage } from "../scripts/audit-public-document-exposure"

const BASE = "https://exemplo.supabase.co"

function response(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status })
}

describe("audit-public-document-exposure: paginação por chave", () => {
  it("ordena por id, pede id na seleção e continua depois do último id, sem OFFSET", () => {
    const first = buildPageUrl(BASE, "projetos_lei", "ementa", null)
    assert.equal(first.searchParams.get("select"), "id,ementa")
    assert.equal(first.searchParams.get("order"), "id.asc")
    assert.equal(first.searchParams.get("offset"), null)
    assert.equal(first.searchParams.get("id"), null)
    const next = buildPageUrl(BASE, "legislacao_mandato_executivo", "ementa,metadata", "abc")
    assert.equal(next.searchParams.get("select"), "id,ementa,metadata")
    assert.equal(next.searchParams.get("id"), "gt.abc")
  })

  it("repete HTTP 500 transitório e devolve a página quando a fonte se recupera", async () => {
    const calls: number[] = []
    const replies = [response(500, { code: "57014", message: "canceling statement due to statement timeout" }), response(200, [{ id: "1", ementa: "x" }])]
    const rows = await fetchPage(BASE, "k", "projetos_lei", "ementa", null, async () => { calls.push(1); return replies.shift()! }, async () => {})
    assert.equal(calls.length, 2)
    assert.deepEqual(rows, [{ id: "1", ementa: "x" }])
  })

  it("falha com o corpo do erro quando o 500 persiste, e não repete erro 4xx", async () => {
    let calls = 0
    await assert.rejects(
      fetchPage(BASE, "k", "projetos_lei", "ementa", null, async () => { calls++; return response(500, "statement timeout") }, async () => {}),
      /projetos_lei: HTTP 500 statement timeout/,
    )
    assert.equal(calls, 5)
    calls = 0
    await assert.rejects(
      fetchPage(BASE, "k", "projetos_lei", "ementa", null, async () => { calls++; return response(401, "no") }, async () => {}),
      /HTTP 401/,
    )
    assert.equal(calls, 1)
  })

  it("continua detectando CPF formatado e ignora o já mascarado", () => {
    assert.equal(countDocumentLikeSequences({ ementa: "CPF 123.456.789-09" }), 1)
    assert.equal(countDocumentLikeSequences({ ementa: "CPF [documento mascarado] em 12/03/2020" }), 0)
  })
})
