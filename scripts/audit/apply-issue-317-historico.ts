/** Reparo limitado ao plano de 31 observações conferidas contra o TSE em 12/09. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { escreverAuditado } from "../lib/escrita-auditada";
import { supabase, supabaseProjectRefParaAuditoria } from "../lib/supabase";
import { escreverPrivado } from "../lib/tse-julgamento-2026";
import { hash, PROJECT } from "./apply-issue-317-tse";
import { descricaoJulgamentoParaTexto } from "../lib/tse-julgamento-texto";

// O plano anterior continua como evidência; seu hash não autoriza novas escritas.
export const APPROVED_HISTORY_PLAN = "f294b9379e98f015ee0c401f254c6fa11a3880fd00301ea9006ff8a223811b89";
interface HistoryBefore { id: string; candidato_id: string; slug: string; sq_candidato_2026: string; situacao_candidatura: string; periodo_inicio: number; observacoes: string }
interface HistoryEntry { before: HistoryBefore; after: string }
interface HistoryPlan { project: string; entries: HistoryEntry[] }
export function validateHistoryPlan(raw: string, project: string): HistoryPlan {
  if (project !== PROJECT || hash(raw) !== APPROVED_HISTORY_PLAN) throw new Error("Projeto/plano de histórico não revisado");
  const plan = JSON.parse(raw) as HistoryPlan;
  if (plan.project !== PROJECT || plan.entries.length !== 31 || new Set(plan.entries.map((e) => e.before.id)).size !== 31) throw new Error("Coorte de histórico divergiu");
  if (plan.entries.some((entry) => !entry.after.endsWith(`Na consulta ao TSE de 12 de setembro de 2026, o registro estava ${descricaoJulgamentoParaTexto(entry.before.situacao_candidatura)}.`))) throw new Error("Descrição oficial do histórico divergiu");
  return plan;
}
export function validateHistoryState(entry: HistoryEntry, current: Record<string, unknown>, candidate: Record<string, unknown>): "pending" | "applied" {
  const before = entry.before;
  if (current.id !== before.id || current.candidato_id !== before.candidato_id || current.periodo_inicio !== 2026 ||
      candidate.id !== before.candidato_id || candidate.slug !== before.slug || candidate.sq_candidato_2026 !== before.sq_candidato_2026 ||
      candidate.situacao_candidatura !== before.situacao_candidatura || candidate.publicavel !== true) throw new Error(`Identidade/situação concorrente: ${before.slug}`);
  if (current.observacoes === entry.after) return "applied";
  if (current.observacoes !== before.observacoes) throw new Error(`Observação concorrente: ${before.slug}`);
  return "pending";
}
async function read(entry: HistoryEntry) {
  const [history, candidate] = await Promise.all([
    supabase.from("historico_politico").select("*").eq("id", entry.before.id).single(),
    supabase.from("candidatos").select("id,slug,sq_candidato_2026,situacao_candidatura,publicavel").eq("id", entry.before.candidato_id).single(),
  ]);
  if (history.error || candidate.error || !history.data || !candidate.data) throw new Error(`Leitura falhou: ${entry.before.slug}`);
  return { history: history.data, candidate: candidate.data };
}
export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.length !== 2 || !["--dry-run", "--apply"].includes(args[0])) throw new Error("Uso: --dry-run|--apply <plano revisado>");
  const plan = validateHistoryPlan(readFileSync(args[1], "utf8"), supabaseProjectRefParaAuditoria());
  const receipt = { plan_hash: APPROVED_HISTORY_PLAN, written: [] as string[], readback: [] as string[], error: null as string | null };
  const receiptPath = `${args[1]}.receipt-${Date.now()}.json`;
  const originals = new Map<string, Record<string, unknown>>();
  for (const entry of plan.entries) {
    const current = await read(entry);
    validateHistoryState(entry, current.history, current.candidate);
    originals.set(entry.before.id, current.history);
  }
  if (args[0] === "--dry-run") { console.log(JSON.stringify({ dry_run: true, targets: plan.entries.length, plan_hash: APPROVED_HISTORY_PLAN })); return; }
  escreverPrivado(`${receiptPath}.before.json`, [...originals.values()]);
  try {
    for (const entry of plan.entries) {
      const current = await read(entry);
      if (validateHistoryState(entry, current.history, current.candidate) === "pending") {
        const rows = await escreverAuditado({ script: "apply-issue-317-historico", tabela: "historico_politico", recorte: entry.before.slug,
          motivo: "Issue #317: julgamento TSE conferido em 12/09/2026; preservar evento e informação histórica datada, corrigindo somente a observação." }, () =>
          supabase.from("historico_politico").update({ observacoes: entry.after }).eq("id", entry.before.id)
            .eq("candidato_id", entry.before.candidato_id).eq("periodo_inicio", 2026).eq("observacoes", entry.before.observacoes).select("id"));
        if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`CAS recusou: ${entry.before.slug}`);
        receipt.written.push(entry.before.slug); escreverPrivado(receiptPath, receipt);
      }
      const after = await read(entry);
      if (validateHistoryState(entry, after.history, after.candidate) !== "applied" ||
          JSON.stringify({ ...after.history, observacoes: originals.get(entry.before.id)!.observacoes }) !== JSON.stringify(originals.get(entry.before.id))) throw new Error(`Readback divergiu: ${entry.before.slug}`);
      receipt.readback.push(entry.before.slug); escreverPrivado(receiptPath, receipt);
    }
  } catch (error) { receipt.error = error instanceof Error ? error.message : "Falha histórico"; throw error; }
  finally { escreverPrivado(receiptPath, receipt); }
  console.log(JSON.stringify({ receipt: receiptPath, written: receipt.written.length, readback: receipt.readback.length }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main().catch((error) => { console.error(error instanceof Error ? error.message : "Falha histórico"); process.exitCode = 2; });
