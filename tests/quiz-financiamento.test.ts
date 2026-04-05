import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildFinanciamentoContexto } from "../src/lib/quiz-financiamento"

describe("quiz-financiamento", () => {
  it("builds context from top donor and total", () => {
    const s = buildFinanciamentoContexto(2022, 1_500_000, [
      { nome: "Empresa X", valor: 800_000, tipo: "PJ" },
      { nome: "Fulano", valor: 100_000, tipo: "PF" },
    ])
    assert.ok(s)
    assert.match(s!, /Empresa X/)
    assert.match(s!, /1\.500\.000/)
    assert.match(s!, /ranking pode incorporar/i)
  })

  it("returns null when no usable fields", () => {
    assert.equal(buildFinanciamentoContexto(2022, null, []), null)
  })
})
