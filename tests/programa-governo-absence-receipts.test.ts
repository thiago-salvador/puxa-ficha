import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { attachProgramAbsenceReceipts, buildProgramAbsencePublicRecords } from "../scripts/audit/attach-program-absence-receipts";
import { generateProgramAbsenceReceipts } from "../scripts/audit/generate-program-absence-receipts";

const ROOT = resolve(import.meta.dirname, "..");
const EVIDENCE_DIR = join(ROOT, "QA/evidencias/2026-08-30-programas-ausentes");
const RECEIPT_PATH = join(EVIDENCE_DIR, "receipt.json");
const MONITOR_PATH = join(EVIDENCE_DIR, "monitor-run-33329832043.json");
const RAW_DIR = join(EVIDENCE_DIR, "raw");
const INVENTORY_PATH = join(ROOT, "scripts/data/programas-governo-governadores-2026/inventario-2026-08-29.json");
const TARGETS = new Map([
  ["60002553922", "vera-lucia-ce"],
  ["130002544411", "ben-mendes"],
  ["190002543380", "eduardo-paes"],
  ["190002550196", "garotinho"],
  ["250002548080", "policial-edjane"],
]);
// Recibo superado por pacote posterior: o artefato de 2026-08-30 continua com
// cinco recibos, mas Eduardo Paes ganhou o programa no pacote de 2026-09-02 e
// Vera Lúcia no pacote de 2026-09-03. Os dois saíram do vínculo com o
// inventário e do estado público sem documento.
const SUPERSEDED = new Map([
  ["60002553922", "vera-lucia-ce"],
  ["190002543380", "eduardo-paes"],
]);
const CURRENT = new Map([...TARGETS].filter(([sq]) => !SUPERSEDED.has(sq)));

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const receiptRaw = readFileSync(RECEIPT_PATH);
const receipt = JSON.parse(receiptRaw.toString("utf8")) as Record<string, unknown> & {
  receipt_sha256: string;
  receipts: Array<Record<string, unknown>>;
  positive_control: Record<string, unknown>;
};
const inventoryRaw = readFileSync(INVENTORY_PATH, "utf8");
const inventory = JSON.parse(inventoryRaw) as Record<string, unknown> & {
  candidaturas: Array<Record<string, unknown>>;
  recibosSemProgramaOficial: Record<string, unknown>;
};

test("prova cinco ausências oficiais com payload bruto e controle positivo", () => {
  assert.equal(receipt.production_database_changed, false);
  assert.equal(receipt.public_program_state_ready_for_publish, true);
  assert.equal("prior_confirmation_at" in receipt, false);
  assert.equal("supersedes_prior_confirmation_with_raw_payloads" in receipt, false);
  assert.deepEqual(new Map(receipt.receipts.map((item) => [String(item.sq_candidato), item.profile_slug])), TARGETS);

  for (const item of receipt.receipts) {
    const rawPath = resolve(dirname(RECEIPT_PATH), String(item.raw_payload_path));
    const raw = readFileSync(rawPath);
    const payload = JSON.parse(raw.toString("utf8")) as { id: number | string; arquivos: Array<{ codTipo?: number | string }> };
    assert.equal(sha256(raw), item.payload_raw_sha256);
    assert.equal(String(payload.id), item.sq_candidato);
    assert.equal(item.http_status, 200);
    assert.ok(Number.isFinite(Date.parse(String(item.checked_at))));
    assert.equal(payload.arquivos.some((file) => String(file.codTipo ?? "") === "5"), false);
    assert.equal(item.program_files_total, 0);
  }

  const controlRaw = readFileSync(resolve(dirname(RECEIPT_PATH), String(receipt.positive_control.raw_payload_path)));
  const control = JSON.parse(controlRaw.toString("utf8")) as { id: number | string; arquivos: Array<{ codTipo?: number | string }> };
  assert.equal(sha256(controlRaw), receipt.positive_control.payload_raw_sha256);
  assert.equal(String(control.id), "240002537073");
  assert.equal(control.arquivos.some((file) => String(file.codTipo ?? "") === "5"), true);
});

test("valida hash semântico e reproduz o receipt set pelo gerador", () => {
  const core: Record<string, unknown> = { ...receipt };
  delete core.receipt_sha256;
  assert.equal(sha256(canonicalJson(core)), receipt.receipt_sha256);
  assert.deepEqual(
    generateProgramAbsenceReceipts({
      monitorPath: MONITOR_PATH,
      rawDir: RAW_DIR,
      outputPath: RECEIPT_PATH,
      runUrl: "https://github.com/thiago-salvador/puxa-ficha/actions/runs/33329832043",
      headSha: "ee5158e253d9c90069cad2a9186ec12fd8acf38c",
    }),
    receipt,
  );
});

test("vincula os recibos vigentes ao inventário sem publicar documento inexistente", () => {
  const attached = inventory.candidaturas.filter((candidate) => candidate.reciboSemProgramaOficialId);
  assert.deepEqual(
    attached.map((candidate) => String(candidate.sqCandidato)).sort(),
    [...CURRENT.keys()].sort(),
  );
  for (const sq of SUPERSEDED.keys()) {
    const superseded = inventory.candidaturas.find((candidate) => String(candidate.sqCandidato) === sq);
    assert.ok(superseded);
    assert.equal(superseded.reciboSemProgramaOficialId, undefined);
    assert.equal(superseded.fonteEstado, "documento_oficial_encontrado");
    assert.ok((superseded.documentoIds as unknown[]).length > 0);
  }
  assert.deepEqual(
    inventory.recibosSemProgramaOficial.receipt_ids_superados,
    [...SUPERSEDED.keys()].map((sq) => `programa-governo-ausente:2026:${sq}`),
  );
  for (const candidate of attached) {
    assert.equal(candidate.fonteEstado, "sem_documento_oficial");
    assert.deepEqual(candidate.documentoIds, []);
    assert.equal(candidate.reciboSemProgramaOficialId, `programa-governo-ausente:2026:${candidate.sqCandidato}`);
  }

  const control = inventory.candidaturas.find((candidate) => String(candidate.sqCandidato) === "240002537073");
  assert.ok(control);
  assert.ok((control.documentoIds as unknown[]).length > 0);
  assert.equal(control.reciboSemProgramaOficialId, undefined);
  assert.equal(inventory.recibosSemProgramaOficial.arquivo_sha256, sha256(receiptRaw));
  assert.equal(inventory.recibosSemProgramaOficial.receipt_sha256, receipt.receipt_sha256);
  assert.equal(attachProgramAbsenceReceipts(INVENTORY_PATH, RECEIPT_PATH), inventoryRaw);
});

test("recusa receipt set adulterado antes de alterar o inventário", () => {
  const temporary = mkdtempSync(join(tmpdir(), "pf-program-receipt-"));
  try {
    const tamperedPath = join(temporary, "receipt.json");
    const tampered = structuredClone(receipt);
    tampered.receipts[0].profile_slug = "perfil-adulterado";
    writeFileSync(tamperedPath, `${JSON.stringify(tampered, null, 2)}\n`);
    assert.throws(
      () => attachProgramAbsenceReceipts(INVENTORY_PATH, tamperedPath),
      /receipt set de programas ausentes inválido/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("mantém a referência no gerador do inventário sem tocar o banco", () => {
  const source = readFileSync(join(ROOT, "scripts/programas-governo-governadores-2026-inventario.ts"), "utf8");
  assert.match(source, /DEFAULT_ABSENCE_RECEIPTS/);
  assert.match(source, /recibosSemProgramaOficial/);
  assert.match(source, /reciboSemProgramaOficialId/);
  assert.equal(receipt.production_database_changed, false);
});

test("gera os estados públicos sem documento dos recibos vigentes, sem inventar conteúdo", () => {
  const records = buildProgramAbsencePublicRecords(INVENTORY_PATH, RECEIPT_PATH);
  // O snapshot do pacote continua datado; o anúncio posterior impede restaurar
  // a ausência antiga na ficha, sem alegar que houve download do PDF.
  assert.deepEqual(records.map((entry) => entry.slug), [...CURRENT.values()].filter((slug) => slug !== "ben-mendes").sort((a, b) => a.localeCompare(b, "pt-BR")));
  for (const entry of records) {
    assert.equal(entry.record.estado, "sem_documento_oficial");
    assert.equal("resumo" in entry.record, false);
    assert.equal("documentos" in entry.record, false);
    assert.equal("extracao" in entry.record, false);
    const persisted = JSON.parse(readFileSync(join(ROOT, `src/data/programas-governo/governadores-2026/${entry.slug}.json`), "utf8"));
    assert.deepEqual(persisted, entry.record);
  }
});
