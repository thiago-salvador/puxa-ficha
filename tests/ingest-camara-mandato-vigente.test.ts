import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { legislaturaCamaraVigente, mandatoCamaraVigente } from "../scripts/lib/ingest-camara"

const setembro2026 = new Date("2026-09-26T12:00:00Z")

describe("legislaturaCamaraVigente", () => {
  it("usa a legislatura que começa em 1º de fevereiro", () => {
    assert.equal(legislaturaCamaraVigente(setembro2026), 57)
    assert.equal(legislaturaCamaraVigente(new Date("2023-02-01T12:00:00Z")), 57)
    assert.equal(legislaturaCamaraVigente(new Date("2027-01-31T12:00:00Z")), 57)
    assert.equal(legislaturaCamaraVigente(new Date("2027-02-01T12:00:00Z")), 58)
    assert.equal(legislaturaCamaraVigente(new Date("1999-02-01T12:00:00Z")), 51)
  })
})

describe("mandatoCamaraVigente", () => {
  it("aceita exercício na legislatura vigente", () => {
    assert.equal(mandatoCamaraVigente({ situacao: "Exercício", idLegislatura: 57, siglaPartido: "PT" }, setembro2026), true)
  })

  it("recusa exercício de legislatura encerrada (ex-deputado com status antigo)", () => {
    // Forma real da API para o deputado 74192 em 26/09/2026: último mandato na
    // legislatura 51, situacao "Exercício", partido daquela época.
    assert.equal(mandatoCamaraVigente({ situacao: "Exercício", idLegislatura: 51, siglaPartido: "PSDB" }, setembro2026), false)
  })

  it("recusa status sem legislatura e situação fora de exercício", () => {
    assert.equal(mandatoCamaraVigente({ situacao: "Exercício" }, setembro2026), false)
    assert.equal(mandatoCamaraVigente({ situacao: "Fim de Mandato", idLegislatura: 57 }, setembro2026), false)
    assert.equal(mandatoCamaraVigente(undefined, setembro2026), false)
  })
})
