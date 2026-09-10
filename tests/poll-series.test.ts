import assert from "node:assert/strict"
import { test } from "node:test"
import { candidateObservations, fieldworkDate, groupPollSeries, observationSegments, publicPollMetadata, publishedValue, resultKey, seriesCandidates } from "../src/lib/poll-series"
import { fixturePoll, fixtureSeries } from "./fixtures/poll-series"

test("public metadata hides unconfirmed retained values without mutating the source", () => {
  const poll = fixturePoll("2026-09-07")
  const fields = (row: typeof poll) => [row.instituto, row.contratante, row.publicationDate, row.fieldwork.start, row.fieldwork.end, row.sample.size, row.sample.population, row.marginErrorPp, row.confidencePercent, row.method, row.registration.code, row.registration.url, row.scenario.question]
  assert.deepEqual(publicPollMetadata(poll), poll)
  for (const field of fields(poll)) field.status = "indeterminado"
  const visible = publicPollMetadata(poll)
  assert.ok(fields(visible).every(field => field.value === null))
  assert.ok(fields(poll).every(field => field.value !== null))
  assert.deepEqual(visible.scenario.resultados, poll.scenario.resultados)
  assert.deepEqual(visible.provenance, poll.provenance)
})

test("series isolate institute, scenario, method, population, turn, office, geography and year", () => {
  const first = fixturePoll("2026-07-01")
  const second = fixturePoll("2026-08-01")
  assert.equal(groupPollSeries([second, first])[0].polls[0].id, first.id)
  assert.equal(groupPollSeries([first, second]).length, 1)
  const variants = [
    { ...second, instituto: { ...second.instituto, value: "Outro instituto" } },
    { ...second, method: { ...second.method, value: "Presencial" } },
    { ...second, sample: { ...second.sample, population: { ...second.sample.population, value: "Votos válidos" } } },
    { ...second, scenario: { ...second.scenario, comparabilityKey: "outro-cenario" } },
    { ...second, scenario: { ...second.scenario, turn: 2 as const } },
    { ...second, geography: { ...second.geography, code: "SP" } },
    { ...second, office: "Governador" }, { ...second, electionYear: 2022 },
  ]
  for (const variant of variants) assert.equal(groupPollSeries([first, variant]).length, 2)
})

test("missing comparison metadata stays isolated and duplicate entries are not counted twice", () => {
  const incomplete = fixtureSeries.map(poll => ({ ...poll, method: { value: null, status: "indeterminado" as const } }))
  assert.equal(groupPollSeries(incomplete).length, incomplete.length)
  const group = groupPollSeries([fixtureSeries[0], fixtureSeries[0], fixtureSeries[1]])
  assert.equal(group[0].polls.length, 2)
})

test("gaps, unverified results and old polls interrupt lines while zero remains a point", () => {
  const rows = structuredClone(fixtureSeries)
  rows[0].scenario.resultados[0].valuePercent = 0
  rows[1].scenario.resultados[0].valuePercent = null
  let points = candidateObservations(rows, "candidate:candidate-0")
  assert.deepEqual(points.map(point => point.value), [0, null, 35, 38])
  assert.deepEqual(observationSegments(points).map(segment => segment.length), [1, 2])
  rows[2].state = "antigo"
  rows[3].scenario.resultados[0].status = "indeterminado"
  points = candidateObservations(rows, "candidate:candidate-0")
  assert.deepEqual(points.map(point => point.value), [0, null, null, null])
  assert.equal(publishedValue(rows[0], { ...rows[0].scenario.resultados[0], valuePercent: NaN }), null)
})

test("absence never becomes zero, inferred identity or a connected segment", () => {
  const rows = structuredClone(fixtureSeries)
  rows[1].scenario.resultados.shift()
  const points = candidateObservations(rows, "candidate:candidate-0")
  assert.equal(points[1].value, null)
  rows[3].scenario.resultados.push({ rawLabel: "Outros", candidateSlug: null, matchStatus: "not_candidate", valuePercent: 0, status: "publicado" })
  rows[3].scenario.resultados.push({ rawLabel: "Pessoa sem vínculo", candidateSlug: null, matchStatus: "indeterminado", valuePercent: 2, status: "publicado" })
  assert.equal(seriesCandidates(rows).length, 3)
  assert.notEqual(resultKey(rows[3].scenario.resultados[3]), resultKey(rows[3].scenario.resultados[4]))
  assert.equal(rows[3].scenario.resultados.length, 5)
})

test("unverified, invalid and duplicate fieldwork dates do not produce a trend", () => {
  const invalid = fixturePoll("2026-02-31")
  assert.equal(fieldworkDate(invalid), null)
  const unpublished = fixturePoll("2026-08-01")
  unpublished.fieldwork.end.status = "indeterminado"
  assert.equal(fieldworkDate(unpublished), null)
  const duplicate = { ...fixtureSeries[1], id: "different-poll-same-date" }
  const points = candidateObservations([fixtureSeries[0], fixtureSeries[1], duplicate, fixtureSeries[2]], "candidate:candidate-0")
  assert.deepEqual(observationSegments(points).map(segment => segment.length), [1, 1])
})

test("a missing latest result is retained as missing, without carrying the earlier value forward", () => {
  const rows = structuredClone(fixtureSeries)
  rows.at(-1)!.scenario.resultados.shift()
  assert.equal(seriesCandidates(rows).length, 3)
  assert.equal(candidateObservations(rows, "candidate:candidate-0").at(-1)!.value, null)
})
