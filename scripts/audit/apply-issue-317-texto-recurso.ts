/** Seis textos: conservar a alternativa oficial entre prazo recursal e recurso. */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { escreverAuditado } from "../lib/escrita-auditada";
import { supabase, supabaseProjectRefParaAuditoria } from "../lib/supabase";
import { escreverPrivado } from "../lib/tse-julgamento-2026";
import { descricaoJulgamentoParaTexto } from "../lib/tse-julgamento-texto";
import { hash, PROJECT } from "./apply-issue-317-tse";

const SOURCE_HASH = "bd5b8fdc7ee56eba8fa73a34187128008e126cbb5b08e3f2f1c6ca8afeab9786";
export const OLD = "Na consulta ao TSE de 12 de setembro de 2026, o registro estava indeferido com recurso.";
export const NEW = `Na consulta ao TSE de 12 de setembro de 2026, o registro estava ${descricaoJulgamentoParaTexto("indeferido com recurso")}.`;
type Row = Record<string, unknown>;
export interface Target { table: "historico_politico" | "candidatos"; field: "observacoes" | "biografia"; id: string; candidato_id: string; slug: string; sq: string }
const histories = [
  ["e0f32b47-7b34-4a4c-9a30-0d5f359f393e", "1e3d6e9b-a35b-4aee-9018-c5c5c500f231", "henrique-lyra", "200002553301"],
  ["4d7738d6-0adb-4e0a-83a3-a21b13f9e124", "20e8b8cd-54a6-4e85-89c2-386ef12d2cc8", "izadora-dias", "250002553062"],
  ["3166759d-81e5-4c65-83c7-2b620aa4b749", "baf8abd2-9386-48df-876e-1e8b16fa1e7f", "jeremias-cosmo", "170002541258"],
  ["c6a0f219-bbc4-471f-9f91-95cb3f1be894", "f5de5375-7258-4164-9f89-45ee8ee442d6", "lourdes-melo", "180002553722"],
  ["fd92acb1-0ca1-4875-a146-718c5d3ca46a", "851a0be1-4c2b-4d95-b483-4c67a51860d8", "policial-edjane", "250002548080"],
];
export const TARGETS: Target[] = histories.map(([id, candidato_id, slug, sq]) => ({ table: "historico_politico", field: "observacoes", id, candidato_id, slug, sq }));
TARGETS.push({ table: "candidatos", field: "biografia", id: histories[3][1], candidato_id: histories[3][1], slug: "lourdes-melo", sq: histories[3][3] });
export interface Snapshot { row: Row; candidate: Row }
export interface Entry { target: Target; before: Snapshot; after: string }
export interface Plan { project: string; source_hash: string; entries: Entry[] }
export interface Store { read(target: Target): Promise<Snapshot>; write(entry: Entry): Promise<Row[]> }
export function repairText(text: unknown): string {
  if (typeof text !== "string") throw new Error("Texto ausente");
  const oldCount = text.split(OLD).length - 1, newCount = text.split(NEW).length - 1;
  if (oldCount === 0 && newCount === 1) return text;
  if (oldCount !== 1 || newCount !== 0) throw new Error("Frase fora do recorte ou duplicada");
  return text.replace(OLD, NEW);
}
function validateIdentity(target: Target, value: Snapshot): void {
  const { row, candidate } = value;
  if (row.id !== target.id || candidate.id !== target.candidato_id || candidate.slug !== target.slug || candidate.sq_candidato_2026 !== target.sq ||
      candidate.situacao_candidatura !== "indeferido com recurso" || candidate.publicavel !== true ||
      (target.table === "historico_politico" && (row.candidato_id !== target.candidato_id || row.periodo_inicio !== 2026))) throw new Error(`Identidade/situação divergiu: ${target.slug}`);
}
export function planTexts(project: string, rows: Snapshot[]): Plan {
  if (project !== PROJECT || rows.length !== TARGETS.length) throw new Error("Projeto/coorte divergiu");
  return { project, source_hash: SOURCE_HASH, entries: TARGETS.map((target, index) => {
    const before = rows[index]; validateIdentity(target, before);
    return { target, before, after: repairText(before.row[target.field]) };
  }) };
}
function state(entry: Entry, value: Snapshot): "applied" | "pending" {
  validateIdentity(entry.target, value);
  const text = value.row[entry.target.field];
  if (text === entry.after) return "applied";
  if (text !== entry.before.row[entry.target.field]) throw new Error(`Texto concorrente: ${entry.target.slug}`);
  return "pending";
}
export interface Receipt { hash: string; attempted: string[]; written: string[]; already_applied: string[]; readback: string[]; error: string | null }
export async function applyTexts(plan: Plan, expected: string, project: string, store: Store, persist: (receipt: Receipt) => void): Promise<Receipt> {
  if (hash(JSON.stringify(plan)) !== expected || JSON.stringify(planTexts(project, plan.entries.map((entry) => entry.before))) !== JSON.stringify(plan)) throw new Error("Plano/hash adulterado");
  const receipt: Receipt = { hash: expected, attempted: [], written: [], already_applied: [], readback: [], error: null };
  persist(receipt);
  try {
    for (const entry of plan.entries) state(entry, await store.read(entry.target));
    for (const entry of plan.entries) {
      const beforeWrite = await store.read(entry.target), label = `${entry.target.table}:${entry.target.slug}`;
      if (state(entry, beforeWrite) === "pending") {
        receipt.attempted.push(label); persist(receipt);
        const rows = await store.write(entry);
        if (rows.length !== 1 || rows[0][entry.target.field] !== entry.after) throw new Error(`CAS recusou: ${label}`);
        receipt.written.push(label); persist(receipt);
      } else receipt.already_applied.push(label);
      const actual = await store.read(entry.target);
      if (state(entry, actual) !== "applied" || Object.keys(beforeWrite.row).some((key) => key !== entry.target.field && key !== "updated_at" && JSON.stringify(beforeWrite.row[key]) !== JSON.stringify(actual.row[key]))) throw new Error(`Readback divergiu: ${label}`);
      receipt.readback.push(label); persist(receipt);
    }
  } catch (error) { receipt.error = error instanceof Error ? error.message : "Falha texto"; throw error; }
  finally { persist(receipt); }
  return receipt;
}
const store: Store = {
  async read(target) {
    const candidate = await supabase.from("candidatos").select("id,slug,sq_candidato_2026,situacao_candidatura,publicavel,biografia").eq("id", target.candidato_id).abortSignal(AbortSignal.timeout(30_000)).single();
    const row = target.table === "candidatos" ? candidate : await supabase.from("historico_politico").select("*").eq("id", target.id).abortSignal(AbortSignal.timeout(30_000)).single();
    if (row.error || candidate.error || !row.data || !candidate.data) throw new Error(`Leitura falhou: ${target.slug}`);
    return { row: row.data, candidate: candidate.data };
  },
  async write(entry) {
    return escreverAuditado({ script: "apply-issue-317-texto-recurso", tabela: entry.target.table, recorte: entry.target.slug,
      motivo: `Issue #317: preservar descrição oficial de prazo recursal ou recurso; fonte ${SOURCE_HASH}; somente frase datada.` }, () => {
      let query = supabase.from(entry.target.table).update({ [entry.target.field]: entry.after }).eq("id", entry.target.id).eq(entry.target.field, entry.before.row[entry.target.field]);
      if (entry.target.table === "historico_politico") query = query.eq("candidato_id", entry.target.candidato_id).eq("periodo_inicio", 2026);
      else query = query.eq("slug", entry.target.slug).eq("sq_candidato_2026", entry.target.sq).eq("situacao_candidatura", "indeferido com recurso").eq("publicavel", true);
      return query.select("*").abortSignal(AbortSignal.timeout(30_000));
    });
  },
};
export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.some((arg) => !/^(--apply|--dry-run|--snapshot=.+|--source=.+|--expect-plan=[a-f0-9]{64})$/.test(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) throw new Error("Argumentos inválidos");
  const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const project = supabaseProjectRefParaAuditoria(), path = option("snapshot");
  if (project !== PROJECT || !path) throw new Error("Projeto/snapshot exigido");
  if (!args.includes("--apply")) {
    if (existsSync(path)) throw new Error("Snapshot existente");
    const source = option("source"); if (!source || hash(readFileSync(source)) !== SOURCE_HASH) throw new Error("Fonte revisada divergiu");
    const plan = planTexts(project, await Promise.all(TARGETS.map((target) => store.read(target))));
    escreverPrivado(path, plan); console.log(JSON.stringify({ dry_run: true, snapshot: resolve(path), plan_hash: hash(JSON.stringify(plan)), targets: 6 })); return;
  }
  const expected = option("expect-plan"); if (!expected) throw new Error("Exige hash revisado");
  const receiptPath = `${path}.receipt-${Date.now()}.json`;
  const receipt = await applyTexts(JSON.parse(readFileSync(path, "utf8")), expected, project, store, (value) => escreverPrivado(receiptPath, value));
  console.log(JSON.stringify({ receipt: receiptPath, written: receipt.written.length, readback: receipt.readback.length, already_applied: receipt.already_applied.length }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main().catch((error) => { console.error(error instanceof Error ? error.message : "Falha prosa"); process.exitCode = 2; });
