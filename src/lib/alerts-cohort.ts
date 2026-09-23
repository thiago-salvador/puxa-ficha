export interface AlertCohortCandidate {
  id: string
  slug?: string
  cargo: string
  uf: string | null
}

export interface AlertCohortSubscription {
  cargo: string
  uf: string | null
}

export interface ResolveAlertCohortInput {
  cohort: readonly AlertCohortCandidate[]
  directCandidateIds?: readonly string[]
  subscriptions?: readonly AlertCohortSubscription[]
  /** Catálogos persistidos permitem que uma assinatura sobreviva à saída temporária da coorte. */
  allowedCargos?: readonly string[]
  allowedUfs?: readonly string[]
  senadoEnabled?: boolean
  maxCandidates?: number
}

export const ALERT_COHORT_MAX_SUBSCRIPTIONS = 10
export const ALERT_COHORT_MAX_CANDIDATES = 500
export const ALERT_COHORT_CARGOS = ["Presidente", "Governador", "Senador"] as const
export const ALERT_COHORT_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const

export interface InvalidAlertCohortSubscription {
  subscription: AlertCohortSubscription
  reason: "cargo_invalido" | "uf_invalida"
}

export interface ResolveAlertCohortResult {
  candidateIds: string[]
  validSubscriptions: AlertCohortSubscription[]
  invalidSubscriptions: InvalidAlertCohortSubscription[]
  matchedSubscriptionCount: number
  truncated: boolean
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeUf(value: unknown): string {
  return normalizeText(value).toUpperCase()
}

function isSenator(candidate: AlertCohortCandidate): boolean {
  return normalizeText(candidate.cargo).toLocaleLowerCase("pt-BR") === "senador"
}

const DEFAULT_ALERT_CARGOS = new Set<string>(ALERT_COHORT_CARGOS)

function uniqueNormalized(values: readonly string[] | undefined): Set<string> | null {
  if (!values) return null
  return new Set(values.map(normalizeText).filter(Boolean))
}

/**
 * Resolve a subscriber's current public cohort without querying or mutating a
 * database. Candidate order is the input order, so digest output is stable.
 */
export function resolveAlertCohort(input: ResolveAlertCohortInput): ResolveAlertCohortResult {
  const senadoEnabled = input.senadoEnabled ?? false
  const maxCandidates = Number.isInteger(input.maxCandidates) && (input.maxCandidates as number) > 0
    ? input.maxCandidates as number
    : ALERT_COHORT_MAX_CANDIDATES
  const allowedCargos = uniqueNormalized(input.allowedCargos) ?? DEFAULT_ALERT_CARGOS
  const allowedUfs = uniqueNormalized(input.allowedUfs)
  const invalidSubscriptions: InvalidAlertCohortSubscription[] = []
  const validSubscriptions: AlertCohortSubscription[] = []

  for (const raw of input.subscriptions ?? []) {
    const cargo = normalizeText(raw?.cargo)
    const uf = raw?.uf == null || normalizeText(raw.uf) === "" ? null : normalizeUf(raw.uf)
    if (!cargo || (allowedCargos ? !allowedCargos.has(cargo) : false)) {
      invalidSubscriptions.push({ subscription: { cargo, uf }, reason: "cargo_invalido" })
      continue
    }
    if (cargo === "Senador" && !senadoEnabled) {
      invalidSubscriptions.push({ subscription: { cargo, uf }, reason: "cargo_invalido" })
      continue
    }
    const validUf = cargo === "Presidente"
      ? uf === null
      : uf === null || (/^[A-Z]{2}$/.test(uf) && (allowedUfs ? allowedUfs.has(uf) : true))
    if (!validUf) {
      invalidSubscriptions.push({ subscription: { cargo, uf }, reason: "uf_invalida" })
      continue
    }
    validSubscriptions.push({ cargo, uf })
  }

  const candidates = input.cohort.filter((candidate) => {
    if (!candidate.id || !candidate.cargo) return false
    return senadoEnabled || !isSenator(candidate)
  })
  const byId = new Map<string, AlertCohortCandidate>()
  for (const candidate of candidates) if (!byId.has(candidate.id)) byId.set(candidate.id, candidate)

  const ids: string[] = []
  const seen = new Set<string>()
  const add = (id: string) => {
    if (ids.length >= maxCandidates || seen.has(id) || !byId.has(id)) return
    seen.add(id)
    ids.push(id)
  }

  for (const id of input.directCandidateIds ?? []) add(normalizeText(id))

  let matchedSubscriptionCount = 0
  for (const subscription of validSubscriptions) {
    let matched = false
    for (const candidate of candidates) {
      if (
        candidate.cargo === subscription.cargo &&
        (subscription.uf === null || normalizeUf(candidate.uf) === subscription.uf)
      ) {
        matched = true
        add(candidate.id)
      }
    }
    if (matched) matchedSubscriptionCount += 1
  }

  const totalBeforeLimit = new Set<string>()
  for (const id of input.directCandidateIds ?? []) if (byId.has(normalizeText(id))) totalBeforeLimit.add(normalizeText(id))
  for (const subscription of validSubscriptions) {
    for (const candidate of candidates) {
      if (
        candidate.cargo === subscription.cargo &&
        (subscription.uf === null || normalizeUf(candidate.uf) === subscription.uf)
      ) totalBeforeLimit.add(candidate.id)
    }
  }

  return {
    candidateIds: ids,
    validSubscriptions,
    invalidSubscriptions,
    matchedSubscriptionCount,
    truncated: totalBeforeLimit.size > maxCandidates,
  }
}
