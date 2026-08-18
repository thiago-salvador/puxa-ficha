import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Candidato } from "@/lib/types"
import { segmentTextByQueryTokens } from "@/lib/global-search-highlight"
import {
  buildGlobalSearchIndexItems,
  buildSearchTextForCandidato,
  filterGlobalSearchPalette,
  mergeVotacaoTagsByCandidatoId,
  normalizeForSearch,
  resolveGlobalSearchHref,
  type GlobalSearchIndexItem,
  type VotacaoSearchRow,
} from "@/lib/global-search"

function baseCandidato(over: Partial<Candidato> = {}): Candidato {
  return {
    id: "c1",
    nome_completo: "Maria da Silva",
    nome_urna: "Maria",
    slug: "maria",
    data_nascimento: null,
    idade: null,
    naturalidade: null,
    formacao: null,
    profissao_declarada: null,
    partido_atual: "Partido X",
    partido_sigla: "PX",
    cargo_atual: null,
    cargo_disputado: "Governador",
    estado: "SP",
    status: "pre-candidato",
    foto_url: null,
    site_campanha: null,
    redes_sociais: {},
    fonte_dados: [],
    ultima_atualizacao: "2026-01-01",
    ...over,
  }
}

describe("normalizeForSearch", () => {
  it("strips diacritics for PT-BR matching", () => {
    assert.equal(normalizeForSearch("São Paulo"), "sao paulo")
    assert.equal(normalizeForSearch("  Economia  "), "economia")
  })
})

describe("mergeVotacaoTagsByCandidatoId", () => {
  it("dedupes tema and titulo per candidato", () => {
    const rows: VotacaoSearchRow[] = [
      {
        candidato_id: "a",
        votacao: { tema: "economia", titulo: "PL 1" },
      },
      {
        candidato_id: "a",
        votacao: { tema: "economia", titulo: "PL 2" },
      },
      { candidato_id: "b", votacao: { tema: null, titulo: "Só título" } },
    ]
    const m = mergeVotacaoTagsByCandidatoId(rows)
    assert.deepEqual(m.get("a"), {
      temas: ["economia"],
      titulos: ["PL 1", "PL 2"],
    })
    assert.deepEqual(m.get("b"), { temas: [], titulos: ["Só título"] })
  })
})

describe("buildSearchTextForCandidato", () => {
  it("includes estado nome from UF map", () => {
    const c = baseCandidato({ estado: "SP" })
    const t = buildSearchTextForCandidato(c, { temas: [], titulos: [] })
    assert.ok(t.includes("sao paulo"))
    assert.ok(t.includes("maria"))
  })
})

describe("buildGlobalSearchIndexItems", () => {
  it("embeds tema in searchText", () => {
    const c = baseCandidato()
    const items = buildGlobalSearchIndexItems([c], new Map([
      [c.id, { temas: ["Meio ambiente"], titulos: [] }],
    ]))
    assert.equal(items.length, 1)
    assert.ok(items[0].searchText.includes("meio ambiente"))
    assert.equal(items[0].href, "/candidato/maria")
  })

  it("omits 'incerto' from subtitle and searchText when partido is uncertain", () => {
    const c = baseCandidato({
      partido_sigla: "incerto",
      partido_atual: "incerto",
    })
    const items = buildGlobalSearchIndexItems([c], new Map())
    assert.equal(items.length, 1)
    assert.equal(
      items[0].subtitle.toLowerCase().includes("incerto"),
      false,
      "subtitle must not contain incerto",
    )
    assert.equal(
      items[0].searchText.toLowerCase().includes("incerto"),
      false,
      "searchText must not contain incerto",
    )
    assert.equal(
      (items[0].searchTextBio ?? "").toLowerCase().includes("incerto"),
      false,
      "searchTextBio must not contain incerto",
    )
  })

  it("preserves real party in subtitle/searchText", () => {
    const c = baseCandidato({ partido_sigla: "PT", partido_atual: "Partido dos Trabalhadores" })
    const items = buildGlobalSearchIndexItems([c], new Map())
    assert.ok(items[0].subtitle.includes("PT"), `expected PT in subtitle, got ${items[0].subtitle}`)
  })
})

describe("filterGlobalSearchPalette", () => {
  const shortcuts: GlobalSearchIndexItem[] = [
    {
      href: "/sobre",
      title: "Sobre",
      subtitle: "Fontes",
      searchText: normalizeForSearch("Sobre Fontes Atalho"),
      badge: "Atalho",
    },
  ]
  const candidates: GlobalSearchIndexItem[] = [
    {
      href: "/candidato/a",
      title: "Fulano",
      subtitle: "PX · Governador · RJ",
      searchText: normalizeForSearch("Fulano Rio de Janeiro economia"),
    },
  ]

  it("matches query without accents against indexed text", () => {
    const r = filterGlobalSearchPalette("economia", shortcuts, candidates)
    assert.equal(r.candidates.length, 1)
    const r2 = filterGlobalSearchPalette("sao paulo", shortcuts, [
      {
        href: "/candidato/sp",
        title: "Candidato SP",
        subtitle: "PX",
        searchText: normalizeForSearch("Candidato São Paulo PX"),
      },
    ])
    assert.equal(r2.candidates.length, 1)
  })

  it("returns truncated candidates when query empty", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      href: `/candidato/x${i}`,
      title: `C${i}`,
      subtitle: "",
      searchText: normalizeForSearch(`candidato ${i}`),
    }))
    const r = filterGlobalSearchPalette("", shortcuts, many, 28)
    assert.equal(r.candidates.length, 28)
  })

  it("ranks title-prefix matches above votação-only matches", () => {
    const q = "economia"
    const votOnly: GlobalSearchIndexItem = {
      href: "/candidato/zuzu",
      title: "Zuzu",
      subtitle: "PX · SP",
      searchText: normalizeForSearch("Zuzu PX SP economia"),
      searchTextBio: normalizeForSearch("Zuzu PX SP"),
      searchTextVotacao: normalizeForSearch("economia"),
    }
    const titleMatch: GlobalSearchIndexItem = {
      href: "/candidato/eco",
      title: "Economia Silva",
      subtitle: "PX",
      searchText: normalizeForSearch("Economia Silva PX economia"),
      searchTextBio: normalizeForSearch("Economia Silva PX"),
    }
    const r = filterGlobalSearchPalette(q, shortcuts, [votOnly, titleMatch])
    assert.equal(r.candidates[0].title, "Economia Silva")
    assert.equal(r.candidates[1].title, "Zuzu")
  })
})

describe("resolveGlobalSearchHref", () => {
  const base: GlobalSearchIndexItem = {
    href: "/candidato/x",
    title: "X",
    subtitle: "PX",
    searchText: normalizeForSearch("X PX meio ambiente"),
    searchTextBio: normalizeForSearch("X PX"),
    searchTextVotacao: normalizeForSearch("meio ambiente"),
  }

  it("appends tab=votos when query matches only votação haystack", () => {
    assert.equal(
      resolveGlobalSearchHref(base, "ambiente"),
      "/candidato/x?tab=votos"
    )
  })

  it("keeps base href when query matches bio", () => {
    assert.equal(resolveGlobalSearchHref(base, "PX"), "/candidato/x")
  })

  it("keeps base href when bio and votação both match the same query", () => {
    const overlap: GlobalSearchIndexItem = {
      ...base,
      searchTextBio: normalizeForSearch("X PX ambiente"),
      searchText: normalizeForSearch("X PX ambiente meio ambiente"),
    }
    assert.equal(resolveGlobalSearchHref(overlap, "ambiente"), "/candidato/x")
  })

  it("ignores shortcuts (badge Atalho)", () => {
    const shortcut: GlobalSearchIndexItem = {
      href: "/sobre",
      title: "Sobre",
      subtitle: "Fontes",
      searchText: normalizeForSearch("Sobre"),
      badge: "Atalho",
      searchTextVotacao: normalizeForSearch("economia"),
    }
    assert.equal(resolveGlobalSearchHref(shortcut, "economia"), "/sobre")
  })
})

describe("segmentTextByQueryTokens", () => {
  it("marks tokens that match normalized query words", () => {
    const segs = segmentTextByQueryTokens("Economia e SP", "eco sp")
    const joined = segs.map((s) => s.text).join("")
    assert.equal(joined, "Economia e SP")
    assert.ok(segs.some((s) => s.highlight && s.text === "Economia"))
    assert.ok(segs.some((s) => s.highlight && s.text === "SP"))
  })
})
