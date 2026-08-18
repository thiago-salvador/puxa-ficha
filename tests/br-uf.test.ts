import assert from "node:assert/strict"
import { test } from "node:test"
import {
  canonicalizeEstadoForStorage,
  extractEstadoFromText,
  getEstadoNome,
  getEstadoUFs,
  longFormMatchesUfSigla,
  normalizeBrUfToken,
  resolveEstadoUf,
} from "@/lib/br-uf"

test("getEstadoNome resolve sigla em qualquer casing", () => {
  assert.equal(getEstadoNome("RJ"), "Rio de Janeiro")
  assert.equal(getEstadoNome("sp"), "São Paulo")
})

test("getEstadoUFs mantém a lista canônica em minúsculas", () => {
  const ufs = getEstadoUFs()
  assert.ok(ufs.includes("rj"))
  assert.ok(ufs.includes("df"))
  assert.equal(new Set(ufs).size, ufs.length)
})

test("resolveEstadoUf aceita nome oficial e alias explícito", () => {
  assert.equal(resolveEstadoUf("Rio de Janeiro"), "rj")
  assert.equal(resolveEstadoUf("Brasília"), "df")
  assert.equal(resolveEstadoUf("estado de são paulo"), "sp")
})

test("longFormMatchesUfSigla só aceita forma longa conhecida da mesma UF", () => {
  assert.equal(longFormMatchesUfSigla("RJ", "Rio de Janeiro"), true)
  assert.equal(longFormMatchesUfSigla("RJ", "Rio de Janeiro, Brasil"), true)
  assert.equal(longFormMatchesUfSigla("RJ", "São Paulo"), false)
  assert.equal(longFormMatchesUfSigla("RJ", "estado de são paulo"), false)
})

test("normalizeBrUfToken remove acentos e normaliza casing", () => {
  assert.equal(normalizeBrUfToken(" São Paulo "), "sao paulo")
  assert.equal(normalizeBrUfToken("Brasília"), "brasilia")
})

// --- canonicalizeEstadoForStorage ---

test("canonicalizeEstadoForStorage retorna UF maiúscula para sigla", () => {
  assert.equal(canonicalizeEstadoForStorage("sp"), "SP")
  assert.equal(canonicalizeEstadoForStorage("SP"), "SP")
  assert.equal(canonicalizeEstadoForStorage("Rj"), "RJ")
})

test("canonicalizeEstadoForStorage retorna UF maiúscula para nome de estado", () => {
  assert.equal(canonicalizeEstadoForStorage("São Paulo"), "SP")
  assert.equal(canonicalizeEstadoForStorage("sao paulo"), "SP")
  assert.equal(canonicalizeEstadoForStorage("Minas Gerais"), "MG")
  assert.equal(canonicalizeEstadoForStorage("Distrito Federal"), "DF")
  assert.equal(canonicalizeEstadoForStorage("Brasília"), "DF")
})

test("canonicalizeEstadoForStorage retorna null para input inválido", () => {
  assert.equal(canonicalizeEstadoForStorage("XY"), null)
  assert.equal(canonicalizeEstadoForStorage(""), null)
  assert.equal(canonicalizeEstadoForStorage(null), null)
  assert.equal(canonicalizeEstadoForStorage(undefined), null)
})

test("canonicalizeEstadoForStorage round-trip para os 27 estados", () => {
  const expected: Array<[string, string]> = [
    ["AC", "Acre"], ["AL", "Alagoas"], ["AM", "Amazonas"], ["AP", "Amapá"],
    ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"],
    ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"],
    ["MG", "Minas Gerais"], ["MS", "Mato Grosso do Sul"], ["MT", "Mato Grosso"],
    ["PA", "Pará"], ["PB", "Paraíba"], ["PE", "Pernambuco"], ["PI", "Piauí"],
    ["PR", "Paraná"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
    ["RO", "Rondônia"], ["RR", "Roraima"], ["RS", "Rio Grande do Sul"],
    ["SC", "Santa Catarina"], ["SE", "Sergipe"], ["SP", "São Paulo"],
    ["TO", "Tocantins"],
  ]
  for (const [uf, nome] of expected) {
    assert.equal(canonicalizeEstadoForStorage(uf), uf, `sigla ${uf}`)
    assert.equal(canonicalizeEstadoForStorage(uf.toLowerCase()), uf, `sigla lowercase ${uf}`)
    assert.equal(canonicalizeEstadoForStorage(nome), uf, `nome ${nome}`)
  }
})

// --- extractEstadoFromText ---

test("extractEstadoFromText extrai UF de texto contendo nome de estado", () => {
  assert.equal(extractEstadoFromText("Governador de São Paulo"), "SP")
  assert.equal(extractEstadoFromText("Senador por Minas Gerais"), "MG")
  assert.equal(extractEstadoFromText("Deputado Federal do Rio de Janeiro"), "RJ")
  assert.equal(extractEstadoFromText("Deputado do Distrito Federal"), "DF")
})

test("extractEstadoFromText usa longest-match-first para evitar falso positivo", () => {
  assert.equal(extractEstadoFromText("Governador do Mato Grosso do Sul"), "MS")
  assert.equal(extractEstadoFromText("Deputado Estadual do Mato Grosso"), "MT")
  assert.equal(extractEstadoFromText("Senador da Paraíba"), "PB")
  assert.equal(extractEstadoFromText("Senador do Pará"), "PA")
  assert.equal(extractEstadoFromText("Deputado Federal do Paraná"), "PR")
})

test("extractEstadoFromText resolve input exato como canonicalizeEstadoForStorage", () => {
  assert.equal(extractEstadoFromText("SP"), "SP")
  assert.equal(extractEstadoFromText("sp"), "SP")
  assert.equal(extractEstadoFromText("Rio de Janeiro"), "RJ")
})

test("extractEstadoFromText retorna null para texto sem estado", () => {
  assert.equal(extractEstadoFromText("Ministro da Educação"), null)
  assert.equal(extractEstadoFromText(""), null)
  assert.equal(extractEstadoFromText(null), null)
})
