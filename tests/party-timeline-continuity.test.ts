import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  analyzePartyTimelineContinuity,
  hasExplicitPartyTimelineGapNote,
} from "../src/lib/party-timeline-continuity"
import type { MudancaPartido } from "../src/lib/types"

function row(
  partial: Pick<MudancaPartido, "partido_anterior" | "partido_novo" | "ano"> &
    Partial<Omit<MudancaPartido, "partido_anterior" | "partido_novo" | "ano">>,
): MudancaPartido {
  return {
    id: partial.id ?? `mp-${partial.ano}-${partial.partido_anterior}-${partial.partido_novo}`,
    candidato_id: partial.candidato_id ?? "c1",
    partido_anterior: partial.partido_anterior,
    partido_novo: partial.partido_novo,
    data_mudanca: partial.data_mudanca ?? null,
    ano: partial.ano,
    contexto: partial.contexto ?? null,
  }
}

describe("hasExplicitPartyTimelineGapNote", () => {
  it("detecta lacuna explícita", () => {
    assert.equal(hasExplicitPartyTimelineGapNote("Editorial: lacuna documentada entre filiações."), true)
  })

  it("nao dispara em contexto neutro", () => {
    assert.equal(hasExplicitPartyTimelineGapNote("Mudança observada entre eleições TSE (2018)"), false)
  })
})

describe("analyzePartyTimelineContinuity", () => {
  it("aceita A -> B seguido de B -> C", () => {
    const mudancas = [
      row({ partido_anterior: "Sem partido", partido_novo: "PT", ano: 2000, id: "a1" }),
      row({ partido_anterior: "PT", partido_novo: "PSOL", ano: 2010, id: "a2" }),
      row({ partido_anterior: "PSOL", partido_novo: "PSB", ano: 2020, id: "a3" }),
    ]
    const r = analyzePartyTimelineContinuity(mudancas)
    assert.equal(r.ok, true)
    assert.equal(r.brokenLinks.length, 0)
  })

  it("aceita A -> B seguido de B -> Sem partido", () => {
    const mudancas = [
      row({ partido_anterior: "Sem partido", partido_novo: "PT", ano: 2000, id: "b1" }),
      row({ partido_anterior: "PT", partido_novo: "Sem partido", ano: 2015, id: "b2" }),
    ]
    const r = analyzePartyTimelineContinuity(mudancas)
    assert.equal(r.ok, true)
    assert.equal(r.brokenLinks.length, 0)
  })

  it("aceita cadeia onde a row seguinte recomeça de Historico anterior nao determinado", () => {
    const mudancas = [
      row({ partido_anterior: "Sem partido", partido_novo: "PT", ano: 2000, id: "c1" }),
      row({ partido_anterior: "PT", partido_novo: "PSOL", ano: 2010, id: "c2" }),
      row({
        partido_anterior: "Historico anterior nao determinado",
        partido_novo: "PL",
        ano: 2026,
        id: "c3",
      }),
    ]
    const r = analyzePartyTimelineContinuity(mudancas)
    assert.equal(r.ok, true)
    assert.equal(r.brokenLinks.length, 0)
  })

  it("marca A -> B seguido de X -> Y como quebra quando X nao encaixa em B", () => {
    const mudancas = [
      row({ partido_anterior: "Sem partido", partido_novo: "PT", ano: 2000, id: "d1" }),
      row({ partido_anterior: "PT", partido_novo: "PSOL", ano: 2010, id: "d2" }),
      row({ partido_anterior: "PSDB", partido_novo: "DEM", ano: 2015, id: "d3" }),
    ]
    const r = analyzePartyTimelineContinuity(mudancas)
    assert.equal(r.ok, false)
    assert.equal(r.brokenLinks.length, 1)
    assert.match(r.brokenLinks[0]!.message, /Quebra de continuidade/)
  })

  it("ignora adjacência quando há nota explícita de lacuna (fail-safe)", () => {
    const mudancas = [
      row({ partido_anterior: "Sem partido", partido_novo: "PT", ano: 2000, id: "e1" }),
      row({
        partido_anterior: "PSDB",
        partido_novo: "DEM",
        ano: 2010,
        id: "e2",
        contexto: "Curadoria: lacuna temporal entre filiações — nao encadeado automaticamente.",
      }),
    ]
    const r = analyzePartyTimelineContinuity(mudancas)
    assert.equal(r.skippedDueToGapNote, 1)
    assert.equal(r.brokenLinks.length, 0)
    assert.equal(r.ok, true)
  })

  it("aceita renomeação histórica na fronteira (PFL -> DEM seguido de DEM -> PSD)", () => {
    const mudancas = [
      row({ partido_anterior: "Sem partido", partido_novo: "PFL", ano: 1998, id: "f1" }),
      row({ partido_anterior: "PFL", partido_novo: "DEM", ano: 2007, id: "f2" }),
      row({ partido_anterior: "DEM", partido_novo: "PSD", ano: 2012, id: "f3" }),
    ]
    const r = analyzePartyTimelineContinuity(mudancas)
    assert.equal(r.ok, true)
    assert.equal(r.brokenLinks.length, 0)
  })

  it("nao marca quebra quando ancora->B e curadoria Y->B (mesmo destino, primeira row com ancora)", () => {
    const mudancas = [
      row({ partido_anterior: "PROS", partido_novo: "PDT", ano: 2015, id: "g1" }),
      row({ partido_anterior: "PDT", partido_novo: "Sem partido", ano: 2022, id: "g2" }),
      row({ partido_anterior: "Sem partido", partido_novo: "PSDB", ano: 2025, id: "g3" }),
      row({
        partido_anterior: "PDT",
        partido_novo: "PSDB",
        ano: 2026,
        id: "g4",
        contexto: "Filiação ao PSDB (curadoria; linha canónica PDT→PSDB).",
      }),
    ]
    const r = analyzePartyTimelineContinuity(mudancas)
    assert.equal(r.ok, true)
    assert.equal(r.brokenLinks.length, 0)
  })

  it("marca quebra quando PT->PSDB e MDB->PSDB (convergencia sem ancora na primeira row)", () => {
    const mudancas = [
      row({ partido_anterior: "Sem partido", partido_novo: "PT", ano: 2000, id: "h0" }),
      row({ partido_anterior: "PT", partido_novo: "PSDB", ano: 2024, id: "h1" }),
      row({ partido_anterior: "MDB", partido_novo: "PSDB", ano: 2025, id: "h2" }),
    ]
    const r = analyzePartyTimelineContinuity(mudancas)
    assert.equal(r.ok, false)
    assert.equal(r.brokenLinks.length, 1)
    assert.match(r.brokenLinks[0]!.message, /Quebra de continuidade/)
  })
})
