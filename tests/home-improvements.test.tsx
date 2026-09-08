import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { compareCandidateSortValues } from "../src/lib/candidate-sort"
import { HomeRecentUpdates } from "../src/components/HomeRecentUpdates"
import { HomeQuizIntro } from "../src/components/HomeQuizIntro"

test("sorting keeps confirmed zero ahead of missing values and sorts amounts descending", () => {
  const records = [{ value: null }, { value: 0 }, { value: 20 }, { value: undefined }, { value: 2 }]
  records.sort((a, b) => compareCandidateSortValues(a.value, b.value))
  assert.deepEqual(records.map((r) => r.value), [20, 2, 0, null, undefined])
  assert.equal(compareCandidateSortValues(Number.NaN, 0), 1)
  assert.equal(compareCandidateSortValues(null, undefined), 0)
  assert.equal(compareCandidateSortValues(0, 0), 0)
})

test("recent updates does not claim monitoring or publish demo events", () => {
  const html = renderToStaticMarkup(createElement(HomeRecentUpdates))
  assert.match(html, /histórico de mudanças verificadas ainda não está disponível/)
  assert.match(html, /href="\/metodologia"/)
  assert.doesNotMatch(html, /Candidato [ABC]|Simular|Nenhuma atualização recente|2026-09-0/)
})

test("quiz introduction explains result limits and links to the actual entry and methodology", () => {
  const html = renderToStaticMarkup(createElement(HomeQuizIntro))
  assert.match(html, /href="\/quiz"/)
  assert.match(html, /href="\/quiz\/metodologia"/)
  assert.match(html, /Não recomenda voto/)
  assert.match(html, /Você escolhe o cargo/)
  assert.doesNotMatch(html, /\d+ minutos|\d+%/)
})
