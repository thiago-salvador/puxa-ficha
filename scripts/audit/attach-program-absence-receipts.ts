import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TARGET_SQS = new Set([
  "60002553922",
  "130002544411",
  "190002543380",
  "190002550196",
  "250002548080",
]);

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function flag(argv: string[], name: string): string | null {
  const prefix = `--${name}=`;
  return argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fixedPointPayload(data: Record<string, unknown>): string {
  const measurements = data.medicoes as Record<string, number>;
  let previous = -1;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const serialized = `${JSON.stringify(data, null, 2)}\n`;
    const bytes = Buffer.byteLength(serialized);
    if (bytes === previous) return serialized;
    measurements.inventarioPayloadBytes = bytes;
    previous = bytes;
  }
  throw new Error("inventarioPayloadBytes não estabilizou");
}

export function attachProgramAbsenceReceipts(inventoryPath: string, receiptsPath: string): string {
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8")) as Record<string, unknown>;
  const receiptsRaw = readFileSync(receiptsPath);
  const receiptSet = JSON.parse(receiptsRaw.toString("utf8")) as Record<string, unknown> & {
    schema_version: number;
    receipt_set_id: string;
    generated_at: string;
    receipt_sha256: string;
    receipts: Array<{ receipt_id: string; sq_candidato: string; result: string; program_files_total: number }>;
  };
  const semanticCore: Record<string, unknown> = { ...receiptSet };
  delete semanticCore.receipt_sha256;
  const receiptSqs = new Set(receiptSet.receipts.map((receipt) => receipt.sq_candidato));
  if (receiptSet.schema_version !== 1 || receiptSet.receipts.length !== 5
    || receiptSet.receipt_sha256 !== sha256(canonicalJson(semanticCore))
    || receiptSqs.size !== TARGET_SQS.size
    || [...TARGET_SQS].some((sq) => !receiptSqs.has(sq))
    || receiptSet.receipts.some((receipt) => receipt.program_files_total !== 0
      || receipt.result !== "sem_programa_oficial_codtipo_5_no_escopo"
      || receipt.receipt_id !== `programa-governo-ausente:2026:${receipt.sq_candidato}`)) {
    throw new Error("receipt set de programas ausentes inválido");
  }
  const bySq = new Map(receiptSet.receipts.map((receipt) => [receipt.sq_candidato, receipt]));
  const candidates = inventory.candidaturas as Array<Record<string, unknown>>;
  const attached = new Set<string>();
  inventory.candidaturas = candidates.map((candidate) => {
    const receipt = bySq.get(String(candidate.sqCandidato));
    if (!receipt) return candidate;
    if (!Array.isArray(candidate.documentoIds) || candidate.documentoIds.length !== 0
      || candidate.fonteEstado !== "sem_documento_oficial") {
      throw new Error(`${receipt.sq_candidato}: inventário não está sem documento oficial`);
    }
    attached.add(receipt.sq_candidato);
    const beforeTse = { ...candidate };
    const tse = beforeTse.tse;
    delete beforeTse.tse;
    delete beforeTse.reciboSemProgramaOficialId;
    return { ...beforeTse, reciboSemProgramaOficialId: receipt.receipt_id, tse };
  });
  if (attached.size !== receiptSet.receipts.length) throw new Error("nem todos os recibos foram vinculados ao inventário");
  inventory.recibosSemProgramaOficial = {
    arquivo: relative(process.cwd(), receiptsPath),
    arquivo_sha256: sha256(receiptsRaw),
    receipt_set_id: receiptSet.receipt_set_id,
    receipt_sha256: receiptSet.receipt_sha256,
    generated_at: receiptSet.generated_at,
    receipt_ids: receiptSet.receipts.map((receipt) => receipt.receipt_id),
  };
  return fixedPointPayload(inventory);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const inventoryFlag = flag(argv, "inventory");
  const receiptsFlag = flag(argv, "receipts");
  if (!inventoryFlag || !receiptsFlag) throw new Error("--inventory e --receipts são obrigatórios");
  const inventoryPath = resolve(inventoryFlag);
  const receiptsPath = resolve(receiptsFlag);
  const out = resolve(flag(argv, "out") ?? inventoryPath);
  writeFileSync(out, attachProgramAbsenceReceipts(inventoryPath, receiptsPath));
  console.log(`PROGRAM_ABSENCE_RECEIPTS_ATTACHED path=${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
