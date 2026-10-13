import { readFileSync } from "node:fs"

import { naCoorteAtualizacao } from "../../src/lib/coorte-atualizacao"

export const PROCESSOS_RECEIPT_SOURCE = "processos-curadoria"
export const PROCESSOS_RECEIPT_SCOPE = "candidato"
export const DEFAULT_MAX_AGE_DAYS = 14
/**
 * Folga sobre os 14 dias antes de reprovar. A coleta local roda segunda e
 * quinta e renova o recibo a partir de 9 dias; a conferência do GitHub roda
 * 3 h depois. O recibo chega a 11 dias numa semana normal, e com uma rodada
 * perdida a seguinte já renova antes da conferência. Passar de 14 dias exige
 * duas rodadas seguidas sem renovar: alerta. A folga de 1 dia absorve rodada
 * atrasada (o launchd executa a rodada perdida quando o Mac acorda); na agenda
 * de segunda e quinta, a reprovação chega na terceira rodada seguida sem
 * renovar, uns 7 dias depois da primeira. A falha da própria rodada local já
 * aparece antes, no marcador do agente (docs/operations/processos-local.md).
 */
export const DEFAULT_STALE_GRACE_DAYS = 1

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
  /** Coorte de atualização: data em que a coleta da ficha foi encerrada. */
  atualizacao_encerrada_em?: string | null
}

export type ProcessosReceiptState =
  | "sem_recibo"
  | "stale"
  | "erro"
  | "indeterminado"
  | "encontrado"
  | "vazio_confirmado"
  | "atualizacao_encerrada"

export type ProcessosReceiptReport = {
  ok: boolean
  total_public_candidates: number
  summary: Record<ProcessosReceiptState, number>
  missing_candidate_ids: string[]
  invalid_rows: number
  /** Recibos da coorte ativa vencidos além de max_age_days + stale_grace_days. */
  stale_overdue: number
  generated_at: string
  max_age_days: number
  stale_grace_days: number
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
  "atualizacao_encerrada",
]

const DAY_MS = 24 * 60 * 60 * 1000

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
    atualizacao_encerrada_em: stringOrNull(row.atualizacao_encerrada_em),
  }
}

/**
 * Ficha congelada pela coorte de atualização: sem recibo ou recibo vencido
 * viram `atualizacao_encerrada` (congelado), não pendência. Recibo inválido
 * continua inválido: congelar não esconde erro de dado.
 */
type ReceiptStateResult = { state: ProcessosReceiptState; invalid: boolean; ageMs?: number }

function receiptState(row: CoverageSnapshotRow, now: Date, maxAgeDays: number): ReceiptStateResult {
  const result = receiptStateBase(row, now, maxAgeDays)
  if (!naCoorteAtualizacao({ atualizacao_encerrada_em: row.atualizacao_encerrada_em ?? null })
      && !result.invalid && (result.state === "sem_recibo" || result.state === "stale")) {
    return { state: "atualizacao_encerrada", invalid: false }
  }
  return result
}

function receiptStateBase(row: CoverageSnapshotRow, now: Date, maxAgeDays: number): ReceiptStateResult {
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
  const ageMs = now.getTime() - executedAt.getTime()
  if (ageMs > maxAgeDays * DAY_MS) return { state: "stale", invalid: false, ageMs }

  switch (row.receipt_result) {
    case "encontrado": return { state: "encontrado", invalid: false }
    case "vazio_confirmado": return { state: "vazio_confirmado", invalid: false }
    case "erro": return { state: "erro", invalid: false }
    default: return { state: "indeterminado", invalid: false }
  }
}

export function checkProcessosReceipts(
  rows: readonly CoverageSnapshotRow[],
  options: { now?: Date; maxAgeDays?: number; staleGraceDays?: number } = {},
): ProcessosReceiptReport {
  const now = options.now ?? new Date()
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS
  const staleGraceDays = options.staleGraceDays ?? DEFAULT_STALE_GRACE_DAYS
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("now inválido")
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) throw new Error("maxAgeDays inválido")
  if (!Number.isFinite(staleGraceDays) || staleGraceDays < 0) throw new Error("staleGraceDays inválido")
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
  let staleOverdue = 0
  for (const row of rows) {
    const result = receiptState(row, now, maxAgeDays)
    summary[result.state] += 1
    if (result.invalid) invalidRows += 1
    if (result.state === "stale" && (result.ageMs ?? 0) > (maxAgeDays + staleGraceDays) * DAY_MS) staleOverdue += 1
    if (result.state === "sem_recibo" && !result.invalid) missingCandidateIds.push(row.candidate_id)
  }
  return {
    ok: missingCandidateIds.length === 0 && invalidRows === 0 && staleOverdue === 0,
    total_public_candidates: rows.length,
    summary,
    missing_candidate_ids: missingCandidateIds,
    invalid_rows: invalidRows,
    stale_overdue: staleOverdue,
    generated_at: now.toISOString(),
    max_age_days: maxAgeDays,
    stale_grace_days: staleGraceDays,
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
  if (!input) throw new Error("uso: check-processos-receipts.ts --input=/caminho/snapshot.json [--now=ISO]")
  // --now fixa o relógio para testes com fixture datada; o workflow não o usa.
  const nowArg = process.argv.find((arg) => arg.startsWith("--now="))?.slice("--now=".length)
  const parsed: unknown = JSON.parse(readFileSync(input, "utf8"))
  const rows = parseSnapshot(parsed)
  const report = checkProcessosReceipts(rows, nowArg ? { now: new Date(nowArg) } : {})
  // Keep CI output safe: counts only, without names, slugs, URLs or judicial data.
  console.log(JSON.stringify({
    ok: report.ok,
    total_public_candidates: report.total_public_candidates,
    summary: report.summary,
    missing_receipts: report.missing_candidate_ids.length,
    stale_overdue: report.stale_overdue,
    max_age_days: report.max_age_days,
    stale_grace_days: report.stale_grace_days,
  }))
  // stdout é o JSON do resumo; os avisos vão para stderr, que o Actions também
  // lê como anotação.
  const limite = report.max_age_days + report.stale_grace_days
  if (report.stale_overdue > 0) {
    console.error(`::error::Recibos judiciais da coorte ativa com mais de ${limite} dias: ${report.stale_overdue}. A coleta local deixou de renovar.`)
  } else if (report.summary.stale > 0) {
    console.error(`::warning::Recibos judiciais da coorte ativa com mais de ${report.max_age_days} dias: ${report.summary.stale} (reprova acima de ${limite}).`)
  }
  if (!report.ok) process.exitCode = 1
}

if (process.argv[1]?.endsWith("check-processos-receipts.ts")) main()
