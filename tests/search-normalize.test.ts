import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { normalizeForSearch } from "@/lib/search-normalize"

describe("normalizeForSearch (paridade com public.normalize_for_search no Postgres)", () => {
  it("remove acentos comuns em PT-BR e lowercases", () => {
    assert.equal(normalizeForSearch("São Paulo"), "sao paulo")
    assert.equal(normalizeForSearch("  Economia  "), "economia")
    assert.equal(normalizeForSearch("José"), "jose")
    assert.equal(normalizeForSearch("Ângela"), "angela")
  })

  it("esvazia após trim de só espaços", () => {
    assert.equal(normalizeForSearch("   "), "")
  })

  it("edge cases alinhados a nomes TSE / razões sociais (paridade SQL)", () => {
    assert.equal(normalizeForSearch("JOÃO D'ÁVILA"), "joao d'avila")
    assert.equal(normalizeForSearch("MUÑOZ"), "munoz")
    assert.equal(normalizeForSearch("COMÉRCIO & CIA"), "comercio & cia")
    assert.equal(normalizeForSearch("AÇÃO"), "acao")
  })
})
