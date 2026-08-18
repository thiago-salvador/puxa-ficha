import assert from "node:assert"
import { describe, it } from "node:test"
import {
  formatHistoricoPeriodoDisplay,
  isHistoricoOpenStale,
} from "../src/lib/historico-display"
import { getCurrentPublicYear } from "../src/lib/timeline-utils"
import { prepareHistoricoPoliticoPublicDisplayList } from "../src/lib/trajetoria-public-display"
import type { HistoricoPolitico } from "../src/lib/types"

function hp(partial: Partial<HistoricoPolitico> & Pick<HistoricoPolitico, "id">): HistoricoPolitico {
  return {
    candidato_id: "c1",
    cargo: "Presidente da República",
    periodo_inicio: 2022,
    periodo_fim: null,
    partido: "PT",
    estado: "BR",
    eleito_por: "",
    observacoes: null,
    cargo_canonico: null,
    ...partial,
  }
}

describe("historico-display", () => {
  it("prepareHistoricoPoliticoPublicDisplayList fixa a candidatura corrente acima do mandato em exercício", () => {
    const currentYear = getCurrentPublicYear()
    const all = [
      hp({
        id: "mandato-mailza",
        cargo: "Governadora",
        tipo_evento: "mandato",
        periodo_inicio: currentYear,
        periodo_fim: null,
      }),
      hp({
        id: "candidatura-mailza",
        cargo: "GOVERNADOR",
        tipo_evento: "candidatura",
        periodo_inicio: currentYear,
        periodo_fim: currentYear,
      }),
    ]

    assert.deepEqual(
      prepareHistoricoPoliticoPublicDisplayList(all).map((item) => item.id),
      ["candidatura-mailza", "mandato-mailza"],
    )
  })

  it("isHistoricoOpenStale: segundo mandato aberto do mesmo cargo canónico", () => {
    const all = [
      hp({ id: "a", cargo: "Presidente da República", periodo_inicio: 2022, periodo_fim: null }),
      hp({ id: "b", cargo: "Presidente da República", periodo_inicio: 2002, periodo_fim: null }),
    ]
    assert.equal(isHistoricoOpenStale(all[0]!, all), false)
    assert.equal(isHistoricoOpenStale(all[1]!, all), true)
  })

  it("isHistoricoOpenStale: mesmo cargo com textos diferentes canonicalizam para Presidente", () => {
    const all = [
      hp({ id: "a", cargo: "Presidente da República", periodo_inicio: 2022, periodo_fim: null }),
      hp({ id: "b", cargo: "Presidente", periodo_inicio: 1998, periodo_fim: 1998 }),
      hp({ id: "c", cargo: "Presidente da República", periodo_inicio: 2002, periodo_fim: null }),
    ]
    assert.equal(isHistoricoOpenStale(all[2]!, all), true)
  })

  it("formatHistoricoPeriodoDisplay: só o maior inicio aberto mostra atual", () => {
    const all = [
      hp({ id: "a", periodo_inicio: 2022, periodo_fim: null }),
      hp({ id: "b", periodo_inicio: 2002, periodo_fim: null }),
    ]
    assert.equal(formatHistoricoPeriodoDisplay(all[0]!, all), "2022 - atual")
    assert.equal(formatHistoricoPeriodoDisplay(all[1]!, all), "2002 - mandato encerrado")
  })

  it("formatHistoricoPeriodoDisplay: candidatura 2026 sem eleição ocorrida não vira Não Eleito", () => {
    const all = [
      hp({
        id: "a",
        cargo: "Presidente",
        tipo_evento: "candidatura",
        periodo_inicio: 2026,
        periodo_fim: 2026,
        observacoes:
          "candidatura: pré-candidatura à Presidência em 2026; sem registro deferido no TSE na data de curadoria",
      }),
    ]

    assert.equal(formatHistoricoPeriodoDisplay(all[0]!, all), "Candidato")
  })

  it("formatHistoricoPeriodoDisplay: candidatura futura registrada mostra Candidato", () => {
    const all = [
      hp({
        id: "a",
        cargo: "Presidente",
        tipo_evento: "candidatura",
        periodo_inicio: 2026,
        periodo_fim: 2026,
        observacoes: "candidatura: registrada no TSE 2026; aguardando eleição",
      }),
    ]

    assert.equal(formatHistoricoPeriodoDisplay(all[0]!, all), "Candidato")
  })

  it("formatHistoricoPeriodoDisplay: candidatura TSE passada mantém Não Eleito", () => {
    const all = [
      hp({
        id: "a",
        cargo: "Deputado Federal",
        tipo_evento: "candidatura",
        periodo_inicio: 2022,
        periodo_fim: 2022,
        observacoes: "Candidatura: NÃO ELEITO (TSE 2022)",
      }),
    ]

    assert.equal(formatHistoricoPeriodoDisplay(all[0]!, all), "2022 - Não Eleito")
  })

  it("formatHistoricoPeriodoDisplay: mandato obsoleto infere fim pelo próximo Presidente na lista", () => {
    const all = [
      hp({ id: "a", periodo_inicio: 2022, periodo_fim: null }),
      hp({ id: "b", periodo_inicio: 2002, periodo_fim: null }),
      hp({
        id: "c",
        periodo_inicio: 2011,
        periodo_fim: 2016,
        observacoes: "TSE",
      }),
    ]
    assert.equal(formatHistoricoPeriodoDisplay(all[1]!, all), "2002 - 2010")
  })

  it("formatHistoricoPeriodoDisplay: linha aberta obsoleta usa periodo_fim de duplicata mesmo início", () => {
    const all = [
      hp({ id: "a", periodo_inicio: 2022, periodo_fim: null }),
      hp({ id: "b", periodo_inicio: 2002, periodo_fim: null }),
      hp({ id: "c", periodo_inicio: 2002, periodo_fim: 2010 }),
    ]
    assert.equal(formatHistoricoPeriodoDisplay(all[1]!, all), "2002 - 2010")
  })
})
