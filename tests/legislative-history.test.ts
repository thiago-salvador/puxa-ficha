import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { hasLegislativeHistory } from "@/lib/legislative-history"

function historicoRow(cargo: string, cargo_canonico: string | null = null) {
  return { cargo, cargo_canonico }
}

describe("hasLegislativeHistory", () => {
  test("detecta Deputado Federal", () => {
    assert.equal(hasLegislativeHistory([historicoRow("Deputado Federal")]), true)
  })

  test("detecta Deputado Estadual", () => {
    assert.equal(hasLegislativeHistory([historicoRow("Deputada Estadual")]), true)
  })

  test("detecta Senador", () => {
    assert.equal(hasLegislativeHistory([historicoRow("1o Suplente Senador")]), true)
  })

  test("detecta Vereador", () => {
    assert.equal(hasLegislativeHistory([historicoRow("Vereador", null)]), true)
  })

  test("usa cargo_canonico quando cargo bruto nao traz o mandato legislativo", () => {
    assert.equal(hasLegislativeHistory([historicoRow("Mandato parlamentar", "Deputado Distrital")]), true)
  })

  test("nao marca cargo executivo puro como historico legislativo", () => {
    assert.equal(
      hasLegislativeHistory([
        historicoRow("Governador"),
        historicoRow("Prefeito"),
        historicoRow("Ministro de Estado"),
      ]),
      false,
    )
  })
})
