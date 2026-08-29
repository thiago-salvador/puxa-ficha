import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const DATA_DIR = join(ROOT, "scripts/data/programas-governo-governadores-2026");
const INVENTORY_PATH = join(DATA_DIR, "inventario-2026-08-29.json");
const SCALE_PATH = join(DATA_DIR, "escala-2026-08-26.json");
const UFS = new Set(
  "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(
    " ",
  ),
);
const TSE_DATASET =
  /^https:\/\/dadosabertos\.tse\.jus\.br\/dataset\/candidatos-2026/;
const TSE_CDN =
  /^https:\/\/cdn\.tse\.jus\.br\/estatistica\/sead\/odsele\/(consulta_cand|proposta_governo)\//;
const SHA256 = /^[a-f0-9]{64}$/;
const VERCEL_FUNCTION_LIMIT = 250 * 1024 * 1024;
const VERCEL_PAYLOAD_LIMIT = 4.5 * 1024 * 1024;

interface Candidate {
  chave: string;
  ano: number;
  cargo: string;
  uf: string;
  sqCandidato: string;
  slug: string | null;
  perfilEstado: string;
  identidadeEstado: string;
  grupoAmbiguidade: string | null;
  alternativasOficiais: Array<{ sqCandidato: string }>;
  fonteEstado: string;
  documentoIds: string[];
}

interface DocumentRow {
  id: string;
  uf: string;
  sqCandidato: string;
  arquivoNoPacote: string;
  pacoteUrl: string;
  pdfOriginalUrl: null;
  bytes: number;
  sha256: string;
  paginas: number;
  textoExtraidoBytes: number;
  textoEstado: string;
  candidaturaAtual: boolean;
}

interface Inventory {
  versao: number;
  geradoEm: string;
  escopo: { ano: number; cargo: string; ufs: string[] };
  fonte: Record<string, unknown>;
  medicoes: Record<string, number>;
  pacotes: Array<
    Record<string, unknown> & { uf: string; documentoIds: string[] }
  >;
  documentos: DocumentRow[];
  candidaturas: Candidate[];
  documentosSemCandidaturaAtual: Array<{ documentoId: string; motivo: string }>;
}

interface Scale {
  versao: number;
  medidoEm: string;
  build: Record<string, number | string>;
  corpusPresidencial: Record<string, number>;
  projecaoGovernadores: Record<string, number | string | boolean>;
  limites: Record<string, number | string>;
  decisao: Record<string, string | boolean>;
}

function load<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function fixedPointPayload(
  data: Record<string, unknown>,
  section: Record<string, unknown>,
): string {
  let previous = -1;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const serialized = `${JSON.stringify(data, null, 2)}\n`;
    const bytes = Buffer.byteLength(serialized);
    if (bytes === previous) return serialized;
    section.relatorioPayloadBytes = bytes;
    previous = bytes;
  }
  throw new Error("relatorioPayloadBytes não estabilizou");
}

function walkFiles(directory: string, skipCache = false): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (skipCache && entry.isDirectory() && entry.name === "cache") continue;
    if (entry.isDirectory()) files.push(...walkFiles(path, skipCache));
    else files.push(path);
  }
  return files;
}

function sumBytes(files: string[]): number {
  return files.reduce((sum, path) => sum + statSync(path).size, 0);
}

function assertInventory(inventory: Inventory): void {
  assert.equal(inventory.versao, 1);
  assert.equal(inventory.escopo.ano, 2026);
  assert.equal(inventory.escopo.cargo, "GOVERNADOR");
  assert.deepEqual(new Set(inventory.escopo.ufs), UFS);
  assert.equal(inventory.pacotes.length, 27);
  assert.equal(new Set(inventory.pacotes.map((row) => row.uf)).size, 27);
  assert.equal(
    inventory.candidaturas.length,
    inventory.medicoes.candidaturasOficiais,
  );
  assert.equal(inventory.medicoes.ufs, 27);

  const candidateKeys = new Set<string>();
  const candidateSqs = new Set<string>();
  for (const candidate of inventory.candidaturas) {
    assert.equal(candidate.ano, 2026);
    assert.equal(candidate.cargo, "GOVERNADOR");
    assert.ok(UFS.has(candidate.uf));
    assert.match(candidate.sqCandidato, /^\d+$/);
    assert.equal(
      candidate.chave,
      `2026:GOVERNADOR:${candidate.uf}:${candidate.sqCandidato}`,
    );
    assert.equal(
      candidateKeys.has(candidate.chave),
      false,
      `chave duplicada ${candidate.chave}`,
    );
    assert.equal(
      candidateSqs.has(candidate.sqCandidato),
      false,
      `SQ_CANDIDATO duplicado ${candidate.sqCandidato}`,
    );
    candidateKeys.add(candidate.chave);
    candidateSqs.add(candidate.sqCandidato);
    assert.equal(
      candidate.perfilEstado,
      candidate.slug
        ? "vinculado"
        : candidate.identidadeEstado === "duplicidade_oficial"
          ? "alias_duplicidade_oficial"
          : "perfil_local_ausente",
    );
    assert.equal(
      candidate.fonteEstado,
      candidate.documentoIds.length
        ? "documento_oficial_encontrado"
        : "sem_documento_oficial",
    );
    if (candidate.identidadeEstado === "duplicidade_oficial") {
      assert.match(
        candidate.grupoAmbiguidade ?? "",
        /^duplicidade-[a-f0-9]{12}$/,
      );
      assert.ok(candidate.alternativasOficiais.length >= 2);
      assert.ok(
        candidate.alternativasOficiais.some(
          (alternative) => alternative.sqCandidato === candidate.sqCandidato,
        ),
      );
    } else {
      assert.equal(candidate.identidadeEstado, "confirmada");
      assert.equal(candidate.grupoAmbiguidade, null);
      assert.deepEqual(candidate.alternativasOficiais, []);
    }
  }

  const documents = new Map<string, DocumentRow>();
  for (const document of inventory.documentos) {
    assert.equal(
      documents.has(document.id),
      false,
      `documento duplicado ${document.id}`,
    );
    documents.set(document.id, document);
    assert.ok(UFS.has(document.uf));
    assert.match(document.sqCandidato, /^\d+$/);
    assert.match(document.sha256, SHA256);
    assert.ok(document.bytes > 0);
    assert.ok(document.paginas > 0);
    assert.ok(document.textoExtraidoBytes >= 0);
    assert.ok(["extraivel", "requer_ocr"].includes(document.textoEstado));
    assert.match(document.pacoteUrl, TSE_CDN);
    assert.equal(document.pdfOriginalUrl, null);
    assert.match(
      document.arquivoNoPacote,
      new RegExp(
        `^${document.uf}/2026${document.uf}${document.sqCandidato}_\\d+\\.pdf$`,
      ),
    );
    assert.equal(
      document.candidaturaAtual,
      candidateSqs.has(document.sqCandidato),
    );
  }

  for (const candidate of inventory.candidaturas) {
    for (const documentId of candidate.documentoIds) {
      const document = documents.get(documentId);
      assert.ok(
        document,
        `${candidate.chave}: documento ausente ${documentId}`,
      );
      assert.equal(document.sqCandidato, candidate.sqCandidato);
      assert.equal(document.uf, candidate.uf);
      assert.equal(document.candidaturaAtual, true);
    }
  }

  const orphanIds = new Set(
    inventory.documentosSemCandidaturaAtual.map((row) => row.documentoId),
  );
  assert.equal(
    orphanIds.size,
    inventory.medicoes.documentosSemCandidaturaAtual,
  );
  for (const document of inventory.documentos) {
    assert.equal(orphanIds.has(document.id), !document.candidaturaAtual);
  }

  for (const packageRow of inventory.pacotes) {
    assert.ok(UFS.has(packageRow.uf));
    assert.match(String(packageRow.recursoCatalogoUrl), TSE_DATASET);
    assert.match(String(packageRow.pacoteUrl), TSE_CDN);
    assert.match(String(packageRow.sha256), SHA256);
    assert.ok(Number(packageRow.bytes) > 0);
    assert.equal(packageRow.integridadeZip, "valida");
    for (const documentId of packageRow.documentoIds) {
      assert.ok(
        documents.has(documentId),
        `${packageRow.uf}: documento ausente ${documentId}`,
      );
    }
  }

  assert.match(String(inventory.fonte.datasetUrl), TSE_DATASET);
  assert.match(String(inventory.fonte.candidatosRecursoUrl), TSE_DATASET);
  assert.match(String(inventory.fonte.candidatosPacoteUrl), TSE_CDN);
  assert.match(String(inventory.fonte.candidatosPacoteSha256), SHA256);
  assert.equal(inventory.fonte.candidatosPacoteIntegridadeZip, "valida");
  assert.equal(inventory.fonte.coleta instanceof Object, true);

  assert.equal(
    inventory.medicoes.candidaturasComDocumento +
      inventory.medicoes.candidaturasSemDocumento,
    inventory.candidaturas.length,
  );
  assert.equal(
    inventory.medicoes.perfisLocaisVinculados +
      inventory.medicoes.perfisLocaisAusentes +
      inventory.medicoes.aliasesDuplicidadeOficial,
    inventory.candidaturas.length,
  );
  assert.equal(
    inventory.medicoes.documentosTotais,
    inventory.documentos.length,
  );
  assert.equal(
    inventory.medicoes.documentosDeCandidaturasAtuais +
      inventory.medicoes.documentosSemCandidaturaAtual,
    inventory.documentos.length,
  );
  assert.equal(
    inventory.medicoes.inventarioPayloadBytes,
    statSync(INVENTORY_PATH).size,
  );
}

function presidentialMeasurements(): {
  files: number;
  pages: number;
  jsonBytes: number;
  contentBytes: number;
  serializedContentBytes: number;
  averageStructuralOverheadBytes: number;
  serializationRatio: number;
  payloadExpansionRatio: number;
  maxPayloadBytes: number;
} {
  const directory = join(ROOT, "src/data/programas-governo/presidencia-2026");
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(directory, name));
  let pages = 0;
  let contentBytes = 0;
  let serializedContentBytes = 0;
  let structuralOverheadBytes = 0;
  for (const path of files) {
    const bytes = readFileSync(path);
    const data = JSON.parse(bytes.toString("utf8")) as {
      extracao: { paginas: number; secoes: Array<{ conteudo: string }> };
    };
    pages += data.extracao.paginas;
    const serialized = data.extracao.secoes.reduce(
      (sum, section) =>
        sum + Buffer.byteLength(JSON.stringify(section.conteudo)),
      0,
    );
    const content = data.extracao.secoes.reduce(
      (sum, section) => sum + Buffer.byteLength(section.conteudo, "utf8"),
      0,
    );
    contentBytes += content;
    serializedContentBytes += serialized;
    structuralOverheadBytes += bytes.length - serialized;
  }
  return {
    files: files.length,
    pages,
    jsonBytes: sumBytes(files),
    contentBytes,
    serializedContentBytes,
    averageStructuralOverheadBytes: Math.ceil(
      structuralOverheadBytes / files.length,
    ),
    serializationRatio: serializedContentBytes / contentBytes,
    payloadExpansionRatio: sumBytes(files) / contentBytes,
    maxPayloadBytes: Math.max(...files.map((path) => statSync(path).size)),
  };
}

function traceBytes(tracePath: string): { files: number; bytes: number } {
  const trace = load<{ files: string[] }>(tracePath);
  const paths = new Set<string>([tracePath]);
  for (const file of trace.files) {
    const path = resolve(dirname(tracePath), file);
    if (existsSync(path)) paths.add(path);
  }
  return { files: paths.size, bytes: sumBytes([...paths]) };
}

function writeScale(
  buildDurationMs: number,
  buildSha: string,
  measuredAt: string,
): void {
  assert.ok(buildDurationMs > 0, "--build-duration-ms obrigatório");
  assert.match(buildSha, /^[a-f0-9]{40}$/);
  assert.ok(
    Number.isFinite(Date.parse(measuredAt)),
    "--measured-at precisa ser ISO válido",
  );
  const inventory = load<Inventory>(INVENTORY_PATH);
  assertInventory(inventory);
  const baseline = presidentialMeasurements();
  const nextDir = join(ROOT, ".next");
  assert.ok(
    existsSync(nextDir),
    ".next ausente; rode build limpo antes de medir",
  );
  const buildFiles = walkFiles(nextDir, true);
  const staticFiles = walkFiles(join(nextDir, "static"));
  const functionTraces = buildFiles.filter((path) =>
    /\/route\.js\.nft\.json$/.test(path),
  );
  const candidateTrace = functionTraces.find((path) =>
    path.endsWith("/api/candidato-profile/[slug]/route.js.nft.json"),
  );
  assert.ok(candidateTrace, "trace da função candidato-profile ausente");
  const functionMeasurement = traceBytes(candidateTrace);
  const routeJs = candidateTrace.replace(/\.nft\.json$/, "");

  const currentDocuments = inventory.documentos.filter(
    (row) => row.candidaturaAtual,
  );
  const textByCandidate = new Map<string, number>();
  for (const document of currentDocuments) {
    textByCandidate.set(
      document.sqCandidato,
      (textByCandidate.get(document.sqCandidato) ?? 0) +
        document.textoExtraidoBytes,
    );
  }
  const projectedCandidatePayloads = [...textByCandidate.entries()].map(
    ([sq, textBytes]) => ({
      sq,
      textBytes,
      payloadBytes: Math.ceil(textBytes * baseline.payloadExpansionRatio),
    }),
  );
  const maxCandidate = projectedCandidatePayloads.sort(
    (left, right) => right.payloadBytes - left.payloadBytes,
  )[0];
  const projectedDocumentPayloads = currentDocuments.map((document) => ({
    id: document.id,
    textBytes: document.textoExtraidoBytes,
    payloadBytes: Math.ceil(
      document.textoExtraidoBytes * baseline.payloadExpansionRatio,
    ),
  }));
  const maxDocument = projectedDocumentPayloads.sort(
    (left, right) => right.payloadBytes - left.payloadBytes,
  )[0];
  const projectedGovernorJsonBytes = projectedCandidatePayloads.reduce(
    (sum, item) => sum + item.payloadBytes,
    0,
  );
  const projectedFunctionBytes =
    functionMeasurement.bytes + projectedGovernorJsonBytes;
  const functionSafetyLimit = Math.floor(VERCEL_FUNCTION_LIMIT * 0.7);
  const payloadSafetyLimit = Math.floor(VERCEL_PAYLOAD_LIMIT * 0.8);
  const functionFits = projectedFunctionBytes <= functionSafetyLimit;
  const wholeCandidatePayloadFits =
    maxCandidate.payloadBytes <= payloadSafetyLimit;

  const build: Record<string, number | string> = {
    sha: buildSha,
    node: process.versions.node,
    duracaoMs: buildDurationMs,
    arquivos: buildFiles.length,
    outputBytesSemCache: sumBytes(buildFiles),
    staticFiles: staticFiles.length,
    staticBytes: sumBytes(staticFiles),
    funcoesRoute: functionTraces.length,
    candidatoProfileTracePath: relative(ROOT, candidateTrace),
    candidatoProfileTraceFiles: functionMeasurement.files,
    candidatoProfileTraceBytes: functionMeasurement.bytes,
    candidatoProfileRouteJsBytes: statSync(routeJs).size,
  };
  const report: Record<string, unknown> = {
    versao: 1,
    medidoEm: measuredAt,
    build,
    corpusPresidencial: baseline,
    inventarioGovernadores: inventory.medicoes,
    projecaoGovernadores: {
      candidatosComTexto: textByCandidate.size,
      textoExtraidoBytes:
        inventory.medicoes.textoExtraidoBytesCandidaturasAtuais,
      jsonServerOnlyProjetadoBytes: projectedGovernorJsonBytes,
      funcaoProjetadaBytes: projectedFunctionBytes,
      maiorCandidatoSq: maxCandidate.sq,
      maiorCandidatoTextoBytes: maxCandidate.textBytes,
      maiorPayloadProjetadoBytes: maxCandidate.payloadBytes,
      maiorDocumentoId: maxDocument.id,
      maiorDocumentoTextoBytes: maxDocument.textBytes,
      maiorDocumentoPayloadProjetadoBytes: maxDocument.payloadBytes,
      payloadPorDocumentoComMargem:
        maxDocument.payloadBytes <= payloadSafetyLimit,
      payloadInteiroComMargem: wholeCandidatePayloadFits,
      funcaoComMargem: functionFits,
    },
    casoLimiteOmarAziz: {
      sqCandidato: "40002532272",
      classificacao: "partes_segmentadas_distintas",
      criterio:
        "oito hashes PDF e texto distintos; baixa sobreposição textual; aberturas temáticas diferentes",
      documentos: currentDocuments
        .filter((document) => document.sqCandidato === "40002532272")
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((document) => ({
          id: document.id,
          paginas: document.paginas,
          pdfBytes: document.bytes,
          textoExtraidoBytes: document.textoExtraidoBytes,
          sha256: document.sha256,
        })),
    },
    limites: {
      vercelFunctionUncompressedBytes: VERCEL_FUNCTION_LIMIT,
      functionSafetyTargetPercent: 70,
      functionSafetyBytes: functionSafetyLimit,
      vercelRequestResponseBytes: VERCEL_PAYLOAD_LIMIT,
      payloadSafetyTargetPercent: 80,
      payloadSafetyBytes: payloadSafetyLimit,
      fonteFunction:
        "https://vercel.com/docs/functions/limitations#bundle-size-limits",
      fontePayload:
        "https://vercel.com/docs/functions/limitations#request-body-size",
      fonteBuild: "https://vercel.com/docs/limits#build-time-per-deployment",
    },
    decisao: {
      arquiteturaEstaticaCabeComMargem: functionFits,
      payloadUnicoPorCandidatoCabeComMargem: wholeCandidatePayloadFits,
      resultado:
        functionFits && wholeCandidatePayloadFits
          ? "estatica_integral_cabe_com_margem"
          : functionFits
            ? "estatica_fragmentada_cabe_com_margem"
            : "estatica_nao_cabe",
      requisito:
        functionFits && !wholeCandidatePayloadFits
          ? "carregar por documento ou por seção; não responder todo o candidato em um único payload"
          : "nenhum",
      infraestruturaExternaNecessaria: !functionFits,
    },
  };
  const serialized = fixedPointPayload(report, build);
  writeFileSync(SCALE_PATH, serialized);
  console.log(`PROGRAMAS_ESCALA_WRITE_PASS path=${SCALE_PATH}`);
}

function assertScale(scale: Scale): void {
  assert.equal(scale.versao, 1);
  assert.match(String(scale.build.sha), /^[a-f0-9]{40}$/);
  assert.match(String(scale.build.node), /^24\./);
  for (const key of [
    "duracaoMs",
    "arquivos",
    "outputBytesSemCache",
    "staticFiles",
    "staticBytes",
    "funcoesRoute",
    "candidatoProfileTraceFiles",
    "candidatoProfileTraceBytes",
    "candidatoProfileRouteJsBytes",
  ]) {
    assert.ok(Number(scale.build[key]) > 0, `build.${key} inválido`);
  }
  for (const key of [
    "files",
    "pages",
    "jsonBytes",
    "contentBytes",
    "maxPayloadBytes",
  ]) {
    assert.ok(
      Number(scale.corpusPresidencial[key]) > 0,
      `corpusPresidencial.${key} inválido`,
    );
  }
  assert.equal(
    scale.limites.vercelFunctionUncompressedBytes,
    VERCEL_FUNCTION_LIMIT,
  );
  assert.equal(scale.limites.vercelRequestResponseBytes, VERCEL_PAYLOAD_LIMIT);
  assert.equal(scale.decisao.arquiteturaEstaticaCabeComMargem, true);
  assert.equal(scale.projecaoGovernadores.payloadPorDocumentoComMargem, true);
  const expectedResult = scale.decisao.payloadUnicoPorCandidatoCabeComMargem
    ? "estatica_integral_cabe_com_margem"
    : "estatica_fragmentada_cabe_com_margem";
  assert.equal(scale.decisao.resultado, expectedResult);
  assert.equal(scale.decisao.infraestruturaExternaNecessaria, false);
  assert.equal(scale.build.relatorioPayloadBytes, statSync(SCALE_PATH).size);
}

export function auditProgramasGovernadoresInventory(): Inventory {
  const inventory = load<Inventory>(INVENTORY_PATH);
  assertInventory(inventory);
  return inventory;
}

export function auditProgramasGovernadoresScale(): Scale {
  const scale = load<Scale>(SCALE_PATH);
  assertScale(scale);
  return scale;
}

function main(): void {
  const major = Number(process.versions.node.split(".")[0]);
  assert.equal(
    major,
    24,
    `Node 24 obrigatório; atual ${process.versions.node}`,
  );
  if (process.argv.includes("--write-scale")) {
    const duration = Number(
      process.argv
        .find((arg) => arg.startsWith("--build-duration-ms="))
        ?.split("=")[1],
    );
    const sha =
      process.argv
        .find((arg) => arg.startsWith("--build-sha="))
        ?.split("=")[1] ?? "";
    const measuredAt =
      process.argv
        .find((arg) => arg.startsWith("--measured-at="))
        ?.split("=")[1] ?? "";
    writeScale(duration, sha, measuredAt);
    return;
  }
  if (process.argv.includes("--escala")) {
    const scale = auditProgramasGovernadoresScale();
    console.log(
      `PROGRAMAS_ESCALA_PASS resultado=${scale.decisao.resultado} function=${scale.projecaoGovernadores.funcaoProjetadaBytes} payloadMax=${scale.projecaoGovernadores.maiorPayloadProjetadoBytes}`,
    );
    return;
  }
  const inventory = auditProgramasGovernadoresInventory();
  console.log(
    `PROGRAMAS_GOVERNADORES_INVENTARIO_PASS ufs=${inventory.medicoes.ufs} candidaturas=${inventory.medicoes.candidaturasOficiais} documentos=${inventory.medicoes.documentosDeCandidaturasAtuais} ausencias=${inventory.medicoes.candidaturasSemDocumento}`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
)
  main();
