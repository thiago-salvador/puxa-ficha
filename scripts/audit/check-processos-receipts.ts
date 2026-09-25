import { readFileSync } from "node:fs"

export const PROCESSOS_RECEIPT_SOURCE = "processos-curadoria"
export const PROCESSOS_RECEIPT_SCOPE = "candidato"
export const DEFAULT_MAX_AGE_DAYS = 14

export type CoverageSnapshotRow = {
  candidate_id: string
  slug: string
  receipt_candidate_id?: string | null
  receipt_slug?: string | null
  receipt_source?: string | null
  receipt_scope?: string | null
  receipt_executed_at?: string | null
  receipt_result?: string | null
  receipt_volume?: number | null
  has_receipt?: boolean | null
}

export type ProcessosReceiptState =
  | "sem_recibo"
  | "stale"
  | "erro"
  | "indeterminado"
  | "encontrado"
  | "vazio_confirmado"

export type ProcessosReceiptReport = {
  ok: boolean
  total_public_candidates: number
  summary: Record<ProcessosReceiptState, number>
  missing_candidate_ids: string[]
  invalid_rows: number
  generated_at: string
  max_age_days: number
}

type SnapshotPayload = {
  rows?: unknown
}

const STATES: readonly ProcessosReceiptState[] = [
  "sem_recibo",
  "stale",
  "erro",
  "indeterminado",
  "encontrado",
  "vazio_confirmado",
]

function blankSummary(): Record<ProcessosReceiptState, number> {
  return Object.fromEntries(STATES.map((state) => [state, 0])) as Record<ProcessosReceiptState, number>
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function rowShape(value: unknown): CoverageSnapshotRow | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const candidateId = stringOrNull(row.candidate_id)
  const slug = stringOrNull(row.slug)
  if (!candidateId || !slug) return null
  return {
    candidate_id: candidateId,
    slug,
    receipt_candidate_id: stringOrNull(row.receipt_candidate_id),
    receipt_slug: stringOrNull(row.receipt_slug),
    receipt_source: stringOrNull(row.receipt_source),
    receipt_scope: stringOrNull(row.receipt_scope),
    receipt_executed_at: stringOrNull(row.receipt_executed_at),
    receipt_result: stringOrNull(row.receipt_result),
    receipt_volume: typeof row.receipt_volume === "number" ? row.receipt_volume : null,
    has_receipt: typeof row.has_receipt === "boolean" ? row.has_receipt : null,
  }
}

function receiptState(row: CoverageSnapshotRow, now: Date, maxAgeDays: number): { state: ProcessosReceiptState; invalid: boolean } {
  const hasAnyReceiptField = row.has_receipt === true
    || (row.receipt_candidate_id !== null && row.receipt_candidate_id !== undefined)
    || (row.receipt_slug !== null && row.receipt_slug !== undefined)
    || (row.receipt_source !== null && row.receipt_source !== undefined)
    || (row.receipt_scope !== null && row.receipt_scope !== undefined)
    || (row.receipt_executed_at !== null && row.receipt_executed_at !== undefined)
    || (row.receipt_result !== null && row.receipt_result !== undefined)
    || (row.receipt_volume !== null && row.receipt_volume !== undefined)
  if (!hasAnyReceiptField) return { state: "sem_recibo", invalid: false }

  const hasReceipt = row.has_receipt === true || row.receipt_candidate_id !== null && row.receipt_candidate_id !== undefined
  if (!hasReceipt) return { state: "sem_recibo", invalid: true }

  const identityMatches = row.receipt_candidate_id === row.candidate_id
    && row.receipt_slug === row.slug
    && row.receipt_source === PROCESSOS_RECEIPT_SOURCE
    && row.receipt_scope === PROCESSOS_RECEIPT_SCOPE
  const executedAt = row.receipt_executed_at ? new Date(row.receipt_executed_at) : null
  if (!identityMatches || !executedAt || Number.isNaN(executedAt.getTime()) || executedAt.getTime() > now.getTime()) {
    return { state: "indeterminado", invalid: true }
  }
  const volume = row.receipt_volume
  if (!Number.isInteger(volume) || (volume ?? -1) < 0
    || (row.receipt_result === "vazio_confirmado" && volume !== 0)
    || (row.receipt_result === "encontrado" && (volume ?? 0) <= 0)) {
    return { state: "indeterminado", invalid: true }
  }
  if (now.getTime() - executedAt.getTime() > maxAgeDays * 24 * 60 * 60 * 1000) return { state: "stale", invalid: false }

  switch (row.receipt_result) {
    case "encontrado": return { state: "encontrado", invalid: false }
    case "vazio_confirmado": return { state: "vazio_confirmado", invalid: false }
    case "erro": return { state: "erro", invalid: false }
    default: return { state: "indeterminado", invalid: false }
  }
}

export function checkProcessosReceipts(
  rows: readonly CoverageSnapshotRow[],
  options: { now?: Date; maxAgeDays?: number } = {},
): ProcessosReceiptReport {
  const now = options.now ?? new Date()
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("now inválido")
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) throw new Error("maxAgeDays inválido")
  if (rows.length === 0) throw new Error("snapshot vazio: coorte pública ausente")
  const ids = new Set<string>()
  const slugs = new Set<string>()
  for (const row of rows) {
    if (ids.has(row.candidate_id) || slugs.has(row.slug)) throw new Error("snapshot duplicado: candidato repetido")
    ids.add(row.candidate_id)
    slugs.add(row.slug)
  }

  const summary = blankSummary()
  const missingCandidateIds: string[] = []
  let invalidRows = 0
  for (const row of rows) {
    const result = receiptState(row, now, maxAgeDays)
    summary[result.state] += 1
    if (result.invalid) invalidRows += 1
    if (result.state === "sem_recibo" && !result.invalid) missingCandidateIds.push(row.candidate_id)
  }
  return {
    ok: missingCandidateIds.length === 0 && invalidRows === 0,
    total_public_candidates: rows.length,
    summary,
    missing_candidate_ids: missingCandidateIds,
    invalid_rows: invalidRows,
    generated_at: now.toISOString(),
    max_age_days: maxAgeDays,
  }
}

export function parseSnapshot(value: unknown): CoverageSnapshotRow[] {
  const rawRows = Array.isArray(value) ? value : value && typeof value === "object" ? (value as SnapshotPayload).rows : null
  if (!Array.isArray(rawRows)) throw new Error("snapshot precisa conter rows[]")
  const rows = rawRows.map(rowShape)
  if (rows.some((row) => row === null)) throw new Error("snapshot contém linha sem candidate_id ou slug")
  return rows as CoverageSnapshotRow[]
}

function main(): void {
  const input = process.argv.find((arg) => arg.startsWith("--input="))?.slice("--input=".length)
  if (!input) throw new Error("uso: check-processos-receipts.ts --input=/caminho/snapshot.json")
  const parsed: unknown = JSON.parse(readFileSync(input, "utf8"))
  const rows = parseSnapshot(parsed)
  const report = checkProcessosReceipts(rows)
  // Keep CI output safe: counts only, without names, slugs, URLs or judicial data.
  console.log(JSON.stringify({
    ok: report.ok,
    total_public_candidates: report.total_public_candidates,
    summary: report.summary,
    missing_receipts: report.missing_candidate_ids.length,
    max_age_days: report.max_age_days,
  }))
  if (!report.ok) process.exitCode = 1
}

if (process.argv[1]?.endsWith("check-processos-receipts.ts")) main()
