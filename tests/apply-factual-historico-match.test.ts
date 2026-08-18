import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { findHistoricoRowForFix } from "../scripts/lib/apply-factual-historico-match"

describe("findHistoricoRowForFix (apply idempotency)", () => {
  it("matches row when cargo string differs by accent but canon and periodo_inicio match UNIQUE", () => {
    const historico = [
      {
        id: "row-1",
        cargo: "Governador do Ceará",
        cargo_canonico: "Governador",
        periodo_inicio: 1991,
        periodo_fim: 1994,
      },
    ]
    const fix = {
      cargo: "Governador do Ceara",
      periodo_inicio: 1991,
      periodo_fim: 1994 as number | null,
    }
    assert.equal(findHistoricoRowForFix(historico, fix)?.id, "row-1")
  })

  it("matches when DB stores canon only on cargo text (no cargo_canonico)", () => {
    const historico = [
      {
        id: "row-2",
        cargo: "Governador do Ceará",
        cargo_canonico: null,
        periodo_inicio: 1991,
        periodo_fim: 1994,
      },
    ]
    const fix = {
      cargo: "Governador do Ceara",
      periodo_inicio: 1991,
      periodo_fim: 1994 as number | null,
    }
    assert.equal(findHistoricoRowForFix(historico, fix)?.id, "row-2")
  })

  it("still prefers exact cargo + full period match over canonical match", () => {
    const historico = [
      {
        id: "exact",
        cargo: "Presidente",
        cargo_canonico: "Presidente",
        periodo_inicio: 1998,
        periodo_fim: 1998,
      },
    ]
    const fix = {
      cargo: "Presidente",
      periodo_inicio: 1998,
      periodo_fim: 1998 as number | null,
    }
    assert.equal(findHistoricoRowForFix(historico, fix)?.id, "exact")
  })
})
