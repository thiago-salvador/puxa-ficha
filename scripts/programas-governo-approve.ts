import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  assertProgramaGovernoRegistro,
  type ProgramaGovernoRegistro,
} from "../src/lib/programa-governo"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const RECORDS_DIR = path.join(
  ROOT,
  "src/data/programas-governo/presidencia-2026",
)

function argument(name: string) {
  const prefix = `--${name}=`
  const value = process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length)
  if (!value) throw new Error(`argumento obrigatório ausente: ${prefix}<valor>`)
  return value
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function approve() {
  const reviewer = argument("reviewer")
  const reviewedAt = argument("reviewed-at")
  assert(!Number.isNaN(Date.parse(reviewedAt)), "--reviewed-at deve ser uma data ISO válida")

  const files = (await readdir(RECORDS_DIR))
    .filter((file) => file.endsWith(".json"))
    .sort()
  assert(files.length === 13, `registros encontrados=${files.length}; esperado=13`)

  const approved: Array<{ filePath: string; record: ProgramaGovernoRegistro }> = []
  for (const file of files) {
    const filePath = path.join(RECORDS_DIR, file)
    const record = JSON.parse(await readFile(filePath, "utf8")) as ProgramaGovernoRegistro
    assertProgramaGovernoRegistro(record)
    assert(record.estado === "aguardando_revisao", `${file}: estado=${record.estado}; esperado=aguardando_revisao`)
    assert(record.extracao && record.resumo && record.julgamento, `${file}: conteúdo incompleto`)
    assert(record.julgamento.verdicts.length > 0, `${file}: julgamento vazio`)
    assert(
      record.julgamento.verdicts.every((item) => item.verdict === "yes"),
      `${file}: existe claim sem verdict yes`,
    )

    const next: ProgramaGovernoRegistro = {
      ...record,
      estado: "aprovado",
      revisao: {
        reviewer,
        reviewedAt,
        sourceSha256: record.extracao.sourceSha256,
        extractedTextSha256: record.extracao.extractedTextSha256,
      },
    }
    assertProgramaGovernoRegistro(next)
    approved.push({ filePath, record: next })
  }

  await Promise.all(
    approved.map(({ filePath, record }) =>
      writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8"),
    ),
  )
  console.log(`PROGRAMAS_APPROVAL_PASS candidatos=${approved.length} reviewer=${reviewer} reviewedAt=${reviewedAt}`)
}

void approve().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
