import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  hasFederalLegislativeHistory,
  hasLegislativeHistory,
  legislativeHistoryFlagsFromRows,
} from "@/lib/legislative-history"

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

  test("flags por candidato a partir das linhas de historico", () => {
    const flags = legislativeHistoryFlagsFromRows([
      { candidato_id: "a", cargo: "Senador", cargo_canonico: null },
      { candidato_id: "b", cargo: "Governador", cargo_canonico: null },
      { candidato_id: "c", cargo: "Mandato", cargo_canonico: "Deputado Federal" },
    ])
    assert.equal(flags.get("a"), true)
    assert.equal(flags.get("b"), false)
    assert.equal(flags.get("c"), true)
    assert.equal(flags.has("d"), false)
  })
})

describe("hasFederalLegislativeHistory", () => {
  test("detecta Deputado Federal e Senador", () => {
    assert.equal(hasFederalLegislativeHistory([historicoRow("Deputado Federal")]), true)
    assert.equal(hasFederalLegislativeHistory([historicoRow("Deputada Federal")]), true)
    assert.equal(hasFederalLegislativeHistory([historicoRow("Senador")]), true)
    assert.equal(hasFederalLegislativeHistory([historicoRow("Senadora")]), true)
    assert.equal(hasFederalLegislativeHistory([historicoRow("1o Suplente Senador")]), true)
    assert.equal(hasFederalLegislativeHistory([historicoRow("Mandato", "Deputado Federal")]), true)
  })

  test("vereador sozinho nao abre o recorte federal", () => {
    assert.equal(hasFederalLegislativeHistory([historicoRow("Vereador")]), false)
    assert.equal(hasFederalLegislativeHistory([historicoRow("Vereadora", null)]), false)
    assert.equal(hasFederalLegislativeHistory([historicoRow("Mandato parlamentar", "Vereador")]), false)
  })

  test("deputado estadual sozinho nao abre o recorte federal", () => {
    assert.equal(hasFederalLegislativeHistory([historicoRow("Deputado Estadual")]), false)
    assert.equal(hasFederalLegislativeHistory([historicoRow("Deputada Estadual")]), false)
    assert.equal(hasFederalLegislativeHistory([historicoRow("Mandato", "Deputado Estadual")]), false)
  })

  test("deputado distrital nao conta como CEAP/CEAPS federal", () => {
    assert.equal(hasFederalLegislativeHistory([historicoRow("Deputado Distrital")]), false)
    assert.equal(hasFederalLegislativeHistory([historicoRow("Mandato parlamentar", "Deputado Distrital")]), false)
  })

  test("deputado sem o qualificativo federal nao conta", () => {
    assert.equal(hasFederalLegislativeHistory([historicoRow("Deputado")]), false)
    assert.equal(hasFederalLegislativeHistory([historicoRow("Deputada")]), false)
  })

  test("flags do comparador sao federais: vereador e estadual ficam false", () => {
    const flags = legislativeHistoryFlagsFromRows([
      { candidato_id: "vereador", cargo: "Vereador", cargo_canonico: null },
      { candidato_id: "estadual", cargo: "Deputada Estadual", cargo_canonico: null },
      { candidato_id: "federal", cargo: "Deputado Federal", cargo_canonico: null },
      { candidato_id: "senador", cargo: "Senador", cargo_canonico: null },
      { candidato_id: "distrital", cargo: "Mandato", cargo_canonico: "Deputado Distrital" },
    ])
    assert.equal(flags.get("vereador"), false)
    assert.equal(flags.get("estadual"), false)
    assert.equal(flags.get("federal"), true)
    assert.equal(flags.get("senador"), true)
    assert.equal(flags.get("distrital"), false)
  })
})
