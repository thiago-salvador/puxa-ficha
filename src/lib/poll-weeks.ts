import type { StatePollScenario } from "./state-polls"
import { fieldworkDate, formatPollDate, pollKey, publishedValue, resultKey, seriesCandidates, type PollResult } from "./poll-series"

const DAY = 86_400_000
export type PollWeek = {
  id: string; date: string | null; end: string | null; polls: StatePollScenario[]; institutes: string[]
  results: { result: PollResult; value: number | null; count: number; total: number }[]
}
export type WeeklySeries = { id: string; label: string; polls: StatePollScenario[]; weeks: PollWeek[] }

export function weekStart(date: string) {
  const time = Date.parse(`${date}T12:00:00Z`)
  return new Date(time - ((new Date(time).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10)
}

/** Keep the catalog's scenario contract, electorate and candidate set. Institute and interview mode may vary. */
function weeklySeriesKey(poll: StatePollScenario) {
  const population = poll.sample.population
  const candidates = poll.scenario.resultados.filter(result => result.matchStatus === "exact_alias" && result.candidateSlug).map(resultKey).sort()
  const verified = population.status === "publicado" && population.value?.trim() && poll.method.status === "publicado" && poll.method.value && poll.instituto.status === "publicado" && poll.instituto.value && candidates.length > 0 && !poll.scenario.resultados.some(result => result.matchStatus === "indeterminado")
  return JSON.stringify([poll.electionYear, poll.office, poll.geography.code, poll.scenario.turn, poll.scenario.comparabilityKey, population.value?.trim().toLocaleLowerCase("pt-BR"), candidates, verified ? null : pollKey(poll)])
}

function surveyIdentity(poll: StatePollScenario) {
  const registration = poll.registration.code.status === "publicado" && poll.registration.code.value?.match(/^([A-Z]{2})-?(\d{5})\/(?:20)?(\d{2})$/i)
  return registration ? `${poll.electionYear}:${registration[1].toUpperCase()}:${registration[2]}:${registration[3]}` : poll.id
}

/** One vote per distinct survey. Never round inputs or borrow a missing result from another week. */
export function aggregatePollWeeks(polls: StatePollScenario[]): PollWeek[] {
  const unique = new Map<string, StatePollScenario>()
  for (const poll of [...polls].sort((a, b) => (b.publicationDate.value ?? "").localeCompare(a.publicationDate.value ?? "") || pollKey(a).localeCompare(pollKey(b)))) {
    if (poll.sourceStatus !== "aprovado" || poll.state !== "publicado") continue
    const identity = `${weeklySeriesKey(poll)}:${surveyIdentity(poll)}`
    if (!unique.has(identity)) unique.set(identity, poll)
  }
  const buckets = new Map<string, { date: string | null; polls: StatePollScenario[] }>()
  for (const poll of unique.values()) {
    const fieldwork = fieldworkDate(poll)
    const date = fieldwork ? weekStart(fieldwork) : null
    const id = `${weeklySeriesKey(poll)}:${date ?? pollKey(poll)}`
    const bucket = buckets.get(id) ?? { date, polls: [] }
    bucket.polls.push(poll)
    buckets.set(id, bucket)
  }
  return [...buckets].map(([id, bucket]) => {
    const members = bucket.polls.sort((a, b) => (fieldworkDate(a) ?? "").localeCompare(fieldworkDate(b) ?? "") || pollKey(a).localeCompare(pollKey(b)))
    return {
      id, date: bucket.date, end: bucket.date ? new Date(Date.parse(`${bucket.date}T12:00:00Z`) + 6 * DAY).toISOString().slice(0, 10) : null,
      polls: members, institutes: [...new Set(members.map(poll => poll.instituto.value ?? "Instituto não informado"))].sort(),
      results: seriesCandidates(members).map(result => {
        const values = members.flatMap(poll => {
          const row = poll.scenario.resultados.find(item => resultKey(item) === resultKey(result))
          const value = row ? publishedValue(poll, row) : null
          return value === null ? [] : [value]
        })
        return { result, value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, count: values.length, total: members.length }
      }),
    }
  }).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.id.localeCompare(b.id))
}

export function groupWeeklyPollSeries(polls: StatePollScenario[]): WeeklySeries[] {
  const groups = new Map<string, StatePollScenario[]>()
  for (const poll of polls) {
    const id = weeklySeriesKey(poll)
    groups.set(id, [...(groups.get(id) ?? []), poll])
  }
  return [...groups].flatMap(([id, members]) => {
    const weeks = aggregatePollWeeks(members)
    return weeks.length ? [{ id, label: weeks.at(-1)!.polls.at(-1)!.scenario.labelRaw, polls: weeks.flatMap(week => week.polls), weeks }] : []
  }).sort((a, b) => (b.weeks.at(-1)!.date ?? "").localeCompare(a.weeks.at(-1)!.date ?? "") || a.id.localeCompare(b.id))
}

export const weekLabel = (week: PollWeek) => week.date ? `${formatPollDate(week.date, true)} a ${formatPollDate(week.end, true)}` : "Coleta sem data verificada"
export const weekTitle = (week: PollWeek) => !week.date ? "Pesquisa sem data verificada" : week.polls.length > 1 ? `Média de ${week.polls.length} pesquisas` : "1 pesquisa na semana"
export const weekObservation = (week: PollWeek, key: string) => ({ week, date: week.date, value: week.results.find(item => resultKey(item.result) === key)?.value ?? null })

/** Empty weeks are gaps, not zero or interpolated averages. */
export function weeklySegments(observations: ReturnType<typeof weekObservation>[]) {
  const segments: typeof observations[] = []
  let segment: typeof observations = []
  for (const point of observations) {
    if (!point.date || point.value === null) {
      if (segment.length) segments.push(segment)
      segment = []
      continue
    }
    if (segment.length && Date.parse(point.date) - Date.parse(segment.at(-1)!.date!) > 7 * DAY) {
      segments.push(segment)
      segment = []
    }
    segment.push(point)
  }
  if (segment.length) segments.push(segment)
  return segments
}
