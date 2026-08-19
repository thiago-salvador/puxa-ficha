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

  it("humaniza grau TSE em caixa alta", () => {
    assert.equal(
      formatFormacaoPublica("SUPERIOR COMPLETO", "Universidade Paulista (Unip)"),
      "Superior completo · Universidade Paulista (Unip)",
    )
    assert.equal(formatFormacaoPublica("SUPERIOR INCOMPLETO", null), "Superior incompleto")
  })

  it("mostra só o grau quando não há instituição", () => {
    assert.equal(formatFormacaoPublica("Superior incompleto", null), "Superior incompleto")
    assert.equal(formatFormacaoPublica("SUPERIOR COMPLETO", null), "Superior completo")
  })

  it("não mostra formação quando só há instituição", () => {
    assert.equal(formatFormacaoPublica(null, "Universidade de São Paulo"), null)
    assert.equal(formatFormacaoPublica("Universidade de São Paulo", null), null)
    assert.equal(
      formatFormacaoPublica("Centro Universitário de Brasília", null),
      null,
    )
    assert.equal(
      formacaoPublicaDe({
        formacao: null,
        formacao_instituicao: "Universidade de São Paulo",
      }),
      null,
    )
  })

  it("não trata o nome da instituição como se fosse grau", () => {
    assert.equal(pareceNomeDeInstituicao("Universidade de São Paulo"), true)
    assert.equal(
      formatFormacaoPublica("Universidade de São Paulo", "Universidade de São Paulo"),
      null,
    )
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
    assert.equal(pareceNomeDeInstituicao("Centro Universitário de Brasília"), true)
    assert.equal(pareceNomeDeInstituicao("Faculdade de Direito da Universidade Federal do Ceará"), true)
    assert.equal(pareceNomeDeInstituicao("Superior incompleto"), false)
    assert.equal(pareceNomeDeInstituicao("Direito (USP), Mestrado em Economia (USP)"), false)
  })
})
