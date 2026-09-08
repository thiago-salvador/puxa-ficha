import assert from "node:assert/strict"
import { test } from "node:test"
import { comparisonIssue, indicatorPeriod, type ComparableIndicator } from "@/lib/state-indicator-comparability"

const base: ComparableIndicator = { id: "sp", estado: "SP", indicador: "pib_total", ano: 2023, valor: 50, fonte: "ibge_sidra", unidade: "mil_reais", metadata: null }
test("requires matching source, unit, period and definition", () => {
  assert.equal(comparisonIssue(base, {...base, estado: "MG"}), null)
  for (const patch of [{ano: 2024}, {unidade: null}, {fonte: null}, {fonte: "other"}, {metadata: {definicao: "other"}}, {valor: NaN}]) assert.notEqual(comparisonIssue(base, {...base, ...patch}), null)
})
test("unemployment period never invents a quarter", () => {
  const row = {...base, indicador: "taxa_desemprego", fonte: "ipeadata", unidade: "percentual"}
  assert.equal(indicatorPeriod(row).key, null)
  assert.match(indicatorPeriod(row).label, /trimestre não informado/)
  assert.equal(indicatorPeriod({...row, metadata: {trimestre: 2}}).label, "2º trimestre de 2023")
})
test("trend requires a real chronological annual interval", () => {
  assert.notEqual(comparisonIssue(base, base, true), null)
  assert.equal(comparisonIssue(base, {...base, ano: 2022}, true), null)
  assert.notEqual(comparisonIssue(base, {...base, ano: 2024}, true), null)
})
