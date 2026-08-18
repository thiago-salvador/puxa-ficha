import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildPartyJourney,
  countPartySwitches,
  formatPartyTransitionLabel,
  hasSameYearPartyReversal,
  normalizePartyTimelineForDisplay,
} from "../src/lib/party-switches"
import type { MudancaPartido } from "../src/lib/types"

function row(partial: Partial<MudancaPartido> & Pick<MudancaPartido, "id" | "ano">): MudancaPartido {
  return {
    candidato_id: "c1",
    partido_anterior: "",
    partido_novo: "",
    data_mudanca: null,
    contexto: null,
    ...partial,
  }
}

describe("party-switches", () => {
  it("countPartySwitches returns 0 for empty list", () => {
    assert.equal(countPartySwitches([]), 0)
  })

  it("excludes initial affiliation anchor from switch count", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "1",
        ano: 1980,
        partido_anterior: "Sem partido",
        partido_novo: "PT",
        contexto: "Filiação inicial",
      }),
    ]
    assert.equal(countPartySwitches(mudancas), 0)
    assert.match(buildPartyJourney(mudancas, "PT"), /PT desde 1980/)
  })

  it("counts a real switch after anchor", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "1",
        ano: 1980,
        partido_anterior: "Sem partido",
        partido_novo: "PT",
      }),
      row({
        id: "2",
        ano: 2000,
        partido_anterior: "PT",
        partido_novo: "PSOL",
      }),
    ]
    assert.equal(countPartySwitches(mudancas), 1)
  })

  it("counts both rows when first row is not an anchor", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "1",
        ano: 1990,
        partido_anterior: "PMDB",
        partido_novo: "PT",
      }),
      row({
        id: "2",
        ano: 2000,
        partido_anterior: "PT",
        partido_novo: "PSOL",
      }),
    ]
    assert.equal(countPartySwitches(mudancas), 2)
  })

  it("does not count no-op curated current party rows as switches", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "1",
        ano: 2026,
        partido_anterior: "UP",
        partido_novo: "UP",
        data_mudanca: "2026-04-01",
        contexto: "filiação atual curada (curadoria presidenciaveis)",
      }),
    ]

    assert.equal(countPartySwitches(mudancas), 0)
    assert.equal(buildPartyJourney(mudancas, "UP"), "UP")
    assert.equal(formatPartyTransitionLabel(mudancas[0]), "Filiação: UP")
    assert.deepEqual(normalizePartyTimelineForDisplay(mudancas), [])
  })

  it("normalizes known party aliases for public display", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "1",
        ano: 2017,
        partido_anterior: "PCDOB",
        partido_novo: "PSB",
      }),
      row({
        id: "2",
        ano: 2019,
        partido_anterior: "PSB",
        partido_novo: "SD",
      }),
    ]

    assert.equal(formatPartyTransitionLabel(mudancas[0]), "PCdoB → PSB")
    assert.equal(buildPartyJourney(mudancas, "DC"), "PCdoB → PSB → SOLIDARIEDADE → DC")
  })

  it("mantém Aldo Rebelo consistente quando PDT entra no meio da timeline", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "1",
        ano: 2017,
        partido_anterior: "PCDOB",
        partido_novo: "PSB",
        contexto: "Saiu do PCdoB após 30 anos",
      }),
      row({
        id: "2",
        ano: 2019,
        partido_anterior: "PSB",
        partido_novo: "SD",
      }),
      row({
        id: "3",
        ano: 2022,
        partido_anterior: "Solidariedade",
        partido_novo: "PDT",
        contexto: "Mudança observada entre eleições TSE (2022)",
      }),
      row({
        id: "4",
        ano: 2025,
        partido_anterior: "Solidariedade",
        partido_novo: "DC",
        contexto: "Filiou-se ao DC para disputar presidência",
      }),
    ]

    const normalized = normalizePartyTimelineForDisplay(mudancas)
    assert.equal(normalized[2].partido_anterior, "SOLIDARIEDADE")
    assert.equal(normalized[2].partido_novo, "PDT")
    assert.equal(normalized[3].partido_anterior, "PDT")
    assert.equal(formatPartyTransitionLabel(normalized[3]), "PDT → DC")
    assert.equal(buildPartyJourney(normalized, "DC"), "PCdoB → PSB → SOLIDARIEDADE → PDT → DC")
  })

  it("não reescreve ingenuamente uma linha quando há renomeação histórica do mesmo partido", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "1",
        ano: 1996,
        data_mudanca: "1996-01-01",
        partido_anterior: "PSDB",
        partido_novo: "CIDADANIA",
        contexto: "Wikidata P102",
      }),
      row({
        id: "2",
        ano: 1997,
        partido_anterior: "PSDB",
        partido_novo: "PPS",
        contexto: "Rompeu com FHC",
      }),
    ]

    const normalized = normalizePartyTimelineForDisplay(mudancas)
    assert.equal(normalized.length, 1)
    assert.equal(normalized[0].partido_anterior, "PSDB")
    assert.equal(formatPartyTransitionLabel(normalized[0]), "PSDB → PPS")
  })

  it("colapsa duplicatas equivalentes e observações TSE redundantes no caso do Ciro", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "1980",
        ano: 1980,
        data_mudanca: "1980-01-01",
        partido_anterior: "Sem partido",
        partido_novo: "PARTIDO DEMOCRÁTICO SOCIAL",
        contexto: "Wikidata P102 (filiação inicial conhecida)",
      }),
      row({
        id: "1983",
        ano: 1983,
        data_mudanca: "1983-01-01",
        partido_anterior: "PARTIDO DEMOCRÁTICO SOCIAL",
        partido_novo: "MDB",
        contexto: "Wikidata P102",
      }),
      row({
        id: "1988",
        ano: 1988,
        data_mudanca: "1988-01-01",
        partido_anterior: "MDB",
        partido_novo: "PSDB",
        contexto: "Wikidata P102",
      }),
      row({
        id: "1990",
        ano: 1990,
        partido_anterior: "PMDB",
        partido_novo: "PSDB",
        contexto: "Saiu do PMDB para disputar o governo do Ceará",
      }),
      row({
        id: "1996",
        ano: 1996,
        data_mudanca: "1996-01-01",
        partido_anterior: "PSDB",
        partido_novo: "CIDADANIA",
        contexto: "Wikidata P102",
      }),
      row({
        id: "1997",
        ano: 1997,
        partido_anterior: "PSDB",
        partido_novo: "PPS",
        contexto: "Rompeu com FHC",
      }),
      row({
        id: "2005",
        ano: 2005,
        partido_anterior: "PPS",
        partido_novo: "PSB",
        contexto: null,
      }),
      row({
        id: "2006",
        ano: 2006,
        partido_anterior: "PPS",
        partido_novo: "PSB",
        contexto: "Mudança observada entre eleições TSE (2006)",
      }),
      row({
        id: "2013-curated",
        ano: 2013,
        partido_anterior: "PSB",
        partido_novo: "PROS",
        contexto: null,
      }),
      row({
        id: "2013-wikidata",
        ano: 2013,
        data_mudanca: "2013-01-01",
        partido_anterior: "PSB",
        partido_novo: "PARTIDO REPUBLICANO DA ORDEM SOCIAL",
        contexto: "Wikidata P102",
      }),
      row({
        id: "2015",
        ano: 2015,
        partido_anterior: "PROS",
        partido_novo: "PDT",
        contexto: "Aliança com Brizola para projeto nacional",
      }),
      row({
        id: "2018",
        ano: 2018,
        partido_anterior: "PSB",
        partido_novo: "PDT",
        contexto: "Mudança observada entre eleições TSE (2018)",
      }),
    ]

    const normalized = normalizePartyTimelineForDisplay(mudancas)
    const relevantRows = normalized
      .filter((item) => item.ano >= 1988 && item.ano <= 2018)
      .map((item) => ({
        ano: item.ano,
        label: formatPartyTransitionLabel(item),
      }))

    assert.deepEqual(relevantRows, [
      { ano: 1990, label: "PMDB → PSDB" },
      { ano: 1997, label: "PSDB → PPS" },
      { ano: 2005, label: "PPS → PSB" },
      { ano: 2013, label: "PSB → PROS" },
      { ano: 2015, label: "PROS → PDT" },
    ])
  })

  it("exibe siglas históricas corretas para partidos renomeados no passado", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "1980",
        ano: 1980,
        data_mudanca: "1980-01-01",
        partido_anterior: "Sem partido",
        partido_novo: "PARTIDO DEMOCRÁTICO SOCIAL",
        contexto: "Wikidata P102 (filiação inicial conhecida)",
      }),
      row({
        id: "1983",
        ano: 1983,
        data_mudanca: "1983-01-01",
        partido_anterior: "PARTIDO DEMOCRÁTICO SOCIAL",
        partido_novo: "MDB",
        contexto: "Wikidata P102",
      }),
      row({
        id: "1996",
        ano: 1996,
        data_mudanca: "1996-01-01",
        partido_anterior: "PSDB",
        partido_novo: "CIDADANIA",
        contexto: "Wikidata P102",
      }),
      row({
        id: "2018",
        ano: 2018,
        partido_anterior: "PRB",
        partido_novo: "REPUBLICANOS",
        contexto: "Mudança observada entre eleições TSE (2018)",
      }),
    ]

    assert.equal(formatPartyTransitionLabel(mudancas[0]), "Partido confirmado: PDS")
    assert.equal(formatPartyTransitionLabel(mudancas[1]), "PDS → PMDB")
    assert.equal(formatPartyTransitionLabel(mudancas[2]), "PSDB → PPS")
    assert.equal(formatPartyTransitionLabel(mudancas[3]), "Filiação: PRB")
    assert.equal(countPartySwitches([mudancas[3]]), 0)
    assert.equal(buildPartyJourney([mudancas[3]], "REPUBLICANOS"), "PRB → REPUBLICANOS")
    assert.equal(normalizePartyTimelineForDisplay([mudancas[3]]).length, 1, "Historical renames are now kept in timeline for transparency")
  })

  it("deixa de fora do reencadeamento automático uma sequência TSE ambígua no mesmo ano", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "1",
        ano: 2020,
        partido_anterior: "PRB",
        partido_novo: "PODE",
        contexto: "Mudança observada entre eleições TSE (2020)",
      }),
      row({
        id: "2",
        ano: 2022,
        partido_anterior: "PV",
        partido_novo: "PL",
        contexto: "Mudança observada entre eleições TSE (2022)",
      }),
      row({
        id: "3",
        ano: 2022,
        partido_anterior: "PODE",
        partido_novo: "PV",
        contexto: "Mudança observada entre eleições TSE (2022)",
      }),
    ]

    const normalized = normalizePartyTimelineForDisplay(mudancas)
    assert.equal(normalized[2].partido_anterior, "PODE")
    assert.equal(formatPartyTransitionLabel(normalized[2]), "PODE → PV")
  })

  it("não deixa um cluster ambíguo anterior contaminar um elo posterior da jornada pública", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "2018",
        ano: 2018,
        partido_anterior: "PSDB",
        partido_novo: "PRB",
        contexto: "Mudança observada entre eleições TSE (2018)",
      }),
      row({
        id: "2020-a",
        ano: 2020,
        partido_anterior: "PSB",
        partido_novo: "PP",
        contexto: "Mudança observada entre eleições TSE (2020)",
      }),
      row({
        id: "2020-b",
        ano: 2020,
        partido_anterior: "PRB",
        partido_novo: "PSB",
        contexto: "Mudança observada entre eleições TSE (2020)",
      }),
      row({
        id: "2022",
        ano: 2022,
        partido_anterior: "PP",
        partido_novo: "REPUBLICANOS",
        contexto: "Mudança observada entre eleições TSE (2022)",
      }),
    ]

    const normalized = normalizePartyTimelineForDisplay(mudancas)
    assert.equal(normalized[3].partido_anterior, "PP")
    assert.equal(formatPartyTransitionLabel(normalized[3]), "PP → REPUBLICANOS")
  })

  it("keeps historical rename (PPB→PP) in normalized timeline with rename label", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "2006",
        ano: 2006,
        partido_anterior: "PPB",
        partido_novo: "PP",
        contexto: "Renomeação do partido",
      }),
      row({
        id: "2016",
        ano: 2016,
        partido_anterior: "PP",
        partido_novo: "PSC",
      }),
      row({
        id: "2018",
        ano: 2018,
        partido_anterior: "PSC",
        partido_novo: "PSL",
      }),
      row({
        id: "2021",
        ano: 2021,
        partido_anterior: "PSL",
        partido_novo: "PL",
      }),
    ]
    const normalized = normalizePartyTimelineForDisplay(mudancas)
    assert.ok(normalized.length >= 4, `Expected at least 4 rows, got ${normalized.length}`)
    const renameRow = normalized.find(
      (r) => r.partido_anterior === "PPB" && r.partido_novo === "PP"
    )
    assert.ok(renameRow, "PPB→PP rename should be kept in timeline")
    assert.match(
      formatPartyTransitionLabel(renameRow),
      /renomeação/,
      "Rename label should include (renomeação)"
    )
  })

  it("does not count historical rename as a switch", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "2006",
        ano: 2006,
        partido_anterior: "PPB",
        partido_novo: "PP",
      }),
      row({
        id: "2016",
        ano: 2016,
        partido_anterior: "PP",
        partido_novo: "PSC",
      }),
    ]
    assert.equal(countPartySwitches(mudancas), 1, "PPB→PP is a rename, only PP→PSC is a switch")
  })

  it("includes full chain in party journey when historical rename present", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "2006",
        ano: 2006,
        partido_anterior: "PPB",
        partido_novo: "PP",
      }),
      row({
        id: "2016",
        ano: 2016,
        partido_anterior: "PP",
        partido_novo: "PSC",
      }),
      row({
        id: "2018",
        ano: 2018,
        partido_anterior: "PSC",
        partido_novo: "PSL",
      }),
      row({
        id: "2021",
        ano: 2021,
        partido_anterior: "PSL",
        partido_novo: "PL",
      }),
    ]
    const journey = buildPartyJourney(mudancas, "PL")
    assert.match(journey, /PPB/, "Journey should start with PPB")
    assert.match(journey, /PP/, "Journey should include PP")
    assert.match(journey, /PSC/, "Journey should include PSC")
    assert.match(journey, /PL/, "Journey should end with PL")
  })

  describe("hasSameYearPartyReversal", () => {
    it("returns false for empty list", () => {
      assert.equal(hasSameYearPartyReversal([]), false)
    })

    it("returns false for single transition", () => {
      const mudancas: MudancaPartido[] = [
        row({ id: "1", ano: 2010, partido_anterior: "PT", partido_novo: "PSDB" }),
      ]
      assert.equal(hasSameYearPartyReversal(mudancas), false)
    })

    it("returns false for transitions in different years", () => {
      const mudancas: MudancaPartido[] = [
        row({ id: "1", ano: 2010, partido_anterior: "PT", partido_novo: "PSDB" }),
        row({ id: "2", ano: 2014, partido_anterior: "PSDB", partido_novo: "PT" }),
      ]
      assert.equal(hasSameYearPartyReversal(mudancas), false)
    })

    it("detects A→B and B→A in the same year (joao-rodrigues 2010 PTC↔DEM pattern)", () => {
      const mudancas: MudancaPartido[] = [
        row({ id: "1", ano: 2010, partido_anterior: "PTC", partido_novo: "DEM" }),
        row({ id: "2", ano: 2010, partido_anterior: "DEM", partido_novo: "PTC" }),
      ]
      assert.equal(hasSameYearPartyReversal(mudancas), true)
    })

    it("detects reversal even when other transitions exist in the same year", () => {
      const mudancas: MudancaPartido[] = [
        row({ id: "a", ano: 2008, partido_anterior: "PR", partido_novo: "PTC" }),
        row({ id: "b", ano: 2008, partido_anterior: "DEM", partido_novo: "PR" }),
        row({ id: "c", ano: 2008, partido_anterior: "PTC", partido_novo: "PR" }),
      ]
      assert.equal(hasSameYearPartyReversal(mudancas), true)
    })

    it("ignores same-party self-transitions in pair check", () => {
      const mudancas: MudancaPartido[] = [
        row({ id: "1", ano: 2010, partido_anterior: "PT", partido_novo: "PT" }),
        row({ id: "2", ano: 2010, partido_anterior: "PT", partido_novo: "PT" }),
      ]
      assert.equal(hasSameYearPartyReversal(mudancas), false)
    })

    it("treats historical renames as equivalent (PFL/DEM in same year is not a reversal)", () => {
      const mudancas: MudancaPartido[] = [
        row({ id: "1", ano: 2007, partido_anterior: "PFL", partido_novo: "DEM" }),
        row({ id: "2", ano: 2007, partido_anterior: "DEM", partido_novo: "PFL" }),
      ]
      // PFL and DEM are the same canonical party; this is noise, not a reversal
      assert.equal(hasSameYearPartyReversal(mudancas), false)
    })
  })
})
