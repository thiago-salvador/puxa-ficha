import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import type { FreshnessSource, FreshnessStatus } from "./types"

const REGISTRY_PATH = resolve(process.cwd(), "scripts/data/data-freshness-sources.json")

export interface SourceEvidence {
  source_id: string
  checked_at: string | null
  source_error?: string | null
  review_required?: boolean
  error_count?: number
  debt_count?: number
  total_count?: number
  execution_id?: string | null
  missing_source_ids?: string[]
  /** Evidência individual preservada por aggregateSourceEvidence para o gate strict. */
  member_evidence?: SourceEvidence[]
}

export interface SourceFreshnessResult extends SourceEvidence {
  status: FreshnessStatus
  age_hours: number | null
  negative_claims_allowed: boolean
  /** A data mais antiga entre os membros requeridos com data válida. */
  oldest_checked_at?: string | null
  /** Membros requeridos cuja própria evidência excedeu o SLA da família. */
  stale_source_ids?: string[]
}

export interface FreshnessEvaluationOptions {
  /** O modo strict avalia cada membro requerido, em vez de só o agregado. */
  strict?: boolean
}

export function loadFreshnessRegistry(path = REGISTRY_PATH): FreshnessSource[] {
  return JSON.parse(readFileSync(path, "utf8")) as FreshnessSource[]
}

function evidenceOrder(item: SourceEvidence): [number, string] {
  const parsed = item.checked_at ? Date.parse(item.checked_at) : Number.NEGATIVE_INFINITY
  return [Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY, item.execution_id ?? ""]
}

/** Mantém somente a execução mais recente de cada fonte, com desempate estável. */
export function selectLatestSourceEvidence(allEvidence: SourceEvidence[]): SourceEvidence[] {
  const latest = new Map<string, SourceEvidence>()
  for (const item of allEvidence) {
    const current = latest.get(item.source_id)
    if (!current) {
      latest.set(item.source_id, item)
      continue
    }
    const [itemTime, itemExecution] = evidenceOrder(item)
    const [currentTime, currentExecution] = evidenceOrder(current)
    if (itemTime > currentTime || (itemTime === currentTime && itemExecution > currentExecution)) {
      latest.set(item.source_id, item)
    }
  }
  return [...latest.values()]
}

export function aggregateSourceEvidence(
  source: FreshnessSource,
  allEvidence: SourceEvidence[],
): SourceEvidence {
  if (source.collection_source_ids.length === 0) {
    return { source_id: source.source_id, checked_at: null }
  }
  const byId = new Map(selectLatestSourceEvidence(allEvidence).map((item) => [item.source_id, item]))
  const candidates = source.collection_source_ids.map((sourceId) => byId.get(sourceId))
  const complete = candidates.filter((item): item is SourceEvidence => Boolean(item))
  const missingSourceIds = source.collection_source_ids.filter((sourceId) => !byId.has(sourceId))
  if (complete.length === 0) {
    return {
      source_id: source.source_id,
      checked_at: null,
      debt_count: missingSourceIds.length,
      missing_source_ids: missingSourceIds,
      member_evidence: [],
    }
  }
  const sourceError = complete.find((item) => item.source_error)?.source_error ?? null
  const checkedAt = complete
    .map((item) => item.checked_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
  return {
    source_id: source.source_id,
    checked_at: checkedAt,
    source_error: sourceError,
    review_required: complete.some((item) => item.review_required),
    error_count: complete.reduce((total, item) => total + (item.error_count ?? 0), 0),
    debt_count:
      missingSourceIds.length + complete.reduce((total, item) => total + (item.debt_count ?? 0), 0),
    total_count: complete.reduce((total, item) => total + (item.total_count ?? 0), 0),
    execution_id: complete.map((item) => item.execution_id).filter(Boolean).join(",") || null,
    missing_source_ids: missingSourceIds,
    member_evidence: complete,
  }
}

function validCheckedAt(value: string | null | undefined): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null
  return value
}

function oldestCheckedAt(evidence: SourceEvidence): string | null {
  const members = evidence.member_evidence ?? [evidence]
  const values = members
    .map((item) => validCheckedAt(item.checked_at))
    .filter((value): value is string => value !== null)
  if (values.length === 0) return null
  return values.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null
}

function staleMemberIds(
  source: FreshnessSource,
  evidence: SourceEvidence,
  now: Date,
): string[] {
  if (source.max_age_hours === null) return []
  const members = evidence.member_evidence ?? [evidence]
  return members
    .filter((member) => {
      const checkedAt = validCheckedAt(member.checked_at)
      if (!checkedAt) return false
      const ageHours = Math.max(0, (now.getTime() - Date.parse(checkedAt)) / 3_600_000)
      return ageHours > source.max_age_hours!
    })
    .map((member) => member.source_id)
}

export function evaluateSourceFreshness(
  source: FreshnessSource,
  evidence: SourceEvidence,
  now = new Date(),
  options: FreshnessEvaluationOptions = {},
): SourceFreshnessResult {
  const strict = options.strict === true
  const oldest = oldestCheckedAt(evidence)
  const staleIds = strict ? staleMemberIds(source, evidence, now) : []
  const ageHoursForResult = (fallback: string | null | undefined): number | null => {
    const checkedAt = strict ? oldest : validCheckedAt(fallback)
    return checkedAt
      ? Math.max(0, (now.getTime() - Date.parse(checkedAt)) / 3_600_000)
      : null
  }
  const result = (
    status: FreshnessStatus,
    ageHours: number | null,
    negativeClaimsAllowed: boolean,
    overrides: Partial<SourceEvidence> = {},
  ): SourceFreshnessResult => ({
    ...evidence,
    ...overrides,
    status,
    age_hours: ageHours,
    negative_claims_allowed: negativeClaimsAllowed,
    oldest_checked_at: oldest,
    stale_source_ids: staleIds,
  })

  if (evidence.source_error && source.refresh_mode === "scheduled") {
    return result("source_error", null, false)
  }
  if (evidence.review_required) {
    return result("review_required", ageHoursForResult(evidence.checked_at), false)
  }
  if (evidence.source_error || (evidence.debt_count ?? 0) > 0) {
    return result("technical_debt", ageHoursForResult(evidence.checked_at), false)
  }
  if (!evidence.checked_at) {
    if (source.refresh_mode !== "scheduled" && source.stale_policy !== "review_required") {
      return result("technical_debt", null, false)
    }
    return result("stale", null, false)
  }

  const checkedAt = Date.parse(evidence.checked_at)
  if (!Number.isFinite(checkedAt)) {
    return result("source_error", null, false, { source_error: "checked_at inválido" })
  }
  const ageHours = ageHoursForResult(evidence.checked_at) ?? Math.max(0, (now.getTime() - checkedAt) / 3_600_000)
  const stale = source.max_age_hours !== null && ageHours > source.max_age_hours
  if (stale && source.refresh_mode !== "scheduled" && source.stale_policy !== "review_required") {
    return result("technical_debt", ageHours, false)
  }
  if (strict && staleIds.length > 0) return result("stale", ageHours, false)
  return result(stale ? "stale" : "fresh", ageHours, !stale)
}

/** Avalia uma família considerando a evidência mais recente de cada membro. */
export function evaluateSourceFreshnessStrict(
  source: FreshnessSource,
  allEvidence: SourceEvidence[],
  now = new Date(),
): SourceFreshnessResult {
  return evaluateSourceFreshness(source, aggregateSourceEvidence(source, allEvidence), now, { strict: true })
}
