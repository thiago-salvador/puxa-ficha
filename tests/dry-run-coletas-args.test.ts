import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseArgs } from "../scripts/dry-run-coletas"

describe("argumentos do dry-run de coletas", () => {
  it("rejeita opções desconhecidas ou malformadas", () => {
    assert.throws(() => parseArgs(["--manifest=arquivo.json"]), /desconhecida/)
    assert.throws(() => parseArgs(["--roster"]), /inválida/)
  })

  it("rejeita opções que a coleta selecionada ignora", () => {
    assert.throws(
      () => parseArgs(["--coleta=sancoes", "--manifesto=arquivo.json"]),
      /só é aceito com --coleta=patrimonio/,
    )
    assert.throws(
      () => parseArgs(["--coleta=patrimonio", "--roster=roster.json"]),
      /só é aceito com --coleta=sancoes/,
    )
  })

  it("mantém as combinações válidas", () => {
    assert.deepEqual(parseArgs(["--coleta=sancoes", "--roster=roster.json"]), {
      coleta: "sancoes",
      roster: "roster.json",
      manifesto: null,
      out: null,
    })
    assert.deepEqual(parseArgs(["--coleta=patrimonio", "--manifesto=manifesto.json"]), {
      coleta: "patrimonio",
      roster: null,
      manifesto: "manifesto.json",
      out: null,
    })
  })
})
