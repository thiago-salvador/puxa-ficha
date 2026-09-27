/**
 * Audited, per-election-year apply path for plan-patrimonio-writers-local.ts.
 * Defaults to dry-run. Apply is deliberately explicit and only usable with a
 * hash-pinned private plan, a private evidence directory, and expected digest.
 */
import { createHash } from "node:crypto"
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { supabase } from "../lib/supabase"
import { escreverAuditado } from "../lib/escrita-auditada"
import { hashPatrimonioPreimage, publicPatrimonioRow } from "./plan-patrimonio-writers-local"

type Action = {
  tipo: "substituir_patrimonio"
  match_mode: "exact_context" | "unique_year_public" | "insert"
  slug: string
  candidato_id: string
  ano_eleicao: number
  antes_publico: Record<string, unknown>[]
  antes_sha256: string
  depois: Record<string, unknown>
  serie: Record<string, unknown>
  fonte_url: string
  pacote_sha256: string
  pacote_bytes: number | null
  sq_candidato: string
  uf_candidatura: string
  source_complete?: boolean
}
type Plan = { acoes: Action[] }
type DbRow = Record<string, unknown>
type QueryResult = { data: DbRow[] | null; error: { message: string } | null }
type Query = PromiseLike<QueryResult> & {
  select(columns?: string): Query
  eq(column: string, value: unknown): Query
  is(column: string, value: null): Query
  update(value: Record<string, unknown>): Query
  insert(value: Record<string, unknown>): Query
}
type Client = { from(table: string): Query }
type ApplyOptions = { apply: boolean; expectedPlanSha: string; evidenceDir: string; client?: Client }

const SCRIPT = "apply-patrimonio-writers-local"
const BATCH_SIZE = 25
const MAX_ACTIONS_PER_RUN = 50
const CANDIDATE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DISPLAY = ["ano_eleicao", "cargo_candidatura", "tipo_eleicao", "valor_total", "bens"]
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}
const digest = (text: string) => createHash("sha256").update(text).digest("hex")
function persist(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true, mode: 0o700 })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  chmodSync(path, 0o600)
}
function compareDisplay(actual: Record<string, unknown>, expected: Record<string, unknown>): boolean {
  return DISPLAY.every((field) => stable(actual[field]) === stable(expected[field]))
}
function validatePlan(plan: Plan): void {
  if (!Array.isArray(plan.acoes)) throw new Error("plano sem lista de ações")
  const identities = new Set<string>()
  for (const action of plan.acoes) {
    if (action.tipo !== "substituir_patrimonio" || !action.slug || !action.candidato_id || !Number.isInteger(action.ano_eleicao)
      || !/^[a-f0-9]{64}$/.test(action.antes_sha256) || !/^[a-f0-9]{64}$/.test(action.pacote_sha256)
      || !action.fonte_url.startsWith("https://cdn.tse.jus.br/") || !Array.isArray(action.antes_publico)
      || !action.depois || !action.serie || !action.sq_candidato || !/^[A-Z]{2}$/.test(action.uf_candidatura)
      || action.source_complete !== true) {
      throw new Error("ação patrimônio sem CAS/proveniência/contexto completo")
    }
    const identity = `${action.candidato_id}/${action.ano_eleicao}`
    if (identities.has(identity)) throw new Error("plano patrimônio contém identidade/ano duplicado")
    identities.add(identity)
    if (!CANDIDATE_ID.test(action.candidato_id) || action.candidato_id === action.slug) throw new Error("ação patrimônio sem identidade pública estável")
    if (!(["exact_context", "unique_year_public", "insert"] as const).includes(action.match_mode)
      || (action.match_mode === "unique_year_public" && (action.antes_publico.length !== 1 || !action.antes_publico[0]?.id))
      || (action.match_mode === "exact_context" && (action.antes_publico.length !== 1 || !action.antes_publico[0]?.id))
      || (action.match_mode === "insert" && action.antes_publico.length !== 0)) {
      throw new Error("ação patrimônio com regra de correspondência/pre-image inválida")
    }
  }
}

export function selectPatrimonioActionBatch(actions: readonly Action[], batchIndex: number): readonly Action[] {
  if (!Number.isInteger(batchIndex) || batchIndex < 0) throw new Error("índice de lote inválido")
  const offset = batchIndex * MAX_ACTIONS_PER_RUN
  if (offset >= actions.length && actions.length > 0) throw new Error("índice de lote fora do plano")
  return actions.slice(offset, offset + MAX_ACTIONS_PER_RUN)
}

/** Read-only mode: validates hash pinning and gives a batch receipt without credentials. */
export function dryRunPatrimonioWriters(plan: Plan, planSha256: string) {
  validatePlan(plan)
  if (digest(stable(plan)) !== planSha256) throw new Error("hash esperado diverge do plano")
  return { dry_run: true, plan_sha256: planSha256, batches: Math.ceil(plan.acoes.length / BATCH_SIZE), actions: plan.acoes.length, production_writes: 0 }
}

/** Applies a pinned plan in batches; callers must opt in with `apply:true`. */
export async function applyPatrimonioWritersAuditadas(plan: Plan, options: ApplyOptions & { batchIndex?: number }) {
  validatePlan(plan)
  const planText = stable(plan)
  const planSha = digest(planText)
  if (!options.expectedPlanSha || options.expectedPlanSha !== planSha) throw new Error("hash esperado diverge do plano")
  if (!options.apply) return dryRunPatrimonioWriters(plan, options.expectedPlanSha)
  const batchIndex = options.batchIndex ?? 0
  const actions = selectPatrimonioActionBatch(plan.acoes, batchIndex)
  const root = resolve(options.evidenceDir)
  const client = options.client ?? (supabase as unknown as Client)
  const receipt: { plan_sha256: string; batches: number; batch_index: number; total_actions: number; remaining_actions: number; attempted: number; written: string[]; readback: string[]; review: Array<{ slug: string; ano_eleicao: number; reason: string }> } = {
    plan_sha256: planSha, batches: Math.ceil(actions.length / BATCH_SIZE), batch_index: batchIndex, total_actions: plan.acoes.length,
    remaining_actions: Math.max(0, plan.acoes.length - (batchIndex + 1) * MAX_ACTIONS_PER_RUN), attempted: 0, written: [], readback: [], review: [],
  }

  for (let offset = 0; offset < actions.length; offset += BATCH_SIZE) {
    const batch = actions.slice(offset, offset + BATCH_SIZE)
    const backup: DbRow[] = []
    for (const action of batch) {
      const { data, error } = await client.from("patrimonio").select("*")
        .eq("candidato_id", action.candidato_id).eq("ano_eleicao", action.ano_eleicao)
      if (error) throw new Error(`pre-image read failed: ${error.message}`)
      backup.push(...(data ?? []).map(publicPatrimonioRow))
    }
    persist(resolve(root, `backup-preimagem-patrimonio-${String(offset / BATCH_SIZE + 1).padStart(3, "0")}.json`), {
      plan_sha256: planSha, batch: offset / BATCH_SIZE + 1, rows: backup,
    })

    for (const action of batch) {
      receipt.attempted++
      let currentQuery = client.from("patrimonio").select("*")
        .eq("candidato_id", action.candidato_id).eq("ano_eleicao", action.ano_eleicao)
      if (action.match_mode === "exact_context") {
        currentQuery = currentQuery.eq("sq_candidato", action.sq_candidato).eq("uf_candidatura", action.uf_candidatura)
      } else if (action.match_mode === "insert") {
        currentQuery = currentQuery.eq("sq_candidato", action.sq_candidato).eq("uf_candidatura", action.uf_candidatura)
      }
      const { data: current, error } = await currentQuery
      if (error) throw new Error(`CAS read failed: ${error.message}`)
      const rows = (current ?? []).map(publicPatrimonioRow)
      if (hashPatrimonioPreimage(rows) !== action.antes_sha256) {
        receipt.review.push({ slug: action.slug, ano_eleicao: action.ano_eleicao, reason: "preimage_digest_changed" })
        continue
      }
      if (rows.length > 1) {
        receipt.review.push({ slug: action.slug, ano_eleicao: action.ano_eleicao, reason: "duplicate_candidate_year_rows" })
        continue
      }
      const patch = { ...action.depois, candidato_id: action.candidato_id }
      const write = await escreverAuditado({ script: SCRIPT, tabela: "patrimonio", motivo: `TSE patrimônio ${action.ano_eleicao}; SHA-256 ${action.pacote_sha256}; CAS por pre-image`, recorte: `${action.slug}/${action.ano_eleicao}` }, () => {
        if (action.match_mode === "insert") return client.from("patrimonio").insert(patch).select("*")
        let guarded = client.from("patrimonio").update(patch)
          .eq("id", action.antes_publico[0]!.id)
          .eq("candidato_id", action.candidato_id).eq("ano_eleicao", action.ano_eleicao)
        const before = (current ?? [])[0]!
        for (const field of ["sq_candidato", "uf_candidatura", "cargo_candidatura", "tipo_eleicao", "ano_arquivo", "valor_total", "bens"] as const) {
          const value = field === "bens" && Array.isArray(before.bens) ? JSON.stringify(before.bens) : before[field]
          guarded = value == null ? guarded.is(field, null) : guarded.eq(field, value)
        }
        return guarded.select("*")
      })
      if (write.length !== 1) {
        receipt.review.push({ slug: action.slug, ano_eleicao: action.ano_eleicao, reason: "cas_write_returned_non_singleton" })
        continue
      }
      if (typeof write[0]!.id !== "string" || !write[0]!.id) {
        receipt.review.push({ slug: action.slug, ano_eleicao: action.ano_eleicao, reason: "write_returned_no_base_id" })
        continue
      }
      receipt.written.push(`${action.slug}/${action.ano_eleicao}`)
      const { data: readback, error: readError } = await client.from("patrimonio").select("*")
        .eq("id", write[0]!.id).eq("candidato_id", action.candidato_id).eq("ano_eleicao", action.ano_eleicao)
      if (readError) throw new Error(`readback failed: ${readError.message}`)
      if ((readback ?? []).length !== 1
        || !compareDisplay(readback![0]!, action.depois)
        || readback![0]!.sq_candidato !== action.sq_candidato
        || readback![0]!.uf_candidatura !== action.uf_candidatura) {
        receipt.review.push({ slug: action.slug, ano_eleicao: action.ano_eleicao, reason: "display_readback_mismatch" })
        continue
      }
      receipt.readback.push(`${action.slug}/${action.ano_eleicao}`)
    }
    persist(resolve(root, `receipt-patrimonio-${String(offset / BATCH_SIZE + 1).padStart(3, "0")}.json`), receipt)
  }
  persist(resolve(root, "receipt-patrimonio-final.json"), receipt)
  return receipt
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const value = (prefix: string) => args.find((arg) => arg.startsWith(`${prefix}=`))?.slice(prefix.length + 1)
  const allow = /^(--apply|--dry-run|--plan=.+|--expect-plan=[a-f0-9]{64}|--evidence-dir=.+|--batch-index=\d+)$/
  if (args.some((arg) => !allow.test(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) throw new Error("argumentos inválidos")
  const planPath = value("--plan")
  if (!planPath) throw new Error("--plan obrigatório")
  const plan = JSON.parse(readFileSync(resolve(planPath), "utf8")) as Plan
  const expected = value("--expect-plan") ?? ""
  const evidenceDir = value("--evidence-dir") ?? resolve("evidencias-privadas/ficha-completa/codex/escritores-532")
  const result = args.includes("--apply")
    ? await applyPatrimonioWritersAuditadas(plan, { apply: true, expectedPlanSha: expected, evidenceDir, batchIndex: value("--batch-index") === undefined ? 0 : Number(value("--batch-index")) })
    : dryRunPatrimonioWriters(plan, expected)
  console.log(JSON.stringify(result))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : "falha"); process.exitCode = 1 })
}
