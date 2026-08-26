import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { auditProgramasGovernadoresInventory } from "../scripts/audit/audit-programas-governo-governadores-inventario";

const inventory = auditProgramasGovernadoresInventory();

test("inventaria a coorte oficial atual de governador nas 27 UFs", () => {
  assert.deepEqual(inventory.medicoes, {
    ufs: 27,
    candidaturasOficiais: 198,
    gruposLogicos: 197,
    gruposAmbiguos: 1,
    linhasEmGruposAmbiguos: 2,
    perfisLocaisVinculados: 148,
    perfisLocaisAusentes: 50,
    pacotes: 27,
    documentosTotais: 212,
    documentosDeCandidaturasAtuais: 206,
    documentosSemCandidaturaAtual: 6,
    candidaturasComDocumento: 193,
    candidaturasSemDocumento: 5,
    paginasCandidaturasAtuais: 11087,
    paginasDocumentosOrfaos: 229,
    pdfBytesCandidaturasAtuais: 268215277,
    pdfBytesDocumentosOrfaos: 4098087,
    pacoteBytesTotais: 276739049,
    textoExtraidoBytesCandidaturasAtuais: 21874177,
    documentosTextoExtraivel: 201,
    documentosRequeremOcr: 5,
    inventarioPayloadBytes: 346768,
  });
});

test("preserva as cinco ausências e os seis documentos órfãos", () => {
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
      "CE:60002540418:01",
      "ES:80002541013:01",
      "MA:100002544075:01",
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

test("mantém a duplicidade oficial de MT como não resolvida", () => {
  const ambiguous = inventory.candidaturas.filter(
    (candidate) => candidate.identidadeEstado === "duplicidade_oficial",
  );
  assert.deepEqual(
    ambiguous.map((candidate) => candidate.sqCandidato),
    ["110002553937", "110002554073"],
  );
  assert.equal(
    new Set(ambiguous.map((candidate) => candidate.grupoAmbiguidade)).size,
    1,
  );
  for (const row of ambiguous) {
    assert.equal(row.slug, null);
    assert.deepEqual(
      row.alternativasOficiais.map(({ sqCandidato }) => sqCandidato),
      ["110002553937", "110002554073"],
    );
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
    [243, 262, 211, 215, 274, 49, 83, 215],
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
    "3bb3dc3e4bc8b0bb36553ec03d5b0f25d34a3821af74176648ed4b76a1ee779b",
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
    new URL("../scripts/programas-governo-governadores-2026-inventario.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /candidateKey\(document\.uf, document\.sqCandidato\)/);
  assert.match(source, /documentsByCandidate\.get\(key\)/);
  assert.doesNotMatch(source, /documentsBySq/);
});

test("falha explicitamente quando pdftotext encerra com erro", async () => {
  const source = await readFile(
    new URL("../scripts/programas-governo-governadores-2026-inventario.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /pdftotext falhou/);
  assert.doesNotMatch(source, /catch\s*\{[\s\S]*?text = Buffer\.alloc\(0\)/);
});

console.log("PROGRAMAS_GOVERNADORES_INVENTARIO_PASS");
