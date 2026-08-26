import "server-only"

import {
  isProgramaGovernoPresidencia2026Slug,
  loadProgramaGovernoPresidencia2026,
} from "@/data/programas-governo-presidencia-2026"
import {
  toProgramaGovernoManifestoPublico,
  toProgramaGovernoPublico,
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

export type ProgramaGovernoRecordLoader = (slug: string) => Promise<ProgramaGovernoRegistro | null>

export const loadProgramaGovernoRecord: ProgramaGovernoRecordLoader = async (slug) => {
  if (!isProgramaGovernoPresidencia2026Slug(slug)) return null
  return loadProgramaGovernoPresidencia2026(slug)
}

export async function getProgramaGovernoManifesto(
  slug: string,
  loadRecord: ProgramaGovernoRecordLoader = loadProgramaGovernoRecord,
): Promise<ProgramaGovernoManifestoPublico | null> {
  const record = await loadRecord(slug)
  return record ? toProgramaGovernoManifestoPublico(record) : null
}

export async function getProgramaGovernoPublicResource(
  slug: string,
  loadRecord: ProgramaGovernoRecordLoader = loadProgramaGovernoRecord,
): Promise<ProgramaGovernoPublicResource> {
  const record = await loadRecord(slug)
  if (!record) return { known: false, manifesto: null, data: null }
  const manifesto = toProgramaGovernoManifestoPublico(record)
  return {
    known: true,
    manifesto,
    data: manifesto.estado === "aprovado" ? toProgramaGovernoPublico(record) : null,
  }
}
