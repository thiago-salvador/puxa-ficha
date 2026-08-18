import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildFinancingComposition } from "../src/lib/financiamento-display"
import type { Financiamento } from "../src/lib/types"

function row(overrides: Partial<Financiamento> = {}): Financiamento {
  return {
    id: "fin-1",
    candidato_id: "cand-1",
    ano_eleicao: 2022,
    total_arrecadado: 100,
    total_fundo_partidario: 20,
    total_fundo_eleitoral: 30,
    total_pessoa_fisica: 0,
    total_recursos_proprios: 0,
    maiores_doadores: [],
    ...overrides,
  }
}

describe("buildFinancingComposition", () => {
  it("preenche o residual legado para o gráfico fechar no total", () => {
    const composition = buildFinancingComposition(row())
    assert.equal(composition.chartIsSafe, true)
    assert.equal(composition.residual, 50)
    assert.equal(
      composition.segments.reduce((sum, segment) => sum + segment.value, 0),
      100,
    )
  })

  it("prefere categorias oficiais mutuamente exclusivas", () => {
    const composition = buildFinancingComposition(row({
      categorias_origem: {
        fundo_eleitoral: 30,
        fundo_partidario: 20,
        outros_recursos: 40,
        nao_informado_pelo_tse: 10,
      },
    }))
    assert.equal(composition.chartIsSafe, true)
    assert.deepEqual(composition.segments.map(({ key, value }) => [key, value]), [
      ["fundo_eleitoral", 30],
      ["fundo_partidario", 20],
      ["outros_recursos", 50],
    ])
  })

  it("bloqueia gráfico quando as categorias excedem o total", () => {
    const composition = buildFinancingComposition(row({
      total_fundo_partidario: 80,
      total_fundo_eleitoral: 40,
    }))
    assert.equal(composition.chartIsSafe, false)
    assert.equal(composition.overage, 20)
  })

  it("bloqueia gráfico quando a composição oficial não fecha o total", () => {
    const composition = buildFinancingComposition(row({
      categorias_origem: {
        fundo_eleitoral: 30,
        fundo_partidario: 20,
        outros_recursos: 10,
        nao_informado_pelo_tse: 0,
      },
    }))
    assert.equal(composition.chartIsSafe, false)
    assert.equal(composition.residual, 40)
  })
})
