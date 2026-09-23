import { readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import { supabase, supabaseProjectRefParaAuditoria } from "./lib/supabase"
import { escreverAuditado } from "./lib/escrita-auditada"
import { validateJournal, type BackfillJournal, type BackfillJournalRow } from "./backfill-numero-urna"

export interface RollbackPlan { row: BackfillJournalRow; action: "skip-null" | "restore-null" }
function arg(name: string): string | null { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] ?? null : null }
export function loadJournal(path: string): BackfillJournal {
  if (!path.startsWith("/")) throw new Error("--journal deve ser absoluto")
  if ((statSync(path).mode & 0o777) !== 0o600) throw new Error("journal inválido: modo deve ser 0600")
  return validateJournal(JSON.parse(readFileSync(path, "utf8")))
}
export function planRollback(journal: BackfillJournal, current: Array<{ id: string; numero_urna: string | null }>): RollbackPlan[] {
  const byId = new Map(current.map((row) => [row.id, row])); const plans: RollbackPlan[] = []
  for (const row of journal.rows) { const found = byId.get(row.id); if (!found) throw new Error(`rollback drift: id ausente ${row.id}`); if (found.numero_urna === null) plans.push({ row, action: "skip-null" }); else if (found.numero_urna === row.officialNumber) plans.push({ row, action: "restore-null" }); else throw new Error(`rollback drift: ${row.slug} esperado ${row.officialNumber}, recebido ${found.numero_urna}`) }
  return plans
}

async function main() {
  const journalPath = arg("--journal"); if (!journalPath) throw new Error("--journal é obrigatório")
  const journal = loadJournal(journalPath)
  if (process.env.PF_NUMERO_URNA_ROLLBACK_CONFIRM !== "I_CONFIRM_ROLLBACK") throw new Error("rollback exige PF_NUMERO_URNA_ROLLBACK_CONFIRM=I_CONFIRM_ROLLBACK")
  if (supabaseProjectRefParaAuditoria() !== "wskpzsobvqwhnbsdsmok") throw new Error("rollback exige o projeto de produção do Puxa Ficha")
  const current: Array<{ id: string; numero_urna: string | null; slug: string; sq_candidato_2026: string | null; estado: string | null; cargo_disputado: string | null }> = []
  for (const row of journal.rows) {
    const result = await supabase.from("candidatos").select("id,slug,sq_candidato_2026,estado,cargo_disputado,numero_urna").eq("id", row.id).maybeSingle()
    if (result.error) throw new Error(`rollback read error ${row.slug}: ${result.error.message}`)
    const found = result.data as typeof current[number] | null
    if (!found || found.slug !== row.slug || found.sq_candidato_2026 !== row.sq || found.estado !== row.estado || (found.cargo_disputado ?? "") !== row.cargo) throw new Error(`rollback identity drift: ${row.slug}`)
    current.push(found)
  }
  const plans = planRollback(journal, current)
  for (const plan of plans.filter((item) => item.action === "restore-null")) await escreverAuditado({ script: "rollback-numero-urna-backfill", tabela: "candidatos", motivo: "reverte backfill oficial do TSE 2026", recorte: `${plan.row.slug}:${plan.row.sq}` }, async () => {
    let query = supabase.from("candidatos").update({ numero_urna: null }).eq("id", plan.row.id).eq("slug", plan.row.slug).eq("sq_candidato_2026", plan.row.sq).eq("cargo_disputado", plan.row.cargo).eq("numero_urna", plan.row.officialNumber)
    query = plan.row.estado === null ? query.is("estado", null) : query.eq("estado", plan.row.estado)
    const result = await query.select("id,numero_urna")
    if (result.error) throw new Error(`rollback write error ${plan.row.slug}: ${result.error.message}`)
    if ((result.data?.length ?? 0) !== 1 || result.data?.[0]?.numero_urna !== null) throw new Error(`rollback CAS failed ${plan.row.slug}`)
    const readback = await supabase.from("candidatos").select("numero_urna").eq("id", plan.row.id).maybeSingle()
    if (readback.error || readback.data?.numero_urna !== null) throw new Error(`rollback readback failed ${plan.row.slug}`)
    return result
  })
  console.log(JSON.stringify({ journal: journalPath, rows: journal.rows.length, skippedNull: plans.filter((p) => p.action === "skip-null").length, restored: plans.filter((p) => p.action === "restore-null").length }, null, 2))
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error) => { console.error(`rollback-numero-urna-backfill: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 })
