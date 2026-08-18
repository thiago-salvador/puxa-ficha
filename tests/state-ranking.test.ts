import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { IndicadorEstadualRanking } from "@/lib/types"
import { computeStateRanking } from "@/lib/state-ranking"

function row(
  estado: string,
  indicador: string,
  valor: number | null,
  ano: number,
  fonte = "ipeadata"
): IndicadorEstadualRanking {
  return {
    id: `${estado}-${indicador}-${ano}`,
    estado,
    ano,
    indicador,
    valor,
    fonte,
  }
}

describe("computeStateRanking", () => {
  it("excludes null valor from ranking", () => {
    const rows = [
      row("SP", "gini", 0.5, 2024),
      row("RJ", "gini", null, 2024),
      row("MG", "gini", 0.55, 2024),
    ]
    const r = computeStateRanking(rows, "SP")
    const gini = r.rankings.find((x) => x.indicador === "gini")
    assert.equal(gini?.total, 2)
    assert.equal(gini?.posicao, 1)
  })

  it("uses dense rank on ties (gini, lower is better)", () => {
    const rows = [
      row("AC", "gini", 0.5, 2024),
      row("SP", "gini", 0.7, 2024),
      row("RJ", "gini", 0.7, 2024),
      row("MG", "gini", 0.6, 2024),
    ]
    const sp = computeStateRanking(rows, "SP")
    const gini = sp.rankings.find((x) => x.indicador === "gini")
    assert.equal(gini?.posicao, 3)
    assert.equal(gini?.total, 4)

    const rj = computeStateRanking(rows, "RJ")
    assert.equal(rj.rankings.find((x) => x.indicador === "gini")?.posicao, 3)

    const ac = computeStateRanking(rows, "AC")
    assert.equal(ac.rankings.find((x) => x.indicador === "gini")?.posicao, 1)
  })

  it("returns empty rankings for unknown uf", () => {
    const r = computeStateRanking([row("SP", "gini", 0.5, 2024)], "XX")
    assert.equal(r.rankings.length, 0)
  })

  it("propaga fonte do registro mais recente da UF", () => {
    const rows = [
      row("SP", "gini", 0.5, 2024, "ipeadata"),
      row("RJ", "gini", 0.6, 2024, "ipeadata"),
    ]
    const r = computeStateRanking(rows, "SP")
    assert.equal(r.rankings.find((x) => x.indicador === "gini")?.fonte, "ipeadata")
  })
})
