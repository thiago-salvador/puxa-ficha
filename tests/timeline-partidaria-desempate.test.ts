/**
 * Duas ou mais trocas de partido no mesmo ano não podem ser desempatadas por
 * ano, porque o ano é igual. O caso que expôs o defeito está publicado:
 * REPUBLICANOS para PATRIOTA em maio de 2021, PATRIOTA para PL em novembro do
 * mesmo ano. Ordenando só por ano, a terminal virava PATRIOTA, e a ficha
 * exibia "a linha do tempo ainda não chegou à filiação atual publicada" logo
 * acima de uma linha que mostrava justamente a chegada ao PL.
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { hasIncompletePartyTimeline } from "../src/lib/candidate-integrity"
import type { MudancaPartido } from "../src/lib/types"

function troca(ano: number, de: string, para: string): MudancaPartido {
  return {
    id: `${ano}-${de}-${para}`,
    candidato_id: "x",
    ano,
    partido_anterior: de,
    partido_novo: para,
    contexto: null,
    data_mudanca: null,
  } as unknown as MudancaPartido
}

describe("linha do tempo partidária: desempate dentro do mesmo ano", () => {
  it("não acusa desatualização quando a cadeia do ano chega ao partido atual", () => {
    // ordem de chegada do array é a que vinha da API, com a terminal em segundo
    const mudancas = [
      troca(2021, "REPUBLICANOS", "PATRIOTA"),
      troca(2021, "PATRIOTA", "PL"),
      troca(2020, "PSL", "REPUBLICANOS"),
      troca(2018, "PSC", "PSL"),
      troca(2016, "PP", "PSC"),
    ]

    assert.equal(
      hasIncompletePartyTimeline(mudancas, "PL", "PL"),
      false,
      "a cadeia fecha em PL: acusar desatualização aqui é aviso falso"
    )
  })

  it("continua acusando quando a cadeia realmente não chega ao partido atual", () => {
    const mudancas = [troca(2021, "REPUBLICANOS", "PATRIOTA"), troca(2020, "PSL", "REPUBLICANOS")]

    assert.equal(
      hasIncompletePartyTimeline(mudancas, "PL", "PL"),
      true,
      "sem transição para PL, o aviso é verdadeiro e precisa continuar aparecendo"
    )
  })

  it("independe da ordem em que as trocas do ano chegam", () => {
    const terminalPrimeiro = [troca(2021, "PATRIOTA", "PL"), troca(2021, "REPUBLICANOS", "PATRIOTA")]
    const terminalDepois = [troca(2021, "REPUBLICANOS", "PATRIOTA"), troca(2021, "PATRIOTA", "PL")]

    assert.equal(hasIncompletePartyTimeline(terminalPrimeiro, "PL", "PL"), false)
    assert.equal(hasIncompletePartyTimeline(terminalDepois, "PL", "PL"), false)
  })

  it("uma troca só no ano continua funcionando como antes", () => {
    const mudancas = [troca(2022, "PSD", "REPUBLICANOS"), troca(2018, "PMDB", "PSD")]

    assert.equal(hasIncompletePartyTimeline(mudancas, "REPUBLICANOS", "REPUBLICANOS"), false)
    assert.equal(hasIncompletePartyTimeline(mudancas, "PT", "PT"), true)
  })

  it("três trocas encadeadas no mesmo ano resolvem pela ponta da cadeia", () => {
    const mudancas = [
      troca(2026, "B", "C"),
      troca(2026, "A", "B"),
      troca(2026, "C", "D"),
    ]

    assert.equal(hasIncompletePartyTimeline(mudancas, "D", "D"), false)
    assert.equal(hasIncompletePartyTimeline(mudancas, "B", "B"), false, "B é destino no ano")
    assert.equal(hasIncompletePartyTimeline(mudancas, "Z", "Z"), true)
  })
})
