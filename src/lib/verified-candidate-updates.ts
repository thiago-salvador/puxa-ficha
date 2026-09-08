import { SITUACAO_CANDIDATURA_DOMINIO } from "./situacao-candidatura"

export interface VerifiedCandidateUpdate {
  id: string
  candidate_slug: string
  candidate_name: string
  field: "patrimonio" | "situacao" | "partido"
  year: number
  before_value: string
  after_value: string
  source_url: string
  detected_at: string
}

export interface VerifiedUpdatesResource {
  status: "available" | "unavailable"
  updates: VerifiedCandidateUpdate[]
}

/** Reject malformed rows instead of exposing arbitrary database strings/URLs. */
export function isVerifiedCandidateUpdate(value: unknown): value is VerifiedCandidateUpdate {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  if (!["id", "candidate_slug", "candidate_name", "before_value", "after_value", "source_url", "detected_at"].every(
    (key) => typeof row[key] === "string" && (row[key] as string).trim().length > 0,
  )) return false
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.candidate_slug as string)) return false
  if (!["patrimonio", "situacao", "partido"].includes(row.field as string)) return false
  if (!Number.isInteger(row.year) || Number(row.year) < 1990 || Number(row.year) > 2100) return false
  if (!Number.isFinite(Date.parse(row.detected_at as string))) return false
  if (row.before_value === row.after_value) return false
  if (row.field === "situacao" && ![row.before_value, row.after_value].every(
    (item) => (SITUACAO_CANDIDATURA_DOMINIO as readonly string[]).includes(item as string),
  )) return false
  if (row.field === "patrimonio" && ![row.before_value, row.after_value].every(
    (item) => /^\d+(\.\d{1,2})?$/.test(item as string) && Number.isFinite(Number(item)),
  )) return false
  try {
    const url = new URL(row.source_url as string)
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === "tse.jus.br" || url.hostname.endsWith(".tse.jus.br"))
  } catch {
    return false
  }
}

export function formatUpdateValue(update: VerifiedCandidateUpdate, value: string): string {
  if (update.field === "patrimonio") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value))
  }
  return value
}
