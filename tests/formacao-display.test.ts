import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formatFormacaoPublica,
  formacaoPublicaDe,
  pareceNomeDeInstituicao,
} from "../src/lib/formacao-display"

describe("formatFormacaoPublica", () => {
  it("compõe grau TSE e instituição", () => {
    assert.equal(
      formatFormacaoPublica("Superior incompleto", "Universidade de São Paulo"),
      "Superior incompleto · Universidade de São Paulo",
    )
  })

  it("não afirma diploma quando só há grau", () => {
    assert.equal(formatFormacaoPublica("Superior incompleto", null), "Superior incompleto")
  })

  it("não inventa grau quando só há instituição", () => {
    assert.equal(formatFormacaoPublica(null, "Universidade de São Paulo"), "Universidade de São Paulo")
  })

  it("compõe a partir do par da ficha", () => {
    assert.equal(
      formacaoPublicaDe({
        formacao: "Superior incompleto",
        formacao_instituicao: "Universidade de São Paulo",
      }),
      "Superior incompleto · Universidade de São Paulo",
    )
  })
})

describe("pareceNomeDeInstituicao", () => {
  it("separa instituição pura de curso ou grau", () => {
    assert.equal(pareceNomeDeInstituicao("Universidade de São Paulo"), true)
    assert.equal(pareceNomeDeInstituicao("Pontifícia Universidade Católica do Rio de Janeiro"), true)
    assert.equal(pareceNomeDeInstituicao("Instituto Presbiteriano Mackenzie"), true)
    assert.equal(pareceNomeDeInstituicao("Superior incompleto"), false)
    assert.equal(pareceNomeDeInstituicao("Direito (USP), Mestrado em Economia (USP)"), false)
  })
})
