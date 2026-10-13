import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { normalizarDetalhamentoGasto } from "../src/lib/gasto-detalhamento"

describe("normalizarDetalhamentoGasto", () => {
  it("mantém o array de categorias", () => {
    assert.deepEqual(normalizarDetalhamentoGasto([{ categoria: "Passagens", valor: 10, fornecedor: "Cia" }]), [
      { categoria: "Passagens", valor: 10, fornecedor: "Cia" },
    ])
  })

  it("desembrulha o objeto legado com categorias e ignora a proveniência", () => {
    const legado = { proveniencia: { fonte_url: "x" }, categorias: [{ categoria: "Combustíveis", valor: "12.5" }] }
    assert.deepEqual(normalizarDetalhamentoGasto(legado), [
      { categoria: "Combustíveis", valor: 12.5, fornecedor: undefined },
    ])
  })

  it("converte mapa categoria -> valor", () => {
    assert.deepEqual(normalizarDetalhamentoGasto({ Telefonia: 3 }), [
      { categoria: "Telefonia", valor: 3, fornecedor: undefined },
    ])
  })

  it("devolve lista vazia para nulo, ausente ou escalar", () => {
    assert.deepEqual(normalizarDetalhamentoGasto(null), [])
    assert.deepEqual(normalizarDetalhamentoGasto(undefined), [])
    assert.deepEqual(normalizarDetalhamentoGasto("texto"), [])
  })

  it("não lança com item que não é objeto", () => {
    assert.deepEqual(normalizarDetalhamentoGasto([7]), [{ categoria: "", valor: 0, fornecedor: undefined }])
  })
})
