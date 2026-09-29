import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  TARGETS,
  buildPageUrl,
  countDocumentLikeSequences,
  fetchPage,
  scanTarget,
} from "../scripts/audit-public-document-exposure"

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

describe("audit-public-document-exposure: despesas de campanha", () => {
  const despesas = TARGETS.find((target) => target.table === "financiamento_despesas_publico")

  it("varre as três colunas JSONB da view pública com dígitos soltos e 404 pendente", () => {
    assert.ok(despesas)
    assert.deepEqual(despesas.columns.split(",").sort(), ["concentracao_despesas", "doacoes_a_terceiros", "maiores_fornecedores"])
    assert.equal(despesas.bareDigits, true)
    assert.equal(despesas.pendingOn404, true)
    // Os alvos antigos continuam estritos: 404 neles é falha, e número de processo
    // em ementa não vira achado.
    for (const target of TARGETS.filter((item) => item !== despesas)) {
      assert.notEqual(target.pendingOn404, true, target.table)
      assert.notEqual(target.bareDigits, true, target.table)
    }
  })

  it("pega CPF de MEI colado no nome sem rótulo, só no modo de dígitos soltos", () => {
    const fornecedores = [{ tipo: "PJ", nome: "JOAO DA SILVA 12345678909", quantidade: 1, valor: 1000 }]
    assert.equal(countDocumentLikeSequences(fornecedores), 0)
    assert.equal(countDocumentLikeSequences(fornecedores, { bareDigits: true }), 1)
    assert.equal(countDocumentLikeSequences([{ destinatario_nome: "EMPRESA 12345678000190" }], { bareDigits: true }), 1)
    // Formatado conta uma vez só, mesmo com os dois modos somados.
    assert.equal(countDocumentLikeSequences([{ nome: "CPF 123.456.789-09" }], { bareDigits: true }), 1)
    // Valor numérico e dez dígitos não são documento.
    assert.equal(countDocumentLikeSequences([{ nome: "GRAFICA LTDA", valor: 12345678901.5 }], { bareDigits: true }), 0)
    assert.equal(countDocumentLikeSequences([{ nome: "LOJA 1234567890" }], { bareDigits: true }), 0)
  })

  it("404 na primeira página da view é aplicação pendente, não falha", async () => {
    const scan = await scanTarget(BASE, "k", despesas!, async () => response(404, { code: "PGRST205" }), async () => {})
    assert.deepEqual(scan, { rows: 0, findings: 0, pendingApply: true })
  })

  it("404 em alvo antigo continua falha, e a view aplicada conta documento no JSONB", async () => {
    const antigo = TARGETS.find((target) => target.table === "patrimonio")!
    await assert.rejects(scanTarget(BASE, "k", antigo, async () => response(404, "nao existe"), async () => {}), /HTTP 404/)
    const scan = await scanTarget(
      BASE,
      "k",
      despesas!,
      async () =>
        response(200, [
          { id: "a", maiores_fornecedores: [{ tipo: "PJ", nome: "MEI 12345678909", valor: 1 }], doacoes_a_terceiros: [], concentracao_despesas: [] },
          { id: "b", maiores_fornecedores: [{ tipo: "PJ", nome: "GRAFICA LTDA", valor: 1 }], doacoes_a_terceiros: [], concentracao_despesas: [] },
        ]),
      async () => {},
    )
    assert.deepEqual(scan, { rows: 2, findings: 1, pendingApply: false })
  })
})
