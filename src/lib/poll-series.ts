import type { StatePollScenario } from "@/lib/state-polls"

export type PollResult = StatePollScenario["scenario"]["resultados"][number]
export type PollCandidate = { slug: string; nome_urna: string; foto_url?: string | null }
export type PollSeries = { id: string; institute: string; label: string; polls: StatePollScenario[] }

/** Clear unconfirmed metadata at the public-view boundary, preserving its status and the original record. */
export function publicPollMetadata(poll: StatePollScenario): StatePollScenario {
  const visible = <T,>(field: { value: T | null; status: StatePollScenario["state"] }) => ({ ...field, value: field.status === "publicado" ? field.value : null })
  return {
    ...poll,
    instituto: visible(poll.instituto), contratante: visible(poll.contratante),
    publicationDate: visible(poll.publicationDate),
    fieldwork: { start: visible(poll.fieldwork.start), end: visible(poll.fieldwork.end) },
    sample: { size: visible(poll.sample.size), population: visible(poll.sample.population) },
    marginErrorPp: visible(poll.marginErrorPp), confidencePercent: visible(poll.confidencePercent), method: visible(poll.method),
    registration: { code: visible(poll.registration.code), url: visible(poll.registration.url) },
    scenario: { ...poll.scenario, question: visible(poll.scenario.question) },
  }
}

export const pollKey = (poll: StatePollScenario) => `${poll.id}:${poll.scenario.id}`
export const resultKey = (result: PollResult) => result.matchStatus === "exact_alias" && result.candidateSlug
  ? `candidate:${result.candidateSlug}`
  : `${result.matchStatus}:${result.rawLabel}`

export function publishedValue(poll: StatePollScenario, result: PollResult): number | null {
  return poll.state === "publicado" && result.status === "publicado" &&
    result.valuePercent !== null && Number.isFinite(result.valuePercent) &&
    result.valuePercent >= 0 && result.valuePercent <= 100 ? result.valuePercent : null
}

export function fieldworkDate(poll: StatePollScenario): string | null {
  const field = poll.fieldwork.end
  if (field.status !== "publicado" || !field.value || !/^\d{4}-\d{2}-\d{2}$/.test(field.value)) return null
  const timestamp = Date.parse(`${field.value}T12:00:00Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === field.value ? field.value : null
}

/** The catalog's exact comparability key is authoritative; do not infer it from names. */
export function groupPollSeries(polls: StatePollScenario[]): PollSeries[] {
  const groups = new Map<string, PollSeries>()
  for (const poll of polls) {
    const metadata = [poll.instituto, poll.method, poll.sample.population]
    const verified = metadata.every(field => field.status === "publicado" && field.value?.trim())
    const id = JSON.stringify([
      poll.electionYear, poll.office, poll.geography.code, poll.scenario.turn,
      poll.scenario.comparabilityKey,
      ...metadata.map(field => field.value?.trim().toLocaleLowerCase("pt-BR") ?? null),
      // Incomplete metadata must not create a spurious shared series.
      verified && poll.scenario.comparabilityKey ? null : pollKey(poll),
    ])
    const group = groups.get(id) ?? {
      id, institute: poll.instituto.value ?? "Instituto não informado",
      label: poll.scenario.labelRaw, polls: [],
    }
    if (!group.polls.some(item => pollKey(item) === pollKey(poll))) group.polls.push(poll)
    groups.set(id, group)
  }
  return [...groups.values()].map(group => ({
    ...group,
    polls: group.polls.sort((a, b) => (fieldworkDate(a) ?? "").localeCompare(fieldworkDate(b) ?? "") || pollKey(a).localeCompare(pollKey(b))),
  })).sort((a, b) => (fieldworkDate(b.polls.at(-1)!) ?? "").localeCompare(fieldworkDate(a.polls.at(-1)!) ?? "") || a.id.localeCompare(b.id))
}

export function seriesCandidates(polls: StatePollScenario[]): PollResult[] {
  const results = new Map<string, PollResult>()
  // Latest labels first, preserving candidates whose later observation is missing.
  for (const poll of [...polls].reverse()) for (const result of poll.scenario.resultados) {
    if (result.matchStatus !== "exact_alias" || !result.candidateSlug) continue
    const key = resultKey(result)
    if (!results.has(key)) results.set(key, result)
  }
  const latestValue = (result: PollResult) => {
    for (const poll of [...polls].reverse()) {
      const row = poll.scenario.resultados.find(item => resultKey(item) === resultKey(result))
      if (row && publishedValue(poll, row) !== null) return publishedValue(poll, row)!
    }
    return -1
  }
  return [...results.values()].sort((a, b) => latestValue(b) - latestValue(a) || a.rawLabel.localeCompare(b.rawLabel, "pt-BR"))
}

export function candidateObservations(polls: StatePollScenario[], key: string) {
  return polls.map(poll => {
    const result = poll.scenario.resultados.find(row => resultKey(row) === key)
    return { poll, date: fieldworkDate(poll), value: result ? publishedValue(poll, result) : null }
  })
}

/** Missing values and duplicate fieldwork dates break lines, without interpolation. */
export function observationSegments(observations: ReturnType<typeof candidateObservations>) {
  const dates = new Map<string, number>()
  for (const observation of observations) if (observation.date) dates.set(observation.date, (dates.get(observation.date) ?? 0) + 1)
  const segments: typeof observations[] = []
  let segment: typeof observations = []
  for (const observation of observations) {
    if (!observation.date || observation.value === null || dates.get(observation.date)! > 1) {
      if (segment.length) segments.push(segment)
      segment = []
      continue
    }
    segment.push(observation)
  }
  if (segment.length) segments.push(segment)
  return segments
}

export const formatPercent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
export function formatPollDate(value: string | null, short = false) {
  if (!value) return "Não informado"
  const parsed = new Date(`${value}T12:00:00Z`)
  if (!Number.isFinite(parsed.getTime())) return "Não informado"
  return parsed.toLocaleDateString("pt-BR", short
    ? { day: "numeric", month: "short", timeZone: "UTC" }
    : { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })
}
