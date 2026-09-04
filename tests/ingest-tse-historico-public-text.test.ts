import assert from "node:assert/strict"
import { test } from "node:test"
import { buildTseHistoricoObservacoes } from "../scripts/lib/ingest-tse-historico"
import { containsTseTechnicalMarker } from "../src/lib/public-text-markers"

for (const marcador of ["#NULO", "#NULO#"]) {
  test(`observação de candidatura remove ${marcador} sem inventar desfecho`, () => {
    const observacao = buildTseHistoricoObservacoes(marcador, 2010, false)
    assert.equal(observacao, "Candidatura: (TSE 2010)")
    assert.equal(containsTseTechnicalMarker(observacao), false)
    assert.doesNotMatch(observacao, /eleito|indeferido|renúncia/i)
  })
}

test("observação preserva resultado explícito, acentos e ano da fonte", () => {
  assert.equal(buildTseHistoricoObservacoes("NAO ELEITO", 2010, false), "Candidatura: NÃO ELEITO (TSE 2010)")
  assert.equal(buildTseHistoricoObservacoes("ELEITO POR QP", 2014, true), "ELEITO POR QP (TSE 2014)")
})
