import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

import { parse } from "csv-parse/sync";

import { stripAccents } from "../src/lib/strip-accents";

const ANO = 2026;
const CARGO = "GOVERNADOR";
const DATASET_URL = "https://dadosabertos.tse.jus.br/dataset/candidatos-2026";
const CANDIDATOS_RECURSO_URL =
  "https://dadosabertos.tse.jus.br/dataset/candidatos-2026/resource/7748de82-a23b-47c4-9ec1-35535d945e5b";
const CANDIDATOS_PACOTE_URL =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip";
const DEFAULT_PROFILE_SNAPSHOT = "data/candidate-roster-active-20260829.json";
const DEFAULT_ABSENCE_RECEIPTS =
  "QA/evidencias/2026-08-30-programas-ausentes/receipt.json";
const ABSENCE_RECEIPT_SQS = new Set([
  "60002553922",
  "130002544411",
  "190002543380",
  "190002550196",
  "250002548080",
]);
const UFS = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const;

const RECURSOS_PROPOSTA: Record<(typeof UFS)[number], string> = {
  AC: "892e69b3-5fee-4c88-8492-489c8971f560",
  AL: "24b68abf-0223-4e8d-b5c6-233b17ebf1df",
  AM: "d1f51a6d-173f-45e4-a895-3ba71569d8c7",
  AP: "d3a6d8f2-05b4-4f4f-bef0-cf43578eca18",
  BA: "83c4812f-6c19-4901-a933-e826a38ee5c4",
  CE: "46fb7c9b-6e64-4577-a847-f1545ccb860b",
  DF: "2ed2713f-62aa-4b4a-b663-ee2d9727d8a6",
  ES: "c1df9a86-90df-4f1f-a604-a0b55a1ffcae",
  GO: "c73b0699-89fc-4427-b1bb-71c0c2b30255",
  MA: "2533babc-f5ac-4097-81aa-0c3507c34ff2",
  MG: "72831fd0-1ace-4834-8d7e-746d190baeb0",
  MS: "7e96e31d-8b9e-419d-8689-f6394d77a003",
  MT: "dcd10ffa-2e30-4cfd-9747-b7e06f3d2376",
  PA: "a17ef84d-7f22-4a5f-8ce9-b8e5f78a9957",
  PB: "e0602f94-5fe6-40f1-b3f6-023790f42cb3",
  PE: "0be7c0ed-7e5f-406a-a676-5cafc31f4c70",
  PI: "27a69a77-5fae-485f-bd88-d4c8bbd5414c",
  PR: "9d178584-c623-463d-a8e7-241437a9d473",
  RJ: "fe53384a-b57e-4dc5-bd87-04b0bb8d0941",
  RN: "c86c1bca-0f59-438f-bf8a-803f289698a1",
  RO: "1f306c5c-6eb7-4a03-8f60-315bb45a39cc",
  RR: "931ddc42-6831-45e2-b84f-b673a8386dab",
  RS: "8b8cb7e4-e05c-4fb2-bde7-a9ff8d8baf1f",
  SC: "a9f5e145-0cc2-4c20-a010-893b10b22547",
  SE: "4a15fa3e-c06b-4fca-b7eb-90e46dbe0eff",
  SP: "c8f84a67-6683-4d69-b1b3-64c24d0c797b",
  TO: "61da85ce-ef67-42fd-ae2a-8e6bd6765901",
};

type Raw = Record<string, string>;

interface CrosswalkProfile {
  profile_slug: string;
  office: string;
  uf: string;
  canonical_registration_sq: string | null;
  registration_sqs: string[];
  names: string[];
  parties: string[];
  statuses: string[];
  publication_status: "active" | "quarantine_duplicate_active";
}

interface Documento {
  id: string;
  uf: string;
  sqCandidato: string;
  sequencia: number;
  arquivoNome: string;
  arquivoNoPacote: string;
  pacoteUrl: string;
  pdfOriginalUrl: null;
  bytes: number;
  sha256: string;
  paginas: number;
  textoExtraidoBytes: number;
  textoExtraidoCaracteres: number;
  textoExtraidoSha256: string;
  textoEstado: "extraivel" | "requer_ocr";
  candidaturaAtual: boolean;
}

interface ProgramaArgs {
  candidateArchive: string;
  proposalDir: string;
  profileSnapshot: string;
  absenceReceipts: string;
  collectedAt: string;
  output: string;
  write: boolean;
}

function parseArgs(): ProgramaArgs {
  const value = (name: string): string | undefined =>
    process.argv
      .find((arg) => arg.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  const candidateArchive = value("--candidate-archive");
  const proposalDir = value("--proposal-dir");
  const collectedAt = value("--collected-at");
  if (!candidateArchive || !proposalDir || !collectedAt) {
    throw new Error(
      "use --candidate-archive=<zip> --proposal-dir=<diretorio> --collected-at=<ISO> [--write]",
    );
  }
  if (!Number.isFinite(Date.parse(collectedAt)))
    throw new Error("--collected-at precisa ser ISO válido");
  return {
    candidateArchive: resolve(candidateArchive),
    proposalDir: resolve(proposalDir),
    profileSnapshot: resolve(
      value("--profile-snapshot") ?? DEFAULT_PROFILE_SNAPSHOT,
    ),
    absenceReceipts: resolve(
      value("--absence-receipts") ?? DEFAULT_ABSENCE_RECEIPTS,
    ),
    collectedAt,
    output: resolve(
      value("--output") ??
        "scripts/data/programas-governo-governadores-2026/inventario-2026-08-29.json",
    ),
    write: process.argv.includes("--write"),
  };
}

interface AbsenceReceiptSet {
  schema_version: number;
  receipt_set_id: string;
  generated_at: string;
  receipt_sha256: string;
  receipts: Array<{
    receipt_id: string;
    sq_candidato: string;
    result: string;
    program_files_total: number;
  }>;
}

function loadAbsenceReceipts(path: string): {
  set: AbsenceReceiptSet;
  raw: Buffer;
  bySq: Map<string, AbsenceReceiptSet["receipts"][number]>;
} {
  const raw = readFileSync(path);
  const set = JSON.parse(raw.toString("utf8")) as AbsenceReceiptSet & Record<string, unknown>;
  const semanticCore: Record<string, unknown> = { ...set };
  delete semanticCore.receipt_sha256;
  if (set.schema_version !== 1 || set.receipts.length !== 5) {
    throw new Error("receipt set de programas ausentes inválido");
  }
  const bySq = new Map(set.receipts.map((receipt) => [receipt.sq_candidato, receipt]));
  if (set.receipt_sha256 !== sha256(canonicalJson(semanticCore))
    || bySq.size !== ABSENCE_RECEIPT_SQS.size
    || [...ABSENCE_RECEIPT_SQS].some((sq) => !bySq.has(sq))
    || set.receipts.some((receipt) =>
      receipt.result !== "sem_programa_oficial_codtipo_5_no_escopo"
      || receipt.program_files_total !== 0
      || receipt.receipt_id !== `programa-governo-ausente:2026:${receipt.sq_candidato}`)) {
    throw new Error("recibos de programas ausentes divergiram do contrato");
  }
  return { set, raw, bySq };
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalize(value: string): string {
  return stripAccents(value)
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

function candidateKey(uf: string, sqCandidato: string): string {
  return `${uf}:${sqCandidato}`;
}

function zipEntries(path: string): string[] {
  return execFileSync("unzip", ["-Z1", path], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  })
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function assertZipIntegrity(path: string): void {
  execFileSync("unzip", ["-tq", path], { stdio: "ignore" });
}

function readCandidateRows(archivePath: string): Raw[] {
  assertZipIntegrity(archivePath);
  const csvFiles = zipEntries(archivePath).filter((entry) =>
    /^consulta_cand_2026_[A-Z]{2}\.csv$/.test(entry),
  );
  const rows: Raw[] = [];
  for (const entry of csvFiles) {
    const bytes = execFileSync("unzip", ["-p", archivePath, entry], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const csv = new TextDecoder("windows-1252").decode(bytes);
    const parsed = parse(csv, {
      delimiter: ";",
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
    }) as Raw[];
    rows.push(
      ...parsed.filter(
        (row) =>
          normalize(row.DS_CARGO || "") === CARGO && row.NR_TURNO === "1",
      ),
    );
  }
  return rows.sort((a, b) =>
    [a.SG_UF, a.SQ_CANDIDATO]
      .join(":")
      .localeCompare([b.SG_UF, b.SQ_CANDIDATO].join(":"), "pt-BR"),
  );
}

function profileCrosswalk(snapshotPath: string): Map<string, CrosswalkProfile> {
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
    metadata: {
      active_registration_count: number;
      active_profile_count: number;
      unresolved_count: number;
    };
    profiles: CrosswalkProfile[];
  };
  if (snapshot.profiles.length !== snapshot.metadata.active_profile_count)
    throw new Error("crosswalk e metadata divergem em perfis ativos");
  const allRegistrations = snapshot.profiles.flatMap(
    (profile) => profile.registration_sqs,
  );
  if (allRegistrations.length !== snapshot.metadata.active_registration_count)
    throw new Error("crosswalk e metadata divergem em inscrições ativas");
  const profiles = snapshot.profiles.filter(
    (profile) => profile.office === "Governador",
  );
  if (snapshot.metadata.unresolved_count !== 0)
    throw new Error("crosswalk contém inscrições sem mapeamento");
  const registrations = profiles.flatMap((profile) => profile.registration_sqs);
  if (new Set(registrations).size !== registrations.length)
    throw new Error("crosswalk contém SQ de inscrição duplicada");
  return new Map(
    profiles.flatMap((profile) =>
      profile.registration_sqs.map((sq) => [
        candidateKey(profile.uf, sq),
        profile,
      ] as const),
    ),
  );
}

function inspectPdf(
  bytes: Buffer,
  entry: string,
  tempDir: string,
): Omit<
  Documento,
  | "id"
  | "uf"
  | "sqCandidato"
  | "sequencia"
  | "arquivoNome"
  | "arquivoNoPacote"
  | "pacoteUrl"
  | "pdfOriginalUrl"
  | "candidaturaAtual"
> {
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error(`${entry}: assinatura PDF ausente`);
  }
  const localPath = join(tempDir, basename(entry));
  writeFileSync(localPath, bytes);
  const info = execFileSync("pdfinfo", [localPath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const pages = Number(info.match(/^Pages:\s+(\d+)$/m)?.[1]);
  if (!Number.isInteger(pages) || pages <= 0)
    throw new Error(`${entry}: páginas inválidas`);
  let text: Buffer;
  try {
    text = execFileSync("pdftotext", ["-enc", "UTF-8", localPath, "-"], {
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${entry}: pdftotext falhou: ${detail}`);
  }
  const normalizedText = text.toString("utf8").replace(/\s+/g, " ").trim();
  return {
    bytes: bytes.length,
    sha256: sha256(bytes),
    paginas: pages,
    textoExtraidoBytes: Buffer.byteLength(normalizedText, "utf8"),
    textoExtraidoCaracteres: normalizedText.length,
    textoExtraidoSha256: sha256(normalizedText),
    textoEstado: normalizedText.length >= 200 ? "extraivel" : "requer_ocr",
  };
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

function main(): void {
  const args = parseArgs();
  if (Number(process.versions.node.split(".")[0]) !== 24) {
    throw new Error(`Node 24 obrigatório; atual ${process.versions.node}`);
  }
  const candidateBytes = readFileSync(args.candidateArchive);
  const allCandidates = readCandidateRows(args.candidateArchive);
  const crosswalk = profileCrosswalk(args.profileSnapshot);
  const absenceReceipts = loadAbsenceReceipts(args.absenceReceipts);
  const candidates = allCandidates.filter((row) =>
    crosswalk.has(candidateKey(row.SG_UF, row.SQ_CANDIDATO)),
  );
  if (candidates.length !== crosswalk.size)
    throw new Error(
      `crosswalk e pacote TSE divergem: crosswalk=${crosswalk.size}; pacote=${candidates.length}`,
    );
  const candidateKeys = new Set(
    candidates.map((row) => candidateKey(row.SG_UF, row.SQ_CANDIDATO)),
  );
  if (candidateKeys.size !== candidates.length)
    throw new Error("chave UF + SQ_CANDIDATO duplicada no recorte GOVERNADOR");
  const foundUfs = [...new Set(candidates.map((row) => row.SG_UF))].sort();
  if (JSON.stringify(foundUfs) !== JSON.stringify([...UFS].sort())) {
    throw new Error(`UFs incompletas: ${foundUfs.join(",")}`);
  }

  const generations = [
    ...new Set(candidates.map((row) => `${row.DT_GERACAO} ${row.HH_GERACAO}`)),
  ];
  if (generations.length !== 1)
    throw new Error(`gerações TSE divergentes: ${generations.join(", ")}`);

  const groups = new Map<string, Raw[]>();
  for (const row of candidates) {
    const groupKey = [
      row.SG_UF,
      normalize(row.NM_CANDIDATO),
      row.SG_PARTIDO,
    ].join(":");
    const values = groups.get(groupKey) ?? [];
    values.push(row);
    groups.set(groupKey, values);
  }
  const ambiguousGroupByKey = new Map<
    string,
    { id: string; alternatives: Raw[] }
  >();
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    const id = `duplicidade-${sha256(key).slice(0, 12)}`;
    for (const row of rows)
      ambiguousGroupByKey.set(candidateKey(row.SG_UF, row.SQ_CANDIDATO), {
        id,
        alternatives: rows,
      });
  }

  const tempDir = mkdtempSync(join(tmpdir(), "pf-programas-governadores-"));
  const documentos: Documento[] = [];
  const pacotes = [];
  try {
    for (const uf of UFS) {
      const archivePath = join(
        args.proposalDir,
        `proposta_governo_2026_${uf}.zip`,
      );
      assertZipIntegrity(archivePath);
      const archiveBytes = readFileSync(archivePath);
      const entries = zipEntries(archivePath);
      const documentIds: string[] = [];
      for (const entry of entries) {
        const match = entry.match(
          new RegExp(`^${uf}/2026${uf}(\\d+)_(\\d+)\\.pdf$`),
        );
        if (!match) continue;
        const sqCandidato = match[1];
        const sequencia = Number(match[2]);
        const id = `${uf}:${sqCandidato}:${String(sequencia).padStart(2, "0")}`;
        const bytes = execFileSync("unzip", ["-p", archivePath, entry], {
          maxBuffer: 128 * 1024 * 1024,
        });
        documentos.push({
          id,
          uf,
          sqCandidato,
          sequencia,
          arquivoNome: basename(entry),
          arquivoNoPacote: entry,
          pacoteUrl: `https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_${uf}.zip`,
          pdfOriginalUrl: null,
          ...inspectPdf(bytes, entry, tempDir),
          candidaturaAtual: candidateKeys.has(candidateKey(uf, sqCandidato)),
        });
        documentIds.push(id);
      }
      pacotes.push({
        uf,
        recursoCatalogoUrl: `${DATASET_URL}/resource/${RECURSOS_PROPOSTA[uf]}`,
        pacoteUrl: `https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_${uf}.zip`,
        arquivoNome: basename(archivePath),
        bytes: archiveBytes.length,
        sha256: sha256(archiveBytes),
        integridadeZip: "valida",
        arquivoLeiaMe:
          entries.find((entry) => entry === `${uf}/leiame.pdf`) ?? null,
        documentoIds: documentIds,
      });
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  const documentIds = new Set(documentos.map((document) => document.id));
  if (documentIds.size !== documentos.length)
    throw new Error("ID de documento duplicado");
  const documentsByCandidate = new Map<string, Documento[]>();
  for (const document of documentos) {
    const key = candidateKey(document.uf, document.sqCandidato);
    const values = documentsByCandidate.get(key) ?? [];
    values.push(document);
    documentsByCandidate.set(key, values);
  }

  const profileSnapshotLabel = relative(resolve("."), args.profileSnapshot);
  const resolvedAmbiguityByKey = new Map<
    string,
    { canonical: boolean; slug: string }
  >();
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const profiles = rows.map((row) =>
      crosswalk.get(candidateKey(row.SG_UF, row.SQ_CANDIDATO)),
    );
    const linkedSlugs = profiles.map((profile) => profile?.profile_slug ?? null);
    const uniqueSlugs = new Set(linkedSlugs.filter(Boolean));
    const documentSignatures = rows.map((row) =>
      JSON.stringify(
        (
          documentsByCandidate.get(candidateKey(row.SG_UF, row.SQ_CANDIDATO)) ??
          []
        )
          .map(({ textoExtraidoSha256 }) => textoExtraidoSha256)
          .sort(),
      ),
    );
    const documentsEquivalent =
      documentSignatures.every((signature) => signature !== "[]") &&
      new Set(documentSignatures).size === 1;
    const profile = profiles[0];
    if (
      uniqueSlugs.size !== 1 ||
      !documentsEquivalent ||
      !profile ||
      profile.publication_status !== "active" ||
      !profile.canonical_registration_sq
    )
      continue;
    const slug = [...uniqueSlugs][0] as string;
    const canonicalSq = rows
      .map(({ SQ_CANDIDATO }) => SQ_CANDIDATO)
      .sort((a, b) => a.localeCompare(b, "pt-BR"))[0];
    for (const row of rows) {
      resolvedAmbiguityByKey.set(candidateKey(row.SG_UF, row.SQ_CANDIDATO), {
        canonical: row.SQ_CANDIDATO === canonicalSq,
        slug,
      });
    }
  }
  const inventario = candidates.map((row) => {
    const key = candidateKey(row.SG_UF, row.SQ_CANDIDATO);
    const documents = (documentsByCandidate.get(key) ?? []).sort(
      (a, b) => a.sequencia - b.sequencia,
    );
    const previous = crosswalk.get(key);
    if (
      previous &&
      (previous.uf !== row.SG_UF ||
        (!previous.names.some(
          (name) => normalize(name) === normalize(row.NM_CANDIDATO),
        ) &&
          !previous.names.some(
            (name) => normalize(name) === normalize(row.NM_URNA_CANDIDATO),
          )) ||
        !previous.parties.includes(row.SG_PARTIDO))
    ) {
      throw new Error(
        `${row.SQ_CANDIDATO}: vínculo local diverge da identidade TSE atual`,
      );
    }
    const ambiguity = ambiguousGroupByKey.get(key);
    const ambiguityResolution = resolvedAmbiguityByKey.get(key);
    const slug = ambiguity
      ? ambiguityResolution?.canonical
        ? ambiguityResolution.slug
        : null
      : previous?.publication_status === "active" &&
          previous.canonical_registration_sq === row.SQ_CANDIDATO
        ? previous.profile_slug
        : null;
    const perfilEstado = slug
      ? "vinculado"
      : ambiguity
        ? "alias_duplicidade_oficial"
        : "perfil_local_ausente";
    const fonteEstado = documents.length
      ? "documento_oficial_encontrado"
      : "sem_documento_oficial";
    const identidadeEstado =
      !ambiguity || ambiguityResolution?.canonical
        ? "confirmada"
        : "duplicidade_oficial";
    const estadoInventario = ambiguity
      ? "duplicidade_oficial"
      : perfilEstado === "perfil_local_ausente"
        ? perfilEstado
        : fonteEstado;
    const absenceReceipt = absenceReceipts.bySq.get(row.SQ_CANDIDATO);
    if (absenceReceipt && documents.length > 0) {
      throw new Error(`${row.SQ_CANDIDATO}: recibo de ausência conflita com documento oficial`);
    }
    return {
      chave: `${ANO}:${CARGO}:${row.SG_UF}:${row.SQ_CANDIDATO}`,
      ano: ANO,
      cargo: CARGO,
      uf: row.SG_UF,
      sqCandidato: row.SQ_CANDIDATO,
      nomeCompleto: row.NM_CANDIDATO,
      nomeUrna: row.NM_URNA_CANDIDATO,
      partido: row.SG_PARTIDO,
      numero: row.NR_CANDIDATO,
      slug,
      perfilEstado,
      perfilVinculoFonte: slug ? profileSnapshotLabel : null,
      identidadeEstado,
      grupoAmbiguidade:
        identidadeEstado === "duplicidade_oficial" ? ambiguity?.id : null,
      alternativasOficiais:
        identidadeEstado === "duplicidade_oficial"
          ? (ambiguity?.alternatives.map((alternative) => ({
              sqCandidato: alternative.SQ_CANDIDATO,
              sqColigacao: alternative.SQ_COLIGACAO,
              nomeCompleto: alternative.NM_CANDIDATO,
              nomeUrna: alternative.NM_URNA_CANDIDATO,
              partido: alternative.SG_PARTIDO,
              situacaoCodigo: alternative.CD_SITUACAO_CANDIDATURA,
              situacao: alternative.DS_SITUACAO_CANDIDATURA,
            })) ?? [])
          : [],
      fonteEstado,
      estadoInventario,
      documentoIds: documents.map((document) => document.id),
      ...(absenceReceipt
        ? { reciboSemProgramaOficialId: absenceReceipt.receipt_id }
        : {}),
      tse: {
        eleicaoCodigo: row.CD_ELEICAO,
        eleicaoData: row.DT_ELEICAO,
        sqColigacao: row.SQ_COLIGACAO,
        situacaoCodigo: row.CD_SITUACAO_CANDIDATURA,
        situacao: row.DS_SITUACAO_CANDIDATURA,
        geradoEm: generations[0],
      },
    };
  });

  const currentDocuments = documentos.filter(
    (document) => document.candidaturaAtual,
  );
  const unmatchedDocuments = documentos.filter(
    (document) => !document.candidaturaAtual,
  );
  const profilesLinked = inventario.filter(
    (row) => row.perfilEstado === "vinculado",
  ).length;
  const profilesMissing = inventario.filter(
    (row) => row.perfilEstado === "perfil_local_ausente",
  ).length;
  const duplicateAliases = inventario.filter(
    (row) => row.perfilEstado === "alias_duplicidade_oficial",
  ).length;
  const uniqueProfiles = new Set(
    candidates.map(
      (row) => crosswalk.get(candidateKey(row.SG_UF, row.SQ_CANDIDATO))?.profile_slug,
    ),
  ).size;
  const candidatesWithDocuments = inventario.filter(
    (row) => row.documentoIds.length > 0,
  ).length;
  const data: Record<string, unknown> = {
    versao: 1,
    geradoEm: args.collectedAt,
    escopo: { ano: ANO, cargo: CARGO, ufs: [...UFS] },
    fonte: {
      datasetUrl: DATASET_URL,
      candidatosRecursoUrl: CANDIDATOS_RECURSO_URL,
      candidatosPacoteUrl: CANDIDATOS_PACOTE_URL,
      candidatosPacoteArquivo: basename(args.candidateArchive),
      candidatosPacoteBytes: candidateBytes.length,
      candidatosPacoteSha256: sha256(candidateBytes),
      candidatosPacoteIntegridadeZip: "valida",
      candidatosGeradoEm: generations[0],
      perfisSnapshotArquivo: profileSnapshotLabel,
      perfisSnapshotSha256: sha256(readFileSync(args.profileSnapshot)),
      frequenciaDeclaradaPeloCatalogo: "4 vezes ao dia",
      coleta: {
        metodo: "playwright_catalogo_recurso",
        shellDireto: "bloqueado_http_403",
        observacao:
          "O navegador obteve os arquivos pelos links do catálogo. A integridade é provada por ZIP válido e hashes, não pelo método de download.",
      },
    },
    medicoes: {
      ufs: UFS.length,
      candidaturasOficiais: inventario.length,
      perfisUnicos: uniqueProfiles,
      gruposLogicos: groups.size,
      gruposAmbiguos: [...groups.values()].filter((rows) => rows.length > 1)
        .length,
      linhasEmGruposAmbiguos: ambiguousGroupByKey.size,
      perfisLocaisVinculados: profilesLinked,
      perfisLocaisAusentes: profilesMissing,
      aliasesDuplicidadeOficial: duplicateAliases,
      pacotes: pacotes.length,
      documentosTotais: documentos.length,
      documentosDeCandidaturasAtuais: currentDocuments.length,
      documentosSemCandidaturaAtual: unmatchedDocuments.length,
      candidaturasComDocumento: candidatesWithDocuments,
      candidaturasSemDocumento: inventario.length - candidatesWithDocuments,
      paginasCandidaturasAtuais: currentDocuments.reduce(
        (sum, item) => sum + item.paginas,
        0,
      ),
      paginasDocumentosOrfaos: unmatchedDocuments.reduce(
        (sum, item) => sum + item.paginas,
        0,
      ),
      pdfBytesCandidaturasAtuais: currentDocuments.reduce(
        (sum, item) => sum + item.bytes,
        0,
      ),
      pdfBytesDocumentosOrfaos: unmatchedDocuments.reduce(
        (sum, item) => sum + item.bytes,
        0,
      ),
      pacoteBytesTotais: pacotes.reduce((sum, item) => sum + item.bytes, 0),
      textoExtraidoBytesCandidaturasAtuais: currentDocuments.reduce(
        (sum, item) => sum + item.textoExtraidoBytes,
        0,
      ),
      documentosTextoExtraivel: currentDocuments.filter(
        (document) => document.textoEstado === "extraivel",
      ).length,
      documentosRequeremOcr: currentDocuments.filter(
        (document) => document.textoEstado === "requer_ocr",
      ).length,
      inventarioPayloadBytes: 0,
    },
    pacotes,
    documentos,
    candidaturas: inventario,
    documentosSemCandidaturaAtual: unmatchedDocuments.map((document) => ({
      documentoId: document.id,
      motivo: "arquivo_presente_no_pacote_sem_linha_GOVERNADOR_atual",
    })),
    recibosSemProgramaOficial: {
      arquivo: relative(process.cwd(), args.absenceReceipts),
      arquivo_sha256: sha256(absenceReceipts.raw),
      receipt_set_id: absenceReceipts.set.receipt_set_id,
      receipt_sha256: absenceReceipts.set.receipt_sha256,
      generated_at: absenceReceipts.set.generated_at,
      receipt_ids: absenceReceipts.set.receipts.map(
        (receipt) => receipt.receipt_id,
      ),
    },
  };
  const serialized = fixedPointPayload(data);
  if (args.write) {
    mkdirSync(resolve(args.output, ".."), { recursive: true });
    writeFileSync(args.output, serialized);
    console.log(`INVENTARIO_WRITE_PASS path=${args.output}`);
  } else {
    process.stdout.write(serialized);
  }
}

main();
