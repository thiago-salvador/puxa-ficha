import { chmod, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { CoverageMatrix } from "./audit-cobertura-fichas"

const FAMILIES = new Set(["projetos_lei", "votos_candidato", "gastos_parlamentares"])
const CLOSED = new Set(["publicado", "vazio_confirmado", "nao_aplicavel"])

export function selectParliamentaryOpenSlugs(matrix: Pick<CoverageMatrix, "cells">): string[] {
  if (!Array.isArray(matrix.cells)) throw new Error("matriz sem cells[]")
  const slugs = new Set<string>()
  for (const cell of matrix.cells) {
    if (!FAMILIES.has(cell.familia) || !cell.aplicavel || CLOSED.has(cell.estado)) continue
    if (typeof cell.slug !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(cell.slug)) throw new Error("slug inválido na matriz")
    slugs.add(cell.slug)
  }
  return [...slugs].sort()
}

async function main(): Promise<void> {
  const input = process.argv.find((arg) => arg.startsWith("--matrix="))?.slice(9)
  const output = process.argv.find((arg) => arg.startsWith("--out="))?.slice(6)
  if (!input || !output) throw new Error("uso: --matrix=<matriz privada.json> --out=<slugs privados.txt>")
  const matrix = JSON.parse(await readFile(resolve(input), "utf8")) as CoverageMatrix
  const slugs = selectParliamentaryOpenSlugs(matrix)
  await writeFile(resolve(output), slugs.length ? `${slugs.join("\n")}\n` : "", { mode: 0o600 })
  await chmod(resolve(output), 0o600)
  console.log(JSON.stringify({ slugs: slugs.length, output: resolve(output) }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
}
