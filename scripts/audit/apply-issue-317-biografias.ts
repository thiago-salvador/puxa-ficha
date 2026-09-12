/** Retira somente a frase genérica de julgamento pendente em 14 fichas revisadas. */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ativarDryRun } from "../lib/dry-run";
import { escreverAuditado } from "../lib/escrita-auditada";
import { supabase, supabaseProjectRefParaAuditoria } from "../lib/supabase";
import { escreverPrivado } from "../lib/tse-julgamento-2026";
import { hash, PROJECT } from "./apply-issue-317-tse";

export const BIO_TARGETS = [
  ["augusto-cury", "5a4d76d2-6243-41b9-88b2-e94c68383e52", "280002551547", "à Presidência da República", "deferido"],
  ["breno-barcelar", "2a636465-411c-4599-9d43-51aa80b78f3c", "80002541012", "ao governo do Espírito Santo", "deferido"],
  ["clariana-barao", "d1486424-4a7f-4ff1-af06-1665ebe99a31", "280002552484", "à Presidência da República", "deferido"],
  ["clecio-luis", "d97908e9-5b30-4d0e-a01b-c0348682949d", "30002536311", "ao governo do Amapá", "deferido"],
  ["expedito-netto", "5b63badb-bf2b-4535-bead-b1e85ad6c609", "220002542185", "ao governo de Rondônia", "deferido"],
  ["joao-rodrigues", "a5fa816e-9e3b-40ae-8679-71568bed63da", "240002551001", "ao governo de Santa Catarina", "deferido"],
  ["juliete-pantoja", "0ef8b4e2-ef3d-4f6a-b284-3f4648c1386b", "190002547272", "ao governo do Rio de Janeiro", "deferido"],
  ["leonardo-avalanche", "11aeff6f-ce8d-45bb-a4d1-a798b160e2fe", "280002553883", "à Vice-Presidência da República", "deferido"],
  ["lourdes-melo", "f5de5375-7258-4164-9f89-45ee8ee442d6", "180002553722", "ao governo do Piauí", "indeferido com recurso"],
  ["luiz-franca", "ce9beb5d-be08-4204-99c9-e94f7276d3e7", "160002551353", "ao governo do Paraná", "deferido"],
  ["renan-santos", "4cbc3b25-075a-4d87-89bd-58d1e0b2a5f2", "280002540694", "à Presidência da República", "deferido"],
  ["samuel-costa", "f4e5e4bd-7934-4d04-8534-9a60fac53edd", "220002550927", "ao governo de Rondônia", "deferido"],
  ["sandro-alex", "00b971a6-5f12-4fa3-961f-5806abfd6fb0", "160002549553", "ao governo do Paraná", "deferido"],
  ["sergio-moro-gov-pr", "6025cfb5-d1a7-4ad0-baa7-c131b381e8fa", "160002540833", "ao governo do Paraná", "deferido"],
] as const;
export interface BioRow { id: string; slug: string; sq_candidato_2026: string; situacao_candidatura: string; publicavel: boolean; biografia: string }
export interface BioEntry { before: BioRow; after: string }
export interface BioPlan { project: string; created_at: string; entries: BioEntry[] }
export const oldSentence = (office: string) => `O pedido de registro da candidatura ${office} consta na base oficial de candidaturas do TSE e aguarda julgamento; registro pendente não equivale a candidatura deferida.`;
export function repairBiography(row: BioRow): string {
  const target = BIO_TARGETS.find(([slug]) => slug === row.slug);
  if (!target || row.id !== target[1] || row.sq_candidato_2026 !== target[2] || row.publicavel !== true || row.situacao_candidatura !== target[4]) throw new Error(`Identidade/situação fora do recorte: ${row.slug}`);
  if (typeof row.biografia !== "string") throw new Error(`Biografia ausente: ${row.slug}`);
  const before = oldSentence(target[3]);
  const after = `Na consulta ao TSE de 12 de setembro de 2026, o registro estava ${target[4]}.`;
  const count = row.biografia.split(before).length - 1;
  if (count === 0 && row.biografia.split(after).length === 2) return row.biografia;
  if (count !== 1 || row.biografia.includes(after)) throw new Error(`Frase genérica ausente ou ambígua: ${row.slug}`);
  return row.biografia.replace(before, after);
}
export function planBiographies(project: string, rows: BioRow[], now = new Date()): BioPlan {
  if (project !== PROJECT || rows.length !== BIO_TARGETS.length || new Set(rows.map((row) => row.slug)).size !== BIO_TARGETS.length) throw new Error("Projeto/coorte de biografias divergiu");
  return { project, created_at: now.toISOString(), entries: [...rows].sort((a, b) => a.slug.localeCompare(b.slug)).map((before) => ({ before, after: repairBiography(before) })) };
}
export interface BioStore { read(id: string): Promise<BioRow>; write(entry: BioEntry): Promise<BioRow[]> }
export interface BioReceipt { plan_hash: string; attempted: string[]; written: string[]; already_applied: string[]; readback: string[]; error: string | null }
function currentState(entry: BioEntry, current: BioRow): "applied" | "pending" {
  const keys = ["id", "slug", "sq_candidato_2026", "situacao_candidatura", "publicavel"] as const;
  if (keys.some((key) => entry.before[key] !== current[key])) throw new Error(`Identidade/situação concorrente: ${entry.before.slug}`);
  if (current.biografia === entry.after) return "applied";
  if (current.biografia !== entry.before.biografia) throw new Error(`Biografia concorrente: ${entry.before.slug}`);
  return "pending";
}
export async function applyBiographies(plan: BioPlan, expected: string, project: string, store: BioStore, persist: (value: BioReceipt) => void): Promise<BioReceipt> {
  if (project !== PROJECT || plan.project !== PROJECT || hash(JSON.stringify(plan)) !== expected ||
      JSON.stringify(planBiographies(project, plan.entries.map((entry) => entry.before), new Date(plan.created_at))) !== JSON.stringify(plan)) throw new Error("Plano/hash de biografias divergiu");
  const receipt: BioReceipt = { plan_hash: expected, attempted: [], written: [], already_applied: [], readback: [], error: null };
  persist(receipt);
  try {
    for (const entry of plan.entries) currentState(entry, await store.read(entry.before.id));
    for (const entry of plan.entries) {
      const current = await store.read(entry.before.id);
      if (currentState(entry, current) === "applied") receipt.already_applied.push(current.slug);
      else {
        receipt.attempted.push(current.slug); persist(receipt);
        const rows = await store.write(entry);
        if (rows.length !== 1 || currentState(entry, rows[0]) !== "applied") throw new Error(`CAS recusou: ${current.slug}`);
        receipt.written.push(current.slug); persist(receipt);
      }
      if (currentState(entry, await store.read(entry.before.id)) !== "applied") throw new Error(`Readback falhou: ${current.slug}`);
      receipt.readback.push(current.slug); persist(receipt);
    }
  } catch (error) { receipt.error = error instanceof Error ? error.message : "Falha biografias"; throw error; }
  finally { persist(receipt); }
  return receipt;
}
const COLUMNS = "id,slug,sq_candidato_2026,situacao_candidatura,publicavel,biografia";
const store: BioStore = {
  async read(id) {
    const { data, error } = await supabase.from("candidatos").select(COLUMNS).eq("id", id).abortSignal(AbortSignal.timeout(30_000)).single();
    if (error || !data) throw new Error(`Leitura biografia falhou: ${id}`);
    return data as BioRow;
  },
  async write(entry) {
    return escreverAuditado({ script: "apply-issue-317-biografias", tabela: "candidatos", recorte: entry.before.slug,
      motivo: "Issue #317: substituir somente frase genérica após julgamento TSE verificado em 12/09/2026; snapshot revisado, texto restante preservado." }, () =>
      supabase.from("candidatos").update({ biografia: entry.after }).eq("id", entry.before.id).eq("slug", entry.before.slug)
        .eq("sq_candidato_2026", entry.before.sq_candidato_2026).eq("situacao_candidatura", entry.before.situacao_candidatura)
        .eq("publicavel", true).eq("biografia", entry.before.biografia).select(COLUMNS).abortSignal(AbortSignal.timeout(30_000)),
    ) as Promise<BioRow[]>;
  },
};
export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.some((arg) => !/^(--apply|--dry-run|--snapshot=.+|--expect-plan=[a-f0-9]{64})$/.test(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) throw new Error("Argumentos inválidos");
  const apply = args.includes("--apply"); if (!apply) ativarDryRun();
  const option = (key: string) => args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
  const path = option("snapshot"); if (!path) throw new Error("Exige --snapshot fora do checkout");
  const project = supabaseProjectRefParaAuditoria(); if (project !== PROJECT) throw new Error("Projeto não autorizado");
  if (!apply) {
    if (existsSync(path)) throw new Error("Snapshot existente; não sobrescrever");
    const plan = planBiographies(project, await Promise.all(BIO_TARGETS.map(([, id]) => store.read(id))));
    escreverPrivado(path, plan);
    console.log(JSON.stringify({ dry_run: true, snapshot: resolve(path), plan_hash: hash(JSON.stringify(plan)), targets: plan.entries.length })); return;
  }
  const expected = option("expect-plan"); if (!expected) throw new Error("Apply exige hash revisado");
  const plan = JSON.parse(readFileSync(path, "utf8")) as BioPlan;
  const receiptPath = `${path}.receipt-${Date.now()}.json`;
  const receipt = await applyBiographies(plan, expected, project, store, (value) => escreverPrivado(receiptPath, value));
  console.log(JSON.stringify({ dry_run: false, receipt: receiptPath, written: receipt.written.length, already_applied: receipt.already_applied.length, readback: receipt.readback.length }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main().catch((error) => { console.error(error instanceof Error ? error.message : "Falha biografias"); process.exitCode = 2; });
