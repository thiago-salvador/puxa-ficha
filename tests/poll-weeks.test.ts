import assert from "node:assert/strict"
import { test } from "node:test"
import { aggregatePollWeeks, groupWeeklyPollSeries, weekObservation, weeklySegments, weekStart, weekTitle } from "../src/lib/poll-weeks"
import { fixturePoll } from "./fixtures/poll-series"

function survey(date: string, institute: string, values = [30, 40, 10]) {
  const poll = fixturePoll(date, values)
  poll.id = `${institute}-${date}`
  poll.instituto.value = institute
  poll.scenario.comparabilityKey = "2026|Presidente|BR|1|estimulado|teste-abc|total_amostra"
  return poll
}

test("default series prefers stimulated voting, preserves spontaneous scenarios and orders by actual fieldwork date", () => {
  const stimulated = survey("2026-09-08", "A")
  const spontaneous = survey("2026-09-10", "B")
  const latestStimulated = survey("2026-09-09", "C")
  for (const poll of [stimulated, spontaneous, latestStimulated]) {
    poll.office = "Governador"
    poll.geography = { ...poll.geography, type: "estadual", label: "São Paulo", code: "SP" }
    poll.scenario.geography = "São Paulo"
  }
  stimulated.scenario.comparabilityKey = "2026|Governador|SP|1|estimulada|lista|total_amostra"
  spontaneous.scenario.comparabilityKey = "2026|Governador|SP|1|espontanea|lista|total_amostra"
  spontaneous.scenario.resultados = spontaneous.scenario.resultados.slice(0, 2)
  latestStimulated.scenario.comparabilityKey = "2026|Governador|SP|1|estimulado|outra-lista|total_amostra"
  const groups = groupWeeklyPollSeries([spontaneous, stimulated, latestStimulated])
  assert.equal(groups.length, 2)
  assert.equal(groups[0].weeks[0].polls.length, 2)
  assert.deepEqual(groups[0].weeks[0].polls.map(poll => poll.id), [stimulated.id, latestStimulated.id])
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

test("different poll, source and list keys with the same dimensions form one weekly mean", () => {
  const a = survey("2026-09-08", "A", [20, 40, 10])
  const b = survey("2026-09-10", "B", [40, 20, 30])
  a.provenance.resultUrl = "https://example.org/source-a"
  b.provenance.resultUrl = "https://example.org/source-b"
  a.scenario.comparabilityKey = "2026|Presidente|BR|1|estimulado|lista-a|total_amostra"
  b.scenario.comparabilityKey = "2026|Presidente|BR|1|estimulada|lista-b|total_amostra"
  const groups = groupWeeklyPollSeries([a, b])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].weeks.length, 1)
  assert.equal(groups[0].weeks[0].polls.length, 2)
  assert.deepEqual(groups[0].weeks[0].results.map(item => item.value).sort((x, y) => x! - y!), [20, 30, 30])
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

test("candidate lists and free-text electorates join the weekly series; base and turn stay separate", () => {
  const a = survey("2026-09-08", "A")
  const variants = Array.from({ length: 5 }, (_, index) => survey("2026-09-10", `B${index}`))
  variants[0].scenario.comparabilityKey += "|validos"
  variants[1].scenario.resultados.pop()
  variants[2].sample.population.value = "Eleitores de 16 anos ou mais em 60 municípios"
  variants[3].sample.population.status = "indeterminado"
  variants[4].scenario.turn = 2
  assert.equal(groupWeeklyPollSeries([a, variants[0]]).length, 2)
  assert.equal(groupWeeklyPollSeries([a, variants[4]]).length, 2)
  for (const variant of variants.slice(1, 4)) assert.equal(groupWeeklyPollSeries([a, variant]).length, 1)
})

test("published spellings of the total-sample base join the same series", () => {
  const a = survey("2026-09-08", "A")
  const b = survey("2026-09-09", "B")
  const c = survey("2026-09-10", "C")
  b.scenario.comparabilityKey = "2026|Presidente|BR|1|estimulada|outra-lista|total_entrevistados"
  c.scenario.comparabilityKey = "2026|Presidente|BR|1|estimulado|lista-c|total"
  assert.equal(groupWeeklyPollSeries([a, b, c]).length, 1)
})

test("institutes with different candidate lists average each candidate over the surveys that list them", () => {
  const a = survey("2026-09-08", "A", [30, 40, 10])
  const b = survey("2026-09-09", "B", [34, 36])
  b.registration.code.value = "BR-00002/2026"
  a.registration.code.value = "BR-00001/2026"
  const [series] = groupWeeklyPollSeries([a, b])
  const week = series.weeks.at(-1)!
  const byCandidate = Object.fromEntries(week.results.map(item => [item.result.candidateSlug, { value: item.value, count: item.count, total: item.total }]))
  assert.deepEqual(byCandidate["candidate-0"], { value: 32, count: 2, total: 2 })
  assert.deepEqual(byCandidate["candidate-1"], { value: 38, count: 2, total: 2 })
  assert.deepEqual(byCandidate["candidate-2"], { value: 10, count: 1, total: 2 })
})

test("a survey with several stimulated scenarios counts once, with its most complete list", () => {
  const full = survey("2026-09-08", "A", [30, 40, 10])
  const reduced = survey("2026-09-08", "A", [35, 45])
  full.registration.code.value = reduced.registration.code.value = "BR-00003/2026"
  full.scenario.id = "com-c"; reduced.scenario.id = "sem-c"
  reduced.id = full.id
  const [week] = aggregatePollWeeks([reduced, full])
  assert.equal(week.polls.length, 1)
  assert.equal(week.polls[0].scenario.id, "com-c")
})

test("unknown or malformed mode isolates the poll by its own key", () => {
  const a = survey("2026-09-08", "A")
  const malformed = survey("2026-09-10", "B")
  malformed.scenario.comparabilityKey = "2026|Presidente|BR|1|indefinido|lista|total_amostra"
  assert.equal(groupWeeklyPollSeries([a, malformed]).length, 2)
})

test("Senado agrupa proveniências distintas e separa pergunta ou base incompatível", () => {
  const first = survey("2026-09-08", "A")
  first.office = "Senador"
  first.geography = { type: "estadual", label: "São Paulo", code: "SP" }
  first.scenario.geography = "São Paulo"
  first.scenario.comparabilityKey = "2026|Senador|SP|1|primeiro-voto|lista-2026|eleitores"
  first.scenario.question.value = "Em quem você votaria para senador?"

  const comparable = structuredClone(first)
  comparable.id = "B-2026-09-08"
  comparable.instituto.value = "B"
  comparable.provenance.resultUrl = "https://example.org/pesquisa/outra-fonte"
  comparable.scenario.question.value = "  Em quem voce votaria para senador?  "
  assert.equal(groupWeeklyPollSeries([first, comparable]).length, 1)

  const differentQuestion = structuredClone(comparable)
  differentQuestion.id = "C-2026-09-08"
  differentQuestion.scenario.question.value = "Em quem você votaria como primeira escolha para senador?"
  assert.equal(groupWeeklyPollSeries([first, differentQuestion]).length, 2)

  const differentDenominator = structuredClone(comparable)
  differentDenominator.id = "D-2026-09-08"
  differentDenominator.sample.population.value = "Votos válidos"
  assert.equal(groupWeeklyPollSeries([first, differentDenominator]).length, 2)
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
