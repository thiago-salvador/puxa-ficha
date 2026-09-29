import { programaSecaoAnchor } from "@/lib/programa-governo-navigation"
import {
  countProgramaTextMatchesInIndex,
  createProgramaTextSearchIndex,
  findProgramaTextMatchesInIndex,
  type ProgramaTextMatch,
  type ProgramaTextSearchIndex,
} from "@/lib/programa-governo-text-search"

export type ProgramaBuscaFiltros = {
  q: string
  uf: string
  cargo: string
  candidato: string
  pagina: number
}

export type ProgramaBuscaCandidato = {
  slug: string
  nomeUrna: string
  partido: string
  cargo: string
  uf: string
  estado: string
}

export type ProgramaBuscaResultado = {
  slug: string
  nomeUrna: string
  partido: string
  cargo: string
  uf: string
  documentoId: string
  documentoNumero: number
  documentosTotal: number
  sourceSha256: string
  version: number
  coletadoEm: string
  secaoId: string
  paginaInicial: number
  paginaFinal: number
  trecho: string
  originalUrl: string
  fichaUrl: string
  origem: "pdftotext" | "ocr"
  paginasSemTexto: number
  matches: Array<ProgramaTextMatch>
}

export type ProgramaBuscaResposta = {
  total: number
  pagina: number
  paginas: number
  resultados: ProgramaBuscaResultado[]
  contagens: Array<{ slug: string; total: number }>
  semDocumento: ProgramaBuscaCandidato[]
}

export type ProgramaBuscaSecao = {
  id: string
  titulo: string
  nivel: number
  paginaInicial: number
  paginaFinal: number
  origem: "pdftotext" | "ocr" | "sem-texto"
  conteudo: string
  searchIndex?: ProgramaTextSearchIndex
}

export type ProgramaBuscaDocumento = {
  documentoId: string
  sourceSha256: string
  paginas: number
  secoes: readonly ProgramaBuscaSecao[]
  pacoteUrl: string | null
  pdfOriginalUrl: string | null
  coletadoEm: string
}

/** Server code builds these records from the canonical loaders; tests can inject fixtures. */
export type ProgramaBuscaRegistro = {
  candidato: ProgramaBuscaCandidato
  version: number
  estado: string
  documentos: readonly ProgramaBuscaDocumento[]
}

export type ProgramaBuscaColecao = {
  registros: readonly ProgramaBuscaRegistro[]
  candidatos?: readonly ProgramaBuscaCandidato[]
}

const PAGE_SIZE = 20
const SNIPPET_RADIUS = 180

function compareCandidate(a: ProgramaBuscaCandidato, b: ProgramaBuscaCandidato): number {
  return a.nomeUrna.localeCompare(b.nomeUrna, "pt-BR", { sensitivity: "base" })
    || a.slug.localeCompare(b.slug, "pt-BR")
}

function matchesCandidate(candidate: ProgramaBuscaCandidato, filtros: ProgramaBuscaFiltros): boolean {
  return (!filtros.uf || candidate.uf === filtros.uf)
    && (!filtros.cargo || candidate.cargo === filtros.cargo)
    && (!filtros.candidato || candidate.slug === filtros.candidato)
}

function sourceUrl(pdfOriginalUrl: string | null, pacoteUrl: string | null, pagina: number): string {
  if (pdfOriginalUrl) return `${pdfOriginalUrl.split("#", 1)[0]}#page=${pagina}`
  if (pacoteUrl) return pacoteUrl.split("#", 1)[0]
  throw new Error("Programa de governo aprovado sem URL oficial")
}

function fichaUrl(slug: string, documentoId: string, sourceSha256: string, secaoId: string): string {
  return `/candidato/${slug}?tab=programa&documentoId=${documentoId}&sourceSha256=${sourceSha256}&secao=${secaoId}#${programaSecaoAnchor(sourceSha256, secaoId)}`
}

function snippet(text: string, match: ProgramaTextMatch): { trecho: string; matches: Array<ProgramaTextMatch> } {
  const start = Math.max(0, match.start - SNIPPET_RADIUS)
  const end = Math.min(text.length, match.end + SNIPPET_RADIUS)
  const prefix = start > 0 ? "…" : ""
  const suffix = end < text.length ? "…" : ""
  return {
    trecho: `${prefix}${text.slice(start, end)}${suffix}`,
    matches: [{ start: prefix.length + match.start - start, end: prefix.length + match.end - start }],
  }
}

function indexForSection(section: ProgramaBuscaSecao): ProgramaTextSearchIndex {
  return section.searchIndex ?? createProgramaTextSearchIndex(section.conteudo)
}

function searchRecords(
  filtros: ProgramaBuscaFiltros,
  collection: ProgramaBuscaColecao,
): ProgramaBuscaResposta {
  const query = filtros.q.trim()
  const selected = [...collection.registros]
    .filter((record) => record.estado === "aprovado" && matchesCandidate(record.candidato, filtros))
    .sort((a, b) => compareCandidate(a.candidato, b.candidato))

  const counts = new Map<string, { candidato: ProgramaBuscaCandidato; total: number }>()
  let total = 0
  for (const record of selected) {
    let candidateTotal = 0
    for (const documento of record.documentos) {
      for (const section of documento.secoes) {
        if (section.origem === "sem-texto") continue
        candidateTotal += countProgramaTextMatchesInIndex(indexForSection(section), query)
      }
    }
    if (candidateTotal > 0) counts.set(record.candidato.slug, { candidato: record.candidato, total: candidateTotal })
    total += candidateTotal
  }

  const paginas = Math.ceil(total / PAGE_SIZE)
  const pagina = Math.min(filtros.pagina, Math.max(1, paginas))
  const inicio = (pagina - 1) * PAGE_SIZE
  const fim = inicio + PAGE_SIZE
  const resultados: ProgramaBuscaResultado[] = []
  if (inicio < total) {
    let ordinal = 0
    for (const record of selected) {
      const documentosTotal = record.documentos.length
      for (const [documentIndex, documento] of record.documentos.entries()) {
        const paginasSemTexto = documento.secoes.filter((section) => section.origem === "sem-texto").length
        for (const section of documento.secoes) {
          if (section.origem === "sem-texto") continue
          const sectionCount = countProgramaTextMatchesInIndex(indexForSection(section), query)
          if (sectionCount === 0 || ordinal + sectionCount <= inicio) {
            ordinal += sectionCount
            continue
          }
          const matches = findProgramaTextMatchesInIndex(indexForSection(section), query, section.conteudo)
          for (const match of matches) {
            if (ordinal >= inicio && ordinal < fim) {
              const excerpt = snippet(section.conteudo, match)
              resultados.push({
                slug: record.candidato.slug,
                nomeUrna: record.candidato.nomeUrna,
                partido: record.candidato.partido,
                cargo: record.candidato.cargo,
                uf: record.candidato.uf,
                documentoId: documento.documentoId,
                documentoNumero: documentIndex + 1,
                documentosTotal,
                sourceSha256: documento.sourceSha256,
                version: record.version,
                coletadoEm: documento.coletadoEm,
                secaoId: section.id,
                paginaInicial: section.paginaInicial,
                paginaFinal: section.paginaFinal,
                trecho: excerpt.trecho,
                originalUrl: sourceUrl(documento.pdfOriginalUrl, documento.pacoteUrl, section.paginaInicial),
                fichaUrl: fichaUrl(record.candidato.slug, documento.documentoId, documento.sourceSha256, section.id),
                origem: section.origem,
                paginasSemTexto,
                matches: excerpt.matches,
              })
            }
            ordinal += 1
            if (ordinal >= fim) break
          }
          if (ordinal >= fim) break
        }
        if (ordinal >= fim) break
      }
      if (ordinal >= fim) break
    }
  }
  const candidatos = collection.candidatos ?? collection.registros.map((record) => record.candidato)
  const semDocumento = candidatos
    .filter((candidate) => candidate.estado === "sem_documento_oficial" && matchesCandidate(candidate, filtros))
    .sort(compareCandidate)

  return {
    total,
    pagina,
    paginas,
    resultados,
    contagens: [...counts.values()]
      .sort((a, b) => compareCandidate(a.candidato, b.candidato))
      .map(({ candidato, total: count }) => ({ slug: candidato.slug, total: count })),
    semDocumento,
  }
}

export function createProgramaBuscaEngine(collection: ProgramaBuscaColecao) {
  return {
    buscarProgramas(filtros: ProgramaBuscaFiltros): ProgramaBuscaResposta {
      return searchRecords(filtros, collection)
    },
  }
}

export function buscarProgramasEmRegistros(
  filtros: ProgramaBuscaFiltros,
  registros: readonly ProgramaBuscaRegistro[],
  candidatos?: readonly ProgramaBuscaCandidato[],
): ProgramaBuscaResposta {
  return searchRecords(filtros, { registros, candidatos })
}
