import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Candidato } from "@/lib/types"
import { segmentTextByQueryTokens } from "@/lib/global-search-highlight"
import {
  buildGlobalSearchIndexItems,
  buildSearchTextForCandidato,
  filterGlobalSearchIndexToPublicSlugs,
  filterGlobalSearchPalette,
  groupNumericSearchCandidates,
  mergeVotacaoTagsByCandidatoId,
  normalizeForSearch,
  parseNumericSearchQuery,
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
    const c = baseCandidato({ numero_urna: "4545" })
    const items = buildGlobalSearchIndexItems([c], new Map([
      [c.id, { temas: ["Meio ambiente"], titulos: [] }],
    ]))
    assert.equal(items.length, 1)
    assert.ok(items[0].searchText.includes("meio ambiente"))
    assert.equal(items[0].numero_urna, "4545")
    assert.ok(items[0].searchText.includes("4545"))
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

  it("aplica a normalização canônica de partido à busca da paleta", () => {
    const result = filterGlobalSearchPalette("PODEMOS", [], [
      {
        href: "/candidato/a",
        title: "Fulano",
        subtitle: "PODE · Deputado · SP",
        searchText: normalizeForSearch("Fulano São Paulo"),
        party_sigla: "PODE",
      },
      {
        href: "/candidato/b",
        title: "Ciclano",
        subtitle: "PT · Deputado · SP",
        searchText: normalizeForSearch("Ciclano São Paulo"),
        party_sigla: "PT",
      },
    ])
    assert.deepEqual(result.candidates.map((item) => item.href), ["/candidato/a"])
  })

  it("combina o filtro de partido da URL com a busca textual", () => {
    const result = filterGlobalSearchPalette("São", [], [
      {
        href: "/candidato/a",
        title: "Fulano",
        subtitle: "PT · Deputado · SP",
        searchText: normalizeForSearch("Fulano São Paulo"),
        party_sigla: "PT",
      },
      {
        href: "/candidato/b",
        title: "Ciclano",
        subtitle: "PODE · Deputado · RJ",
        searchText: normalizeForSearch("Ciclano São Paulo"),
        party_sigla: "PODE",
      },
    ], undefined, "PT")
    assert.deepEqual(result.candidates.map((item) => item.href), ["/candidato/a"])
  })

  it("aplica o filtro de partido da URL antes de digitar na paleta", () => {
    const result = filterGlobalSearchPalette("", [], [
      { href: "/candidato/a", title: "Fulano", subtitle: "PT", searchText: "fulano", party_sigla: "PT" },
      { href: "/candidato/b", title: "Ciclano", subtitle: "PODE", searchText: "ciclano", party_sigla: "PODE" },
    ], undefined, "PT")
    assert.deepEqual(result.candidates.map((item) => item.href), ["/candidato/a"])
  })

  it("ignora filtro de URL inválido ou incerto", () => {
    const candidate: GlobalSearchIndexItem = {
      href: "/candidato/a",
      title: "Fulano",
      subtitle: "PT · Deputado · SP",
      searchText: normalizeForSearch("Fulano"),
      party_sigla: "PT",
    }
    assert.equal(filterGlobalSearchPalette("Fulano", [], [candidate], undefined, "INCERTO").candidates.length, 1)
    assert.equal(filterGlobalSearchPalette("Fulano", [], [candidate], undefined, "NAO-EXISTE").candidates.length, 1)
  })

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

  it("matches an exact urna number and restricts by UF", () => {
    const items: GlobalSearchIndexItem[] = [
      { href: "/candidato/sp", title: "A", subtitle: "Governador · SP · Urna 4545", searchText: "a", numero_urna: "4545", estado: "SP", cargo_disputado: "Governador", party_sigla: "PT" },
      { href: "/candidato/rj", title: "B", subtitle: "Governador · RJ · Urna 4545", searchText: "b", numero_urna: "4545", estado: "RJ", cargo_disputado: "Governador", party_sigla: "PODE" },
    ]
    assert.deepEqual(filterGlobalSearchPalette("4545 RJ", [], items).candidates.map((item) => item.href), ["/candidato/rj"])
    assert.deepEqual(filterGlobalSearchPalette("4545", [], items).candidates.map((item) => item.href), ["/candidato/sp", "/candidato/rj"])
    assert.deepEqual(filterGlobalSearchPalette("4545", [], items, undefined, "PT").candidates.map((item) => item.href), ["/candidato/sp"])
  })

  it("prioriza o presidenciável ao buscar um número também usado por governador", () => {
    const items: GlobalSearchIndexItem[] = [
      { href: "/candidato/governador", title: "Governador", subtitle: "SP", searchText: "governador", numero_urna: "22", estado: "SP", cargo_disputado: "Governador" },
      { href: "/candidato/presidente", title: "Presidente", subtitle: "BR", searchText: "presidente", numero_urna: "22", estado: "BR", cargo_disputado: "Presidente" },
    ]
    assert.deepEqual(filterGlobalSearchPalette("22", [], items).candidates.map((item) => item.href), ["/candidato/presidente", "/candidato/governador"])
  })

  it("does not turn digits embedded in a candidate name into numeric hits", () => {
    const item: GlobalSearchIndexItem = { href: "/candidato/a", title: "A13", subtitle: "PT", searchText: "a13", numero_urna: "13", estado: "SP", cargo_disputado: "Governador" }
    const nameOnly: GlobalSearchIndexItem = { href: "/candidato/b", title: "B13", subtitle: "PT", searchText: "b13", numero_urna: null, estado: "SP", cargo_disputado: "Governador" }
    assert.equal(parseNumericSearchQuery("A13"), null)
    assert.equal(filterGlobalSearchPalette("A13", [], [item]).candidates.length, 1)
    assert.deepEqual(filterGlobalSearchPalette("13 SP", [], [item, nameOnly]).candidates.map((candidate) => candidate.href), ["/candidato/a"])
  })

  it("groups repeated numbers by UF and cargo", () => {
    const items: GlobalSearchIndexItem[] = [
      { href: "/candidato/a", title: "A", subtitle: "", searchText: "", numero_urna: "13", estado: "SP", cargo_disputado: "Governador" },
      { href: "/candidato/b", title: "B", subtitle: "", searchText: "", numero_urna: "13", estado: "RJ", cargo_disputado: "Senador" },
    ]
    assert.deepEqual(groupNumericSearchCandidates(items).map((group) => group.label), ["RJ · Senador", "SP · Governador"])
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

describe("filterGlobalSearchIndexToPublicSlugs", () => {
  it("removes stale candidate entries while preserving non-candidate shortcuts", () => {
    const stale: GlobalSearchIndexItem = {
      href: "/candidato/cleber-rabelo",
      title: "Cleber Rabelo",
      subtitle: "PSTU · Governador · PA",
      searchText: "cleber rabelo pstu governador pa",
    }
    const current: GlobalSearchIndexItem = {
      href: "/candidato/well-macedo",
      title: "Well Macedo",
      subtitle: "PSTU · Governador · PA",
      searchText: "well macedo pstu governador pa",
    }
    const shortcut: GlobalSearchIndexItem = {
      href: "/sobre",
      title: "Sobre",
      subtitle: "Fontes",
      searchText: "sobre fontes",
      badge: "Atalho",
    }

    assert.deepEqual(
      filterGlobalSearchIndexToPublicSlugs(
        [stale, current, shortcut],
        ["well-macedo"],
      ),
      [current, shortcut],
    )
  })

  it("matches candidate URLs with query strings against the canonical slug", () => {
    const item: GlobalSearchIndexItem = {
      href: "/candidato/cleber-rabelo?tab=votos",
      title: "Cleber Rabelo",
      subtitle: "PSTU · Governador · PA",
      searchText: "cleber rabelo",
    }

    assert.deepEqual(filterGlobalSearchIndexToPublicSlugs([item], []), [])
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
