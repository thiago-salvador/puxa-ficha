import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TARGETS = [
  { profile_slug: "vera-lucia-ce", sq_candidato: "60002553922" },
  { profile_slug: "ben-mendes", sq_candidato: "130002544411" },
  { profile_slug: "eduardo-paes", sq_candidato: "190002543380" },
  { profile_slug: "garotinho", sq_candidato: "190002550196" },
  { profile_slug: "policial-edjane", sq_candidato: "250002548080" },
] as const;
const CONTROL = { profile_slug: "jorginho-mello", sq_candidato: "240002537073" } as const;

interface SourceReceipt {
  url: string;
  checked_at: string;
  http_status: number;
  payload_raw_sha256: string;
  artifact_path: string;
  attempt: number;
  error: string | null;
}

interface MonitorReport {
  status: string;
  generated_at: string;
  alerts: unknown[];
  errors: unknown[];
  sources: SourceReceipt[];
  program_control: { profile_slug: string; sq_candidato: string; program_file_count: number };
  program_files: Array<{ profile_slug: string; sq_candidato: string; files_total: number; program_files: unknown[] }>;
  report_sha256: string;
}

function flag(argv: string[], name: string): string | null {
  const prefix = `--${name}=`;
  return argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
}

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

function readOfficialPayload(source: SourceReceipt, rawDir: string, expectedSq: string): {
  path: string;
  payload: Record<string, unknown>;
  files: Array<Record<string, unknown>>;
} {
  if (source.http_status !== 200 || source.error !== null || source.attempt !== 1) {
    throw new Error(`${expectedSq}: source receipt não é HTTP 200 limpo`);
  }
  if (!Number.isFinite(Date.parse(source.checked_at))) throw new Error(`${expectedSq}: checked_at inválido`);
  if (!/^[a-f0-9]{64}$/.test(source.payload_raw_sha256)) throw new Error(`${expectedSq}: hash inválido`);
  const path = resolve(rawDir, `${source.payload_raw_sha256}.raw`);
  const raw = readFileSync(path);
  if (sha256(raw) !== source.payload_raw_sha256) throw new Error(`${expectedSq}: payload bruto divergiu do hash`);
  const payload = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  if (String(payload.id ?? "") !== expectedSq) throw new Error(`${expectedSq}: identidade do payload divergiu`);
  if (!Array.isArray(payload.arquivos)) throw new Error(`${expectedSq}: payload sem arquivos[]`);
  const files = payload.arquivos as Array<Record<string, unknown>>;
  return { path, payload, files };
}

export function generateProgramAbsenceReceipts(input: {
  monitorPath: string;
  rawDir: string;
  outputPath: string;
  runUrl: string;
  headSha: string;
  priorCheckedAt: string;
}): Record<string, unknown> & { receipt_sha256: string } {
  const monitorRaw = readFileSync(input.monitorPath);
  const monitor = JSON.parse(monitorRaw.toString("utf8")) as MonitorReport;
  if (monitor.status !== "ok" || monitor.alerts.length !== 0 || monitor.errors.length !== 0 || monitor.sources.length !== 8) {
    throw new Error("monitor TSE não está limpo para gerar recibos negativos");
  }
  if (!/^https:\/\/github\.com\/thiago-salvador\/puxa-ficha\/actions\/runs\/\d+$/.test(input.runUrl)) {
    throw new Error("run URL inválida");
  }
  if (!/^[a-f0-9]{40}$/.test(input.headSha)) throw new Error("head SHA inválido");
  if (!Number.isFinite(Date.parse(input.priorCheckedAt))) throw new Error("prior checked_at inválido");

  const sourceFor = (sq: string): SourceReceipt => {
    const matches = monitor.sources.filter((source) => source.url.endsWith(`/candidato/${sq}`));
    if (matches.length !== 1) throw new Error(`${sq}: esperava uma source receipt, recebeu ${matches.length}`);
    return matches[0];
  };
  const controlSource = sourceFor(CONTROL.sq_candidato);
  const control = readOfficialPayload(controlSource, input.rawDir, CONTROL.sq_candidato);
  const controlPrograms = control.files.filter((file) => String(file.codTipo ?? "") === "5");
  if (monitor.program_control.profile_slug !== CONTROL.profile_slug
    || monitor.program_control.sq_candidato !== CONTROL.sq_candidato
    || controlPrograms.length < 1) {
    throw new Error("controle positivo Jorginho Mello não confirmou codTipo 5");
  }

  const receipts = TARGETS.map((target) => {
    const source = sourceFor(target.sq_candidato);
    const official = readOfficialPayload(source, input.rawDir, target.sq_candidato);
    const programs = official.files.filter((file) => String(file.codTipo ?? "") === "5");
    const monitorItem = monitor.program_files.find((item) => item.sq_candidato === target.sq_candidato);
    if (!monitorItem || monitorItem.profile_slug !== target.profile_slug
      || monitorItem.files_total !== official.files.length || monitorItem.program_files.length !== 0
      || programs.length !== 0) {
      throw new Error(`${target.sq_candidato}: monitor e payload não provam ausência de codTipo 5`);
    }
    return {
      receipt_id: `programa-governo-ausente:2026:${target.sq_candidato}`,
      profile_slug: target.profile_slug,
      sq_candidato: target.sq_candidato,
      result: "sem_programa_oficial_codtipo_5_no_escopo",
      scope: "DivulgaCand candidatura 2026, campo arquivos, codTipo 5",
      source_url: source.url,
      checked_at: source.checked_at,
      http_status: source.http_status,
      payload_raw_sha256: source.payload_raw_sha256,
      raw_payload_path: relative(dirname(input.outputPath), official.path),
      files_total: official.files.length,
      observed_file_types: [...new Set(official.files.map((file) => String(file.codTipo ?? "")))].sort(),
      program_files_total: 0,
    };
  });

  const core = {
    schema_version: 1,
    receipt_set_id: "programas-governo-ausentes:2026-08-30",
    generated_at: monitor.generated_at,
    prior_confirmation_at: input.priorCheckedAt,
    supersedes_prior_confirmation_with_raw_payloads: true,
    source_system: "TSE DivulgaCandContas",
    source_contract: "candidatura.arquivos[].codTipo",
    program_cod_tipo: "5",
    execution: {
      run_url: input.runUrl,
      head_sha: input.headSha,
      monitor_report_path: relative(dirname(input.outputPath), input.monitorPath),
      monitor_report_sha256: sha256(monitorRaw),
      monitor_contract_sha256: monitor.report_sha256,
    },
    positive_control: {
      profile_slug: CONTROL.profile_slug,
      sq_candidato: CONTROL.sq_candidato,
      result: "programa_oficial_codtipo_5_encontrado",
      source_url: controlSource.url,
      checked_at: controlSource.checked_at,
      http_status: controlSource.http_status,
      payload_raw_sha256: controlSource.payload_raw_sha256,
      raw_payload_path: relative(dirname(input.outputPath), control.path),
      program_file_ids: controlPrograms.map((file) => String(file.idArquivo ?? "")),
    },
    receipts,
    public_data_changed: false,
  };
  return { ...core, receipt_sha256: sha256(canonicalJson(core)) };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const monitorFlag = flag(argv, "monitor");
  const rawDirFlag = flag(argv, "raw-dir");
  const outputFlag = flag(argv, "out");
  if (!monitorFlag || !rawDirFlag || !outputFlag) throw new Error("--monitor, --raw-dir e --out são obrigatórios");
  const monitorPath = resolve(monitorFlag);
  const rawDir = resolve(rawDirFlag);
  const outputPath = resolve(outputFlag);
  const runUrl = flag(argv, "run-url") ?? "";
  const headSha = flag(argv, "head-sha") ?? "";
  const priorCheckedAt = flag(argv, "prior-checked-at") ?? "";
  const receipt = generateProgramAbsenceReceipts({ monitorPath, rawDir, outputPath, runUrl, headSha, priorCheckedAt });
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ out: outputPath, receipts: (receipt.receipts as unknown[]).length, receipt_sha256: receipt.receipt_sha256 }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
