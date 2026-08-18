import { describe, it } from "node:test"
import assert from "node:assert"
import {
  sanitizeFinanciamentoForPublic,
  sanitizeMaioresDoadoresForPublic,
} from "@/lib/financiamento-public"

describe("financiamento sanitization", () => {
  it("remove cpf_hash from doador object", () => {
    const input = [
      { nome: "João Silva", valor: 10000, tipo: "PF", cpf_hash: "a".repeat(64) },
    ]
    const result = sanitizeMaioresDoadoresForPublic(input)
    assert.deepStrictEqual(result, [{ nome: "João Silva", valor: 10000, tipo: "PF" }])
  })

  it("remove cnpj from doador object", () => {
    const input = [
      { nome: "Empresa XYZ", valor: 50000, tipo: "PJ", cnpj: "12345678901234" },
    ]
    const result = sanitizeMaioresDoadoresForPublic(input)
    assert.deepStrictEqual(result, [{ nome: "Empresa XYZ", valor: 50000, tipo: "PJ" }])
  })

  it("preserve non-sensitive fields", () => {
    const input = [
      { nome: "João Silva", valor: 10000, tipo: "PF", cpf_hash: "a".repeat(64) },
    ]
    const [doador] = sanitizeMaioresDoadoresForPublic(input)
    assert.ok(doador)
    assert.strictEqual(doador.nome, "João Silva")
    assert.strictEqual(doador.valor, 10000)
    assert.strictEqual(doador.tipo, "PF")
  })

  it("return empty array for null input", () => {
    const result = sanitizeMaioresDoadoresForPublic(null)
    assert.deepStrictEqual(result, [])
  })

  it("return empty array for undefined input", () => {
    const result = sanitizeMaioresDoadoresForPublic(undefined)
    assert.deepStrictEqual(result, [])
  })

  it("filtra marcadores técnicos do TSE no nome do doador", () => {
    const marcadores = [
      "#NULO",
      "#NULO#",
      "NULL",
      "#NE",
      "NE",
      "NÃO DIVULGÁVEL",
      "#NAO DIVULGAVEL#",
    ]
    const result = sanitizeMaioresDoadoresForPublic([
      ...marcadores.map((nome) => ({ nome, valor: 100, tipo: "PF" })),
      { nome: "Doadora real", valor: 500, tipo: "PF" },
    ])

    assert.deepStrictEqual(result, [{ nome: "Doadora real", valor: 500, tipo: "PF" }])
  })

  it("sanitize financiamento record with maiores_doadores", () => {
    const input = {
      id: "123",
      candidato_id: "456",
      ano_eleicao: 2022,
      maiores_doadores: [
        { nome: "João Silva", valor: 10000, tipo: "PF" as const, cpf_hash: "a".repeat(64) },
      ],
    }
    const [result] = sanitizeFinanciamentoForPublic([input])
    assert.ok(result)
    const [doador] = result.maiores_doadores
    assert.ok(doador)
    assert.strictEqual(doador.nome, "João Silva")
    assert.strictEqual(Object.hasOwn(doador, "cpf_hash"), false)
  })

  it("JSON stringify of sanitized output does not contain sensitive patterns", () => {
    const input = {
      id: "123",
      maiores_doadores: [
        { nome: "João Silva", valor: 10000, tipo: "PF" as const, cpf_hash: "a".repeat(64) },
        { nome: "Empresa XYZ", valor: 50000, tipo: "PJ" as const, cnpj: "12345678901234" },
      ],
    }
    const result = sanitizeFinanciamentoForPublic([input])
    const jsonStr = JSON.stringify(result)

    assert.strictEqual(jsonStr.includes("cpf_hash"), false)
    assert.strictEqual(jsonStr.includes("cnpj"), false)
    assert.strictEqual(jsonStr.includes("a".repeat(64)), false)
    assert.strictEqual(jsonStr.includes("12345678901234"), false)
  })
})
