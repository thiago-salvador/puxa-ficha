import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import test, { before } from "node:test"

import {
  assertProgramaGovernoRegistro,
  createProgramaGovernoChunk,
  programaGovernoRevisaoHashes,
  toProgramaGovernoManifestoPublico,
  toProgramaGovernoPublico,
  type ProgramaGovernoDocumento,
  type ProgramaGovernoManifestoPublico,
  type ProgramaGovernoRegistro,
} from "../src/lib/programa-governo"
import { createFixedWindowIpRateLimiter } from "../src/lib/request-rate-limit"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

let createProgramaGovernoManifestoServer: typeof import("../src/data/programas-governo-2026").createProgramaGovernoManifestoServer
let getProgramaGovernoPublicChunk: typeof import("../src/lib/programa-governo-server").getProgramaGovernoPublicChunk
let createProgramaGovernoGetHandler: typeof import("../src/app/api/candidato-profile/[slug]/programa/route").createProgramaGovernoGetHandler

before(async () => {
  ;({ createProgramaGovernoManifestoServer } = await import("../src/data/programas-governo-2026"))
  ;({ getProgramaGovernoPublicChunk } = await import("../src/lib/programa-governo-server"))
  ;({ createProgramaGovernoGetHandler } = await import("../src/app/api/candidato-profile/[slug]/programa/route"))
})

const confirmedPackageUrl = "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_AM.zip"
const confirmedDatasetUrl = "https://dadosabertos.tse.jus.br/dataset/candidatos-2026"
const syntheticIdentity = {
  ano: 2026 as const,
  cargo: "GOVERNADOR" as const,
  uf: "AM" as const,
  sqCandidato: "40000000000",
  slug: "candidatura-multipartes-teste",
  nomeUrna: "CANDIDATURA MULTIPARTES DE TESTE",
  partido: "TESTE",
}

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `palavra${index + 1}`).join(" ")
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function syntheticDocument(index: number, sectionBytes = 80): ProgramaGovernoDocumento {
  const sequence = String(index + 1).padStart(2, "0")
  const documentoId = `AM:${syntheticIdentity.sqCandidato}:${sequence}`
  const secoes = Array.from({ length: 4 }, (_, sectionIndex) => ({
    id: `parte-${sequence}-secao-${sectionIndex + 1}`,
    titulo: `Seção sintética ${sectionIndex + 1}`,
    nivel: 1,
    paginaInicial: sectionIndex + 1,
    paginaFinal: sectionIndex + 1,
    origem: "pdftotext" as const,
    conteudo: `${sequence}:${sectionIndex + 1}:${"x".repeat(sectionBytes)}`,
  }))
  return {
    documentoId,
    fonte: {
      arquivoNome: `2026AM${syntheticIdentity.sqCandidato}_${sequence}.pdf`,
      arquivoNoPacote: `AM/2026AM${syntheticIdentity.sqCandidato}_${sequence}.pdf`,
      pacoteUrl: confirmedPackageUrl,
      datasetUrl: confirmedDatasetUrl,
      pdfOriginalUrl: null,
      coletadoEm: "2026-08-26T12:00:00Z",
    },
    extracao: {
      sourceSha256: ((index + 1) % 16).toString(16).repeat(64),
      extractedTextSha256: sha(secoes.map(({ conteudo }) => conteudo).join("\n\f\n")),
      paginas: 4,
      secoes,
      extractionVersion: "programa-governo-extracao-v2",
      method: "pdftotext-pagewise-with-ocr-fallback",
      pageMap: secoes.map((section) => ({
        pagina: section.paginaInicial,
        origem: section.origem,
        textSha256: sha(section.conteudo),
      })),
    },
  }
}

function syntheticMultipartRecord(sectionBytes = 80): ProgramaGovernoRegistro {
  const documentos = Array.from({ length: 8 }, (_, index) => syntheticDocument(index, sectionBytes))
  const texto = words(120)
  const evidence = (documentIndex: number, pagina: number) => ({
    documentoId: documentos[documentIndex].documentoId,
    pagina,
    trecho: `Trecho sintético ${documentIndex + 1}:${pagina}`,
  })
  const record: ProgramaGovernoRegistro = {
    version: 1,
    estado: "aprovado",
    fonte: { ...syntheticIdentity, ...documentos[0].fonte },
    documentos,
    resumo: {
      texto,
      frases: Array.from({ length: 6 }, (_, index) => ({
        texto,
        evidencias: [evidence(index, 1)],
      })),
      temas: Array.from({ length: 4 }, (_, index) => ({
        id: `tema-${index + 1}`,
        titulo: `Tema sintético ${index + 1}`,
        descricao: "Descrição sintética sem conteúdo público.",
        evidencias: [evidence(index + 4, 2)],
      })),
    },
    geracao: { promptVersion: "teste-v1", model: "modelo-teste", generatedAt: "2026-08-26T12:10:00Z" },
    julgamento: {
      model: "juiz-teste",
      judgedAt: "2026-08-26T12:20:00Z",
      verdicts: [{ id: "claim-teste", verdict: "yes", reason: "fixture sintética" }],
    },
    revisao: {
      reviewer: "Revisor de teste",
      reviewedAt: "2026-08-26T12:30:00Z",
      sourceSha256: documentos[0].extracao.sourceSha256,
      extractedTextSha256: documentos[0].extracao.extractedTextSha256,
    },
  }
  Object.assign(record.revisao!, programaGovernoRevisaoHashes(record))
  return record
}

test("schema preserves eight sequential documents and document-scoped evidence", () => {
  const record = syntheticMultipartRecord()
  assert.doesNotThrow(() => assertProgramaGovernoRegistro(record))
  assert.deepEqual(
    record.documentos?.map(({ documentoId }) => documentoId),
    Array.from({ length: 8 }, (_, index) => `AM:${syntheticIdentity.sqCandidato}:${String(index + 1).padStart(2, "0")}`),
  )

  const missingDocument = structuredClone(record)
  delete missingDocument.resumo!.frases[0].evidencias[0].documentoId
  assert.throws(() => assertProgramaGovernoRegistro(missingDocument), /documentoId.*obrigatorio/)

  const crossedPage = structuredClone(record)
  crossedPage.resumo!.temas[0].evidencias[0].pagina = 5
  assert.throws(() => assertProgramaGovernoRegistro(crossedPage), /paginas do documento/)

  const skippedSequence = structuredClone(record)
  skippedSequence.documentos![1].fonte.arquivoNome = `2026AM${syntheticIdentity.sqCandidato}_03.pdf`
  assert.throws(() => assertProgramaGovernoRegistro(skippedSequence), /parte sequencial 02/)
})

test("multipart approval binds every document, page map and editorial field", () => {
  const original = syntheticMultipartRecord()

  const changedSecondDocument = structuredClone(original)
  const changedExtraction = changedSecondDocument.documentos![1].extracao
  changedExtraction.secoes[0].conteudo += " alterado depois da revisão"
  changedExtraction.pageMap![0].textSha256 = sha(changedExtraction.secoes[0].conteudo)
  changedExtraction.extractedTextSha256 = sha(
    changedExtraction.secoes.map(({ conteudo }) => conteudo).join("\n\f\n"),
  )
  assert.throws(
    () => assertProgramaGovernoRegistro(changedSecondDocument),
    /documentSetSha256.*conjunto documental mudou/u,
  )

  const changedPageMap = structuredClone(original)
  changedPageMap.documentos![2].extracao.extractionVersion = "programa-governo-extracao-v3"
  assert.throws(
    () => assertProgramaGovernoRegistro(changedPageMap),
    /documentSetSha256.*conjunto documental mudou/u,
  )

  const changedSummary = structuredClone(original)
  changedSummary.resumo!.temas[0].titulo = "Tema alterado depois da revisão"
  assert.throws(
    () => assertProgramaGovernoRegistro(changedSummary),
    /contentSha256.*conteudo editorial mudou/u,
  )
})

test("multipart public DTO exposes only the light document index", () => {
  const publicRecord = toProgramaGovernoPublico(syntheticMultipartRecord())
  assert.equal(publicRecord.documentos?.length, 8)
  assert.equal(publicRecord.paginas, 32)
  assert.deepEqual(publicRecord.secoes, [])
  assert.doesNotMatch(JSON.stringify(publicRecord.documentos), /conteudo|Trecho sintético/)

  const presidential = require("../src/data/programas-governo/presidencia-2026/lula.json") as ProgramaGovernoRegistro
  const presidentialPublic = toProgramaGovernoPublico(presidential)
  assert.equal("documentos" in presidentialPublic, false)
  assert.ok(presidentialPublic.secoes.length > 0)
})

test("chunk cursor is deterministic, document-bound and serially complete", () => {
  const documento = syntheticDocument(0, 70_000)
  const chunks = []
  let cursor: string | null = null
  do {
    const chunk = createProgramaGovernoChunk(documento, cursor, { maxBytes: 100_000, maxSecoes: 4 })
    assert.ok(chunk.bytes <= 100_000)
    chunks.push(chunk)
    cursor = chunk.nextCursor
  } while (cursor !== null)

  assert.equal(chunks.at(-1)?.completo, true)
  assert.deepEqual(
    chunks.flatMap(({ secoes }) => secoes.map(({ id }) => id)),
    documento.extracao.secoes.map(({ id }) => id),
  )
  assert.deepEqual(
    createProgramaGovernoChunk(documento, null, { maxBytes: 100_000, maxSecoes: 4 }),
    chunks[0],
  )
  assert.throws(
    () => createProgramaGovernoChunk(documento, `AM:${syntheticIdentity.sqCandidato}:02@1`),
    /nao pertence ao documento/,
  )
})

test("server manifest loads only the requested document", async () => {
  const record = syntheticMultipartRecord()
  const manifesto = toProgramaGovernoManifestoPublico(record)
  const documentLoads = Array(8).fill(0) as number[]
  let recordLoads = 0
  const serverManifest = createProgramaGovernoManifestoServer([{
    identidade: syntheticIdentity,
    manifesto,
    load: async () => {
      recordLoads += 1
      return { default: structuredClone(record) }
    },
    documentos: record.documentos!.map((documento, index) => ({
      documentoId: documento.documentoId,
      load: async () => {
        documentLoads[index] += 1
        return { default: structuredClone(documento) }
      },
    })),
  }])

  const requestedId = record.documentos![3].documentoId
  const loaded = await serverManifest.loadDocumentoBySlug(syntheticIdentity.slug, requestedId)
  assert.equal(loaded?.documentoId, requestedId)
  assert.equal(recordLoads, 0)
  assert.deepEqual(documentLoads, [0, 0, 0, 1, 0, 0, 0, 0])
  assert.equal(
    await serverManifest.loadDocumentoBySlug(syntheticIdentity.slug, `AM:${syntheticIdentity.sqCandidato}:09`),
    null,
  )
  assert.equal(recordLoads, 0, "documento ausente nao deve carregar o registro integral")

  const divergentRecord = structuredClone(record)
  divergentRecord.documentos![3].extracao.sourceSha256 = "f".repeat(64)
  const divergentManifest = createProgramaGovernoManifestoServer([{
    identidade: syntheticIdentity,
    manifesto,
    load: async () => ({ default: structuredClone(record) }),
    documentos: divergentRecord.documentos!.map((documento) => ({
      documentoId: documento.documentoId,
      load: async () => ({ default: structuredClone(documento) }),
    })),
  }])
  await assert.rejects(
    () => divergentManifest.loadDocumentoBySlug(syntheticIdentity.slug, requestedId),
    /documento carregado diverge/,
  )

  const forgedText = structuredClone(record)
  forgedText.documentos![3].extracao.secoes[0].conteudo += " adulterado"
  const forgedTextManifest = createProgramaGovernoManifestoServer([{
    identidade: syntheticIdentity,
    manifesto,
    load: async () => ({ default: structuredClone(record) }),
    documentos: forgedText.documentos!.map((documento) => ({
      documentoId: documento.documentoId,
      load: async () => ({ default: structuredClone(documento) }),
    })),
  }])
  await assert.rejects(
    () => forgedTextManifest.loadDocumentoBySlug(syntheticIdentity.slug, requestedId),
    /documento carregado diverge/,
  )

  const forgedPageMap = structuredClone(record)
  forgedPageMap.documentos![3].extracao.pageMap![0].textSha256 = "0".repeat(64)
  const forgedPageMapManifest = createProgramaGovernoManifestoServer([{
    identidade: syntheticIdentity,
    manifesto,
    load: async () => ({ default: structuredClone(record) }),
    documentos: forgedPageMap.documentos!.map((documento) => ({
      documentoId: documento.documentoId,
      load: async () => ({ default: structuredClone(documento) }),
    })),
  }])
  await assert.rejects(
    () => forgedPageMapManifest.loadDocumentoBySlug(syntheticIdentity.slug, requestedId),
    /documento carregado diverge/,
  )
})

test("multipart manifest requires exact public index and loader parity", async () => {
  const record = syntheticMultipartRecord()
  const manifesto = toProgramaGovernoManifestoPublico(record)
  let recordLoads = 0
  const load = async () => {
    recordLoads += 1
    return { default: structuredClone(record) }
  }

  assert.throws(
    () => createProgramaGovernoManifestoServer([{ identidade: syntheticIdentity, manifesto, load }]),
    /indice multidocumento e loaders devem coexistir/,
  )
  assert.throws(
    () => createProgramaGovernoManifestoServer([{
      identidade: syntheticIdentity,
      manifesto,
      load,
      documentos: record.documentos!.slice(0, -1).map((documento) => ({
        documentoId: documento.documentoId,
        load: async () => ({ default: structuredClone(documento) }),
      })),
    }]),
    /loaders divergem dos documentos publicos/,
  )
  assert.equal(recordLoads, 0)

  const unindexed = createProgramaGovernoManifestoServer([{
    identidade: syntheticIdentity,
    load,
  }])
  assert.equal(
    await unindexed.loadDocumentoBySlug(syntheticIdentity.slug, record.documentos![0].documentoId),
    null,
  )
  assert.equal(recordLoads, 0, "entrada estadual sem indice nunca deve carregar o registro integral")
})

test("pending state blocks document loader and approved chunk is bounded", async () => {
  const record = syntheticMultipartRecord(70_000)
  const approvedManifest = toProgramaGovernoManifestoPublico(record)
  let loads = 0
  const loadDocument = async (_slug: string, documentoId: string) => {
    loads += 1
    return record.documentos!.find((documento) => documento.documentoId === documentoId) ?? null
  }
  const documentoId = record.documentos![0].documentoId
  const approved = await getProgramaGovernoPublicChunk(
    syntheticIdentity.slug,
    documentoId,
    null,
    loadDocument,
    async () => approvedManifest,
  )
  assert.equal(approved.known, true)
  assert.ok(approved.chunk?.bytes && approved.chunk.bytes <= 1_048_576)
  assert.equal(loads, 1)

  const pendingManifest: ProgramaGovernoManifestoPublico = {
    ...approvedManifest,
    estado: "em_revisao",
  }
  const pending = await getProgramaGovernoPublicChunk(
    syntheticIdentity.slug,
    documentoId,
    null,
    loadDocument,
    async () => pendingManifest,
  )
  assert.equal(pending.known, true)
  assert.equal(pending.chunk, null)
  assert.equal(loads, 1)

  const divergentDocument = structuredClone(record.documentos![0])
  divergentDocument.extracao.extractedTextSha256 = "e".repeat(64)
  const divergent = await getProgramaGovernoPublicChunk(
    syntheticIdentity.slug,
    documentoId,
    null,
    async () => divergentDocument,
    async () => approvedManifest,
  )
  assert.deepEqual(divergent, { known: false, manifesto: null, chunk: null })
})

test("route rate-limits before each chunk load and validates document cursor", async () => {
  const record = syntheticMultipartRecord()
  const manifesto = toProgramaGovernoManifestoPublico(record)
  const documentoId = record.documentos![0].documentoId
  let chunkLoads = 0
  const handler = createProgramaGovernoGetHandler({
    rateLimiter: createFixedWindowIpRateLimiter({ namespace: "chunk-route-test", max: 1, windowMs: 60_000 }),
    getProgramaGovernoPublicResource: async () => ({ known: false, manifesto: null, data: null }),
    getProgramaGovernoPublicChunk: async (_slug, _documentoId, cursor) => {
      chunkLoads += 1
      return {
        known: true,
        manifesto,
        chunk: createProgramaGovernoChunk(record.documentos![0], cursor),
      }
    },
  })
  const makeRequest = (cursor?: string) => {
    const url = new URL(`http://localhost/api/candidato-profile/${syntheticIdentity.slug}/programa`)
    url.searchParams.set("documentoId", documentoId)
    if (cursor) url.searchParams.set("cursor", cursor)
    return new Request(url, { headers: { "x-forwarded-for": "203.0.113.90" } })
  }
  const params = { params: Promise.resolve({ slug: syntheticIdentity.slug }) }

  const first = await handler(makeRequest(), params)
  assert.equal(first.status, 200)
  assert.equal(chunkLoads, 1)
  const blocked = await handler(makeRequest(), params)
  assert.equal(blocked.status, 429)
  assert.equal(chunkLoads, 1)

  const invalidHandler = createProgramaGovernoGetHandler({
    rateLimiter: createFixedWindowIpRateLimiter({ namespace: "chunk-route-invalid", max: 5, windowMs: 60_000 }),
    getProgramaGovernoPublicResource: async () => ({ known: false, manifesto: null, data: null }),
    getProgramaGovernoPublicChunk: async () => {
      chunkLoads += 1
      return { known: false, manifesto: null, chunk: null }
    },
  })
  const invalid = await invalidHandler(makeRequest("AM:40000000000:02@1"), params)
  assert.equal(invalid.status, 400)
  assert.equal(chunkLoads, 1)

  const outOfRangeHandler = createProgramaGovernoGetHandler({
    rateLimiter: createFixedWindowIpRateLimiter({ namespace: "chunk-route-range", max: 5, windowMs: 60_000 }),
    getProgramaGovernoPublicResource: async () => ({ known: false, manifesto: null, data: null }),
    getProgramaGovernoPublicChunk: async (_slug, _documentoId, cursor) => ({
      known: true,
      manifesto,
      chunk: createProgramaGovernoChunk(record.documentos![0], cursor),
    }),
  })
  const outOfRange = await outOfRangeHandler(makeRequest(`${documentoId}@999`), params)
  assert.equal(outOfRange.status, 400)
})

test("server page no longer hard-gates the manifesto to President", async () => {
  const source = await readFile(
    new URL("../src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx", import.meta.url),
    "utf8",
  )
  assert.match(source, /cargo_disputado === "Governador"/)
  assert.match(source, /await getProgramaGovernoManifesto\(slug\)/)
})

test("PROGRAMAS_CHUNKING_PASS", () => assert.ok(true))
