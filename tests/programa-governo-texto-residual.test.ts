import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  assertProgramaGovernoRegistro,
  programaGovernoTextoResidual,
  programaGovernoTextoResidualLegado,
  type ProgramaGovernoRegistro,
} from "../src/lib/programa-governo"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DATA_DIRS = [
  "src/data/programas-governo/governadores-2026",
  "src/data/programas-governo/presidencia-2026",
].map((dir) => path.join(ROOT, dir))

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function publishedRecords(): ProgramaGovernoRegistro[] {
  return DATA_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => JSON.parse(readFileSync(path.join(dir, file), "utf8")) as ProgramaGovernoRegistro),
  )
}

test("residuo e vazio quando o resumo e exatamente a uniao das frases", () => {
  const frases = [{ texto: "Primeira frase verificada." }, { texto: "Segunda frase verificada." }]
  assert.equal(programaGovernoTextoResidual("Primeira frase verificada. Segunda frase verificada.", frases), "")
  assert.equal(programaGovernoTextoResidual("Primeira frase verificada.  Segunda frase verificada. ", frases), "")
  assert.equal(
    programaGovernoTextoResidual("Primeira frase verificada. Segunda frase verificada. Frase que ninguem verificou.", frases),
    "Frase que ninguem verificou",
  )
})

test("todo resumo publicado e a uniao das frases verificadas, salvo o legado congelado por hash", () => {
  const legado = new Map(programaGovernoTextoResidualLegado().map((item) => [item.slug, item]))
  const comResiduo: string[] = []
  for (const record of publishedRecords()) {
    if (!record.resumo) continue
    const residuo = programaGovernoTextoResidual(record.resumo.texto, record.resumo.frases)
    if (!residuo) continue
    const slug = record.fonte.slug
    comResiduo.push(String(slug))
    const entrada = slug ? legado.get(slug) : undefined
    assert.ok(entrada, `${slug}: prosa fora das frases verificadas sem entrada no legado`)
    assert.equal(entrada.textoSha256, sha256(record.resumo.texto), `${slug}: texto mudou; a entrada do legado precisa sair`)
    assert.equal(entrada.palavrasResiduais, residuo.split(" ").length, `${slug}: contagem residual divergente`)
  }
  assert.deepEqual(comResiduo.sort(), [...legado.keys()].sort(), "toda entrada do legado precisa corresponder a um registro com residuo")
})

test("o legado so diminui: 12 registros de 2026-09-02, nenhum novo", () => {
  assert.ok(programaGovernoTextoResidualLegado().length <= 12)
})

test("registro novo com prosa fora das frases falha fechado; o legado passa so com o hash congelado", () => {
  const [legado] = programaGovernoTextoResidualLegado()
  const record = publishedRecords().find((item) => item.fonte.slug === legado.slug)
  assert.ok(record?.resumo)
  assert.doesNotThrow(() => assertProgramaGovernoRegistro(record))

  const editado = structuredClone(record)
  editado.resumo!.texto = `${editado.resumo!.texto} Frase acrescentada sem evidencia.`
  assert.throws(() => assertProgramaGovernoRegistro(editado), /prosa fora das frases verificadas/u)

  const outroSlug = structuredClone(record)
  outroSlug.fonte = { ...outroSlug.fonte, slug: "candidato-inexistente" }
  assert.throws(() => assertProgramaGovernoRegistro(outroSlug), /prosa fora das frases verificadas/u)
})
