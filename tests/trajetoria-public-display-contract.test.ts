import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { normalizeHistoricoPoliticoForDisplay } from "@/lib/historico-dedupe"
import {
  formatHistoricoCargoTituloPublico,
  formatHistoricoPeriodoDisplay,
} from "@/lib/historico-display"
import { countPartySwitches } from "@/lib/party-switches"
import { getCurrentPublicYear } from "@/lib/timeline-utils"
import type { HistoricoPolitico, MudancaPartido } from "@/lib/types"
import {
  buildPublicHistoricoPoliticoDisplayListFromRaw,
  mudancasPartidoLinhasPublicas,
  prepareHistoricoPoliticoPublicDisplayList,
  profileTrajetoriaTabBadgeCount,
} from "@/lib/trajetoria-public-display"

function hp(partial: Partial<HistoricoPolitico> & Pick<HistoricoPolitico, "id">): HistoricoPolitico {
  return {
    candidato_id: "c1",
    cargo: partial.cargo ?? "Deputado Federal",
    cargo_canonico: partial.cargo_canonico ?? "Deputado Federal",
    tipo_evento: partial.tipo_evento ?? "mandato",
    periodo_inicio: partial.periodo_inicio ?? 2020,
    periodo_fim: partial.periodo_fim ?? null,
    partido: partial.partido ?? "PT",
    estado: partial.estado ?? "SP",
    observacoes: partial.observacoes ?? null,
    ...partial,
  } as HistoricoPolitico
}

describe("trajetoria-public-display — ordenação overview ↔ aba", () => {
  it("pina a candidatura do pleito corrente acima de mandato iniciado no mesmo ano", () => {
    const currentYear = getCurrentPublicYear()
    const rows: HistoricoPolitico[] = [
      hp({
        id: "mandato-mailza",
        cargo: "Governadora",
        cargo_canonico: "Governador",
        tipo_evento: "mandato",
        periodo_inicio: currentYear,
        periodo_fim: null,
      }),
      hp({
        id: "candidatura-mailza",
        cargo: "GOVERNADOR",
        cargo_canonico: "Governador",
        tipo_evento: "candidatura",
        periodo_inicio: currentYear,
        periodo_fim: currentYear,
      }),
    ]

    assert.deepEqual(
      prepareHistoricoPoliticoPublicDisplayList(rows).map((row) => row.id),
      ["candidatura-mailza", "mandato-mailza"],
    )
  })

  it("preserva a ordem-base entre múltiplas candidaturas correntes e no restante", () => {
    const currentYear = getCurrentPublicYear()
    const rows: HistoricoPolitico[] = [
      hp({ id: "mandato-corrente", tipo_evento: "mandato", periodo_inicio: currentYear }),
      hp({ id: "candidatura-b", tipo_evento: "candidatura", periodo_inicio: currentYear }),
      hp({ id: "mandato-anterior", tipo_evento: "mandato", periodo_inicio: currentYear - 4 }),
      hp({ id: "candidatura-a", tipo_evento: "candidatura", periodo_inicio: currentYear }),
    ]

    assert.deepEqual(
      prepareHistoricoPoliticoPublicDisplayList(rows).map((row) => row.id),
      ["candidatura-b", "candidatura-a", "mandato-corrente", "mandato-anterior"],
    )
  })

  it("prepareHistoricoPoliticoPublicDisplayList coincide com o sort inline legado", () => {
    const rows: HistoricoPolitico[] = [
      hp({ id: "a", periodo_inicio: 2010 }),
      hp({ id: "b", periodo_inicio: 2022 }),
      hp({ id: "c", periodo_inicio: 2002 }),
    ]
    const expected = [...rows].sort((a, b) => (b.periodo_inicio ?? 0) - (a.periodo_inicio ?? 0))
    const got = prepareHistoricoPoliticoPublicDisplayList(rows)
    assert.deepEqual(
      got.map((r) => r.id),
      expected.map((r) => r.id),
    )
  })

  it("buildPublicHistoricoPoliticoDisplayListFromRaw aplica dedupe + ordenação (convergência pipeline)", () => {
    const raw: HistoricoPolitico[] = [
      hp({
        id: "dup-a",
        cargo: "Presidente",
        cargo_canonico: "Presidente",
        periodo_inicio: 2002,
        periodo_fim: null,
        observacoes: "ELEITO (TSE)",
      }),
      hp({
        id: "dup-b",
        cargo: "Presidente",
        cargo_canonico: "Presidente",
        periodo_inicio: 2006,
        periodo_fim: null,
        observacoes: "ELEITO (TSE)",
      }),
    ]
    const normalized = normalizeHistoricoPoliticoForDisplay(raw)
    const fromHelper = buildPublicHistoricoPoliticoDisplayListFromRaw(raw)
    assert.deepEqual(
      fromHelper.map((r) => r.id),
      prepareHistoricoPoliticoPublicDisplayList(normalized).map((r) => r.id),
    )
  })
})

describe("trajetoria-public-display — linhas vs trocas efetivas (ADR-T8)", () => {
  it("mudancasPartidoLinhasPublicas === length; cards usam countPartySwitches", () => {
    const mudancas = [
      {
        id: "1",
        ano: 2007,
        partido_anterior: "PFL",
        partido_novo: "DEM",
        data_mudanca: null,
        contexto: "",
      },
    ] as MudancaPartido[]
    assert.equal(mudancasPartidoLinhasPublicas(mudancas), 1)
    assert.equal(countPartySwitches(mudancas), 0)
  })

  it("profileTrajetoriaTabBadgeCount soma histórico + mudanças (badge do separador)", () => {
    const h = [hp({ id: "h1", periodo_inicio: 2020 })]
    const m = [{ id: "m1", ano: 2022, partido_anterior: "PT", partido_novo: "PSOL", data_mudanca: null, contexto: "" }] as MudancaPartido[]
    assert.equal(profileTrajetoriaTabBadgeCount(h, m), 2)
  })
})

describe("trajetoria-public-display — candidatura e períodos (§7.2–7.3)", () => {
  it("formatHistoricoCargoTituloPublico prefixa candidatura", () => {
    const row = hp({
      id: "cand",
      cargo: "Governador",
      tipo_evento: "candidatura",
      periodo_inicio: 2022,
      periodo_fim: 2022,
      observacoes: "Candidatura: NÃO ELEITO (TSE 2022)",
    })
    assert.equal(formatHistoricoCargoTituloPublico(row), "Candidatura: Governador")
  })

  it("dois mandatos presidenciais fechados: períodos reais por mandato (após split dedupe)", () => {
    const raw: HistoricoPolitico[] = [
      hp({
        id: "p1",
        cargo: "Presidente",
        cargo_canonico: "Presidente",
        periodo_inicio: 2002,
        periodo_fim: null,
        observacoes: "ELEITO (TSE)",
      }),
      hp({
        id: "p2",
        cargo: "Presidente",
        cargo_canonico: "Presidente",
        periodo_inicio: 2022,
        periodo_fim: null,
        observacoes: "ELEITO (TSE)",
      }),
    ]
    const display = prepareHistoricoPoliticoPublicDisplayList(normalizeHistoricoPoliticoForDisplay(raw))
    const byStart = new Map(display.map((r) => [r.periodo_inicio, r]))
    const y2002 = byStart.get(2002)
    const y2006 = byStart.get(2006)
    assert.ok(y2002 && y2006, "splitBrasilPresidenteTwoOpenLongGap deve criar 2006")
    assert.equal(formatHistoricoPeriodoDisplay(y2002, display), "2002 - 2006")
    assert.equal(formatHistoricoPeriodoDisplay(y2006, display), "2006 - 2010")
  })

  it("isHistoricoOpenStale: período inferido para row aberta obsoleta", () => {
    const all: HistoricoPolitico[] = [
      hp({
        id: "open-old",
        cargo: "Senador",
        cargo_canonico: "Senador",
        periodo_inicio: 2002,
        periodo_fim: null,
        partido: "PT",
      }),
      hp({
        id: "open-new",
        cargo: "Senador",
        cargo_canonico: "Senador",
        periodo_inicio: 2011,
        periodo_fim: null,
        partido: "PT",
      }),
    ]
    const ordered = prepareHistoricoPoliticoPublicDisplayList(all)
    const old = ordered.find((r) => r.id === "open-old")!
    assert.match(formatHistoricoPeriodoDisplay(old, ordered), /2002 - 2010/)
  })
})
