import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { diaEmBrasilia, porSemana, semanaDe } from "../scripts/arquivo/semanas"

describe("séries semanais do arquivo", () => {
  it("usa o dia de Brasília: domingo 23h59 BRT ainda é a semana que começou na segunda anterior", () => {
    // 2026-10-26T02:59Z é domingo, 25/10, 23h59 em Brasília.
    assert.equal(diaEmBrasilia("2026-10-26T02:59:00.000Z"), "2026-10-25")
    assert.equal(semanaDe("2026-10-26T02:59:00.000Z"), "2026-10-19")
    // 2026-10-26T03:00Z já é segunda, 26/10, 00h00 em Brasília.
    assert.equal(semanaDe("2026-10-26T03:00:00.000Z"), "2026-10-26")
  })

  it("segunda-feira é o começo da própria semana", () => {
    assert.equal(semanaDe("2026-03-23T12:00:00.000Z"), "2026-03-23")
    assert.equal(semanaDe("2026-03-29T12:00:00.000Z"), "2026-03-23")
  })

  it("preenche com zero as semanas sem registro e ignora datas fora do intervalo", () => {
    const serie = porSemana(
      ["2026-03-10T12:00:00.000Z", "2026-03-24T12:00:00.000Z", "2026-03-25T12:00:00.000Z", "2026-04-08T12:00:00.000Z", "2026-05-20T12:00:00.000Z"],
      "2026-03-29T12:00:00.000Z",
      "2026-04-12T12:00:00.000Z",
    )
    assert.deepEqual(serie.semanas, ["2026-03-23", "2026-03-30", "2026-04-06"])
    assert.deepEqual(serie.valores, [2, 0, 1])
  })

  it("sem datas, todas as semanas do intervalo ficam em zero", () => {
    const serie = porSemana([], "2026-03-29T12:00:00.000Z", "2026-04-12T12:00:00.000Z")
    assert.deepEqual(serie.valores, [0, 0, 0])
  })
})
