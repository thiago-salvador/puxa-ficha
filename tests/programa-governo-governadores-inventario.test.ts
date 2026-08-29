import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { auditProgramasGovernadoresInventory } from "../scripts/audit/audit-programas-governo-governadores-inventario";

const inventory = auditProgramasGovernadoresInventory();

test("inventaria a coorte oficial atual de governador nas 27 UFs", () => {
  assert.deepEqual(inventory.medicoes, {
    ufs: 27,
    candidaturasOficiais: 196,
    perfisUnicos: 195,
    gruposLogicos: 195,
    gruposAmbiguos: 1,
    linhasEmGruposAmbiguos: 2,
    perfisLocaisVinculados: 194,
    perfisLocaisAusentes: 0,
    aliasesDuplicidadeOficial: 2,
    pacotes: 27,
    documentosTotais: 212,
    documentosDeCandidaturasAtuais: 204,
    documentosSemCandidaturaAtual: 8,
    candidaturasComDocumento: 191,
    candidaturasSemDocumento: 5,
    paginasCandidaturasAtuais: 11056,
    paginasDocumentosOrfaos: 283,
    pdfBytesCandidaturasAtuais: 269008917,
    pdfBytesDocumentosOrfaos: 5011949,
    pacoteBytesTotais: 278446551,
    textoExtraidoBytesCandidaturasAtuais: 21850086,
    documentosTextoExtraivel: 199,
    documentosRequeremOcr: 5,
    inventarioPayloadBytes: 369428,
  });
});

test("preserva as cinco ausências e os oito documentos órfãos", () => {
  assert.deepEqual(
    inventory.candidaturas
      .filter((candidate) => candidate.documentoIds.length === 0)
      .map((candidate) => `${candidate.uf}:${candidate.sqCandidato}`),
    [
      "CE:60002553922",
      "MG:130002544411",
      "RJ:190002543380",
      "RJ:190002550196",
      "SP:250002548080",
    ],
  );
  assert.deepEqual(
    inventory.documentosSemCandidaturaAtual.map(
      ({ documentoId }) => documentoId,
    ),
    [
      "CE:60002540336:01",
      "CE:60002540418:01",
      "ES:80002541013:01",
      "MA:100002544075:01",
      "PA:140002538631:01",
      "PE:170002540338:01",
      "PI:180002533958:01",
      "RJ:190002543534:01",
    ],
  );
  const elizeu = inventory.candidaturas.find(
    (candidate) => candidate.sqCandidato === "180002549920",
  );
  assert.equal(elizeu?.identidadeEstado, "confirmada");
  assert.deepEqual(elizeu?.documentoIds, ["PI:180002549920:01"]);
});

test("consolida a duplicidade de Laudicério quando os documentos são equivalentes", () => {
  const laudicerio = inventory.candidaturas.filter((candidate) =>
    candidate.nomeUrna.includes("LAUDICÉRIO"),
  );
  const first = laudicerio.find(
    (candidate) => candidate.sqCandidato === "110002553937",
  );
  const alias = laudicerio.find(
    (candidate) => candidate.sqCandidato === "110002554073",
  );

  assert.equal(laudicerio.length, 2);
  assert.equal(first?.identidadeEstado, "duplicidade_oficial");
  assert.equal(first?.slug, null);
  assert.equal(first?.perfilEstado, "alias_duplicidade_oficial");
  assert.deepEqual(first?.documentoIds, ["MT:110002553937:01"]);
  assert.equal(alias?.identidadeEstado, "duplicidade_oficial");
  assert.equal(alias?.slug, null);
  assert.equal(alias?.perfilEstado, "alias_duplicidade_oficial");
  assert.deepEqual(
    alias?.alternativasOficiais.map(({ sqCandidato }) => sqCandidato),
    ["110002553937", "110002554073"],
  );
});

test("usa as 196 inscrições de governador do crosswalk e mantém terminais fora da superfície", () => {
  const governors = inventory.candidaturas;
  assert.equal(governors.length, 196);
  assert.equal(new Set(governors.map((candidate) => candidate.slug).filter(Boolean)).size, 194);
  assert.equal(
    governors.some((candidate) => candidate.nomeUrna === "CLEBER RABELO"),
    false,
  );
  assert.equal(
    governors.some((candidate) => candidate.nomeUrna === "PEDRO BRITO"),
    false,
  );
  assert.deepEqual(
    inventory.documentosSemCandidaturaAtual
      .map(({ documentoId }) => documentoId)
      .filter((id) => id.startsWith("CE:60002540336") || id.startsWith("PA:140002538631")),
    ["CE:60002540336:01", "PA:140002538631:01"],
  );
});

test("registra a identidade do crosswalk canônico com path e hash", async () => {
  const source = await readFile(
    new URL(
      "../scripts/programas-governo-governadores-2026-inventario.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /candidate-roster-active-20260829\.json/);
  assert.match(source, /profiles/);
  assert.match(source, /registration_sqs/);
  assert.match(source, /canonical_registration_sq/);
  assert.match(source, /perfisSnapshotSha256/);
  assert.equal(inventory.fonte.perfisSnapshotArquivo, "data/candidate-roster-active-20260829.json");
  assert.match(inventory.fonte.perfisSnapshotSha256 as string, /^[a-f0-9]{64}$/);
});

test("audita todos os eixos de stale dos registros publicados", async () => {
  const source = await readFile(
    new URL(
      "../scripts/audit/audit-programas-governo-governadores-publicados.ts",
      import.meta.url,
    ),
    "utf8",
  );
  for (const reason of [
    "identity",
    "identity_not_in_canonical_crosswalk",
    "name",
    "party",
    "document_set",
    "document_hash",
  ]) {
    assert.match(source, new RegExp(`\\\"${reason}\\\"`));
  }
});

test("contabiliza separadamente as oito partes distintas do pacote de Omar Aziz", () => {
  const omar = inventory.candidaturas.find(
    (candidate) => candidate.sqCandidato === "40002532272",
  );
  assert.ok(omar);
  assert.equal(omar.documentoIds.length, 8);
  const documents = omar.documentoIds.map((id) => {
    const document = inventory.documentos.find((item) => item.id === id);
    assert.ok(document);
    return document;
  });
  assert.deepEqual(
    documents.map(({ paginas }) => paginas),
    [274, 211, 243, 215, 262, 49, 83, 215],
  );
  assert.equal(
    documents.reduce((sum, document) => sum + document.paginas, 0),
    1552,
  );
  assert.equal(
    documents.reduce((sum, document) => sum + document.bytes, 0),
    70790534,
  );
  assert.equal(
    documents.reduce((sum, document) => sum + document.textoExtraidoBytes, 0),
    3332441,
  );
  assert.equal(new Set(documents.map(({ sha256 }) => sha256)).size, 8);
});

test("registra proveniência de pacote e integridade sem confundir transporte com prova", () => {
  assert.equal(
    inventory.fonte.candidatosPacoteSha256,
    "eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27",
  );
  assert.deepEqual(inventory.fonte.coleta, {
    metodo: "playwright_catalogo_recurso",
    shellDireto: "bloqueado_http_403",
    observacao:
      "O navegador obteve os arquivos pelos links do catálogo. A integridade é provada por ZIP válido e hashes, não pelo método de download.",
  });
});

test("vincula candidatura e documento pela chave composta UF + SQ", async () => {
  const source = await readFile(
    new URL(
      "../scripts/programas-governo-governadores-2026-inventario.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /candidateKey\(document\.uf, document\.sqCandidato\)/);
  assert.match(source, /documentsByCandidate\.get\(key\)/);
  assert.doesNotMatch(source, /documentsBySq/);
});

test("usa o crosswalk atual e não deixa programa oficial sem ficha", async () => {
  const source = await readFile(
    new URL(
      "../scripts/programas-governo-governadores-2026-inventario.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const candidaturasComPrograma = inventory.candidaturas.filter(
    (candidate) =>
      candidate.documentoIds.length > 0 &&
      candidate.perfilEstado !== "alias_duplicidade_oficial",
  );

  assert.match(source, /candidate-roster-active-20260829\.json/);
  assert.doesNotMatch(source, /chapas-2026-tse-20260815\.json/);
  assert.equal(inventory.medicoes.perfisLocaisAusentes, 0);
  assert.equal(inventory.medicoes.aliasesDuplicidadeOficial, 2);
  assert.equal(
    candidaturasComPrograma.every(
      (candidate) =>
        candidate.perfilEstado === "vinculado" && Boolean(candidate.slug),
    ),
    true,
  );
});

test("falha explicitamente quando pdftotext encerra com erro", async () => {
  const source = await readFile(
    new URL(
      "../scripts/programas-governo-governadores-2026-inventario.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /pdftotext falhou/);
  assert.doesNotMatch(source, /catch\s*\{[\s\S]*?text = Buffer\.alloc\(0\)/);
});

console.log("PROGRAMAS_GOVERNADORES_INVENTARIO_PASS");
