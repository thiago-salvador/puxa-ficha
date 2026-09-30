import "server-only"

import {
  getProgramaGoverno2026ManifestoEntry,
  loadProgramaGoverno2026,
  programasGoverno2026Identidades,
} from "@/data/programas-governo-2026"
import type {
  ProgramaGovernoDocumento,
  ProgramaGovernoRegistro,
  ProgramaGovernoSecao,
} from "@/lib/programa-governo"
import {
  createProgramaTextSearchIndex,
} from "@/lib/programa-governo-text-search"
import {
  createProgramaBuscaEngine,
  type ProgramaBuscaCandidato,
  type ProgramaBuscaColecao,
  type ProgramaBuscaDocumento,
  type ProgramaBuscaFiltros,
  type ProgramaBuscaRegistro,
  type ProgramaBuscaResposta,
  type ProgramaBuscaSecao,
} from "@/lib/programa-governo-busca"

const UF_VALUES = new Set([
  "BR", "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
])
const CARGO_VALUES = new Set(["PRESIDENTE", "GOVERNADOR"])
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export class ProgramaBuscaFiltroError extends Error {
  readonly status = 400

  constructor(message: string) {
    super(message)
    this.name = "ProgramaBuscaFiltroError"
  }
}

export function parseProgramaBuscaFiltros(params: URLSearchParams): ProgramaBuscaFiltros {
  if (params.has("tema")) throw new ProgramaBuscaFiltroError("O filtro tema não é suportado.")

  const q = (params.get("q") ?? "").trim()
  if (q.length > 100) throw new ProgramaBuscaFiltroError("A busca deve ter no máximo 100 caracteres.")
  const uf = (params.get("uf") ?? "").trim().toUpperCase()
  if (uf && !UF_VALUES.has(uf)) throw new ProgramaBuscaFiltroError("UF inválida.")
  const cargo = (params.get("cargo") ?? "").trim().toUpperCase()
  if (cargo && !CARGO_VALUES.has(cargo)) throw new ProgramaBuscaFiltroError("Cargo inválido.")
  const candidato = (params.get("candidato") ?? "").trim()
  if (candidato && !SLUG_PATTERN.test(candidato)) throw new ProgramaBuscaFiltroError("Candidato inválido.")

  const rawPage = params.get("pagina") ?? "1"
  if (!/^\d+$/.test(rawPage)) throw new ProgramaBuscaFiltroError("Página inválida.")
  const pagina = Number(rawPage)
  if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 100_000) {
    throw new ProgramaBuscaFiltroError("Página inválida.")
  }

  return { q, uf, cargo, candidato, pagina }
}

function candidatoFromIdentity(
  identity: { slug: string | null; nomeUrna: string; partido: string; cargo: string; uf: string },
  estado: string,
): ProgramaBuscaCandidato {
  if (!identity.slug) throw new Error("Identidade de programa sem slug")
  return {
    slug: identity.slug,
    nomeUrna: identity.nomeUrna,
    partido: identity.partido,
    cargo: identity.cargo,
    uf: identity.uf,
    estado,
  }
}

function toBuscaSecao(section: ProgramaGovernoSecao): ProgramaBuscaSecao {
  return {
    ...section,
    searchIndex: createProgramaTextSearchIndex(section.conteudo, { withOffsets: false }),
  }
}

function toBuscaDocumento(documento: ProgramaGovernoDocumento): ProgramaBuscaDocumento {
  return {
    documentoId: documento.documentoId,
    sourceSha256: documento.extracao.sourceSha256,
    paginas: documento.extracao.paginas,
    secoes: documento.extracao.secoes.map(toBuscaSecao),
    pacoteUrl: documento.fonte.pacoteUrl,
    pdfOriginalUrl: documento.fonte.pdfOriginalUrl,
    coletadoEm: documento.fonte.coletadoEm,
  }
}

function legacyDocument(record: ProgramaGovernoRegistro): ProgramaBuscaDocumento {
  if (!record.extracao) throw new Error(`Programa aprovado sem extração: ${record.fonte.slug}`)
  if (!record.fonte.slug) throw new Error("Programa aprovado sem slug")
  return {
    documentoId: `${record.fonte.uf}:${record.fonte.sqCandidato}:01`,
    sourceSha256: record.extracao.sourceSha256,
    paginas: record.extracao.paginas,
    secoes: record.extracao.secoes.map(toBuscaSecao),
    pacoteUrl: record.fonte.pacoteUrl,
    pdfOriginalUrl: record.fonte.pdfOriginalUrl,
    coletadoEm: record.fonte.coletadoEm,
  }
}

function toBuscaRegistro(record: ProgramaGovernoRegistro, candidato: ProgramaBuscaCandidato): ProgramaBuscaRegistro {
  const documentos = record.documentos?.map(toBuscaDocumento) ?? [legacyDocument(record)]
  if (documentos.length === 0) throw new Error(`Programa aprovado sem documentos: ${candidato.slug}`)
  return { candidato, version: record.version, estado: record.estado, documentos }
}

export function getProgramaBuscaCandidatos(): ProgramaBuscaCandidato[] {
  return programasGoverno2026Identidades
    .filter((identity) => identity.slug !== null)
    .map((identity) => {
      const entry = getProgramaGoverno2026ManifestoEntry(identity.slug!)
      // Presidential entries predate the generated manifesto index but are all
      // approved records in the canonical loader.
      return candidatoFromIdentity(identity, entry?.manifesto?.estado ?? "aprovado")
    })
    .sort((a, b) => a.nomeUrna.localeCompare(b.nomeUrna, "pt-BR", { sensitivity: "base" }) || a.slug.localeCompare(b.slug))
}

async function buildProgramaBuscaColecao(): Promise<ProgramaBuscaColecao> {
  const candidatos = getProgramaBuscaCandidatos()
  const bySlug = new Map(candidatos.map((candidate) => [candidate.slug, candidate]))
  const registros: ProgramaBuscaRegistro[] = []

  // Deliberately sequential: loading 219 JSON documents at once needlessly
  // duplicates their parsed object graphs and spikes server memory.
  for (const identity of programasGoverno2026Identidades) {
    if (!identity.slug) continue
    const candidato = bySlug.get(identity.slug)
    if (!candidato) throw new Error(`Candidato de busca ausente: ${identity.slug}`)
    if (candidato.estado !== "aprovado") {
      registros.push({ candidato, version: 0, estado: candidato.estado, documentos: [] })
      continue
    }
    const record = await loadProgramaGoverno2026(identity.slug)
    if (!record) throw new Error(`Loader de programa não retornou registro: ${identity.slug}`)
    if (record.estado !== "aprovado") throw new Error(`Estado divergente no programa: ${identity.slug}`)
    registros.push(toBuscaRegistro(record, candidato))
  }

  return { registros, candidatos }
}

export function createProgramaBuscaIndexLoader(
  load: () => Promise<ProgramaBuscaColecao> = buildProgramaBuscaColecao,
) {
  let promise: Promise<ProgramaBuscaColecao> | null = null
  const get = () => {
    if (!promise) {
      promise = load().catch((error) => {
        promise = null
        throw error
      })
    }
    return promise
  }
  return { get }
}

const defaultIndex = createProgramaBuscaIndexLoader()

export async function buscarProgramas(filtros: ProgramaBuscaFiltros): Promise<ProgramaBuscaResposta> {
  const collection = await defaultIndex.get()
  return createProgramaBuscaEngine(collection).buscarProgramas(filtros)
}
