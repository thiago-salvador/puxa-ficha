import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { hasIncompletePartyTimeline } from "../src/lib/candidate-integrity"
import { resolvePartySuccession } from "../src/lib/party-succession"
import {
  countPartySwitches,
  formatPartyTransitionLabel,
  normalizePartyTimelineForDisplay,
  withCurrentRegistryPartyRow,
} from "../src/lib/party-switches"
import { partiesHistoricallyEquivalent } from "../src/lib/party-utils"
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

describe("sucessão de legenda (fusão, incorporação e renomeação)", () => {
  it("reconhece fusão quando a decisão do TSE cai dentro da janela observada", () => {
    assert.equal(resolvePartySuccession("DEM", "UNIÃO", { fromYear: 2018, toYear: 2026 })?.kind, "fusao")
    assert.equal(resolvePartySuccession("PSL", "UNIÃO", { fromYear: 2018, toYear: 2026 })?.kind, "fusao")
    assert.equal(resolvePartySuccession("PTB", "PRD", { fromYear: 2018, toYear: 2026 })?.kind, "fusao")
    assert.equal(resolvePartySuccession("PATRIOTA", "PRD", { fromYear: 2022, toYear: 2026 })?.kind, "fusao")
  })

  it("reconhece incorporação", () => {
    assert.equal(
      resolvePartySuccession("PROS", "SOLIDARIEDADE", { fromYear: 2020, toYear: 2026 })?.kind,
      "incorporacao",
    )
    assert.equal(resolvePartySuccession("PSC", "PODE", { fromYear: 2018, toYear: 2026 })?.kind, "incorporacao")
    assert.equal(resolvePartySuccession("PHS", "PODE", { fromYear: 2016, toYear: 2026 })?.kind, "incorporacao")
  })

  it("não colapsa partidos que apenas terminaram na mesma legenda", () => {
    // PSL e DEM viraram UNIÃO em 2022, mas até lá eram partidos distintos: quem
    // saiu de um para o outro em 2020 trocou de partido de verdade.
    assert.equal(resolvePartySuccession("PSL", "DEM", { fromYear: 2018, toYear: 2020 }), null)
    assert.equal(partiesHistoricallyEquivalent("PSL", "DEM"), false)
  })

  it("a data separa o PSD histórico do PSD de hoje", () => {
    // Incorporação do PSD histórico pelo PTB decidida em 20/02/2003.
    assert.equal(resolvePartySuccession("PSD", "PTB", { fromYear: 1998, toYear: 2006 })?.kind, "incorporacao")
    assert.equal(resolvePartySuccession("PSD", "PTB", { fromYear: 2014, toYear: 2022 }), null)
  })

  it("MISSÃO herdou o número do PTB mas é registro novo, não sucessão", () => {
    assert.equal(resolvePartySuccession("PTB", "MISSÃO", { fromYear: 2018, toYear: 2026 }), null)
  })

  it("renomeações que faltavam agora são a mesma legenda", () => {
    for (const [antes, depois] of [
      ["PSDC", "DC"],
      ["PTC", "AGIR"],
      ["PRN", "AGIR"],
      ["PMB", "DEMOCRATA"],
      ["PEN", "PATRIOTA"],
      ["PMR", "REPUBLICANOS"],
    ] as const) {
      assert.equal(partiesHistoricallyEquivalent(antes, depois), true, `${antes} ↔ ${depois}`)
    }
  })

  it("rotula a transição pelo que aconteceu e não conta como troca", () => {
    const fusao = row({ id: "1", ano: 2026, partido_anterior: "DEM", partido_novo: "UNIÃO" })
    assert.equal(formatPartyTransitionLabel(fusao), "DEM → UNIÃO (fusão)")

    const incorporacao = row({ id: "2", ano: 2026, partido_anterior: "PROS", partido_novo: "SOLIDARIEDADE" })
    assert.equal(formatPartyTransitionLabel(incorporacao), "PROS → SOLIDARIEDADE (incorporação)")

    assert.equal(
      countPartySwitches([
        row({ id: "3", ano: 2007, partido_anterior: "PFL", partido_novo: "DEM" }),
        row({ id: "4", ano: 2022, partido_anterior: "DEM", partido_novo: "UNIÃO" }),
        row({ id: "5", ano: 2026, partido_anterior: "UNIÃO", partido_novo: "PL" }),
      ]),
      1,
    )
  })

  it("sucessão documentada não acusa linha do tempo desatualizada", () => {
    const rows = [row({ id: "6", ano: 2018, partido_anterior: "PP", partido_novo: "DEM" })]
    assert.equal(hasIncompletePartyTimeline(rows, "UNIÃO", "UNIÃO"), false)
    assert.equal(hasIncompletePartyTimeline(rows, "PSD", "PSD"), true)
  })
})

describe("linha derivada do registro de candidatura", () => {
  it("fecha a linha do tempo no partido do registro corrente", () => {
    const rows = [row({ id: "7", ano: 2006, partido_anterior: "PPB", partido_novo: "PP" })]
    const comRegistro = normalizePartyTimelineForDisplay(
      withCurrentRegistryPartyRow(rows, { candidatoId: "c1", partidoAtual: "PSD" }),
    )

    const ultima = comRegistro.at(-1)
    assert.equal(ultima?.ano, 2026)
    assert.equal(ultima?.partido_anterior, "PP")
    assert.equal(ultima?.partido_novo, "PSD")
    // A data da troca não consta em fonte oficial: publicar uma seria invenção.
    assert.equal(ultima?.data_mudanca, null)
    assert.match(ultima?.contexto ?? "", /registro de candidatura/i)
    // PPB → PP é renomeação e não conta; a troca real para o PSD conta.
    assert.equal(countPartySwitches(comRegistro), 1)
  })

  it("não deriva linha quando o registro já é o partido da ponta", () => {
    const rows = [row({ id: "8", ano: 2022, partido_anterior: "PT", partido_novo: "PSB" })]
    assert.deepEqual(withCurrentRegistryPartyRow(rows, { candidatoId: "c1", partidoAtual: "PSB" }), rows)
  })

  it("não deriva linha por renomeação da mesma legenda", () => {
    const rows = [row({ id: "9", ano: 2016, partido_anterior: "PT", partido_novo: "PMDB" })]
    assert.deepEqual(withCurrentRegistryPartyRow(rows, { candidatoId: "c1", partidoAtual: "MDB" }), rows)
  })

  it("usa a trajetória quando não há nenhuma linha partidária", () => {
    const derivadas = withCurrentRegistryPartyRow([], {
      candidatoId: "c1",
      partidoAtual: "PL",
      ultimoPartidoHistorico: "PRTB",
    })
    assert.equal(derivadas.length, 1)
    assert.equal(derivadas[0]?.partido_anterior, "PRTB")
    assert.equal(derivadas[0]?.partido_novo, "PL")
  })

  it("materializa a sucessão de legenda extinta antes da linha de registro", () => {
    // PROS foi incorporado pelo SOLIDARIEDADE em 14/02/2023: em 2026 a pessoa não
    // podia estar "saindo do PROS", porque o PROS já não existia.
    const rows = [row({ id: "11", ano: 2022, partido_anterior: "PTB", partido_novo: "PROS" })]
    const derivadas = normalizePartyTimelineForDisplay(
      withCurrentRegistryPartyRow(rows, { candidatoId: "c1", partidoAtual: "AGIR" }),
    )

    const sucessao = derivadas.find((item) => item.ano === 2023)
    assert.equal(sucessao?.partido_anterior, "PROS")
    assert.equal(sucessao?.partido_novo, "SOLIDARIEDADE")
    assert.equal(sucessao?.data_mudanca, "2023-02-14")
    assert.match(sucessao?.contexto ?? "", /Sucessão de legenda decidida pelo TSE em 14\/02\/2023/)

    const registro = derivadas.at(-1)
    assert.equal(registro?.ano, 2026)
    assert.equal(registro?.partido_anterior, "SOLIDARIEDADE")
    assert.equal(registro?.partido_novo, "AGIR")
    // PTB → PROS e SOLIDARIEDADE → AGIR são trocas; a incorporação não é.
    assert.equal(countPartySwitches(derivadas), 2)
  })

  it("não duplica a linha derivada em chamadas repetidas", () => {
    const rows = [row({ id: "10", ano: 2022, partido_anterior: "PT", partido_novo: "PSB" })]
    const uma = withCurrentRegistryPartyRow(rows, { candidatoId: "c1", partidoAtual: "PDT" })
    const duas = withCurrentRegistryPartyRow(uma, { candidatoId: "c1", partidoAtual: "PDT" })
    assert.equal(duas.length, uma.length)
  })
})

describe("ficha sem nenhuma linha partidária", () => {
  it("acusa a lacuna quando a trajetória diverge do partido atual", () => {
    assert.equal(hasIncompletePartyTimeline([], "PL", "PL", "PRTB"), true)
  })

  it("não acusa quando a trajetória já está no partido atual, nem sem trajetória", () => {
    assert.equal(hasIncompletePartyTimeline([], "PL", "PL", "PL"), false)
    assert.equal(hasIncompletePartyTimeline([], "PL", "PL", null), false)
  })

  it("não acusa quando a diferença é sucessão de legenda", () => {
    assert.equal(hasIncompletePartyTimeline([], "UNIÃO", "UNIÃO", "DEM"), false)
  })
})
