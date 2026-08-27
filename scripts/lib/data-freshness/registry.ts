import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import type { FreshnessSource, FreshnessStatus } from "./types"

const REGISTRY_PATH = resolve(process.cwd(), "scripts/data/data-freshness-sources.json")

export interface SourceEvidence {
  source_id: string
  checked_at: string | null
  source_error?: string | null
  review_required?: boolean
}

export interface SourceFreshnessResult extends SourceEvidence {
  status: FreshnessStatus
  age_hours: number | null
  negative_claims_allowed: boolean
}

export function loadFreshnessRegistry(path = REGISTRY_PATH): FreshnessSource[] {
  return JSON.parse(readFileSync(path, "utf8")) as FreshnessSource[]
}

export function aggregateSourceEvidence(
  source: FreshnessSource,
  allEvidence: SourceEvidence[],
): SourceEvidence {
  if (source.collection_source_ids.length === 0) {
    return { source_id: source.source_id, checked_at: null }
  }
  const byId = new Map(allEvidence.map((item) => [item.source_id, item]))
  const candidates = source.collection_source_ids.map((sourceId) => byId.get(sourceId))
  if (candidates.some((item) => !item)) {
    return { source_id: source.source_id, checked_at: null }
  }
  const complete = candidates as SourceEvidence[]
  const sourceError = complete.find((item) => item.source_error)?.source_error ?? null
  const checkedAt = complete
    .map((item) => item.checked_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null
  return {
    source_id: source.source_id,
    checked_at: checkedAt,
    source_error: sourceError,
    review_required: complete.some((item) => item.review_required),
  }
}

export function evaluateSourceFreshness(
  source: FreshnessSource,
  evidence: SourceEvidence,
  now = new Date(),
): SourceFreshnessResult {
  if (evidence.source_error) {
    return {
      ...evidence,
      status: "source_error",
      age_hours: null,
      negative_claims_allowed: false,
    }
  }
  if (evidence.review_required) {
    return {
      ...evidence,
      status: "review_required",
      age_hours: evidence.checked_at
        ? Math.max(0, (now.getTime() - Date.parse(evidence.checked_at)) / 3_600_000)
        : null,
      negative_claims_allowed: false,
    }
  }
  if (!evidence.checked_at) {
    return {
      ...evidence,
      status: "stale",
      age_hours: null,
      negative_claims_allowed: false,
    }
  }

  const checkedAt = Date.parse(evidence.checked_at)
  if (!Number.isFinite(checkedAt)) {
    return {
      ...evidence,
      source_error: "checked_at inválido",
      status: "source_error",
      age_hours: null,
      negative_claims_allowed: false,
    }
  }
  const ageHours = Math.max(0, (now.getTime() - checkedAt) / 3_600_000)
  const stale = source.max_age_hours !== null && ageHours > source.max_age_hours
  return {
    ...evidence,
    status: stale ? "stale" : "fresh",
    age_hours: ageHours,
    negative_claims_allowed: !stale,
  }
}
