import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  assertProgramaGovernoRegistro,
  toProgramaGovernoManifestoPublico,
  type ProgramaGovernoRegistro,
} from "../src/lib/programa-governo"

const ROOT = path.resolve(import.meta.dirname, "..")
const RECORDS_DIR = path.join(ROOT, "src/data/programas-governo/governadores-2026")
const OUTPUT = path.join(ROOT, "src/data/programas-governo-governadores-2026.ts")

function quoted(value: unknown): string {
  return JSON.stringify(value)
}

async function main(): Promise<void> {
  const files = (await readdir(RECORDS_DIR)).filter((file) => file.endsWith(".json")).sort()
  if (files.length === 0) throw new Error("nenhum programa estadual aprovado")

  const records = await Promise.all(files.map(async (file) => {
    const record = JSON.parse(await readFile(path.join(RECORDS_DIR, file), "utf8")) as ProgramaGovernoRegistro
    assertProgramaGovernoRegistro(record)
    if (!["aprovado", "sem_documento_oficial", "documento_anunciado"].includes(record.estado)) {
      throw new Error(`${file}: estado não publicável no manifesto`)
    }
    if (record.fonte.cargo !== "GOVERNADOR") throw new Error(`${file}: cargo divergente`)
    if (!record.fonte.slug || file !== `${record.fonte.slug}.json`) throw new Error(`${file}: slug divergente`)
    if (record.estado === "aprovado" && !record.documentos?.length) {
      throw new Error(`${file}: documentos ausentes`)
    }
    if (record.estado === "sem_documento_oficial" && record.documentos !== undefined) {
      throw new Error(`${file}: ausência oficial não pode carregar documentos`)
    }
    return record
  }))

  const slugs = records.map((record) => record.fonte.slug!)
  if (new Set(slugs).size !== slugs.length) throw new Error("slug estadual duplicado")

  const entries = records.map((record) => {
    const fonte = record.fonte
    const identity = {
      ano: fonte.ano,
      cargo: fonte.cargo,
      uf: fonte.uf,
      sqCandidato: fonte.sqCandidato,
      slug: fonte.slug,
      nomeUrna: fonte.nomeUrna,
      partido: fonte.partido,
    }
    const documentIds = record.documentos?.map(({ documentoId }) => documentoId) ?? []
    const manifesto = toProgramaGovernoManifestoPublico(record)
    return [
      `  ${quoted(fonte.slug)}: {`,
      `    identidade: ${quoted(identity)},`,
      `    manifesto: ${quoted(manifesto)},`,
      `    load: () => import("./programas-governo/governadores-2026/${fonte.slug}.json"),`,
      `    documentoIds: ${quoted(documentIds)},`,
      "  }",
    ].join("\n")
  }).join(",\n")

  const source = [
    "// Arquivo gerado por scripts/programas-governo-governadores-2026-manifesto.ts.",
    "// Nao editar manualmente.",
    'import "server-only"',
    "",
    "import {",
    "  assertProgramaGovernoRegistro,",
    "  type ProgramaGovernoIdentidade,",
    "  type ProgramaGovernoManifestoPublico,",
    '} from "@/lib/programa-governo"',
    "",
    "type GovernorEntry = {",
    "  identidade: ProgramaGovernoIdentidade",
    "  manifesto: ProgramaGovernoManifestoPublico",
    "  load: () => Promise<{ default: unknown }>",
    "  documentoIds: readonly string[]",
    "}",
    "",
    "const entries = {",
    entries,
    "} satisfies Record<string, GovernorEntry>",
    "",
    "export type ProgramaGovernoGovernador2026Slug = keyof typeof entries",
    "",
    "export const programasGovernoGovernadores2026Identidades = Object.freeze(",
    "  Object.values(entries).map((entry) => Object.freeze({ ...entry.identidade })),",
    ")",
    "",
    "function isGovernorSlug(value: string): value is ProgramaGovernoGovernador2026Slug {",
    "  return Object.hasOwn(entries, value)",
    "}",
    "",
    "export function getProgramaGovernoGovernador2026ManifestoEntry(slug: string) {",
    "  if (!isGovernorSlug(slug)) return null",
    "  const entry = entries[slug]",
    "  const documentos = entry.documentoIds.length > 0 ? entry.documentoIds.map((documentoId, index) => ({",
    "    documentoId,",
    "    load: async () => {",
    "      const record = (await entry.load()).default",
    "      assertProgramaGovernoRegistro(record)",
    "      const documento = record.documentos?.[index]",
    "      if (!documento || documento.documentoId !== documentoId) {",
    "        throw new Error(`${slug}: documento ${documentoId} ausente ou fora de ordem`)",
    "      }",
    "      return { default: documento }",
    "    },",
    "  })) : undefined",
    "  return {",
    "    identidade: entry.identidade,",
    "    manifesto: entry.manifesto,",
    "    load: entry.load,",
    "    ...(documentos ? { documentos } : {}),",
    "  }",
    "}",
    "",
  ].join("\n")

  await writeFile(OUTPUT, source, "utf8")
  console.log(`PROGRAMAS_GOV_MANIFESTO_PASS registros=${records.length} destino=${OUTPUT}`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
