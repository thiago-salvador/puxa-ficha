import assert from "node:assert/strict"

import sourcepack from "../../data/siqueira-to-20260907.json"
import {
  assertProgramaGovernoFonte,
  assertProgramaGovernoIdentidadeCorresponde,
  programaGovernoDocumentoFonte,
  type ProgramaGovernoRegistro,
} from "../../src/lib/programa-governo"
import type { ProgramaGovernoStageSource } from "../programas-governo-stage"

/** Registro esperado independente do resumo publicado, derivado do recibo de coleta. */
export function fonteDiretaProgramaEsperada(): ProgramaGovernoStageSource {
  const candidate = sourcepack.candidate
  const media = sourcepack.media.filter((item) => item.kind === "programa_governo")
  assert.equal(media.length, 1, "sourcepack exige exatamente um programa")
  const pdf = media[0]
  assert.equal(pdf.http_status, 200)
  assert.equal(pdf.detected_magic, "pdf")
  assert.equal(pdf.cod_tipo, "5")
  assert.equal(candidate.source.http_status, 200)
  assert(sourcepack.runs.includes("https://github.com/thiago-salvador/puxa-ficha/actions/runs/34151762737"))
  const fonte = {
    ano: 2026 as const,
    cargo: "GOVERNADOR" as const,
    uf: candidate.estado,
    sqCandidato: candidate.sq_candidato_2026,
    slug: candidate.slug,
    nomeUrna: candidate.nome_urna,
    partido: candidate.partido_sigla,
    origem: "divulgacand_pdf" as const,
    arquivoNome: pdf.nome,
    arquivoNoPacote: null,
    pacoteUrl: null,
    datasetUrl: "https://dadosabertos.tse.jus.br/dataset/candidatos-2026",
    pdfOriginalUrl: pdf.url,
    coletadoEm: pdf.checked_at,
    vinculoCandidatura: {
      fonteUrl: candidate.source.url,
      arquivoId: pdf.id_arquivo,
      codTipo: pdf.cod_tipo,
      consultadoEm: candidate.source.checked_at,
      payloadSha256: candidate.source.payload_raw_sha256,
      evidenciaUrl: "https://github.com/thiago-salvador/puxa-ficha/actions/runs/34151762737",
    },
  }
  assertProgramaGovernoFonte(fonte)
  assert(fonte.arquivoNome)
  return {
    ...fonte,
    documentos: [{ documentoId: `${fonte.uf}:${fonte.sqCandidato}:01`, fonte: programaGovernoDocumentoFonte(fonte) }],
  }
}

export function assertProgramaDiretoFonteEsperada(record: ProgramaGovernoRegistro): ProgramaGovernoStageSource {
  const expected = fonteDiretaProgramaEsperada()
  assertProgramaGovernoIdentidadeCorresponde(record.fonte, expected)
  const { documentos, ...fonte } = expected
  // Compare fields explicitly: object insertion order is not a source property.
  for (const [key, value] of Object.entries(fonte)) {
    assert.deepEqual(record.fonte[key as keyof typeof record.fonte], value, `fonte direta diverge do sourcepack: ${key}`)
  }
  assert.equal(record.documentos?.length, 1, "conjunto documental direto divergente")
  const document = record.documentos![0]
  assert.equal(document.documentoId, documentos![0].documentoId)
  assert.deepEqual(document.fonte, documentos![0].fonte)
  const pdf = sourcepack.media.find((item) => item.kind === "programa_governo")!
  assert.equal(document.extracao.sourceSha256, pdf.sha256, "PDF diverge dos bytes coletados")
  return expected
}
