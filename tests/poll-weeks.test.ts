import assert from "node:assert/strict"
import { test } from "node:test"
import { aggregatePollWeeks, groupWeeklyPollSeries, weekObservation, weeklySegments, weekStart, weekTitle } from "../src/lib/poll-weeks"
import { fixturePoll } from "./fixtures/poll-series"

function survey(date: string, institute: string, values = [30, 40, 10]) {
  const poll = fixturePoll(date, values)
  poll.id = `${institute}-${date}`
  poll.instituto.value = institute
  return poll
}

test("default series prefers stimulated voting, preserves spontaneous scenarios and orders by actual fieldwork date", () => {
  const stimulated = survey("2026-09-08", "A")
  stimulated.scenario.comparabilityKey = "2026|Governador|SP|1|estimulada|lista|total"
  const spontaneous = survey("2026-09-10", "B")
  spontaneous.scenario.comparabilityKey = "2026|Governador|SP|1|espontanea|lista|total"
  spontaneous.scenario.resultados = spontaneous.scenario.resultados.slice(0, 2)
  const latestStimulated = survey("2026-09-09", "C")
  latestStimulated.scenario.comparabilityKey = "2026|Governador|SP|1|estimulado|outra-lista|total"
  const groups = groupWeeklyPollSeries([spontaneous, stimulated, latestStimulated])
  assert.equal(groups[0].polls[0].id, latestStimulated.id)
  assert.equal(groups.length, 3)
  assert.equal(groupWeeklyPollSeries([spontaneous])[0].polls[0].id, spontaneous.id)
})

test("weekly means combine institutes and interview modes with equal survey weights", () => {
  const a = survey("2026-09-08", "A", [30, 40, 0])
  const b = survey("2026-09-08", "B", [40, 30, 10])
  b.method.value = "Presencial"
  b.sample.size.value = 9000
  const groups = groupWeeklyPollSeries([a, b])
  assert.equal(groups.length, 1)
  const [week] = groups[0].weeks
  assert.equal(week.date, "2026-09-07")
  assert.equal(week.end, "2026-09-13")
  assert.deepEqual(week.institutes, ["A", "B"])
  assert.deepEqual(week.results.map(item => item.value).sort((a, b) => a! - b!), [5, 35, 35])
  assert.equal(weekTitle(week), "Média de 2 pesquisas")
  assert.equal(week.polls[0].provenance.resultUrl, a.provenance.resultUrl)
})

test("calendar weeks have non-overlapping Monday/Sunday and year/month boundaries", () => {
  const weeks = aggregatePollWeeks([survey("2026-09-13", "A"), survey("2026-09-14", "A")])
  assert.deepEqual(weeks.map(week => week.date), ["2026-09-07", "2026-09-14"])
  assert.equal(weekStart("2027-01-01"), "2026-12-28")
  const crossMonth = aggregatePollWeeks([survey("2026-08-31", "A"), survey("2026-09-01", "B")])
  assert.equal(crossMonth.length, 1)
  assert.equal(crossMonth[0].polls.length, 2)
  assert.equal(crossMonth[0].date, "2026-08-31")
})

test("duplicate IDs and repeated registrations never overweight the mean", () => {
  const a = survey("2026-09-08", "A")
  a.registration.code.value = "BR-12345/26"
  const copy = structuredClone(a)
  copy.id = "duplicate-article"
  copy.registration.code.value = "BR-12345/2026"
  const b = survey("2026-09-10", "B", [60, 20, 20])
  const [week] = aggregatePollWeeks([a, a, copy, b])
  assert.equal(week.polls.length, 2)
  assert.equal(week.results.find(item => item.result.candidateSlug === "candidate-0")!.value, 45)
})

test("missing results keep their denominator and zero is a real observation", () => {
  const a = survey("2026-09-08", "A", [0, 30, 10])
  const b = survey("2026-09-10", "B", [10, 40, 20])
  b.scenario.resultados[0].valuePercent = null
  a.scenario.resultados[2].status = "indeterminado"
  b.scenario.resultados[2].valuePercent = null
  const [week] = aggregatePollWeeks([a, b])
  const zero = week.results.find(item => item.result.candidateSlug === "candidate-0")!
  assert.deepEqual({ value: zero.value, count: zero.count, total: zero.total }, { value: 0, count: 1, total: 2 })
  const missing = week.results.find(item => item.result.candidateSlug === "candidate-2")!
  assert.equal(missing.value, null)
  assert.equal(missing.count, 0)
})

test("different scenarios, candidate lists, electorates and unknown metadata remain separate", () => {
  const a = survey("2026-09-08", "A")
  const variants = Array.from({ length: 5 }, (_, index) => survey("2026-09-10", `B${index}`))
  variants[0].scenario.comparabilityKey += "|validos"
  variants[1].scenario.resultados.pop()
  variants[2].sample.population.value = "Votos válidos"
  variants[3].sample.population.status = "indeterminado"
  variants[4].scenario.turn = 2
  for (const variant of variants) assert.equal(groupWeeklyPollSeries([a, variant]).length, 2)
})

test("unapproved/old surveys are excluded and undated surveys do not join dated weeks", () => {
  const a = survey("2026-09-08", "A")
  const old = survey("2026-09-10", "B")
  old.state = "antigo"
  const unapproved = survey("2026-09-10", "C")
  unapproved.sourceStatus = "condicional"
  assert.equal(aggregatePollWeeks([a, old, unapproved])[0].polls.length, 1)
  assert.deepEqual(groupWeeklyPollSeries([old, unapproved]), [])
  const undated = survey("2026-09-10", "D")
  undated.fieldwork.end.status = "indeterminado"
  assert.equal(aggregatePollWeeks([a, undated]).length, 2)
  assert.equal(aggregatePollWeeks([undated])[0].date, null)
})

test("unobserved weeks and null results break the line without interpolation", () => {
  const weeks = aggregatePollWeeks([survey("2026-09-08", "A"), survey("2026-09-14", "B"), survey("2026-09-28", "A")])
  assert.deepEqual(weeklySegments(weeks.map(week => weekObservation(week, "candidate:candidate-0"))).map(segment => segment.length), [2, 1])
  weeks[1].results.find(item => item.result.candidateSlug === "candidate-0")!.value = null
  assert.deepEqual(weeklySegments(weeks.map(week => weekObservation(week, "candidate:candidate-0"))).map(segment => segment.length), [1, 1])
})
