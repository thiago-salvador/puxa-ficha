import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { anosDePleitoDisputado } from "../src/lib/pleitos-disputados"

describe("pleitos disputados", () => {
  it("não transforma registro indeferido em pleito disputado", () => {
    const anos = anosDePleitoDisputado([
      {
        periodo_inicio: 2018,
        cargo: "Presidente",
        proveniencia: "tse",
        eleito_por: "nao eleito",
        observacoes: "Registro INDEFERIDO pelo TSE. Não participou da votação.",
      },
      {
        periodo_inicio: 2022,
        cargo: "Presidente",
        proveniencia: "tse",
        eleito_por: "eleito",
        observacoes: "ELEITO (TSE 2022)",
      },
    ])

    assert.deepEqual([...anos], [2022])
  })
})
