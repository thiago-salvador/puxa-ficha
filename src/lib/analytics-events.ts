export const ANALYTICS_EVENTS = {
  candidateClick: "Candidate Click",
  comparisonStart: "Comparison Start",
  quizComplete: "Quiz Complete",
  externalSourceClick: "External Source Click",
  searchZeroResults: "Search Zero Results",
} as const

export const SENSITIVE_ANALYTICS_PROP_KEY_RE =
  /(^|_)(cpf|email|href|name|nome|secret|slug|token|url)($|_)|(^|_)query$/i

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]

export const ANALYTICS_EVENT_NAMES = Object.values(ANALYTICS_EVENTS) as AnalyticsEventName[]

const ANALYTICS_EVENT_NAME_SET = new Set<string>(ANALYTICS_EVENT_NAMES)

export function isAnalyticsEventName(value: unknown): value is AnalyticsEventName {
  return typeof value === "string" && ANALYTICS_EVENT_NAME_SET.has(value)
}

const ANALYTICS_ALLOWED_PAYLOAD_KEYS = [
  "area",
  "candidate_count",
  "eixo",
  "host",
  "proof_id",
  "question_count",
  "scope",
  "surface",
  "term_length",
] as const

export type AnalyticsPayloadKey = (typeof ANALYTICS_ALLOWED_PAYLOAD_KEYS)[number]
export type AnalyticsPayloadValue = string | number | boolean
export type AnalyticsPayload = Partial<Record<AnalyticsPayloadKey, AnalyticsPayloadValue>>

const ANALYTICS_ALLOWED_PAYLOAD_KEY_SET = new Set<string>(ANALYTICS_ALLOWED_PAYLOAD_KEYS)

export const ANALYTICS_PROOF_ID_RE = /^[a-z0-9_-]{8,80}$/i

export function sanitizeAnalyticsPayload(input: unknown): AnalyticsPayload {
  const out: Record<string, AnalyticsPayloadValue> = {}
  if (input === null || typeof input !== "object" || Array.isArray(input)) return out

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!ANALYTICS_ALLOWED_PAYLOAD_KEY_SET.has(key)) continue
    if (SENSITIVE_ANALYTICS_PROP_KEY_RE.test(key)) continue

    if (typeof value === "string") {
      const trimmed = value.trim()
      if (trimmed) out[key] = trimmed.slice(0, 120)
      continue
    }

    if (typeof value === "number") {
      if (Number.isFinite(value)) out[key] = value
      continue
    }

    if (typeof value === "boolean") {
      out[key] = value
    }
  }

  return out as AnalyticsPayload
}

export function getAnalyticsProofIdFromPayload(payload: AnalyticsPayload): string | null {
  const value = payload.proof_id
  if (typeof value !== "string") return null
  return ANALYTICS_PROOF_ID_RE.test(value) ? value : null
}

export function getAnalyticsHostname(href: string | undefined): string {
  if (!href) return "unknown"

  try {
    return new URL(href).hostname
  } catch {
    return "invalid"
  }
}
