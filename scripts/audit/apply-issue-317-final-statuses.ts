/** Reparo guardado de #317: dois julgamentos REST e uma frase de biografia. */
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { ativarDryRun } from "../lib/dry-run"
import { supabase, supabaseProjectRefParaAuditoria } from "../lib/supabase"
import { escreverAuditado } from "../lib/escrita-auditada"
import { escreverPrivado } from "../lib/tse-julgamento-2026"

export const PROJECT = "wskpzsobvqwhnbsdsmok"
export const SOURCE = {
  "pazolini": { sq: "80002552682", uf: "ES", url: "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/ES/20322002026/candidato/80002552682", checked_at: "2026-09-12T17:32:59.229Z", raw_sha256: "990bc353210f751231210b313db5bb370fe8063244b59b56cc8e328ea06a9916" },
  "gelson-merisio": { sq: "240002548628", uf: "SC", url: "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/SC/20322002026/candidato/240002548628", checked_at: "2026-09-12T17:33:00.683Z", raw_sha256: "fd96ed36ae171bde7792738b005d5ee371438c51374b4c356f2d35be03ea3f94" },
  "victor-assis": { sq: "170002552776", uf: "PE", url: "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/PE/20322002026/candidato/170002552776", checked_at: "2026-09-12T18:25:10.683Z", raw_sha256: "e90573f4b9281a44c6d96756af1fcd42841f4926052dc07f68824f23c35bfd6e" },
} as const
const GELSON_BEFORE = "O pedido de registro da candidatura ao governo de Santa Catarina consta na base oficial de candidaturas do TSE e aguarda julgamento; registro pendente não equivale a candidatura deferida."
const GELSON_AFTER = "O pedido de registro da candidatura ao governo de Santa Catarina consta na base oficial de candidaturas do TSE e foi deferido."
type Row = Record<string, unknown>
type Entry = { slug: string; id: string; before: Row; patch: Row; source: typeof SOURCE[keyof typeof SOURCE] }
export const TARGETS = [
  { slug: "pazolini", id: "8d4eb423-5fa3-401f-883d-d70f4c0c64d8", sq: SOURCE.pazolini.sq, uf: SOURCE.pazolini.uf },
  { slug: "gelson-merisio", id: "85bcd355-89c2-464d-bfce-620fe8631285", sq: SOURCE["gelson-merisio"].sq, uf: SOURCE["gelson-merisio"].uf },
  { slug: "victor-assis", id: "2cb5e948-08ea-4a25-8124-6aaac3155c70", sq: SOURCE["victor-assis"].sq, uf: SOURCE["victor-assis"].uf },
] as const
export const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex")
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const patchFor = (slug: string): Row => slug === "gelson-merisio" ? { situacao_candidatura: "deferido", biografia: undefined } : { situacao_candidatura: "deferido" }

export function makePlan(rows: readonly Row[]) {
  if (supabaseProjectRefParaAuditoria() !== PROJECT || rows.length !== TARGETS.length) throw new Error("Recorte/projeto inválido")
  const entries: Entry[] = TARGETS.map((target, i) => {
    const before = rows[i]
    if (before.id !== target.id || before.slug !== target.slug || before.sq_candidato_2026 !== target.sq || before.estado !== target.uf || before.cargo_disputado !== "Governador" || before.publicavel !== true || before.status !== "candidato") throw new Error(`Identidade divergiu: ${target.slug}`)
    if (!["aguardando julgamento", "deferido"].includes(String(before.situacao_candidatura))) throw new Error(`Situação divergente: ${target.slug}`)
    if (target.slug === "gelson-merisio" && typeof before.biografia === "string" && !before.biografia.endsWith(GELSON_BEFORE) && !before.biografia.endsWith(GELSON_AFTER)) throw new Error("Biografia do Gelson divergiu")
    const patch = patchFor(target.slug)
    if (target.slug === "gelson-merisio" && typeof before.biografia === "string") patch.biografia = before.biografia.endsWith(GELSON_BEFORE) ? before.biografia.slice(0, -GELSON_BEFORE.length) + GELSON_AFTER : before.biografia
    return { slug: target.slug, id: target.id, before, patch, source: SOURCE[target.slug as keyof typeof SOURCE] }
  })
  return { version: 1, project: PROJECT, source: SOURCE, entries }
}
const read = async (id: string) => { const { data, error } = await supabase.from("candidatos").select("*").eq("id", id).single(); if (error || !data) throw new Error(error?.message ?? "Leitura falhou"); return data as Row }
export function validatePlan(plan: ReturnType<typeof makePlan>) {
  if (plan.project !== PROJECT || JSON.stringify(plan.source) !== JSON.stringify(SOURCE) || plan.entries.length !== TARGETS.length) throw new Error("Plano fora da allowlist")
  for (const e of plan.entries) {
    const t = TARGETS.find((target) => target.slug === e.slug)
    if (!t || e.id !== t.id || e.source.sq !== t.sq || e.source.uf !== t.uf || e.source.url !== SOURCE[t.slug].url || e.source.raw_sha256 !== SOURCE[t.slug].raw_sha256) throw new Error(`Entrada fora da allowlist: ${e.slug}`)
    const keys = Object.keys(e.patch).sort()
    if (keys.some((k) => !["situacao_candidatura", "biografia"].includes(k)) || e.patch.situacao_candidatura !== "deferido") throw new Error(`Patch fora da allowlist: ${e.slug}`)
    if (e.before.id !== e.id || e.before.slug !== e.slug || e.before.sq_candidato_2026 !== t.sq || e.before.estado !== t.uf || e.before.publicavel !== true || e.before.status !== "candidato") throw new Error(`Preimage fora da allowlist: ${e.slug}`)
  }
}
async function apply(plan: ReturnType<typeof makePlan>, expected: string, receiptPath: string) {
  validatePlan(plan)
  if (hash(plan) !== expected) throw new Error("Hash do plano divergiu")
  const receipt = { plan_hash: expected, attempts: [] as string[], written: [] as string[], already_applied: [] as string[], readback: [] as string[], failure: null as string | null }
  const persist = () => escreverPrivado(receiptPath, receipt)
  try { for (const e of plan.entries) {
    const current = await read(e.id)
    const applied = Object.entries(e.patch).every(([k,v]) => equal(current[k], v))
    if (!applied) {
      if (current.slug !== e.before.slug || current.sq_candidato_2026 !== e.before.sq_candidato_2026 || current.estado !== e.before.estado || current.publicavel !== e.before.publicavel || current.status !== e.before.status || current.situacao_candidatura !== e.before.situacao_candidatura || (e.slug === "gelson-merisio" && current.biografia !== e.before.biografia)) throw new Error(`CAS recusou ${e.slug}`)
      receipt.attempts.push(e.slug); persist()
      const rows = await escreverAuditado({ script: "apply-issue-317-final-statuses", tabela: "candidatos", recorte: e.slug, motivo: `REST TSE ${e.source.url} raw ${e.source.raw_sha256}` }, () => { let q = supabase.from("candidatos").update(e.patch).eq("id", e.id).eq("situacao_candidatura", e.before.situacao_candidatura); if (e.slug === "gelson-merisio") q = q.eq("biografia", e.before.biografia); return q.select("*") })
      if (rows.length !== 1) throw new Error(`CAS recusou ${e.slug}`)
      receipt.written.push(e.slug)
    } else receipt.already_applied.push(e.slug)
    const after = await read(e.id)
    if (!Object.entries(e.patch).every(([k,v]) => equal(after[k], v))) throw new Error(`Readback falhou ${e.slug}`)
    receipt.readback.push(e.slug); persist()
  } } catch (error) { receipt.failure = error instanceof Error ? error.message : String(error); persist(); throw error }
  persist(); return receipt
}
export async function main(args = process.argv.slice(2)) {
  const snap = args.find(a => a.startsWith("--snapshot="))?.slice(11); const applyMode = args.includes("--apply")
  if (!snap || (applyMode && !args.some(a => a.startsWith("--expect-plan=")))) throw new Error("Exige snapshot e hash")
  if (!applyMode) { ativarDryRun(); const rows = await Promise.all(TARGETS.map(t => read(t.id))); const plan = makePlan(rows); if (existsSync(snap)) throw new Error("Snapshot já existe"); escreverPrivado(snap, plan); console.log(JSON.stringify({ dry_run: true, snapshot: snap, plan_hash: hash(plan), targets: plan.entries.length })); return }
  const plan = JSON.parse(readFileSync(snap, "utf8")); const expected = args.find(a => a.startsWith("--expect-plan="))!.slice(14); const receipt = await apply(plan, expected, `${snap}.receipt-${Date.now()}.json`); console.log(JSON.stringify({ dry_run: false, written: receipt.written.length, already_applied: receipt.already_applied.length, readback: receipt.readback.length }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 2 })
