/**
 * Regressao das siglas partidarias adicionadas na etapa 2C da auditoria de
 * integridade de 2026-07-24.
 *
 * Fonte oficial unica de todos os fatos afirmados aqui:
 * https://www.tse.jus.br/partidos/partidos-politicos/partidos-registrados-no-tse
 * (HTTP 200 em teste real por curl, acesso 2026-07-25). Trechos literais:
 *
 *  - "Partido da Mobilização Nacional (PMN) Mobilização Nacional (MOBILIZA)
 *     PetCiv nº 0001624-23.1996.6.00.0000 05/12/2023"
 *  - "A mudança de nome do Partido Ecológico Nacional (PEN) para Patriota
 *     (PATRI) foi deferida em 26/04/2018. Posteriormente, o Patriota (PATRI)
 *     requereu a utilização do nome PATRIOTA (sem sigla). O pedido foi deferido
 *     pelo TSE, em 26/03/2019."
 *  - "PCB PARTIDO COMUNISTA BRASILEIRO 9.5.1996"
 *  - "Partido da Reconstrução Nacional (PRN) Partido Trabalhista Cristão (PTC)
 *     PET nº 341 (1069-69.1997.6.00.0000) 24/04/2001"
 *  - "Partido da Reedificação da Ordem Nacional (PRONA) e Partido Liberal (PL)
 *     Partido da República (PR) ** RPP nº 305 (29782-39.2006.6.00.0000)
 *     19/12/2006"
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formatPartyDisplayLabel,
  partiesEquivalent,
  partiesHistoricallyEquivalent,
  resolveCanonicalPartySigla,
} from "@/lib/party-utils"
import { countPartySwitches, normalizePartyTimelineForDisplay } from "@/lib/party-switches"
import type { MudancaPartido } from "@/lib/types"

function mudanca(partial: Partial<MudancaPartido> & { ano: number }): MudancaPartido {
  return {
    id: `${partial.ano}-${partial.partido_anterior ?? "x"}-${partial.partido_novo ?? "y"}`,
    candidato_id: "c1",
    partido_anterior: null,
    partido_novo: null,
    data_mudanca: null,
    contexto: null,
    ...partial,
  } as MudancaPartido
}

describe("siglas que nao resolviam no registro canonico (auditoria 2026-07-24)", () => {
  it("resolve PCB, PRN e PRONA em vez de devolver null", () => {
    assert.equal(resolveCanonicalPartySigla("PCB"), "PCB")
    assert.equal(resolveCanonicalPartySigla("PRN"), "PRN")
    assert.equal(resolveCanonicalPartySigla("PRONA"), "PRONA")
  })

  it("uma sigla e equivalente a si mesma (antes era falso porque ambos os lados eram null)", () => {
    assert.equal(partiesEquivalent("PCB", "PCB"), true)
    assert.equal(partiesEquivalent("PRONA", "PRONA"), true)
  })
})

describe("PATRI e PATRIOTA sao a mesma legenda", () => {
  it("PATRI resolve para PATRIOTA", () => {
    assert.equal(resolveCanonicalPartySigla("PATRI"), "PATRIOTA")
    assert.equal(resolveCanonicalPartySigla("PATRIOTA"), "PATRIOTA")
    assert.equal(partiesEquivalent("PATRI", "PATRIOTA"), true)
  })

  it("reencadeia a timeline do padrao cabo-daciolo em vez de publicar descontinuidade", () => {
    // Padrao exato observado em producao no perfil cabo-daciolo em 2026-07-24:
    // a terceira linha reabria em PATRIOTA depois de a cadeia ter terminado em PDT.
    const timeline = normalizePartyTimelineForDisplay([
      mudanca({ ano: 2018, partido_anterior: "PSOL", partido_novo: "PATRI" }),
      mudanca({ ano: 2022, partido_anterior: "PATRI", partido_novo: "PDT" }),
      mudanca({ ano: 2026, partido_anterior: "PATRIOTA", partido_novo: "MOBILIZA" }),
    ])

    assert.deepEqual(
      timeline.map((row) => [row.ano, row.partido_anterior, row.partido_novo]),
      [
        [2018, "PSOL", "PATRIOTA"],
        [2022, "PATRIOTA", "PDT"],
        [2026, "PDT", "MOBILIZA"],
      ],
    )
  })
})

describe("PMN e MOBILIZA: mesma legenda, eras diferentes", () => {
  it("mantem entradas canonicas distintas para nao rotular filiacao atual com o nome antigo", () => {
    assert.equal(resolveCanonicalPartySigla("PMN"), "PMN")
    assert.equal(resolveCanonicalPartySigla("MOBILIZA"), "MOBILIZA")
    assert.equal(resolveCanonicalPartySigla("Mobiliza"), "MOBILIZA")
    assert.equal(formatPartyDisplayLabel("MOBILIZA"), "MOBILIZA")
  })

  it("trata a renomeacao como continuidade historica, nao como troca de partido", () => {
    assert.equal(partiesHistoricallyEquivalent("PMN", "MOBILIZA"), true)
    assert.equal(
      countPartySwitches([mudanca({ ano: 2024, partido_anterior: "PMN", partido_novo: "MOBILIZA" })]),
      0,
    )
  })

  it("rotula pelo nome vigente no ano (decisao do TSE em 05/12/2023)", () => {
    assert.equal(formatPartyDisplayLabel("MOBILIZA", { year: 2018 }), "PMN")
    assert.equal(formatPartyDisplayLabel("PMN", { year: 2018 }), "PMN")
    assert.equal(formatPartyDisplayLabel("PMN", { year: 2026 }), "MOBILIZA")
    assert.equal(formatPartyDisplayLabel("MOBILIZA", { year: 2026 }), "MOBILIZA")
  })
})
