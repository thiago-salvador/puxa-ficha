/** Reconta as divergências já classificadas usando somente ações auditadas e
 * o recibo refeito sobre o snapshot projetado. Não lê banco nem dados pessoais. */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { assertOutsideRepository } from "./lib/private-output"

type Family = "financiamento" | "patrimonio" | "historico_politico"
type Cell = { slug: string; family: string; category: string; reason: string; writer_actions?: string[]; writer_status?: string; post_write_readback_matches?: boolean | null }
type Projection = { slug: string; family: string; writer_actions: string[]; post_write_readback_matches: boolean; reason: string }
type Receipt = {
  slug?: string
  family?: string
  alvo?: string
  resultado?: string
  volume?: number
  detalhe?: string
}

function confirmedReceiptKey(receipt: Receipt): string | null {
  const slug = receipt.slug ?? receipt.alvo
  let detail: Record<string, unknown> = {}
  if (receipt.detalhe) {
    try {
      const parsed: unknown = JSON.parse(receipt.detalhe)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) detail = parsed as Record<string, unknown>
    } catch { return null }
  }
  const family = receipt.family ?? detail.family
  if (!slug || typeof family !== "string" || !FAMILIES.includes(family as Family) || receipt.resultado !== "encontrado" ||
    !Number.isFinite(receipt.volume) || (receipt.volume ?? 0) <= 0) return null
  const readback = detail.materialized_readback
  const proof = detail.coverage_proof
  if (!readback || typeof readback !== "object" || Array.isArray(readback) ||
    !proof || typeof proof !== "object" || Array.isArray(proof)) return null
  const materialized = readback as Record<string, unknown>
  const coverage = proof as Record<string, unknown>
  if (materialized.required !== true || materialized.provided !== true || materialized.equal !== true ||
    coverage.scope_complete !== true || !Number.isInteger(coverage.matched_rows) || Number(coverage.matched_rows) <= 0) return null
  return `${slug}|${family}`
}

const FAMILIES = ["financiamento", "patrimonio", "historico_politico"] as const

export function reprojectSafeClosures(baseline: { cells: Cell[] }, receipt: { receipts?: Receipt[]; apply_projection?: Projection[]; diagnostics?: Array<{ slug: string; family: string; reason: string }> }) {
  const projected = new Map<string, Projection>()
  const diagnostics = new Map((receipt.diagnostics ?? []).map((item) => [`${item.slug}|${item.family}`, item.reason]))
  const observed = new Set((receipt.receipts ?? []).flatMap((item) => {
    const key = confirmedReceiptKey(item)
    return key ? [key] : []
  }))
  for (const item of receipt.apply_projection ?? []) {
    const key = `${item.slug}|${item.family}`
    if (projected.has(key)) throw new Error(`projeção duplicada: ${key}`)
    projected.set(key, item)
  }
  const original = baseline.cells.filter((cell) => cell.category === "stale_not_projected" && FAMILIES.includes(cell.family as Family))
  if (new Set(original.map((cell) => `${cell.slug}|${cell.family}`)).size !== original.length) throw new Error("célula de origem duplicada")
  const cells = baseline.cells.map((cell) => {
    if (cell.category === "closed_now" && FAMILIES.includes(cell.family as Family)) {
      const reason = diagnostics.get(`${cell.slug}|${cell.family}`)
      return reason ? { ...cell, category: "display_contract_reopened", reason } : cell
    }
    if (cell.category !== "stale_not_projected" || !FAMILIES.includes(cell.family as Family)) return cell
    const key = `${cell.slug}|${cell.family}`
    if (observed.has(key) && !diagnostics.has(key)) return { ...cell, category: "closed_now", reason: "display_contract_matches", writer_actions: [], writer_status: "no_action_needed", post_write_readback_matches: true }
    const after = projected.get(key)
    const safe = Boolean(after?.writer_actions.length && after.post_write_readback_matches)
    return { ...cell,
      category: safe ? "projected_after_safe_write" : "stale_not_projected",
      reason: after?.reason ?? "projection_missing",
      writer_actions: after?.writer_actions ?? [],
      writer_status: after?.writer_actions.length ? "simulated_action" : "no_planned_action",
      post_write_readback_matches: after?.post_write_readback_matches ?? null,
    }
  })
  const byFamily = Object.fromEntries(FAMILIES.map((family) => {
    const originalKeys = new Set(original.filter((cell) => cell.family === family).map((cell) => `${cell.slug}|${cell.family}`))
    const subset = cells.filter((cell) => cell.family === family && originalKeys.has(`${cell.slug}|${cell.family}`))
    const stillOpen = subset.filter((cell) => cell.category === "stale_not_projected")
    const reasons: Record<string, number> = {}
    for (const cell of stillOpen) reasons[cell.reason] = (reasons[cell.reason] ?? 0) + 1
    return [family, { baseline_open: subset.length, closed_now_by_contract: subset.filter((cell) => cell.category === "closed_now").length, projected_closed: subset.filter((cell) => cell.category === "projected_after_safe_write").length, still_open: stillOpen.length, still_open_by_reason: reasons }]
  })) as Record<Family, { baseline_open: number; closed_now_by_contract: number; projected_closed: number; still_open: number; still_open_by_reason: Record<string, number> }>
  const projectedClosed = Object.values(byFamily).reduce((sum, family) => sum + family.projected_closed + family.closed_now_by_contract, 0)
  const closedNowByContract = Object.values(byFamily).reduce((sum, family) => sum + family.closed_now_by_contract, 0)
  return {
    schema_version: 1,
    baseline_open: original.length,
    projected_closed: projectedClosed,
    closed_now_by_contract: closedNowByContract,
    closed_after_safe_write: projectedClosed - closedNowByContract,
    still_open: original.length - projectedClosed,
    projected_fraction: original.length ? projectedClosed / original.length : 0,
    target_95_percent_met: original.length > 0 && projectedClosed / original.length >= 0.95,
    display_contract_reopened: cells.filter((cell) => cell.category === "display_contract_reopened").length,
    by_family: byFamily,
    cells,
  }
}

function required(name: string): string {
  const value = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  if (!value) throw new Error(`--${name}=... obrigatório`)
  return resolve(value)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baseline = JSON.parse(readFileSync(required("baseline"), "utf8")) as { cells: Cell[] }
  const receipt = JSON.parse(readFileSync(required("receipt"), "utf8")) as { receipts?: Receipt[]; apply_projection?: Projection[]; diagnostics?: Array<{ slug: string; family: string; reason: string }> }
  const result = reprojectSafeClosures(baseline, receipt)
  writeFileSync(assertOutsideRepository(required("out"), "--out"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  console.log(JSON.stringify({ baseline_open: result.baseline_open, projected_closed: result.projected_closed,
    closed_now_by_contract: result.closed_now_by_contract, closed_after_safe_write: result.closed_after_safe_write,
    still_open: result.still_open, display_contract_reopened: result.display_contract_reopened,
    target_95_percent_met: result.target_95_percent_met, by_family: result.by_family }))
}
