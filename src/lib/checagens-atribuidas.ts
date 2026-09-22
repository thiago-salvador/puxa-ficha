import rawChecks from "../../scripts/data/checagens-atribuidas.json"

const ATTRIBUTED_CHECKS_POLICY = "pf-checagens-v1"

export type AttributedSourceOrigin = "cited_by_publisher" | "consulted_by_us"

export interface AttributedCheckSource {
  url?: string
  origin: AttributedSourceOrigin
  title?: string
  excerpt?: string
}

export interface AttributedCheckCorrection {
  version: string
  publishedAt: string
  summary: string
  finalLabel: string
  url: string
}

export interface AttributedCheckReview {
  approved: true
  reviewer: string
  reviewerKind: "human" | "model_principal"
  reviewedAt: string
}

export type AttributedCheckRelationship = "same_occurrence" | "equivalent_occurrence"

export interface AttributedCheckRelation {
  checkId: string
  relationship: AttributedCheckRelationship
  rationale: string
  review: AttributedCheckReview
}

export interface AttributedCheckEvent {
  date: string
  context: string
  speakerIdentityReviewed: true
  contextReviewed: true
  speaker?: string
  question?: string
  adjacentTurns?: string[]
  timecode?: string
}

export interface AttributedCheckSourceEvidence {
  originalLabel: string
  speakerIdentity: string
  contextExcerpt: string
}

/**
 * A single claim evaluated by a third-party publisher. This contract carries
 * the publisher's label only; it intentionally has no independent verdict.
 */
export interface AttributedFactCheck {
  id: string
  candidate_id: string
  candidate_slug: string
  candidate_name: string
  office: "Presidente" | "Governador"
  uf: string | null
  claim: string
  claimFormat: "literal" | "paraphrase"
  quoteText?: string
  event: AttributedCheckEvent
  publisher: string
  assessmentOrigin: "publisher"
  originalLabel: string
  summary: string
  publishedAt: string
  originalUrl: string
  methodologyUrl: string
  methodologyVersion: string
  sourcePolicyVersion: string
  sourceSnapshotSha256: string
  retrievedAt: string
  sourceEvidence: AttributedCheckSourceEvidence
  sources: AttributedCheckSource[]
  corrections: AttributedCheckCorrection[]
  review: AttributedCheckReview
  relatedChecks?: AttributedCheckRelation[]
}

export interface CandidateCheckIdentity {
  candidate_id: string
  candidate_slug: string
  office: string
  uf: string | null
}

const INDEPENDENT_VERDICT_KEYS = new Set([
  "verdict",
  "truthLabel",
  "truth_status",
  "independentVerdict",
  "independentConclusion",
  "independentAssessment",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function validDate(value: unknown): value is string {
  if (!nonEmptyString(value)) return false
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(value)
  if (!match || Number.isNaN(Date.parse(value))) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
}

function validHttpsUrl(value: unknown, allowHttp = false): value is string {
  if (!nonEmptyString(value)) return false
  try {
    const url = new URL(value)
    return (url.protocol === "https:" || allowHttp && url.protocol === "http:") && !url.username && !url.password
  } catch {
    return false
  }
}

function hasIndependentVerdict(value: Record<string, unknown>): boolean {
  return [...INDEPENDENT_VERDICT_KEYS].some((key) => key in value)
}

function parseReview(value: unknown): AttributedCheckReview | null {
  if (!isRecord(value) || value.approved !== true || !nonEmptyString(value.reviewer) ||
    (value.reviewerKind !== "human" && value.reviewerKind !== "model_principal") || !validDate(value.reviewedAt)) return null
  return {
    approved: true,
    reviewer: value.reviewer,
    reviewerKind: value.reviewerKind,
    reviewedAt: value.reviewedAt,
  }
}

function parseRelatedChecks(value: unknown): AttributedCheckRelation[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const relations: AttributedCheckRelation[] = []
  for (const raw of value) {
    if (!isRecord(raw) || !nonEmptyString(raw.checkId) ||
      (raw.relationship !== "same_occurrence" && raw.relationship !== "equivalent_occurrence") ||
      !nonEmptyString(raw.rationale)) return null
    const review = parseReview(raw.review)
    if (!review) return null
    relations.push({ checkId: raw.checkId, relationship: raw.relationship, rationale: raw.rationale, review })
  }
  return relations
}

function parseSource(value: unknown): AttributedCheckSource | null {
  if (!isRecord(value)) return null
  if (value.origin !== "cited_by_publisher" && value.origin !== "consulted_by_us") return null
  if (value.url !== undefined && !validHttpsUrl(value.url, true)) return null
  if (value.url === undefined && (value.origin !== "cited_by_publisher" || !nonEmptyString(value.title))) return null
  if (value.title !== undefined && !nonEmptyString(value.title)) return null
  if (value.excerpt !== undefined && !nonEmptyString(value.excerpt)) return null
  return {
    ...(value.url === undefined ? {} : { url: value.url }),
    origin: value.origin,
    ...(value.title === undefined ? {} : { title: value.title }),
    ...(value.excerpt === undefined ? {} : { excerpt: value.excerpt }),
  }
}

function parseCorrection(value: unknown): AttributedCheckCorrection | null {
  if (!isRecord(value)) return null
  if (!nonEmptyString(value.version) || !validDate(value.publishedAt) || !nonEmptyString(value.summary) || !nonEmptyString(value.finalLabel) || !validHttpsUrl(value.url)) {
    return null
  }
  return {
    version: value.version,
    publishedAt: value.publishedAt,
    summary: value.summary,
    finalLabel: value.finalLabel,
    url: value.url,
  }
}

function parseEvent(value: unknown): AttributedCheckEvent | null {
  if (!isRecord(value) || !validDate(value.date) || !nonEmptyString(value.context) || value.speakerIdentityReviewed !== true || value.contextReviewed !== true) return null
  if (value.speaker !== undefined && !nonEmptyString(value.speaker)) return null
  if (value.question !== undefined && !nonEmptyString(value.question)) return null
  if (value.timecode !== undefined && !nonEmptyString(value.timecode)) return null
  if (value.adjacentTurns !== undefined && (!Array.isArray(value.adjacentTurns) || value.adjacentTurns.some((turn) => !nonEmptyString(turn)))) return null
  return {
    date: value.date,
    context: value.context,
    speakerIdentityReviewed: true,
    contextReviewed: true,
    ...(value.speaker === undefined ? {} : { speaker: value.speaker }),
    ...(value.question === undefined ? {} : { question: value.question }),
    ...(value.adjacentTurns === undefined ? {} : { adjacentTurns: value.adjacentTurns }),
    ...(value.timecode === undefined ? {} : { timecode: value.timecode }),
  }
}

/** Strict runtime parser used at the publication boundary. */
export function parseAttributedFactCheck(value: unknown): AttributedFactCheck | null {
  if (!isRecord(value) || hasIndependentVerdict(value)) return null
  if (
    !nonEmptyString(value.id) ||
    !nonEmptyString(value.candidate_id) ||
    !nonEmptyString(value.candidate_slug) ||
    !nonEmptyString(value.candidate_name) ||
    (value.office !== "Presidente" && value.office !== "Governador") ||
    (value.uf !== null && !nonEmptyString(value.uf)) ||
    !nonEmptyString(value.claim) ||
    (value.claimFormat !== "literal" && value.claimFormat !== "paraphrase") ||
    (value.quoteText !== undefined && !nonEmptyString(value.quoteText)) ||
    !nonEmptyString(value.publisher) ||
    value.assessmentOrigin !== "publisher" ||
    !nonEmptyString(value.originalLabel) ||
    !nonEmptyString(value.summary) ||
    !validDate(value.publishedAt) ||
    !validHttpsUrl(value.originalUrl) ||
    !validHttpsUrl(value.methodologyUrl) ||
    !nonEmptyString(value.methodologyVersion) ||
    value.sourcePolicyVersion !== ATTRIBUTED_CHECKS_POLICY ||
    !/^[a-f0-9]{64}$/i.test(String(value.sourceSnapshotSha256)) ||
    !validDate(value.retrievedAt) ||
    !isRecord(value.sourceEvidence) ||
    !nonEmptyString(value.sourceEvidence.originalLabel) ||
    value.sourceEvidence.originalLabel !== value.originalLabel ||
    !nonEmptyString(value.sourceEvidence.speakerIdentity) ||
    !nonEmptyString(value.sourceEvidence.contextExcerpt) ||
    !Array.isArray(value.sources) ||
    !Array.isArray(value.corrections) ||
    !isRecord(value.review)
  ) return null

  const review = parseReview(value.review)
  const event = parseEvent(value.event)
  const sources = value.sources.map(parseSource)
  const corrections = value.corrections.map(parseCorrection)
  const relatedChecks = parseRelatedChecks(value.relatedChecks)
  if (!review || !event || !relatedChecks || sources.some((source) => source === null) || corrections.some((correction) => correction === null)) return null
  if (!sources.some((source) => source?.origin === "cited_by_publisher")) return null
  const parsedCorrections = corrections as AttributedCheckCorrection[]
  if (parsedCorrections.length > 0 && parsedCorrections[parsedCorrections.length - 1].finalLabel !== value.originalLabel) return null

  return {
    id: value.id,
    candidate_id: value.candidate_id,
    candidate_slug: value.candidate_slug,
    candidate_name: value.candidate_name,
    office: value.office,
    uf: value.uf,
    claim: value.claim,
    claimFormat: value.claimFormat,
    ...(value.quoteText === undefined ? {} : { quoteText: value.quoteText }),
    event,
    publisher: value.publisher,
    assessmentOrigin: "publisher",
    originalLabel: value.originalLabel,
    summary: value.summary,
    publishedAt: value.publishedAt,
    originalUrl: value.originalUrl,
    methodologyUrl: value.methodologyUrl,
    methodologyVersion: value.methodologyVersion,
    sourcePolicyVersion: value.sourcePolicyVersion,
    sourceSnapshotSha256: String(value.sourceSnapshotSha256),
    retrievedAt: value.retrievedAt,
    sourceEvidence: {
      originalLabel: value.sourceEvidence.originalLabel,
      speakerIdentity: value.sourceEvidence.speakerIdentity,
      contextExcerpt: value.sourceEvidence.contextExcerpt,
    },
    sources: sources as AttributedCheckSource[],
    corrections: corrections as AttributedCheckCorrection[],
    review,
    ...(value.relatedChecks === undefined ? {} : { relatedChecks }),
  }
}

export interface AttributedCheckDatasetIssue {
  index: number
  id: string | null
  reason: "invalid_record" | "duplicate_id" | "identity_mismatch" | "relation_mismatch"
}

export interface CandidateRosterIdentity {
  candidate_id: string
  candidate_slug: string
  office: "Presidente" | "Governador"
  uf: string | null
}

/**
 * Validate the entire public dataset before selecting cards. Invalid rows are
 * surfaced to tests and release gates instead of being silently dropped.
 */
export function validateAttributedFactCheckDataset(
  records: unknown,
  roster: CandidateRosterIdentity[] = [],
): AttributedCheckDatasetIssue[] {
  if (!Array.isArray(records)) return [{ index: -1, id: null, reason: "invalid_record" }]
  const issues: AttributedCheckDatasetIssue[] = []
  const seenIds = new Set<string>()
  const parsedRecords: Array<{ index: number; record: AttributedFactCheck }> = []
  for (const [index, raw] of records.entries()) {
    const id = isRecord(raw) && nonEmptyString(raw.id) ? raw.id : null
    const parsed = parseAttributedFactCheck(raw)
    if (!parsed) {
      issues.push({ index, id, reason: "invalid_record" })
      continue
    }
    if (seenIds.has(parsed.id)) issues.push({ index, id: parsed.id, reason: "duplicate_id" })
    seenIds.add(parsed.id)
    parsedRecords.push({ index, record: parsed })
    if (roster.length > 0 && !roster.some((candidate) =>
      candidate.candidate_id === parsed.candidate_id &&
      candidate.candidate_slug === parsed.candidate_slug &&
      candidate.office === parsed.office &&
      candidate.uf === parsed.uf,
    )) {
      issues.push({ index, id: parsed.id, reason: "identity_mismatch" })
    }
  }
  const parsedById = new Map(parsedRecords.map(({ record }) => [record.id, record]))
  for (const { index, record } of parsedRecords) {
    const relatedIds = new Set<string>()
    for (const relation of record.relatedChecks ?? []) {
      const target = parsedById.get(relation.checkId)
      if (relatedIds.has(relation.checkId) || relation.checkId === record.id || !target ||
        target.candidate_id !== record.candidate_id || target.candidate_slug !== record.candidate_slug ||
        target.office !== record.office || target.uf !== record.uf) {
        issues.push({ index, id: record.id, reason: "relation_mismatch" })
      }
      relatedIds.add(relation.checkId)
    }
  }
  return issues
}

export function selectApprovedAttributedFactChecks(
  records: unknown,
  identity: CandidateCheckIdentity,
): AttributedFactCheck[] {
  if (!Array.isArray(records) || identity.office !== "Presidente" && identity.office !== "Governador") return []
  return records
    .map(parseAttributedFactCheck)
    .filter((record): record is AttributedFactCheck => record !== null)
    .filter((record) =>
      record.candidate_id === identity.candidate_id &&
      record.candidate_slug === identity.candidate_slug &&
      record.office === identity.office &&
      record.uf === identity.uf,
    )
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id))
}

export function getApprovedAttributedFactChecks(identity: CandidateCheckIdentity): AttributedFactCheck[] {
  if (validateAttributedFactCheckDataset(rawChecks).length > 0) return []
  return selectApprovedAttributedFactChecks(rawChecks, identity)
}
