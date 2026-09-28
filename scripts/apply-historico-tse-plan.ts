/** Audited, opt-in executor for the local SHA-locked historical-candidacy plan.
 * Dry-run is the default. Apply requires a frozen plan digest and a private backup path.
 */
import { createHash } from "node:crypto"
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { supabase } from "./lib/supabase"
import { escreverAuditado } from "./lib/escrita-auditada"
import { assertOutsideRepository } from "./audit/lib/private-output"

const FIELDS = ["cargo", "cargo_canonico", "tipo_evento", "periodo_inicio", "periodo_fim", "partido", "estado", "eleito_por", "observacoes"] as const
type Row = Record<string, unknown> & { id?: string; candidato_id?: string }
type Action = { tipo: "substituir_historico"; slug: string; candidato_id: string; antes_publico: Row[]; antes_sha256: string; depois: Row[]; source_complete?: boolean; source_revisions?: Array<{ year: number; url?: string; sha256: string }>; classification?: string }
type Port = {
  read(candidateId: string): Promise<Row[]>
  delete(rows: Row[], candidateId: string, slug: string): Promise<string[]>
  insert(rows: Row[], slug: string): Promise<string[]>
}
export type ApplyResult = { applied: number; batches: number; conflicts: Array<{ slug: string; reason: string }> }
const MAX_ACTIONS_PER_RUN = 50
const SHA256 = /^[a-f0-9]{64}$/
const CANDIDATE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validateActions(actions: readonly Action[]): void {
  const identities = new Set<string>()
  for (const action of actions) {
    if (action.tipo !== "substituir_historico" || action.classification !== "a") continue
    const identity = action.candidato_id
    if (!action.slug || !CANDIDATE_ID.test(action.candidato_id) || action.candidato_id === action.slug) throw new Error("ação histórica sem identidade pública estável")
    if (identities.has(identity)) throw new Error("plano histórico contém identidade duplicada")
    identities.add(identity)
    if (action.source_complete !== true || !action.source_revisions?.length
      || action.source_revisions.some((revision) => !SHA256.test(revision.sha256) || !Number.isInteger(revision.year) || revision.year < 1900)) {
      throw new Error("substituição histórica exige fonte oficial completa e revisões SHA-256")
    }
    if (!Array.isArray(action.depois) || action.depois.length === 0
      || action.depois.some((row) => row.proveniencia !== "tse" || row.tipo_evento !== "candidatura")) {
      throw new Error("substituição histórica sem candidaturas oficiais positivas")
    }
    const coveredYears = new Set(action.source_revisions.map((revision) => revision.year))
    if (action.depois.some((row) => !coveredYears.has(Number(row.periodo_inicio)))
      || action.antes_publico.some((row) => !coveredYears.has(Number(row.periodo_inicio)))) {
      throw new Error("plano histórico inclui ano sem pacote oficial revisado")
    }
    if (action.antes_publico.length > action.depois.length * 1.25) {
      throw new Error("plano histórico excede limite de redução de candidaturas")
    }
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}
function displayed(rows: readonly Row[]): Row[] {
  return rows.map((row) => Object.fromEntries(FIELDS.map((key) => [key, row[key] ?? null])))
    .sort((a, b) => stable(a).localeCompare(stable(b)))
}
function digest(rows: readonly Row[]): string { return createHash("sha256").update(stable(displayed(rows))).digest("hex") }
function isTseCandidacy(row: Row): boolean { return row.proveniencia === "tse" && row.tipo_evento === "candidatura" }
function covered(action: Action, row: Row): boolean {
  return isTseCandidacy(row) && Boolean(action.source_revisions?.some((revision) => revision.year === Number(row.periodo_inicio)))
}
function sameRows(a: readonly Row[], b: readonly Row[]): boolean {
  return stable([...a].sort((x, y) => stable(x).localeCompare(stable(y)))) === stable([...b].sort((x, y) => stable(x).localeCompare(stable(y))))
}

export function selectHistoricalActionBatch(actions: readonly Action[], batchIndex: number): readonly Action[] {
  if (!Number.isInteger(batchIndex) || batchIndex < 0) throw new Error("índice de lote inválido")
  const offset = batchIndex * MAX_ACTIONS_PER_RUN
  if (offset >= actions.length && actions.length > 0) throw new Error("índice de lote fora do plano")
  return actions.slice(offset, offset + MAX_ACTIONS_PER_RUN)
}

export function dryRunHistoricalActions(actions: readonly Action[]) {
  validateActions(actions)
  return { mode: "dry-run" as const, actions: actions.length, actions_per_apply: MAX_ACTIONS_PER_RUN, apply_runs: Math.ceil(actions.length / MAX_ACTIONS_PER_RUN) }
}

export async function applyHistoricalActions(actions: readonly Action[], port: Port, batchSize = 10, batchIndex = 0, interruptedReceiptPath?: string): Promise<ApplyResult> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) throw new Error("batch inválido")
  validateActions(actions)
  const selected = selectHistoricalActionBatch(actions, batchIndex)
  const conflicts: ApplyResult["conflicts"] = []
  let applied = 0
  let batches = 0
  let failingSlug: string | null = null
  let restoreAttempt = "not_needed"
  let restoreFailure: string | null = null
  try {
  for (let offset = 0; offset < selected.length; offset += batchSize) {
    batches++
    for (const action of selected.slice(offset, offset + batchSize)) {
      failingSlug = action.slug
      if (action.tipo !== "substituir_historico" || action.classification !== "a") {
        conflicts.push({ slug: action.slug, reason: "ação_fora_da_classe_a" }); continue
      }
      const current = await port.read(action.candidato_id)
      const currentTse = current.filter((row) => covered(action, row))
      const untouched = current.filter((row) => isTseCandidacy(row) && !covered(action, row))
      if (digest(currentTse) !== action.antes_sha256 || stable(displayed(currentTse)) !== stable(displayed(action.antes_publico))) {
        conflicts.push({ slug: action.slug, reason: "preimagem_divergente" }); continue
      }
      if (currentTse.length > action.depois.length * 1.25) {
        conflicts.push({ slug: action.slug, reason: "limite_reducao_candidaturas" }); continue
      }
      try {
        const removed = currentTse.length ? await port.delete(currentTse, action.candidato_id, action.slug) : []
        if (removed.length !== currentTse.length) throw new Error("CAS delete não confirmou todas as linhas TSE")
        const inserted = await port.insert(action.depois.map((row) => ({ ...row, candidato_id: action.candidato_id })), action.slug)
        if (inserted.length !== action.depois.length) throw new Error("insert não confirmou todas as candidaturas")
        const after = (await port.read(action.candidato_id)).filter(isTseCandidacy)
        if (!sameRows(untouched, after.filter((row) => !covered(action, row)))) throw new Error("anos sem pacote oficial foram alterados")
        if (stable(displayed(after.filter((row) => covered(action, row)))) !== stable(displayed(action.depois))) throw new Error(`readback divergente para ${action.slug}`)
      } catch (error) {
        // Compensating restore is limited to the reviewed years.
        restoreAttempt = "attempted"
        try {
          const partial = (await port.read(action.candidato_id)).filter((row) => covered(action, row))
          if (partial.length) await port.delete(partial, action.candidato_id, `${action.slug}:restaura`)
          const restored = currentTse.length ? await port.insert(currentTse.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "id"))), `${action.slug}:restaura`) : []
          if (restored.length !== currentTse.length) throw new Error("restauração auditada não confirmou preimagem")
          const restoredRows = (await port.read(action.candidato_id)).filter(isTseCandidacy)
          if (!sameRows(untouched, restoredRows.filter((row) => !covered(action, row)))
            || stable(displayed(restoredRows.filter((row) => covered(action, row)))) !== stable(displayed(currentTse))) {
            throw new Error("restauração auditada não confirmou cobertura histórica")
          }
          restoreAttempt = "confirmed"
        } catch (restoreError) {
          restoreAttempt = "failed"
          restoreFailure = restoreError instanceof Error ? restoreError.message : "restauração falhou"
        }
        throw error
      }
      applied++
      failingSlug = null
    }
  }
  } catch (error) {
    if (interruptedReceiptPath) writePrivateArtifact(interruptedReceiptPath, {
      status: "interrompido", batch_index: batchIndex, applied, batches, conflicts,
      written: applied, failing_slug: failingSlug, restore_attempt: restoreAttempt, restore_failure: restoreFailure,
      failure: error instanceof Error ? error.message : "falha de escrita",
    })
    throw error
  }
  return { applied, batches, conflicts }
}

export function writePrivateArtifact(path: string, value: unknown): void {
  const target = assertOutsideRepository(path, "private artifact")
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  chmodSync(target, 0o600)
}

function parseArgs(args: string[]) {
  const value = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  const batchIndex = value("batch-index")
  return { plan: value("plan"), backup: value("backup"), receipt: value("receipt"), expectedSha: value("expected-plan-sha"), apply: args.includes("--apply"), batchIndex: batchIndex === undefined ? 0 : Number(batchIndex) }
}
function shaFile(path: string): string { return createHash("sha256").update(readFileSync(path)).digest("hex") }
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!args.plan) throw new Error("use --plan=<plano-privado.json>")
  const planPath = assertOutsideRepository(args.plan, "--plan")
  const planDigest = shaFile(planPath)
  const plan = JSON.parse(readFileSync(planPath, "utf8")) as { actions?: Action[]; acoes?: Action[] }
  const actions = plan.actions ?? plan.acoes ?? []
  validateActions(actions)
  if (!args.apply) { console.log(JSON.stringify({ plan_sha256: planDigest, ...dryRunHistoricalActions(actions) })); return }
  if (!args.expectedSha || args.expectedSha !== planDigest || !args.backup || !args.receipt) throw new Error("apply exige --expected-plan-sha, --backup e --receipt privados")
  const backupPath = resolve(args.backup)
  const receiptPath = resolve(args.receipt)
  const port: Port = {
    read: async (candidateId) => {
      const { data, error } = await supabase.from("historico_politico").select("*").eq("candidato_id", candidateId)
      if (error) throw new Error("read preimage falhou")
      return (data ?? []) as Row[]
    },
    delete: async (rows, candidateId, slug) => {
      const deleted = await escreverAuditado<{ id: string }>({
        script: "apply-historico-tse-plan", tabela: "historico_politico", motivo: "remove preimagem TSE com CAS antes da substituição", recorte: slug,
      }, async () => {
        const touched: Array<{ id: string }> = []
        for (const row of rows) {
          const id = String(row.id)
          let query = supabase.from("historico_politico").delete().eq("id", id).eq("candidato_id", candidateId)
          for (const field of [...FIELDS, "proveniencia"] as const) {
            const value = row[field]
            query = value == null ? query.is(field, null) : query.eq(field, value as never)
          }
          const { data, error } = await query.select("id")
          if (error) return { data: touched, error: { message: "delete CAS falhou" } }
          touched.push(...((data ?? []) as Array<{ id: string }>))
        }
        return { data: touched, error: null }
      })
      return deleted.map((row) => row.id)
    },
    insert: async (rows, slug) => escreverAuditado({
      script: "apply-historico-tse-plan", tabela: "historico_politico", motivo: `insere candidaturas do pacote TSE; SHA-256=${actions.find((action) => action.slug === slug)?.source_revisions?.map((revision) => revision.sha256).join(",") ?? "no plano"}`, recorte: slug,
    }, () => supabase.from("historico_politico").insert(rows).select("id")),
  }
  const selected = selectHistoricalActionBatch(actions, args.batchIndex)
  const snapshots: Array<{ candidato_id: string; slug: string; rows: Row[] }> = []
  for (const action of selected) snapshots.push({ candidato_id: action.candidato_id, slug: action.slug, rows: await port.read(action.candidato_id) })
  writePrivateArtifact(backupPath, { plan_sha256: planDigest, batch_index: args.batchIndex, snapshots })
  const result = await applyHistoricalActions(actions, port, 10, args.batchIndex, receiptPath)
  const receipt = { plan_sha256: planDigest, backup: backupPath, batch_size: 10, batch_index: args.batchIndex, total_actions: actions.length, remaining_actions: Math.max(0, actions.length - (args.batchIndex + 1) * MAX_ACTIONS_PER_RUN), ...result, readback: "verified_per_candidate" }
  writePrivateArtifact(receiptPath, receipt)
  console.log(JSON.stringify({ applied: result.applied, conflicts: result.conflicts.length, backup: backupPath, receipt: receiptPath }))
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) void main().catch((error) => { console.error(error instanceof Error ? error.message : "falha no plano TSE"); process.exitCode = 1 })
