import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  normalizeDoadorTipoWithIdentifiers,
  normalizeMaioresDoadoresForStorage,
  sanitizeFinanciamentoForPublic,
  sanitizeMaioresDoadoresForPublic,
} from "@/lib/financiamento-public"

describe("financiamento-public", () => {
  it("corrige tipo PF quando o doador tem cpf_hash e remove IDs do payload publico", () => {
    const [doador] = sanitizeMaioresDoadoresForPublic([
      { nome: "Fulano de Tal", valor: 100, tipo: "PJ", cpf_hash: "hash-interno", id: "public-id" },
    ])

    assert.deepEqual(doador, { nome: "Fulano de Tal", valor: 100, tipo: "PF" })
    assert.equal(Object.hasOwn(doador, "id"), false)
    assert.equal(Object.hasOwn(doador, "cpf_hash"), false)
    assert.equal(Object.hasOwn(doador, "cnpj"), false)
  })

  it("mantem fundos explicitos mesmo quando ha documento PJ", () => {
    assert.equal(
      normalizeDoadorTipoWithIdentifiers("fundo_eleitoral", { cnpj: "12345678000190" }),
      "fundo_eleitoral"
    )
    assert.equal(normalizeDoadorTipoWithIdentifiers("PJ", { cpf_hash: "hash" }), "PF")
    assert.equal(normalizeDoadorTipoWithIdentifiers("PF", { cnpj: "12345678000190" }), "PJ")
  })

  it("agrega nomes publicos duplicados antes de serializar a ficha", () => {
    const out = sanitizeMaioresDoadoresForPublic([
      { nome: "Direcao Nacional", valor: 100.111, tipo: "PJ", cnpj: "11111111000111" },
      { nome: "Direção   Nacional", valor: 200.115, tipo: "PJ", cnpj: "22222222000122" },
      { nome: "Outra Empresa", valor: 50, tipo: "PJ", cnpj: "33333333000133" },
    ])

    assert.deepEqual(out, [
      { nome: "Direcao Nacional", valor: 300.23, tipo: "PJ" },
      { nome: "Outra Empresa", valor: 50, tipo: "PJ" },
    ])
  })

  it("preserva um identificador de storage apenas quando ele continua inequivoco", () => {
    const samePerson = normalizeMaioresDoadoresForStorage([
      { nome: "Fulano", valor: 10, tipo: "PJ", cpf_hash: "hash-1" },
      { nome: "FULANO", valor: 20, tipo: "PJ", cpf_hash: "hash-1" },
    ])
    assert.deepEqual(samePerson, [{ nome: "Fulano", valor: 30, tipo: "PF", cpf_hash: "hash-1" }])

    const ambiguousOrg = normalizeMaioresDoadoresForStorage([
      { nome: "Direcao Nacional", valor: 10, tipo: "PJ", cnpj: "11111111000111" },
      { nome: "Direção Nacional", valor: 20, tipo: "PJ", cnpj: "22222222000122" },
    ])
    assert.deepEqual(ambiguousOrg, [{ nome: "Direcao Nacional", valor: 30, tipo: "PJ" }])
  })

  it("sanitiza linhas de financiamento sem alterar outros campos", () => {
    const [row] = sanitizeFinanciamentoForPublic([
      {
        id: "fin-1",
        candidato_id: "cand-1",
        ano_eleicao: 2022,
        total_arrecadado: 100,
        maiores_doadores: [{ nome: "Fulano", valor: 100, tipo: "PJ", cpf_hash: "hash" }],
      },
    ])

    assert.equal(row.id, "fin-1")
    assert.deepEqual(row.maiores_doadores, [{ nome: "Fulano", valor: 100, tipo: "PF" }])
  })
})
