import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolveDataReferenciaFromFontes } from "../scripts/lib/pontos-atencao-dates"

describe("pontos-atencao-dates", () => {
  it("resolveDataReferenciaFromFontes uses minimum of all dates (url + data)", () => {
    const r = resolveDataReferenciaFromFontes([
      { url: "https://exemplo.com/2024/08/17/noticia", titulo: "A" },
      { url: "https://outro.com.br/2024/1/22/post", titulo: "B" },
    ])
    assert.equal(r, "2024-01-22")
  })

  it("resolveDataReferenciaFromFontes includes explicit data fields in min", () => {
    const r = resolveDataReferenciaFromFontes([
      { titulo: "A", data: "2020-06-01" },
      { titulo: "B", data: "2019-12-31" },
    ])
    assert.equal(r, "2019-12-31")
  })

  it("returns null when fontes is not an array", () => {
    assert.equal(resolveDataReferenciaFromFontes(null), null)
    assert.equal(resolveDataReferenciaFromFontes({}), null)
    assert.equal(resolveDataReferenciaFromFontes("x"), null)
  })

  it("ignores invalid data strings and still picks min from valid entries", () => {
    const r = resolveDataReferenciaFromFontes([
      { titulo: "A", data: "nope" },
      { titulo: "B", data: "2021-03-15" },
      { titulo: "C", data: "" },
    ])
    assert.equal(r, "2021-03-15")
  })

  it("combines data field and url path on same fonte for minimum", () => {
    const r = resolveDataReferenciaFromFontes([
      {
        titulo: "A",
        data: "2018-05-01",
        url: "https://exemplo.com/2020/12/31/materia",
      },
    ])
    assert.equal(r, "2018-05-01")
  })

  it("deduplicates identical dates from multiple fontes", () => {
    const r = resolveDataReferenciaFromFontes([
      { titulo: "A", data: "2022-01-01" },
      { titulo: "B", data: "2022-01-01" },
      { titulo: "C", url: "https://x.com/2023/06/06/y" },
    ])
    assert.equal(r, "2022-01-01")
  })
})
