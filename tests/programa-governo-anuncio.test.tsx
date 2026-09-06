import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ProgramaGovernoOverview, ProgramaGovernoTab } from "../src/components/ProgramaGovernoSection"
import { assertProgramaGovernoRegistro, toProgramaGovernoManifestoPublico, toProgramaGovernoPublico } from "../src/lib/programa-governo"
import { auditProgramaGovernoRecordSet } from "../scripts/audit/audit-programas-governo"
import type { ProgramaGovernoPipelineRecord, ProgramaGovernoStageSource } from "../scripts/programas-governo-stage"

const announced = {
  version: 1,
  estado: "documento_anunciado",
  anuncio: {
    fonteUrl: "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MG/20322002026/candidato/130002544411",
    idArquivo: "130017139584",
    nomeArquivo: "pje-0601954-55.2026.6.13.0000 Plano de Governo.pdf",
    codTipo: "5",
    consultadoEm: "2026-09-04T15:06:05.782Z",
    payloadSha256: "6f8138d36cb5093f612d37bf3c8aafd0e5871a21fe2ee5b6e1ec66895bfaee8c",
    evidenciaUrl: "https://github.com/thiago-salvador/puxa-ficha/actions/runs/33887424607",
    metadadosSha256: "5bc8b0f39bb96a572e3cdc62a2c853621c0b1010667f05768b7da6753dbb4920",
  },
  fonte: {
    ano: 2026, cargo: "GOVERNADOR", uf: "MG", sqCandidato: "130002544411",
    slug: "candidato-anunciado", nomeUrna: "CANDIDATO ANUNCIADO", partido: "TESTE",
    arquivoNome: null, arquivoNoPacote: null,
    pacoteUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_MG.zip",
    datasetUrl: "https://dadosabertos.tse.jus.br/dataset/candidatos-2026",
    pdfOriginalUrl: null, coletadoEm: "2026-09-04T15:06:05.782Z",
  },
} as const

test("anúncio preserva identidade, recibo e dívida sem publicar PDF ou resumo", () => {
  assert.doesNotThrow(() => assertProgramaGovernoRegistro(announced))
  assert.equal(announced.estado, "documento_anunciado")
  assert.equal(announced.anuncio.idArquivo, "130017139584")
  assert.equal(announced.fonte.sqCandidato, "130002544411")
  assert.throws(() => toProgramaGovernoPublico(announced), /somente registros aprovados/)
  const manifesto = toProgramaGovernoManifestoPublico(announced)
  assert.deepEqual(manifesto.anuncio, announced.anuncio)
  assert.equal(manifesto.fonte.pdfOriginalUrl, null)
  for (const field of ["resumo", "documentos", "paginas", "reviewedAt"]) assert.equal(field in manifesto, false)
  const source = announced.fonte as unknown as ProgramaGovernoStageSource
  const record = announced as unknown as ProgramaGovernoPipelineRecord
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
    fonteUrl: announced.anuncio.fonteUrl.replace("130002544411", "130002544412"),
    evidenciaUrl: "https://example.com/recibo",
  })) {
    const invalid = structuredClone(announced)
    Object.assign(invalid.anuncio, { [field]: value })
    assert.throws(() => assertProgramaGovernoRegistro(invalid), Error, field)
  }
})

test("anúncio não aceita alegação de hash do PDF, conteúdo, extração ou aprovação", () => {
  for (const field of ["sourceSha256", "pdfOriginalUrl", "paginas"]) {
    const invalid = structuredClone(announced)
    Object.assign(invalid.anuncio, { [field]: "a".repeat(64) })
    assert.throws(() => assertProgramaGovernoRegistro(invalid), /nao pertence ao recibo/)
  }
  for (const field of ["resumo", "extracao", "documentos", "geracao", "julgamento", "revisao"]) {
    assert.throws(() => assertProgramaGovernoRegistro({ ...announced, [field]: {} }), /nao publica conteudo nem revisao/)
  }
  const invalid = structuredClone(announced)
  Object.assign(invalid.fonte, { arquivoNome: "2026MG130002544411_01.pdf", arquivoNoPacote: "MG/2026MG130002544411_01.pdf" })
  assert.throws(() => assertProgramaGovernoRegistro(invalid), /nao comprova PDF/)
  assert.throws(() => assertProgramaGovernoRegistro({ ...announced, estado: "aprovado" }), /exige estado documento_anunciado/)
})

test("ficha mostra anúncio e resumo pendente com link específico, sem alegar ausência ou PDF lido", () => {
  const manifesto = toProgramaGovernoManifestoPublico(announced)
  const html = renderToStaticMarkup(<ProgramaGovernoOverview manifesto={manifesto} onOpenTab={() => {}} />)
  assert.match(html, /Documento anunciado pelo TSE/)
  assert.match(html, /Resumo pendente/)
  assert.match(html, /download e a leitura do PDF ainda não foram confirmados/)
  assert.match(html, /data-pf-programa-source="anuncio-tse"/)
  assert.ok(html.includes(announced.anuncio.fonteUrl))
  assert.doesNotMatch(html, /Documento oficial não localizado|Abrir PDF original|Ler programa completo|revisado editorialmente|dentro do pacote oficial/)
  const tab = renderToStaticMarkup(<ProgramaGovernoTab manifesto={manifesto} loadState="loaded" response={{ data: null, ...manifesto }} onRetry={() => {}} />)
  assert.match(tab, /Resumo pendente/)
  assert.doesNotMatch(tab, /Abrir PDF original|data-pf-programa-reader/)
})
