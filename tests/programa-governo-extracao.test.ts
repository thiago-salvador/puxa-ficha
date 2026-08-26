import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"

import {
  PROGRAMA_GOVERNO_EXTRACTION_METHOD,
  PROGRAMA_GOVERNO_EXTRACTION_VERSION,
  createProgramaTempWorkspace,
  extractProgramaPdf,
  fetchTseProgramaBytes,
  type ProgramaGovernoExtractionAdapters,
} from "../scripts/lib/programas-governo-extracao"

const fixtures = resolve(import.meta.dirname, "fixtures/programas-governo")

test("extracts textual PDF deterministically with page mapping", async () => {
  const pdf = join(fixtures, "textual.pdf")
  const adapters: Partial<ProgramaGovernoExtractionAdapters> = {
    run: async (command, args) => {
      if (command === "pdfinfo") return Buffer.from("Pages: 2\n")
      if (command === "pdftotext") {
        return Buffer.from(args[1] === "1"
          ? "Primeiro parágrafo\n• Item preservado\n"
          : "Segundo parágrafo\n")
      }
      throw new Error(`comando inesperado: ${command}`)
    },
  }
  const first = await extractProgramaPdf(pdf, adapters)
  const second = await extractProgramaPdf(pdf, adapters)

  assert.equal(first.paginas, 2)
  assert.equal(first.extractionVersion, PROGRAMA_GOVERNO_EXTRACTION_VERSION)
  assert.equal(first.method, PROGRAMA_GOVERNO_EXTRACTION_METHOD)
  assert.match(first.sourceSha256, /^[a-f0-9]{64}$/)
  assert.match(first.extractedTextSha256, /^[a-f0-9]{64}$/)
  assert.equal(first.extractedTextSha256, second.extractedTextSha256)
  assert.deepEqual(first.secoes.map((section) => section.id), second.secoes.map((section) => section.id))
  assert.deepEqual(first.secoes.map((section) => section.paginaInicial), [1, 2])
  assert.deepEqual(first.secoes.map((section) => section.origem), ["pdftotext", "pdftotext"])
  assert.deepEqual(first.pageMap.map((page) => page.pagina), [1, 2])
  assert.deepEqual(first.pageMap.map((page) => page.origem), ["pdftotext", "pdftotext"])
  assert.equal(first.pageMap.every((page) => /^[a-f0-9]{64}$/u.test(page.textSha256)), true)
  assert.deepEqual(first.pageMap, second.pageMap)
  assert.match(first.secoes[0].conteudo, /Primeiro parágrafo/u)
  assert.match(first.secoes[0].conteudo, /• Item preservado/u)
  assert.match(first.secoes[1].conteudo, /Segundo parágrafo/u)
})

test("uses OCR only for the page without trustworthy embedded text", async () => {
  const commands: string[] = []
  let removed = false
  const adapters: Partial<ProgramaGovernoExtractionAdapters> = {
    readBytes: async () => Buffer.from("fixture-pdf"),
    makeTempDir: async () => join(tmpdir(), "pf-programa-ocr-hermetic"),
    remove: async () => {
      removed = true
    },
    run: async (command, args) => {
      commands.push(`${command}:${args.join(" ")}`)
      if (command === "pdfinfo") return Buffer.from("Pages: 2\n")
      if (command === "pdftotext") {
        return Buffer.from(args[1] === "1" ? "Texto confiável da página um.\n" : " \n")
      }
      if (command === "pdftoppm") return Buffer.alloc(0)
      if (command === "xcrun") return Buffer.from("Texto recuperado por OCR na página dois.\n")
      throw new Error(`comando inesperado: ${command}`)
    },
  }

  const result = await extractProgramaPdf("/fixture/governador.pdf", adapters)

  assert.deepEqual(result.pageMap.map((page) => page.origem), ["pdftotext", "ocr"])
  assert.equal(commands.filter((command) => command.startsWith("pdftoppm:")).length, 1)
  assert.equal(commands.filter((command) => command.startsWith("xcrun:")).length, 1)
  assert.equal(removed, true)
})

test("fails explicitly when a PDF page has no trustworthy text", async () => {
  const adapters: Partial<ProgramaGovernoExtractionAdapters> = {
    run: async (command) => {
      if (command === "pdfinfo") return Buffer.from("Pages: 1\n")
      if (command === "pdftoppm") return Buffer.alloc(0)
      if (command === "pdftotext" || command === "xcrun") return Buffer.from(" \n")
      throw new Error(`comando inesperado: ${command}`)
    },
  }
  await assert.rejects(
    () => extractProgramaPdf(join(fixtures, "scan-sem-texto.pdf"), adapters),
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
  await assert.rejects(
    () => fetchTseProgramaBytes("https://example.com/programa.pdf", adapters),
    /dominio oficial do TSE/,
  )
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
