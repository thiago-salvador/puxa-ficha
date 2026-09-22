/**
 * Migra registros de programa de governo para o schema v2: cada frase do resumo
 * ganha `id = programaGovernoFraseId(slug, texto)`.
 *
 * Dry-run por padrão: valida, conta e imprime o recibo sem gravar.
 * `--apply` grava os arquivos. A migração é idempotente.
 */
import { createHash } from "node:crypto"
import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  assertProgramaGovernoRegistro,
  programaGovernoFraseId,
  type ProgramaGovernoRegistro,
} from "../src/lib/programa-governo"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const PROGRAMAS_GOVERNO_DIRS = [
  "src/data/programas-governo/presidencia-2026",
  "src/data/programas-governo/governadores-2026",
] as const

export type MigracaoFraseIdsResultado = {
  arquivos: number
  migrados: number
  jaV2: number
  semResumo: number
  frases: number
  idsSha256: string
}

/** Retorna o registro em v2. Registro sem resumo só muda a versão. */
export function migrarRegistroParaV2(value: unknown): ProgramaGovernoRegistro {
  assertProgramaGovernoRegistro(value)
  if (value.version === 2) return value
  const slug = value.fonte.slug
  const resumo = value.resumo
  if (resumo && !slug) throw new Error("registro com resumo sem slug nao pode receber id de frase")
  const migrado: ProgramaGovernoRegistro = {
    ...value,
    version: 2,
    ...(resumo
      ? {
          resumo: {
            ...resumo,
            frases: resumo.frases.map((frase) => ({ id: programaGovernoFraseId(slug!, frase.texto), ...frase })),
          },
        }
      : {}),
  }
  assertProgramaGovernoRegistro(migrado)
  return migrado
}

export async function listarArquivosProgramas(root = ROOT): Promise<string[]> {
  const arquivos: string[] = []
  for (const dir of PROGRAMAS_GOVERNO_DIRS) {
    for (const nome of (await readdir(path.join(root, dir))).sort()) {
      if (nome.endsWith(".json")) arquivos.push(path.join(root, dir, nome))
    }
  }
  return arquivos
}

export async function migrarFraseIds(options: { apply: boolean; root?: string }): Promise<MigracaoFraseIdsResultado> {
  const resultado: MigracaoFraseIdsResultado = {
    arquivos: 0, migrados: 0, jaV2: 0, semResumo: 0, frases: 0, idsSha256: "",
  }
  const ids: string[] = []
  const vistos = new Map<string, string>()
  for (const arquivo of await listarArquivosProgramas(options.root)) {
    resultado.arquivos += 1
    const original = JSON.parse(await readFile(arquivo, "utf8")) as ProgramaGovernoRegistro
    const migrado = migrarRegistroParaV2(original)
    if (original.version === 2) resultado.jaV2 += 1
    else resultado.migrados += 1
    if (!migrado.resumo) resultado.semResumo += 1
    for (const frase of migrado.resumo?.frases ?? []) {
      const anterior = vistos.get(frase.id!)
      if (anterior) throw new Error(`colisao de id ${frase.id}: ${anterior} e ${path.basename(arquivo)}`)
      vistos.set(frase.id!, path.basename(arquivo))
      ids.push(frase.id!)
      resultado.frases += 1
    }
    if (options.apply && original.version !== 2) {
      await writeFile(arquivo, `${JSON.stringify(migrado, null, 2)}\n`)
    }
  }
  resultado.idsSha256 = createHash("sha256").update(ids.sort().join("\n")).digest("hex")
  return resultado
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply")
  const resultado = await migrarFraseIds({ apply })
  console.log(JSON.stringify({ modo: apply ? "apply" : "dry-run", ...resultado }, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
