import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ProgramaGovernoOverview } from "../src/components/ProgramaGovernoSection"
import { assertProgramaDiretoFonteEsperada } from "../scripts/lib/programas-governo-fontes-diretas"
import {
  assertProgramaGovernoFonte,
  assertProgramaGovernoRegistro,
  programaGovernoRevisaoHashes,
  toProgramaGovernoManifestoPublico,
  toProgramaGovernoPublico,
  type ProgramaGovernoRegistro,
} from "../src/lib/programa-governo"

function record(): ProgramaGovernoRegistro {
  return JSON.parse(readFileSync(new URL("../src/data/programas-governo/governadores-2026/siqueira-campos-jr.json", import.meta.url), "utf8")) as ProgramaGovernoRegistro
}

function approvedFixture(): ProgramaGovernoRegistro {
  const value = record()
  value.estado = "aprovado"
  const extraction = value.documentos![0].extracao
  value.revisao = {
    reviewer: "Fixture de teste, sem aprovação editorial",
    reviewedAt: "2026-09-07T19:00:00Z",
    sourceSha256: extraction.sourceSha256,
    extractedTextSha256: extraction.extractedTextSha256,
    ...programaGovernoRevisaoHashes(value),
  }
  return value
}

test("PDF direto conserva o nome oficial e nunca inventa pacote ou caminho ZIP", () => {
  const value = record()
  assert.doesNotThrow(() => assertProgramaGovernoRegistro(value))
  assert.equal(value.fonte.origem, "divulgacand_pdf")
  assert.equal(value.fonte.arquivoNome, "Plano de Governo Final.pdf")
  assert.equal(value.fonte.arquivoNoPacote, null)
  assert.equal(value.fonte.pacoteUrl, null)
  assert.equal(value.documentos![0].extracao.paginas, 7)
  assert.equal(value.documentos![0].extracao.sourceSha256, "4fe5618450e7f3ecbde2d2ed128138028b4389e625a3304aa0cabf47d59746b7")
})

test("fonte direta rejeita URL estranha, protocolo, query e arquivo diferente do recibo", () => {
  for (const pdfOriginalUrl of [
    "http://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/doc/270017140501",
    "https://example.com/divulga/rest/arquivo/doc/270017140501",
    "https://divulgacandcontas.tse.jus.br.evil.test/divulga/rest/arquivo/doc/270017140501",
    "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/doc/999",
    "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/doc/270017140501?url=https://example.com",
  ]) {
    const fonte = { ...record().fonte, pdfOriginalUrl }
    assert.throws(() => assertProgramaGovernoFonte(fonte), /pdfOriginalUrl/)
  }
})

test("recibo direto exige vínculo exato à UF, SQ, tipo de programa e fonte preservada", () => {
  const original = record().fonte
  assert(original.origem === "divulgacand_pdf")
  for (const change of [
    { fonteUrl: original.vinculoCandidatura.fonteUrl.replace("270002554375", "270002546368") },
    { fonteUrl: original.vinculoCandidatura.fonteUrl.replace("/TO/", "/SP/") },
    { codTipo: "12" },
    { payloadSha256: "sem hash" },
    { evidenciaUrl: "https://example.com/recibo" },
  ]) {
    assert.throws(() => assertProgramaGovernoFonte({ ...original, vinculoCandidatura: { ...original.vinculoCandidatura, ...change } }), /vinculoCandidatura/)
  }
  assert.throws(() => assertProgramaGovernoFonte({ ...original, vinculoCandidatura: undefined }), /vinculoCandidatura/)
  assert.throws(() => assertProgramaGovernoFonte({ ...original, pacoteUrl: "https://cdn.tse.jus.br/falso.zip" }), /pacote\/caminho nulos/)
  assert.throws(() => assertProgramaGovernoFonte({ ...original, arquivoNoPacote: "TO/falso.pdf" }), /pacote\/caminho nulos/)
  assert.throws(() => assertProgramaGovernoFonte({ ...original, origem: undefined }), /arquivoNome|pacoteUrl/)
})

test("revisão fica stale quando o recibo de vínculo muda", () => {
  for (const mutation of ["payload", "arquivo"] as const) {
    const value = approvedFixture()
    assert.doesNotThrow(() => assertProgramaGovernoRegistro(value))
    const document = value.documentos![0]
    for (const fonte of [value.fonte, document.fonte]) {
      assert(fonte.origem === "divulgacand_pdf")
      if (mutation === "payload") {
        fonte.vinculoCandidatura.payloadSha256 = "a".repeat(64)
      } else {
        fonte.vinculoCandidatura.arquivoId = "999"
        fonte.pdfOriginalUrl = "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/doc/999"
      }
    }
    assert.throws(() => assertProgramaGovernoRegistro(value), /mudou depois da revisao/)
  }
})

test("manifesto e UI oferecem PDF direto sem expor recibos internos", () => {
  const value = approvedFixture()
  const manifesto = toProgramaGovernoManifestoPublico(value)
  const publico = toProgramaGovernoPublico(value)
  assert.equal(publico.fonte.arquivoNoPacote, null)
  assert.equal(manifesto.fonte.pacoteUrl, null)
  assert.equal(manifesto.documentos![0].fonte.arquivoNoPacote, null)
  assert.doesNotMatch(JSON.stringify(manifesto), /vinculoCandidatura|payloadSha256|reviewer|julgamento/)
  const html = renderToStaticMarkup(<ProgramaGovernoOverview manifesto={manifesto} onOpenTab={() => {}} />)
  assert.match(html, /href="https:\/\/divulgacandcontas\.tse\.jus\.br\/divulga\/rest\/arquivo\/doc\/270017140501"/)
  assert.doesNotMatch(html, /\.zip/)
})

test("registro pendente continua sem resumo público mesmo com PDF direto válido", () => {
  const value = record()
  value.estado = "em_revisao"
  delete value.revisao
  const manifesto = toProgramaGovernoManifestoPublico(value)
  assert.equal(manifesto.resumo, undefined)
  assert.throws(() => toProgramaGovernoPublico(value), /somente registros aprovados/)
})

test("auditoria exige identidade, arquivo e hash de fonte independente do registro publicado", () => {
  const original = record()
  assert.doesNotThrow(() => assertProgramaDiretoFonteEsperada(original))
  for (const mutation of ["identidade", "arquivo", "hash"] as const) {
    const value = record()
    assert(value.fonte.origem === "divulgacand_pdf")
    const document = value.documentos![0]
    assert(document.fonte.origem === "divulgacand_pdf")
    if (mutation === "identidade") {
      value.fonte.sqCandidato = "270002546368"
    } else if (mutation === "arquivo") {
      for (const fonte of [value.fonte, document.fonte]) {
        fonte.vinculoCandidatura.arquivoId = "999"
        fonte.pdfOriginalUrl = "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/doc/999"
      }
    } else {
      document.extracao.sourceSha256 = "a".repeat(64)
    }
    assert.throws(() => assertProgramaDiretoFonteEsperada(value))
  }
})
