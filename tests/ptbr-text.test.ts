import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { sanitizeNullablePtBrText, sanitizePtBrText } from "../src/lib/ptbr-text"

describe("ptbr-text", () => {
  it("corrige termos no início da string preservando capitalização", () => {
    assert.equal(sanitizePtBrText("nao votou"), "não votou")
    assert.equal(sanitizePtBrText("Nao votou"), "Não votou")
  })

  it("evita falso positivo dentro de palavras maiores", () => {
    assert.equal(sanitizePtBrText("canao decidiu"), "canao decidiu")
  })

  it("corrige palavras no meio da frase", () => {
    assert.equal(sanitizePtBrText("e entao parou"), "e então parou")
  })

  it("normaliza partidos, cargos e títulos públicos recorrentes", () => {
    assert.equal(sanitizePtBrText("Uniao Brasil"), "União Brasil")
    assert.equal(sanitizePtBrText("Partido Social Democratico"), "Partido Social Democrático")
    assert.equal(sanitizePtBrText("Vice-Governador da Paraiba"), "Vice-Governador da Paraíba")
    assert.equal(sanitizePtBrText("Sancao administrativa ativa (CEIS)"), "Sanção administrativa ativa (CEIS)")
    assert.equal(sanitizePtBrText("Presidente da Republica"), "Presidente da República")
  })

  it("não acentua falsos cognatos partidários", () => {
    assert.equal(sanitizePtBrText("Republicanos"), "Republicanos")
  })

  it("mantém null e undefined intactos", () => {
    assert.equal(sanitizeNullablePtBrText(null), null)
    assert.equal(sanitizeNullablePtBrText(undefined), undefined)
  })
})
