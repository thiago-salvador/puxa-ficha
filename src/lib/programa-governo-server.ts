import "server-only"

import {
  getProgramaGoverno2026ManifestoEntry,
  loadProgramaGovernoDocumento2026,
  loadProgramaGoverno2026,
} from "@/data/programas-governo-2026"
import {
  assertProgramaGovernoDocumento,
  createProgramaGovernoChunk,
  programaGovernoDocumentoPublicoCorresponde,
  programaGovernoIdentidadeCorresponde,
  toProgramaGovernoManifestoPublico,
  toProgramaGovernoPublico,
  type ProgramaGovernoChunkPublico,
  type ProgramaGovernoDocumento,
  type ProgramaGovernoIdentidade,
  type ProgramaGovernoManifestoPublico,
  type ProgramaGovernoPublico,
  type ProgramaGovernoRegistro,
} from "@/lib/programa-governo"

export type ProgramaGovernoPublicResource = {
  known: true
  manifesto: ProgramaGovernoManifestoPublico
  data: ProgramaGovernoPublico | null
} | {
  known: false
  manifesto: null
  data: null
}

export type ProgramaGovernoChunkResource = {
  known: true
  manifesto: ProgramaGovernoManifestoPublico
  chunk: ProgramaGovernoChunkPublico | null
} | {
  known: false
  manifesto: null
  chunk: null
}

export type ProgramaGovernoRecordLoader = (slug: string) => Promise<ProgramaGovernoRegistro | null>
export type ProgramaGovernoIdentityResolver = (slug: string) => ProgramaGovernoIdentidade | null
export type ProgramaGovernoDocumentLoader = (
  slug: string,
  documentoId: string,
) => Promise<ProgramaGovernoDocumento | null>

const loadProgramaGovernoRecord: ProgramaGovernoRecordLoader = async (slug) => {
  return loadProgramaGoverno2026(slug)
}

const resolveProgramaGovernoIdentity: ProgramaGovernoIdentityResolver = (slug) => {
  return getProgramaGoverno2026ManifestoEntry(slug)?.identidade ?? null
}

async function loadMatchingRecord(
  slug: string,
  loadRecord: ProgramaGovernoRecordLoader,
  resolveIdentity: ProgramaGovernoIdentityResolver,
): Promise<ProgramaGovernoRegistro | null> {
  const expectedIdentity = resolveIdentity(slug)
  if (!expectedIdentity) return null
  const record = await loadRecord(slug)
  if (!record || !programaGovernoIdentidadeCorresponde(record.fonte, expectedIdentity)) return null
  return record
}

export async function getProgramaGovernoManifesto(
  slug: string,
  loadRecord: ProgramaGovernoRecordLoader = loadProgramaGovernoRecord,
  resolveIdentity: ProgramaGovernoIdentityResolver = resolveProgramaGovernoIdentity,
): Promise<ProgramaGovernoManifestoPublico | null> {
  if (loadRecord === loadProgramaGovernoRecord && resolveIdentity === resolveProgramaGovernoIdentity) {
    const indexed = getProgramaGoverno2026ManifestoEntry(slug)?.manifesto
    if (indexed) return structuredClone(indexed)
  }
  const record = await loadMatchingRecord(slug, loadRecord, resolveIdentity)
  return record ? toProgramaGovernoManifestoPublico(record) : null
}

export async function getProgramaGovernoPublicChunk(
  slug: string,
  documentoId: string,
  cursor: string | null,
  loadDocument: ProgramaGovernoDocumentLoader = loadProgramaGovernoDocumento2026,
  loadManifesto: (slug: string) => Promise<ProgramaGovernoManifestoPublico | null> = getProgramaGovernoManifesto,
): Promise<ProgramaGovernoChunkResource> {
  const manifesto = await loadManifesto(slug)
  if (!manifesto) return { known: false, manifesto: null, chunk: null }
  if (manifesto.estado !== "aprovado") return { known: true, manifesto, chunk: null }

  const documentoIds = manifesto.documentos?.map((documento) => documento.documentoId)
    ?? [`${manifesto.fonte.uf}:${manifesto.fonte.sqCandidato}:01`]
  if (!documentoIds.includes(documentoId)) {
    return { known: false, manifesto: null, chunk: null }
  }
  const documento = await loadDocument(slug, documentoId)
  if (!documento) return { known: false, manifesto: null, chunk: null }
  const documentoIndex = documentoIds.indexOf(documentoId)
  try {
    assertProgramaGovernoDocumento(documento, {
      ano: manifesto.fonte.ano,
      cargo: manifesto.fonte.cargo,
      uf: manifesto.fonte.uf,
      sqCandidato: manifesto.fonte.sqCandidato,
      slug,
      nomeUrna: manifesto.fonte.nomeUrna,
      partido: manifesto.fonte.partido,
    }, documentoIndex + 1)
  } catch {
    return { known: false, manifesto: null, chunk: null }
  }
  const documentoEsperado = manifesto.documentos?.[documentoIndex]
  if (documentoEsperado && !programaGovernoDocumentoPublicoCorresponde(documento, documentoEsperado)) {
    return { known: false, manifesto: null, chunk: null }
  }
  return {
    known: true,
    manifesto,
    chunk: createProgramaGovernoChunk(documento, cursor),
  }
}

export async function getProgramaGovernoPublicResource(
  slug: string,
  loadRecord: ProgramaGovernoRecordLoader = loadProgramaGovernoRecord,
  resolveIdentity: ProgramaGovernoIdentityResolver = resolveProgramaGovernoIdentity,
): Promise<ProgramaGovernoPublicResource> {
  const record = await loadMatchingRecord(slug, loadRecord, resolveIdentity)
  if (!record) return { known: false, manifesto: null, data: null }
  const manifesto = toProgramaGovernoManifestoPublico(record)
  return {
    known: true,
    manifesto,
    data: manifesto.estado === "aprovado" ? toProgramaGovernoPublico(record) : null,
  }
}
