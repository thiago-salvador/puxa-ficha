import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import ben from "../src/data/programas-governo/governadores-2026/ben-mendes.json"
import { ProgramaGovernoOverview, ProgramaGovernoTab } from "../src/components/ProgramaGovernoSection"
import { assertProgramaGovernoRegistro, toProgramaGovernoManifestoPublico, toProgramaGovernoPublico } from "../src/lib/programa-governo"
import { auditProgramaGovernoRecordSet } from "../scripts/audit/audit-programas-governo"
import type { ProgramaGovernoPipelineRecord, ProgramaGovernoStageSource } from "../scripts/programas-governo-stage"

test("anúncio de Ben preserva identidade, recibo e dívida sem publicar PDF ou resumo", () => {
  assert.doesNotThrow(() => assertProgramaGovernoRegistro(ben))
  assert.equal(ben.estado, "documento_anunciado")
  assert.equal(ben.anuncio.idArquivo, "130017139584")
  assert.equal(ben.fonte.sqCandidato, "130002544411")
  assert.throws(() => toProgramaGovernoPublico(ben), /somente registros aprovados/)
  const manifesto = toProgramaGovernoManifestoPublico(ben)
  assert.deepEqual(manifesto.anuncio, ben.anuncio)
  assert.equal(manifesto.fonte.pdfOriginalUrl, null)
  for (const field of ["resumo", "documentos", "paginas", "reviewedAt"]) assert.equal(field in manifesto, false)
  const source = ben.fonte as unknown as ProgramaGovernoStageSource
  const record = ben as unknown as ProgramaGovernoPipelineRecord
  const audit = auditProgramaGovernoRecordSet([source], [record])
  assert.equal(audit.approved, 0)
  assert.equal(audit.absent, 0)
  assert.equal(audit.reviewPending, 1)
  assert.equal(audit.pages, 0)
  assert.equal(audit.claims, 0)
  assert.throws(() => auditProgramaGovernoRecordSet([source], [record], { expectAllApproved: true }), /pendentes de revisao/)
})

test("recusa recibo adulterado, fonte de outra candidatura e classificação não oficial", () => {
  for (const [field, value] of Object.entries({
    metadadosSha256: "0".repeat(64), payloadSha256: "nao-e-hash", idArquivo: "999999999999",
    nomeArquivo: "outro.pdf", codTipo: "2", consultadoEm: "2026-02-30T00:00:00Z",
    fonteUrl: ben.anuncio.fonteUrl.replace("130002544411", "130002544412"),
    evidenciaUrl: "https://example.com/recibo",
  })) {
    const invalid = structuredClone(ben)
    Object.assign(invalid.anuncio, { [field]: value })
    assert.throws(() => assertProgramaGovernoRegistro(invalid), Error, field)
  }
})

test("anúncio não aceita alegação de hash do PDF, conteúdo, extração ou aprovação", () => {
  for (const field of ["sourceSha256", "pdfOriginalUrl", "paginas"]) {
    const invalid = structuredClone(ben)
    Object.assign(invalid.anuncio, { [field]: "a".repeat(64) })
    assert.throws(() => assertProgramaGovernoRegistro(invalid), /nao pertence ao recibo/)
  }
  for (const field of ["resumo", "extracao", "documentos", "geracao", "julgamento", "revisao"]) {
    assert.throws(() => assertProgramaGovernoRegistro({ ...ben, [field]: {} }), /nao publica conteudo nem revisao/)
  }
  const invalid = structuredClone(ben)
  Object.assign(invalid.fonte, { arquivoNome: "2026MG130002544411_01.pdf", arquivoNoPacote: "MG/2026MG130002544411_01.pdf" })
  assert.throws(() => assertProgramaGovernoRegistro(invalid), /nao comprova PDF/)
  assert.throws(() => assertProgramaGovernoRegistro({ ...ben, estado: "aprovado" }), /exige estado documento_anunciado/)
})

test("ficha mostra anúncio e resumo pendente com link específico, sem alegar ausência ou PDF lido", () => {
  const manifesto = toProgramaGovernoManifestoPublico(ben)
  const html = renderToStaticMarkup(<ProgramaGovernoOverview manifesto={manifesto} onOpenTab={() => {}} />)
  assert.match(html, /Documento anunciado pelo TSE/)
  assert.match(html, /Resumo pendente/)
  assert.match(html, /download e a leitura do PDF ainda não foram confirmados/)
  assert.match(html, /data-pf-programa-source="anuncio-tse"/)
  assert.ok(html.includes(ben.anuncio.fonteUrl))
  assert.doesNotMatch(html, /Documento oficial não localizado|Abrir PDF original|Ler programa completo|revisado editorialmente|dentro do pacote oficial/)
  const tab = renderToStaticMarkup(<ProgramaGovernoTab manifesto={manifesto} loadState="loaded" response={{ data: null, ...manifesto }} onRetry={() => {}} />)
  assert.match(tab, /Resumo pendente/)
  assert.doesNotMatch(tab, /Abrir PDF original|data-pf-programa-reader/)
})
