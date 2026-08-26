import "server-only"

import {
  getProgramaGovernoPresidencia2026ManifestoEntry,
  programasGovernoPresidencia2026Identidades,
} from "@/data/programas-governo-presidencia-2026"
import {
  assertProgramaGovernoIdentidade,
  assertProgramaGovernoIdentidadeCorresponde,
  assertProgramaGovernoDocumento,
  assertProgramaGovernoRegistro,
  programaGovernoDocumentoPublicoCorresponde,
  programaGovernoChave,
  type ProgramaGovernoIdentidade,
  type ProgramaGovernoDocumento,
  type ProgramaGovernoManifestoPublico,
  type ProgramaGovernoRegistro,
} from "@/lib/programa-governo"

export type ProgramaGovernoDocumentoServerEntry = {
  documentoId: string
  load: () => Promise<{ default: unknown }>
}

export type ProgramaGovernoManifestoServerEntry = {
  identidade: ProgramaGovernoIdentidade
  load: () => Promise<{ default: unknown }>
  manifesto?: ProgramaGovernoManifestoPublico
  documentos?: readonly ProgramaGovernoDocumentoServerEntry[]
}

export type ProgramaGovernoManifestoServer = {
  identidades: readonly ProgramaGovernoIdentidade[]
  getBySlug: (slug: string) => ProgramaGovernoManifestoServerEntry | null
  loadBySlug: (slug: string) => Promise<ProgramaGovernoRegistro | null>
  loadDocumentoBySlug: (slug: string, documentoId: string) => Promise<ProgramaGovernoDocumento | null>
}

export function createProgramaGovernoManifestoServer(
  entries: readonly ProgramaGovernoManifestoServerEntry[],
): ProgramaGovernoManifestoServer {
  const bySlug = new Map<string, ProgramaGovernoManifestoServerEntry>()
  const compoundKeys = new Set<string>()
  const stableIdentidades: ProgramaGovernoIdentidade[] = []

  for (const [index, entry] of entries.entries()) {
    assertProgramaGovernoIdentidade(entry.identidade, `manifesto[${index}].identidade`)
    const stableEntry = Object.freeze({
      identidade: Object.freeze({ ...entry.identidade }),
      load: entry.load,
      ...(entry.manifesto ? { manifesto: Object.freeze(structuredClone(entry.manifesto)) } : {}),
      ...(entry.documentos
        ? {
            documentos: Object.freeze(entry.documentos.map((documento) => Object.freeze({ ...documento }))),
          }
        : {}),
    })
    const key = programaGovernoChave(stableEntry.identidade)
    if (compoundKeys.has(key)) throw new Error(`manifesto: identidade eleitoral duplicada ${key}`)
    compoundKeys.add(key)
    stableIdentidades.push(stableEntry.identidade)

    if (stableEntry.manifesto) {
      const publicIdentity = stableEntry.manifesto.fonte
      if (
        publicIdentity.ano !== stableEntry.identidade.ano
        || publicIdentity.cargo !== stableEntry.identidade.cargo
        || publicIdentity.uf !== stableEntry.identidade.uf
        || publicIdentity.sqCandidato !== stableEntry.identidade.sqCandidato
        || publicIdentity.nomeUrna !== stableEntry.identidade.nomeUrna
        || publicIdentity.partido !== stableEntry.identidade.partido
      ) {
        throw new Error(`manifesto: identidade publica diverge de ${key}`)
      }
      if (
        stableEntry.manifesto.estado !== "aprovado"
        && (
          stableEntry.manifesto.resumo !== undefined
          || stableEntry.manifesto.paginas !== undefined
          || stableEntry.manifesto.reviewedAt !== undefined
        )
      ) {
        throw new Error(`manifesto: estado nao aprovado expoe conteudo de ${key}`)
      }
      if (
        stableEntry.manifesto.estado === "aprovado"
        && (
          stableEntry.manifesto.resumo === undefined
          || stableEntry.manifesto.paginas === undefined
          || stableEntry.manifesto.reviewedAt === undefined
        )
      ) {
        throw new Error(`manifesto: estado aprovado incompleto em ${key}`)
      }
    }

    for (const [documentoIndex, documento] of (stableEntry.documentos ?? []).entries()) {
      const sufixo = String(documentoIndex + 1).padStart(2, "0")
      const esperado = `${stableEntry.identidade.uf}:${stableEntry.identidade.sqCandidato}:${sufixo}`
      if (documento.documentoId !== esperado) {
        throw new Error(`manifesto: documento fora da sequencia ${esperado}`)
      }
    }
    const publicIds = stableEntry.manifesto?.documentos?.map(({ documentoId }) => documentoId)
    const loaderIds = stableEntry.documentos?.map(({ documentoId }) => documentoId)
    if ((publicIds === undefined) !== (loaderIds === undefined)) {
      throw new Error("manifesto: indice multidocumento e loaders devem coexistir")
    }
    if (publicIds && loaderIds && JSON.stringify(publicIds) !== JSON.stringify(loaderIds)) {
      throw new Error("manifesto: loaders divergem dos documentos publicos")
    }

    const { slug } = stableEntry.identidade
    if (slug === null) continue
    if (bySlug.has(slug)) throw new Error(`manifesto: slug duplicado ${slug}`)
    bySlug.set(slug, stableEntry)
  }

  return Object.freeze({
    identidades: Object.freeze(stableIdentidades),
    getBySlug(slug) {
      return bySlug.get(slug) ?? null
    },
    async loadBySlug(slug) {
      const entry = bySlug.get(slug)
      if (!entry) return null
      const record = (await entry.load()).default
      assertProgramaGovernoRegistro(record)
      assertProgramaGovernoIdentidadeCorresponde(record.fonte, entry.identidade)
      return record
    },
    async loadDocumentoBySlug(slug, documentoId) {
      const entry = bySlug.get(slug)
      if (!entry) return null
      const documentoIndex = entry.documentos?.findIndex((item) => item.documentoId === documentoId) ?? -1
      if (documentoIndex >= 0 && entry.documentos) {
        if (entry.manifesto?.estado !== "aprovado") return null
        const documento = (await entry.documentos[documentoIndex].load()).default
        assertProgramaGovernoDocumento(
          documento,
          entry.identidade,
          documentoIndex + 1,
          `manifesto.${slug}.documentos[${documentoIndex}]`,
        )
        const publicDocument = entry.manifesto?.documentos?.[documentoIndex]
        if (publicDocument && !programaGovernoDocumentoPublicoCorresponde(documento, publicDocument)) {
          throw new Error(`manifesto: documento carregado diverge de ${publicDocument.documentoId}`)
        }
        return documento
      }
      if (entry.documentos) return null

      const legacyPresidency = entry.identidade.cargo === "PRESIDENTE" && entry.identidade.uf === "BR"
      if (!legacyPresidency) return null
      const legacyId = `${entry.identidade.uf}:${entry.identidade.sqCandidato}:01`
      if (documentoId !== legacyId) return null

      const record = await this.loadBySlug(slug)
      if (!record || record.estado !== "aprovado") return null
      if (record.documentos) return null
      if (!record.extracao) return null
      if (typeof record.fonte.arquivoNome !== "string" || typeof record.fonte.arquivoNoPacote !== "string") {
        return null
      }
      return {
        documentoId: legacyId,
        fonte: {
          arquivoNome: record.fonte.arquivoNome,
          arquivoNoPacote: record.fonte.arquivoNoPacote,
          pacoteUrl: record.fonte.pacoteUrl,
          datasetUrl: record.fonte.datasetUrl,
          pdfOriginalUrl: record.fonte.pdfOriginalUrl,
          coletadoEm: record.fonte.coletadoEm,
        },
        extracao: record.extracao,
      }
    },
  })
}

const presidentialEntries = programasGovernoPresidencia2026Identidades.map((identidade) => {
  const entry = getProgramaGovernoPresidencia2026ManifestoEntry(identidade.slug ?? "")
  if (!entry) throw new Error(`manifesto presidencial ausente para ${identidade.slug ?? "slug nulo"}`)
  return entry
})

export const programasGoverno2026Manifesto = createProgramaGovernoManifestoServer(
  presidentialEntries,
)

export const programasGoverno2026Identidades = programasGoverno2026Manifesto.identidades

export function getProgramaGoverno2026ManifestoEntry(
  slug: string,
): ProgramaGovernoManifestoServerEntry | null {
  return programasGoverno2026Manifesto.getBySlug(slug)
}

export function loadProgramaGoverno2026(slug: string): Promise<ProgramaGovernoRegistro | null> {
  return programasGoverno2026Manifesto.loadBySlug(slug)
}

export function loadProgramaGovernoDocumento2026(
  slug: string,
  documentoId: string,
): Promise<ProgramaGovernoDocumento | null> {
  return programasGoverno2026Manifesto.loadDocumentoBySlug(slug, documentoId)
}
