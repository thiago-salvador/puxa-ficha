import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createHash } from "node:crypto"
import {
  KEY_WINDOWS,
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
    assert.deepEqual(first.searchParams.getAll("id"), [
      "gte.00000000-0000-0000-0000-000000000000",
      "lt.10000000-0000-0000-0000-000000000000",
    ])
    const next = buildPageUrl(BASE, "legislacao_mandato_executivo", "ementa,metadata", "abc", KEY_WINDOWS[15])
    assert.equal(next.searchParams.get("select"), "id,ementa,metadata")
    // A última janela não tem teto.
    assert.deepEqual(next.searchParams.getAll("id"), ["gt.abc"])
  })

  it("as janelas cobrem todo o espaço de chave, em ordem e sem sobreposição", () => {
    assert.equal(KEY_WINDOWS.length, 16)
    assert.equal(KEY_WINDOWS[0].lower, "00000000-0000-0000-0000-000000000000")
    assert.equal(KEY_WINDOWS[15].upper, null)
    for (let index = 1; index < KEY_WINDOWS.length; index += 1) {
      assert.equal(KEY_WINDOWS[index].lower, KEY_WINDOWS[index - 1].upper)
    }
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

function uuidFor(seed: string): string {
  const hex = createHash("sha1").update(seed).digest("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** PostgREST mínimo: aplica gte/gt/lt em id, order=id.asc e limit. */
function fakePostgrest(
  rows: ({ id: string } & Record<string, unknown>)[],
  options: { failOnCall?: number; repeatPreviousLast?: boolean } = {},
) {
  const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const served: string[] = []
  let calls = 0
  const fetcher = async (input: string | URL | Request) => {
    calls += 1
    if (options.failOnCall === calls) {
      return response(500, { code: "57014", message: "canceling statement due to statement timeout" })
    }
    const params = new URL(String(input)).searchParams
    let page = sorted
    for (const filter of params.getAll("id")) {
      const [op, value] = [filter.slice(0, filter.indexOf(".")), filter.slice(filter.indexOf(".") + 1)]
      page = page.filter((row) => (op === "gte" ? row.id >= value : op === "gt" ? row.id > value : row.id < value))
    }
    page = page.slice(0, Number(params.get("limit")))
    // Fonte defeituosa: a página seguinte recomeça na última linha já servida,
    // dentro da mesma janela, então só a guarda de ordem estrita pode pegar.
    const after = params.getAll("id").find((filter) => filter.startsWith("gt."))?.slice(3)
    const previous = sorted.find((row) => row.id === after)
    if (options.repeatPreviousLast && previous) page = [previous, ...page.slice(0, -1)]
    served.push(...page.map((row) => row.id))
    return response(200, page)
  }
  return { fetcher: fetcher as typeof fetch, served, calls: () => calls }
}

describe("audit-public-document-exposure: varredura por janelas de chave", () => {
  const projetos = TARGETS.find((target) => target.table === "projetos_lei")!
  // 2.500 linhas espalhadas e mais 2.300 concentradas numa janela só, para que
  // ela precise de três páginas e as outras de uma.
  const dataset = [
    ...Array.from({ length: 2500 }, (_, index) => ({ id: uuidFor(`a${index}`), ementa: "Dispõe sobre X" })),
    ...Array.from({ length: 2300 }, (_, index) => ({ id: `3${uuidFor(`b${index}`).slice(1)}`, ementa: "Altera a Lei Y" })),
  ]
  dataset[4000].ementa = "Beneficia CPF 123.456.789-09"

  it("lê toda linha exatamente uma vez e conta os achados", async () => {
    const api = fakePostgrest(dataset)
    const scan = await scanTarget(BASE, "k", projetos, api.fetcher, async () => {})
    assert.deepEqual(scan, { rows: dataset.length, findings: 1, pendingApply: false })
    assert.equal(api.served.length, dataset.length)
    assert.equal(new Set(api.served).size, dataset.length)
    assert.deepEqual([...api.served].sort(), dataset.map((row) => row.id).sort())
  })

  it("falha fechado quando uma página do meio esgota as tentativas", async () => {
    const api = fakePostgrest(dataset)
    let calls = 0
    const failing = (async (input: string | URL | Request) => {
      calls += 1
      // Da oitava chamada em diante a fonte só devolve timeout.
      return calls >= 8 ? response(500, "statement timeout") : api.fetcher(input)
    }) as typeof fetch
    await assert.rejects(scanTarget(BASE, "k", projetos, failing, async () => {}), /projetos_lei: HTTP 500 statement timeout/)
  })

  it("um timeout isolado é repetido e não perde nem duplica linha", async () => {
    const api = fakePostgrest(dataset, { failOnCall: 5 })
    const scan = await scanTarget(BASE, "k", projetos, api.fetcher, async () => {})
    assert.equal(scan.rows, dataset.length)
    assert.equal(new Set(api.served).size, dataset.length)
  })

  it("falha fechado se a fonte repetir linha já lida", async () => {
    const api = fakePostgrest(dataset, { repeatPreviousLast: true })
    await assert.rejects(scanTarget(BASE, "k", projetos, api.fetcher, async () => {}), /paginação repetiu ou não avançou/)
  })

  it("404 depois da primeira janela é falha, mesmo em alvo com aplicação pendente", async () => {
    const despesas = TARGETS.find((target) => target.table === "financiamento_despesas_publico")!
    let calls = 0
    const fetcher = (async () => {
      calls += 1
      return calls === 1 ? response(200, []) : response(404, { code: "PGRST205" })
    }) as typeof fetch
    await assert.rejects(scanTarget(BASE, "k", despesas, fetcher, async () => {}), /HTTP 404/)
  })
})

describe("audit-public-document-exposure: despesas de campanha", () => {
  const despesas = TARGETS.find((target) => target.table === "financiamento_despesas_publico")

  it("varre as três colunas JSONB da view pública com dígitos soltos e 404 pendente", () => {
    assert.ok(despesas)
    assert.deepEqual(despesas.columns.split(",").sort(), ["cargo_candidatura", "concentracao_despesas", "doacoes_a_terceiros", "fonte", "maiores_fornecedores"])
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
    const api = fakePostgrest([
      { id: uuidFor("a"), maiores_fornecedores: [{ tipo: "PJ", nome: "MEI 12345678909", valor: 1 }], doacoes_a_terceiros: [], concentracao_despesas: [] },
      { id: uuidFor("b"), maiores_fornecedores: [{ tipo: "PJ", nome: "GRAFICA LTDA", valor: 1 }], doacoes_a_terceiros: [], concentracao_despesas: [] },
    ])
    const scan = await scanTarget(BASE, "k", despesas!, api.fetcher, async () => {})
    assert.deepEqual(scan, { rows: 2, findings: 1, pendingApply: false })
  })
})
