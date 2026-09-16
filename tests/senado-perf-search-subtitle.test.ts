import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildGlobalSearchIndexItems, normalizeForSearch } from "@/lib/global-search"
import type { Candidato } from "@/lib/types"

function candidate(overrides: Partial<Candidato>): Candidato {
  return {
    id: "fixture-id",
    slug: "fixture-slug",
    nome_completo: "Pessoa Fictícia da Silva",
    nome_urna: "Pessoa Fictícia",
    data_nascimento: null,
    idade: null,
    naturalidade: null,
    formacao: null,
    profissao_declarada: null,
    partido_atual: "Partido Novo",
    partido_sigla: "NOVO",
    cargo_atual: null,
    cargo_disputado: "Senador",
    estado: "SP",
    status: "candidato",
    foto_url: null,
    site_campanha: null,
    redes_sociais: {},
    fonte_dados: [],
    ultima_atualizacao: "2026-09-15",
    biografia: null,
    ...overrides,
  } as Candidato
}

describe("subtítulo do índice de busca indica a candidatura", () => {
  it("candidato ao Senado com cargo atual mostra a candidatura, não o cargo atual", () => {
    const [item] = buildGlobalSearchIndexItems(
      [candidate({ cargo_atual: "Deputado(a) Federal" })],
      new Map(),
    )

    assert.equal(item.subtitle, "NOVO · Candidato(a) ao Senado · SP")
    assert.doesNotMatch(item.subtitle, /Deputado/)
  })

  it("o cargo atual continua pesquisável no searchText", () => {
    const [item] = buildGlobalSearchIndexItems(
      [candidate({ cargo_atual: "Deputado(a) Federal" })],
      new Map(),
    )

    assert.ok(item.searchText.includes(normalizeForSearch("Deputado(a) Federal")))
    assert.ok(item.searchTextBio?.includes(normalizeForSearch("Deputado(a) Federal")))
    assert.ok(item.searchText.includes(normalizeForSearch("Senador")))
  })

  it("candidato ao Senado sem cargo atual também mostra a candidatura", () => {
    const [item] = buildGlobalSearchIndexItems([candidate({ cargo_atual: null })], new Map())

    assert.equal(item.subtitle, "NOVO · Candidato(a) ao Senado · SP")
  })

  it("demais disputas mantêm o subtítulo atual", () => {
    const [comCargo, semCargo] = buildGlobalSearchIndexItems(
      [
        candidate({ slug: "a", cargo_disputado: "Governador", cargo_atual: "Prefeito(a)" }),
        candidate({ slug: "b", cargo_disputado: "Presidente", cargo_atual: null, estado: null }),
      ],
      new Map(),
    )

    assert.equal(comCargo.subtitle, "NOVO · Prefeito(a) · SP")
    assert.equal(semCargo.subtitle, "NOVO · Presidente")
  })
})
