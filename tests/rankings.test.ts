import assert from "node:assert/strict"
import { describe, it } from "node:test"

describe("rankings", () => {
  it("exposes only the canonical MVP ranking slugs", async () => {
    const { rankingDefinitions } = await import("../src/data/ranking-definitions")

    assert.deepEqual(
      rankingDefinitions.map((definition) => definition.slug),
      ["gastos-parlamentares", "mudancas-partido", "patrimonio-declarado"]
    )
  })

  it("normalizes ranking filters for supported cargos and UFs", async () => {
    const { normalizeRankingFilters } = await import("../src/lib/rankings")

    assert.deepEqual(normalizeRankingFilters({}), {
      cargo: "Presidente",
      estado: undefined,
      isFiltered: false,
    })

    assert.deepEqual(normalizeRankingFilters({ cargo: "Governador", uf: "sp" }), {
      cargo: "Governador",
      estado: "SP",
      isFiltered: true,
    })

    assert.deepEqual(normalizeRankingFilters({ cargo: "Senador", uf: "rj" }), {
      cargo: "Senador",
      estado: undefined,
      isFiltered: true,
    })

    assert.deepEqual(normalizeRankingFilters({ cargo: "Prefeito", uf: "xx" }), {
      cargo: "Presidente",
      estado: undefined,
      isFiltered: false,
    })
  })

  it("normalizes ranking sort order and query state", async () => {
    const { normalizeRankingViewState } = await import("../src/lib/rankings")

    assert.deepEqual(normalizeRankingViewState({ ordem: "asc" }), {
      cargo: "Presidente",
      estado: undefined,
      sortOrder: "asc",
      isFiltered: true,
    })

    assert.deepEqual(normalizeRankingViewState({ cargo: "Governador", uf: "sp", ordem: "desc" }), {
      cargo: "Governador",
      estado: "SP",
      sortOrder: "desc",
      isFiltered: true,
    })
  })

  it("sorts ranking entries descending with nulls last and nome_urna as tie-breaker", async () => {
    const { sortRankingEntries } = await import("../src/lib/rankings")

    const entries = sortRankingEntries([
      {
        candidato: { nome_urna: "Zelia", slug: "zelia" },
        metricValue: 10,
      },
      {
        candidato: { nome_urna: "Ana", slug: "ana" },
        metricValue: 10,
      },
      {
        candidato: { nome_urna: "Bruno", slug: "bruno" },
        metricValue: null,
      },
      {
        candidato: { nome_urna: "Carlos", slug: "carlos" },
        metricValue: 15,
      },
    ])

    assert.deepEqual(
      entries.map((entry) => entry.candidato.slug),
      ["carlos", "ana", "zelia", "bruno"]
    )
  })

  it("sorts ranking entries ascending with nulls last and nome_urna as tie-breaker", async () => {
    const { sortRankingEntries } = await import("../src/lib/rankings")

    const entries = sortRankingEntries(
      [
        {
          candidato: { nome_urna: "Zelia", slug: "zelia" },
          metricValue: 10,
        },
        {
          candidato: { nome_urna: "Ana", slug: "ana" },
          metricValue: 10,
        },
        {
          candidato: { nome_urna: "Bruno", slug: "bruno" },
          metricValue: null,
        },
        {
          candidato: { nome_urna: "Carlos", slug: "carlos" },
          metricValue: 15,
        },
      ],
      "asc"
    )

    assert.deepEqual(entries.map((entry) => entry.candidato.slug), ["ana", "zelia", "carlos", "bruno"])
  })

  it("builds ranking paths with cargo, uf and sort order only when necessary", async () => {
    const { buildRankingPath } = await import("../src/lib/rankings")

    assert.equal(
      buildRankingPath("gastos-parlamentares", { cargo: "Presidente", sortOrder: "desc" }),
      "/rankings/gastos-parlamentares"
    )
    assert.equal(
      buildRankingPath("gastos-parlamentares", { cargo: "Presidente", sortOrder: "asc" }),
      "/rankings/gastos-parlamentares?ordem=asc"
    )
    assert.equal(
      buildRankingPath("gastos-parlamentares", { cargo: "Governador", estado: "SP", sortOrder: "asc" }),
      "/rankings/gastos-parlamentares?cargo=Governador&uf=SP&ordem=asc"
    )
  })

  it("aggregates numeric table rows by candidato_id and preserves unmatched candidates as null", async () => {
    const { buildAggregateRankingEntries } = await import("../src/lib/rankings")

    const entries = buildAggregateRankingEntries({
      candidatos: [
        {
          id: "1",
          nome_urna: "Carlos",
          slug: "carlos",
          partido_sigla: "PT",
          cargo_disputado: "Presidente",
          estado: null,
          foto_url: null,
        },
        {
          id: "2",
          nome_urna: "Ana",
          slug: "ana",
          partido_sigla: "PSOL",
          cargo_disputado: "Presidente",
          estado: null,
          foto_url: null,
        },
      ],
      rows: [
        { candidato_id: "1", metricValue: 100 },
        { candidato_id: "1", metricValue: 40 },
        { candidato_id: "2", metricValue: null },
      ],
    })

    assert.deepEqual(entries, [
      {
        candidato: {
          id: "1",
          nome_urna: "Carlos",
          slug: "carlos",
          partido_sigla: "PT",
          cargo_disputado: "Presidente",
          estado: null,
          foto_url: null,
        },
        metricValue: 140,
      },
      {
        candidato: {
          id: "2",
          nome_urna: "Ana",
          slug: "ana",
          partido_sigla: "PSOL",
          cargo_disputado: "Presidente",
          estado: null,
          foto_url: null,
        },
        metricValue: null,
      },
    ])
  })

  it("builds ranking entries from comparador fields before canonical sorting", async () => {
    const { buildFieldRankingEntries, sortRankingEntries } = await import("../src/lib/rankings")

    const entries = sortRankingEntries(
      buildFieldRankingEntries({
        candidatos: [
          {
            id: "1",
            nome_urna: "Carlos",
            slug: "carlos",
            partido_sigla: "PT",
            cargo_disputado: "Presidente",
            estado: null,
            foto_url: null,
            mudancas_partido: 2,
            patrimonio_declarado: 500,
          },
          {
            id: "2",
            nome_urna: "Ana",
            slug: "ana",
            partido_sigla: "PSOL",
            cargo_disputado: "Presidente",
            estado: null,
            foto_url: null,
            mudancas_partido: 6,
            patrimonio_declarado: null,
          },
        ],
        sourceField: "mudancas_partido",
      })
    )

    assert.deepEqual(entries, [
      {
        candidato: {
          id: "2",
          nome_urna: "Ana",
          slug: "ana",
          partido_sigla: "PSOL",
          cargo_disputado: "Presidente",
          estado: null,
          foto_url: null,
        },
        metricValue: 6,
      },
      {
        candidato: {
          id: "1",
          nome_urna: "Carlos",
          slug: "carlos",
          partido_sigla: "PT",
          cargo_disputado: "Presidente",
          estado: null,
          foto_url: null,
        },
        metricValue: 2,
      },
    ])
  })

  it("formats ranking metric values consistently for currency, count and null", async () => {
    const { formatRankingMetricValue } = await import("../src/lib/rankings")

    assert.equal(formatRankingMetricValue(1250000, "currency"), "R$ 1.250.000")
    assert.equal(formatRankingMetricValue(12, "count"), "12")
    assert.equal(formatRankingMetricValue(null, "count"), "--")
  })
})
