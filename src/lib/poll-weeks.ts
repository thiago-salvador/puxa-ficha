import type { StatePollScenario } from "./state-polls"
import { assinaturaSenadoScenario, fieldworkDate, formatPollDate, pollKey, publishedValue, resultKey, seriesCandidates, type PollResult } from "./poll-series"

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

function normalizeDimension(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR")
}

/** Key parts when year, office, geography and turn match the poll itself; otherwise null. */
function scopedComparabilityParts(poll: StatePollScenario): string[] | null {
  const parts = poll.scenario.comparabilityKey.split("|").map(part => part.trim())
  if (parts.length < 5) return null
  const [year, office, geography, turn] = parts
  if (year !== String(poll.electionYear) || normalizeDimension(office) !== normalizeDimension(poll.office)
    || geography.toLocaleUpperCase("pt-BR") !== poll.geography.code.toLocaleUpperCase("pt-BR") || turn !== String(poll.scenario.turn)) return null
  return parts
}

/** Mirrors SENADO_POLL_MEASURES in senado-polls.ts, which is server-only and cannot be imported here. */
const SENADO_WEEKLY_MEASURES = new Set(["primeiro-voto", "segundo-voto", "agregado"])

function senadoMeasure(poll: StatePollScenario): string | null {
  const parts = scopedComparabilityParts(poll)
  const measure = parts ? normalizeDimension(parts[4]) : null
  return measure && SENADO_WEEKLY_MEASURES.has(measure) ? measure : null
}

function comparabilityMode(poll: StatePollScenario): "estimulada" | "espontanea" | null {
  const parts = scopedComparabilityParts(poll)
  if (!parts) return null
  const mode = normalizeDimension(parts[4])
  if (mode !== "estimulada" && mode !== "estimulado" && mode !== "espontanea" && mode !== "espontaneo") return null
  return mode.startsWith("estimul") ? "estimulada" : "espontanea"
}

function comparabilityDimensions(poll: StatePollScenario): {
  mode: "estimulada" | "espontanea"
  universe: "total_amostra" | "votos_validos"
} | null {
  const parts = poll.scenario.comparabilityKey.split("|").map(part => part.trim())
  if (parts.length !== 7) return null
  const mode = comparabilityMode(poll)
  if (!mode) return null
  const [, , , , , , rawUniverse] = parts
  // "total" and "total_entrevistados" are published spellings of the same base as "total_amostra".
  const normalized = normalizeDimension(rawUniverse)
  const universe = normalized === "total" || normalized === "total_entrevistados" ? "total_amostra" : normalized
  if (universe !== "total_amostra" && universe !== "votos_validos") return null
  return { mode, universe }
}

/** Named candidates with an exact identity in this scenario. */
function namedCandidates(poll: StatePollScenario) {
  return poll.scenario.resultados.filter(result => result.matchStatus === "exact_alias" && result.candidateSlug)
}

/**
 * Keep factual comparability dimensions. Governor and president series combine every institute
 * that asked the same kind of question (stimulated or spontaneous) on the same base (total sample
 * or valid votes) in the same turn; candidate lists and free-text electorate descriptions do not
 * split the series, and each candidate is averaged over the surveys that list them.
 */
function weeklySeriesKey(poll: StatePollScenario) {
  const dimensions = comparabilityDimensions(poll)
  const population = poll.sample.population
  const candidates = namedCandidates(poll).map(resultKey).sort()
  const identified = poll.instituto.status === "publicado" && Boolean(poll.instituto.value?.trim())
    && candidates.length > 0 && !poll.scenario.resultados.some(result => result.matchStatus === "indeterminado")
  if (poll.office === "Senador") {
    // Senate scenarios (two votes per state) group by the published question,
    // denominator and methodology signature, never by provenance or institute.
    const metadataVerified = identified && population.status === "publicado" && Boolean(population.value?.trim())
      && poll.method.status === "publicado" && Boolean(poll.method.value?.trim())
    if (!senadoMeasure(poll) || !metadataVerified) return JSON.stringify(["isolated", pollKey(poll)])
    return JSON.stringify([
      poll.electionYear,
      normalizeDimension(poll.office),
      poll.geography.code.toLocaleUpperCase("pt-BR"),
      poll.scenario.turn,
      assinaturaSenadoScenario(poll),
      candidates,
      normalizeDimension(population.value!),
    ])
  }
  if (!dimensions || !identified) return JSON.stringify(["isolated", pollKey(poll)])
  return JSON.stringify([
    poll.electionYear,
    normalizeDimension(poll.office),
    poll.geography.code.toLocaleUpperCase("pt-BR"),
    poll.scenario.turn,
    dimensions.mode,
    dimensions.universe,
  ])
}

function surveyIdentity(poll: StatePollScenario) {
  const registration = poll.registration.code.status === "publicado" && poll.registration.code.value?.match(/^([A-Z]{2})-?(\d{5})\/(?:20)?(\d{2})$/i)
  return registration ? `${poll.electionYear}:${registration[1].toUpperCase()}:${registration[2]}:${registration[3]}` : poll.id
}

/** One vote per distinct survey. Never round inputs or borrow a missing result from another week. */
export function aggregatePollWeeks(polls: StatePollScenario[]): PollWeek[] {
  const unique = new Map<string, StatePollScenario>()
  // One scenario per survey: the most recent publication, then the most complete candidate list.
  for (const poll of [...polls].sort((a, b) => (b.publicationDate.value ?? "").localeCompare(a.publicationDate.value ?? "") ||
    namedCandidates(b).length - namedCandidates(a).length || pollKey(a).localeCompare(pollKey(b)))) {
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
    if (!weeks.length) return []
    const seriesPolls = weeks.flatMap(week => week.polls)
    const labels = new Set(seriesPolls.map(poll => poll.scenario.labelRaw))
    const mode = comparabilityMode(seriesPolls[0])
    const label = labels.size === 1 || !mode ? weeks.at(-1)!.polls.at(-1)!.scenario.labelRaw
      : `Intenção de voto ${mode === "estimulada" ? "estimulada" : "espontânea"} no ${seriesPolls[0].scenario.turn}º turno`
    return [{ id, label, polls: seriesPolls, weeks }]
  }).sort((a, b) => {
    // The initial view should show the prompted candidate list, not a sparse
    // spontaneous scenario chosen accidentally by lexicographic ID order.
    const stimulated = (series: WeeklySeries) => comparabilityMode(series.polls[0]) === "estimulada"
    const latestFieldwork = (series: WeeklySeries) => series.polls.map(poll => fieldworkDate(poll) ?? "").sort().at(-1) ?? ""
    const latestPublication = (series: WeeklySeries) => series.polls.map(poll => poll.publicationDate.status === "publicado" ? poll.publicationDate.value ?? "" : "").sort().at(-1) ?? ""
    return Number(stimulated(b)) - Number(stimulated(a)) ||
      latestFieldwork(b).localeCompare(latestFieldwork(a)) ||
      latestPublication(b).localeCompare(latestPublication(a)) || a.id.localeCompare(b.id)
  })
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
