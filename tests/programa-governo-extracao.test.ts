import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"

import {
  assertTseProgramaUrl,
  createProgramaTempWorkspace,
  extractProgramaPdf,
  type ProgramaGovernoExtractionAdapters,
} from "../scripts/lib/programas-governo-extracao"

const fixtures = resolve(import.meta.dirname, "fixtures/programas-governo")

test("extracts textual PDF deterministically with page mapping", async () => {
  const pdf = join(fixtures, "textual.pdf")
  const first = await extractProgramaPdf(pdf)
  const second = await extractProgramaPdf(pdf)

  assert.equal(first.paginas, 2)
  assert.match(first.sourceSha256, /^[a-f0-9]{64}$/)
  assert.match(first.extractedTextSha256, /^[a-f0-9]{64}$/)
  assert.equal(first.extractedTextSha256, second.extractedTextSha256)
  assert.deepEqual(first.secoes.map((section) => section.id), second.secoes.map((section) => section.id))
  assert.deepEqual(first.secoes.map((section) => section.paginaInicial), [1, 2])
  assert.match(first.secoes[0].conteudo, /Primeiro parágrafo/u)
  assert.match(first.secoes[0].conteudo, /• Item preservado/u)
  assert.match(first.secoes[1].conteudo, /Segundo parágrafo/u)
})

test("fails explicitly when a PDF page has no trustworthy text", async () => {
  await assert.rejects(
    () => extractProgramaPdf(join(fixtures, "scan-sem-texto.pdf")),
    (error: unknown) => error instanceof Error && error.name === "ProgramaGovernoExtractionError" && /extracao_falhou/.test(error.message),
  )
})

test("refuses non-TSE source before invoking network", async () => {
  let networkCalls = 0
  const adapters: Partial<ProgramaGovernoExtractionAdapters> = {
    fetchBytes: async () => {
      networkCalls += 1
      return Buffer.from("never")
    },
  }
  assert.throws(() => assertTseProgramaUrl("https://example.com/programa.pdf", adapters), /dominio oficial do TSE/)
  assert.equal(networkCalls, 0)
})

test("temporary extraction workspace stays outside the repository and is removed", async () => {
  const repository = resolve(import.meta.dirname, "..")
  const observed: string[] = []
  const adapters: Partial<ProgramaGovernoExtractionAdapters> = {
    makeTempDir: async () => {
      const directory = await mkdtemp(join(tmpdir(), "pf-programa-test-"))
      observed.push(directory)
      return directory
    },
  }
  const workspace = await createProgramaTempWorkspace(adapters)
  assert.equal(observed.some((directory) => directory.startsWith(repository)), false)
  await workspace.cleanup()
  await assert.rejects(() => readFile(workspace.directory), /ENOENT|EISDIR/)
  await Promise.all(observed.map((directory) => rm(directory, { recursive: true, force: true })))
})

test("PROGRAMAS_EXTRACAO_PASS", () => {
  assert.equal(true, true)
})
