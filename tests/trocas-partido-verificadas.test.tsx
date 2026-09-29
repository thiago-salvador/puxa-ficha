import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { TrajectoryTabSection } from "@/components/CandidatoProfileSections"
import { partySwitchCountVerified } from "@/lib/party-switches"
import type { MudancaPartido } from "@/lib/types"

// Zero de trocas sem recibo de filiação conclusivo é "não verificado".
const registro: MudancaPartido = {
  id: "registro-2026", candidato_id: "c1", ano: 2026, partido_anterior: "MISSÃO", partido_novo: "MISSÃO",
  data_mudanca: null, contexto: "Filiação atual observada no registro de candidatura 2026",
}
const troca: MudancaPartido = {
  id: "t1", candidato_id: "c1", ano: 2018, partido_anterior: "PT", partido_novo: "PSDB",
  data_mudanca: null, contexto: "Mudança observada entre eleições TSE (2018)",
}

function render(mudancas: MudancaPartido[], partySwitchesVerified: boolean | undefined) {
  return renderToStaticMarkup(createElement(TrajectoryTabSection, {
    historico: [], mudancas, historicoDescartado: 0, timelinePartidariaIncompleta: false,
    partidoAtualSigla: "MISSÃO", partidoAtualNome: null, partySwitchesVerified, suggestion: null,
  }))
}

describe("trocas de partido sem recibo conclusivo", () => {
  it("só afirma a contagem com troca contada ou filiação encontrada/vazia confirmada", () => {
    assert.equal(partySwitchCountVerified([], undefined), false)
    assert.equal(partySwitchCountVerified([], "indeterminado"), false)
    assert.equal(partySwitchCountVerified([registro], "indeterminado"), false)
    assert.equal(partySwitchCountVerified([registro], "erro"), false)
    assert.equal(partySwitchCountVerified([registro], "vazio_confirmado"), true)
    assert.equal(partySwitchCountVerified([], "encontrado"), true)
    assert.equal(partySwitchCountVerified([troca], null), true)
  })

  it("seção da trajetória não afirma zero sem recibo", () => {
    const aberto = render([], false)
    assert.match(aberto, /Trocas de partido não verificadas/)
    assert.match(aberto, /data-pf-partidos-count="nao_coletado"/)
    assert.doesNotMatch(aberto, /Sem trocas de partido registradas/)
    assert.match(render([], undefined), /data-pf-partidos-count="nao_coletado"/)
    const confirmado = render([], true)
    assert.match(confirmado, /data-pf-partidos-count="0"/)
    assert.match(confirmado, /Sem trocas de partido registradas na base/)
  })

  it("card da ficha e Comparador usam a mesma régua, não o recibo da trajetória", () => {
    const perfil = readFileSync("src/components/CandidatoProfile.tsx", "utf8")
    assert.match(perfil, /partySwitchCountVerified\(mudancas, ficha\.filiacao_verificacao\?\.resultado\)/)
    assert.doesNotMatch(perfil, /trajetoria_verificacao\?\.resultado === "vazio_confirmado"\s*\n\s*\? ficha\.total_mudancas_partido/)
    const diferido = readFileSync("src/components/DeferredCandidatoProfile.tsx", "utf8")
    assert.match(diferido, /partySwitchCountVerified\(mudancas, ficha\.filiacao_verificacao\?\.resultado\)/)
    assert.match(diferido, /mudancas: partySwitchesVerified \? ficha\.total_mudancas_partido : null/)
    const api = readFileSync("src/lib/api.ts", "utf8")
    assert.match(api, /fetchColetaVerificacoesBatch\(baseRows\.map\(\(row\) => \(\{ id: row\.id, slug: row\.slug \}\)\), "filiacao"\)/)
    assert.match(api, /mudancas_partido_verificado: switchCountById\.has\(row\.id\)/)
    const painel = readFileSync("src/components/ComparadorPanel.tsx", "utf8")
    assert.match(painel, /candidato\.mudancas_partido_verificado \? \(/)
    assert.match(painel, /não verificado/)
  })
})
