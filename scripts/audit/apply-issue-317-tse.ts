/** Reparo pontual de #317. Dry-run por padrão; nenhuma exclusão de cadastro. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ativarDryRun } from "../lib/dry-run";
import { escreverAuditado } from "../lib/escrita-auditada";
import { supabase, supabaseProjectRefParaAuditoria } from "../lib/supabase";
import { escreverPrivado } from "../lib/tse-julgamento-2026";

export const PROJECT = "wskpzsobvqwhnbsdsmok";
const SOURCE_HASH = "cedfae01530b69f861eb70c4bdbfa8d180463e10619beb466618114aa3141d87";
const UNIVERSE_HASH = "0ba2aa64e7210d4608c6390c8705d9d3f724f01a4fa24e8f537a34405329510f";
const CDN_HASH = "342852c06b645fa90f4bc767153b497995ead648542d04059ccf14fb745c25d8";
const CDN_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip";
const CDN_CHECKED_AT = "2026-09-12T15:20:12.954Z";
type Row = Record<string, unknown>;
type Table = "candidatos" | "chapas_2026";
export type Target = { table: Table; id: string; identity: Row; patch: Row; evidence: string };

export const TARGETS: readonly Target[] = [
  { table: "candidatos", id: "6149187f-70b5-4441-8b2a-6022d165959d",
    identity: { slug: "pablo-marcal", sq_candidato_2026: "280002553884", cargo_disputado: "Presidente", estado: null },
    patch: { situacao_candidatura: "indeferido", publicavel: false, status: "removido" },
    evidence: "DivulgaCand detalhe 280002553884: Indeferido, isCandidatoInapto=true; HTTP/hash nos artefatos fixados." },
  { table: "candidatos", id: "5a4d76d2-6243-41b9-88b2-e94c68383e52",
    identity: { slug: "augusto-cury", sq_candidato_2026: "280002551547", cargo_disputado: "Presidente", estado: null, publicavel: true, status: "candidato" },
    patch: { situacao_candidatura: "deferido" },
    evidence: "DivulgaCand detalhe 280002551547: Deferido, flags aptas; HTTP/hash nos artefatos fixados." },
  { table: "candidatos", id: "11aeff6f-ce8d-45bb-a4d1-a798b160e2fe",
    identity: { slug: "leonardo-avalanche", sq_candidato_2026: "280002553883", cargo_disputado: "Vice-Presidente", estado: null, publicavel: true, status: "candidato" },
    patch: { situacao_candidatura: "deferido" },
    evidence: "Leitura visual oficial verificada nesta revisão: Concorrendo/Deferido, atualização TSE 12/09/2026 11:51. https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/20322002026/280002553883/2026/BR/viceSuplente . Fonte UI, sem recibo HTTP/hash de corpo atribuído." },
  { table: "chapas_2026", id: "79208d24-e973-4893-a08c-ee6bea67e213",
    identity: { chave: "2026:RR:jose-clebio-genuino-do-nascimento", titular_sq_candidato: "230002553857",
      titular_candidato_id: "12357734-561a-48c9-8c91-78fdbeb5b6f7", uf: "RR", cargo_titular: "Governador",
      sq_coligacao: "230001801451", vice_candidato_id: null, fonte_tipo: "legado", fonte_detalhe: null,
      tse_situacao_codigo: "#NE", tse_situacao_titular_codigo: "-3", tse_situacao_vice_codigo: "-3" },
    patch: { vice_sq_candidato: "230002554442", vice_nome_urna: "JOTA RODRIGUES", vice_nome_completo: "JARILOM RODRIGUES SABAJO",
      vice_partido_sigla: "PCO", fonte_url: CDN_URL, fonte_sha256: CDN_HASH, snapshot_em: CDN_CHECKED_AT },
    evidence: "Registro de vice mais recente conforme CDN; não afirma aptidão/vigência. Detalhe titular: Jota e Gregório com situacao_vice=3. Jota, JARILOM RODRIGUES SABAJO, leitura visual oficial Indeferido, atualização 11/09/2026 17:32: https://divulgacandcontas.tse.jus.br/divulga/#/candidato/RR/RR/20322002026/230002554442/2026/RR/viceSuplente . Códigos CSV -3 preservados; fonte_detalhe fica NULL por constraint do ramo legado. Histórico anterior preservado no snapshot privado." },
];

export interface Entry { target: Target; before: Row; after: Row }
export interface Plan { version: 1; project: string; created_at: string; source_hash: string; universe_hash: string; entries: Entry[] }
export const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
const equal = (left: unknown, right: unknown) => stable(left) === stable(right);
const matches = (row: Row, expected: Row) => Object.entries(expected).every(([key, value]) =>
  key === "snapshot_em" && typeof row[key] === "string" && typeof value === "string"
    ? Number.isFinite(Date.parse(value)) && Date.parse(row[key]) === Date.parse(value)
    : equal(row[key], value));
const reference = (target: Target) => String(target.identity.slug ?? target.identity.chave);

export function planRepair(project: string, rows: readonly Row[], now = new Date()): Plan {
  if (project !== PROJECT) throw new Error("Projeto não autorizado para #317");
  if (rows.length !== TARGETS.length) throw new Error("Recorte incompleto de #317");
  const entries = TARGETS.map((target, index): Entry => {
    const before = rows[index];
    if (before.id !== target.id || !matches(before, target.identity)) throw new Error(`Identidade divergiu: ${reference(target)}`);
    const applied = matches(before, target.patch);
    if (!applied && target.table === "candidatos") {
      if (before.publicavel !== true || before.status !== "candidato" ||
          !(target.identity.slug === "pablo-marcal" ? ["aguardando julgamento", "indeferido"] : ["aguardando julgamento"]).includes(String(before.situacao_candidatura)))
        throw new Error(`Situação anterior divergiu: ${reference(target)}`);
    }
    if (!applied && target.table === "chapas_2026" && !matches(before, {
      vice_sq_candidato: "230002553858", vice_nome_urna: "GREGÓRIO PEREIRA",
      vice_nome_completo: "JOSÉ GREGÓRIO RODRIGUES PEREIRA", vice_partido_sigla: "PCO",
      fonte_url: CDN_URL, fonte_sha256: "eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27",
      snapshot_em: "2026-08-28T01:58:24.127+00:00",
    })) throw new Error("Vice anterior ou fonte divergiu");
    return { target, before, after: { ...before, ...target.patch } };
  });
  return { version: 1, project, created_at: now.toISOString(), source_hash: SOURCE_HASH, universe_hash: UNIVERSE_HASH, entries };
}

/** Compara somente a identidade e os campos escritos; não sobrescreve outros. */
export function disposition(entry: Entry, current: Row): "applied" | "pending" {
  if (current.id !== entry.target.id || !matches(current, entry.target.identity)) throw new Error(`Identidade concorrente: ${reference(entry.target)}`);
  if (matches(current, entry.target.patch)) return "applied";
  const beforeFields = Object.fromEntries(Object.keys(entry.target.patch).map((key) => [key, entry.before[key]]));
  if (!matches(current, beforeFields)) throw new Error(`Estado concorrente: ${reference(entry.target)}`);
  return "pending";
}

export interface RepairStore { read(target: Target): Promise<Row>; write(entry: Entry): Promise<Row[]> }
export interface Receipt { plan_hash: string; attempts: string[]; written: string[]; already_applied: string[]; readback: string[]; failure: string | null }
export async function applyRepair(plan: Plan, expectedHash: string, project: string, store: RepairStore, persist: (receipt: Receipt) => void): Promise<Receipt> {
  if (project !== PROJECT || plan.project !== PROJECT || hash(JSON.stringify(plan)) !== expectedHash) throw new Error("Projeto/hash aprovado divergiu");
  if (plan.version !== 1 || plan.source_hash !== SOURCE_HASH || plan.universe_hash !== UNIVERSE_HASH ||
      !equal(plan.entries.map((entry) => entry.target), TARGETS)) throw new Error("Plano fora do recorte autorizado");
  const rebuilt = planRepair(project, plan.entries.map((entry) => entry.before), new Date(plan.created_at));
  if (!equal(rebuilt, plan)) throw new Error("Plano adulterado");
  // Sem rollback automático: o retry confirma pós-imagens já aplicadas e conclui
  // somente operações pendentes. Uma falha não republica candidatura inapta.
  const receipt: Receipt = { plan_hash: expectedHash, attempts: [], written: [], already_applied: [], readback: [], failure: null };
  for (const entry of plan.entries) disposition(entry, await store.read(entry.target));
  persist(receipt);
  try {
    for (const entry of plan.entries) {
      const beforeWrite = await store.read(entry.target);
      const ref = reference(entry.target);
      if (disposition(entry, beforeWrite) === "applied") receipt.already_applied.push(ref);
      else {
        receipt.attempts.push(ref); persist(receipt);
        const rows = await store.write(entry);
        if (rows.length !== 1 || disposition(entry, rows[0]) !== "applied") throw new Error(`CAS recusou ${ref}`);
        receipt.written.push(ref); persist(receipt);
      }
      const actual = await store.read(entry.target);
      if (disposition(entry, actual) !== "applied") throw new Error(`Readback falhou ${ref}`);
      const untouched = Object.keys(beforeWrite).filter((key) => !(key in entry.target.patch) && key !== "updated_at");
      if (!untouched.every((key) => equal(beforeWrite[key], actual[key]))) throw new Error(`Campo fora do recorte mudou ${ref}`);
      receipt.readback.push(ref); persist(receipt);
    }
  } catch (error) { receipt.failure = error instanceof Error ? error.message : "Falha no reparo"; throw error; }
  finally { persist(receipt); }
  return receipt;
}

async function readTarget(target: Target): Promise<Row> {
  const { data, error } = await supabase.from(target.table).select("*").eq("id", target.id).abortSignal(AbortSignal.timeout(30_000)).single();
  if (error || !data) throw new Error(`Leitura falhou ${reference(target)}: ${error?.message ?? "ausente"}`);
  return data;
}
const productionStore: RepairStore = {
  read: readTarget,
  write: async (entry) => escreverAuditado({ script: "apply-issue-317-tse", tabela: entry.target.table,
    recorte: reference(entry.target), motivo: `Issue #317; source ${SOURCE_HASH}; ${entry.target.evidence}` }, () => {
    let query = supabase.from(entry.target.table).update(entry.target.patch).eq("id", entry.target.id);
    const guards = { ...entry.target.identity, ...Object.fromEntries(Object.keys(entry.target.patch).map((key) => [key, entry.before[key]])) };
    for (const [key, value] of Object.entries(guards)) query = value === null ? query.is(key, null) : query.eq(key, value);
    return query.select("*").abortSignal(AbortSignal.timeout(30_000));
  }),
};

export async function main(args = process.argv.slice(2)): Promise<void> {
  const allowed = /^(--apply|--dry-run|--snapshot=.+|--expect-plan=[a-f0-9]{64}|--evidence-dir=.+)$/;
  if (args.some((arg) => !allowed.test(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) throw new Error("Argumentos inválidos");
  const apply = args.includes("--apply");
  if (!apply) ativarDryRun();
  const option = (key: string) => args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
  const snapshotPath = option("snapshot");
  if (!snapshotPath) throw new Error("Exige --snapshot=<arquivo privado fora do checkout>");
  const project = supabaseProjectRefParaAuditoria();
  if (project !== PROJECT) throw new Error("Projeto não autorizado");
  if (!apply) {
    if (existsSync(snapshotPath)) throw new Error("Snapshot já existe; use arquivo novo ou aplique snapshot revisado");
    const dir = option("evidence-dir");
    if (!dir || hash(readFileSync(resolve(dir, "source.json"))) !== SOURCE_HASH || hash(readFileSync(resolve(dir, "universe.json"))) !== UNIVERSE_HASH)
      throw new Error("Artefatos oficiais não correspondem à evidência revisada de #317");
    const plan = planRepair(project, await Promise.all(TARGETS.map(readTarget)));
    escreverPrivado(snapshotPath, plan);
    console.log(JSON.stringify({ dry_run: true, snapshot: resolve(snapshotPath), plan_hash: hash(JSON.stringify(plan)), targets: plan.entries.length }));
    return;
  }
  const expected = option("expect-plan");
  if (!expected) throw new Error("Apply exige --expect-plan=<hash revisado>");
  const plan = JSON.parse(readFileSync(snapshotPath, "utf8")) as Plan;
  const receiptPath = `${snapshotPath}.receipt-${Date.now()}.json`;
  const receipt = await applyRepair(plan, expected, project, productionStore, (value) => escreverPrivado(receiptPath, value));
  console.log(JSON.stringify({ dry_run: false, receipt: receiptPath, written: receipt.written.length, already_applied: receipt.already_applied.length, readback: receipt.readback.length }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main().catch((error) => { console.error(error instanceof Error ? error.message : "Falha #317"); process.exitCode = 2; });
