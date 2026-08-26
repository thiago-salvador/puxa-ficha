import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { promisify } from "node:util"

import type { ProgramaGovernoExtracao, ProgramaGovernoSecao } from "../../src/lib/programa-governo"
import { stripAccents } from "../../src/lib/strip-accents"

const execFileAsync = promisify(execFile)
const OFFICIAL_TSE_HOSTS = new Set(["cdn.tse.jus.br", "dadosabertos.tse.jus.br", "divulgacandcontas.tse.jus.br"])
export const PROGRAMA_GOVERNO_EXTRACTION_VERSION = "programa-governo-extracao-v2" as const
export const PROGRAMA_GOVERNO_EXTRACTION_METHOD = "pdftotext-pagewise-with-ocr-fallback" as const

export type ProgramaGovernoPaginaMapeada = {
  pagina: number
  origem: ProgramaGovernoSecao["origem"]
  textSha256: string
}

export type ProgramaGovernoExtracaoRastreavel = ProgramaGovernoExtracao & {
  extractionVersion: typeof PROGRAMA_GOVERNO_EXTRACTION_VERSION
  method: typeof PROGRAMA_GOVERNO_EXTRACTION_METHOD
  pageMap: ProgramaGovernoPaginaMapeada[]
}

export class ProgramaGovernoExtractionError extends Error {
  constructor(message: string) {
    super(`extracao_falhou: ${message}`)
    this.name = "ProgramaGovernoExtractionError"
  }
}

export type ProgramaGovernoExtractionAdapters = {
  readBytes(path: string): Promise<Buffer>
  run(command: string, args: string[]): Promise<Buffer>
  makeTempDir(): Promise<string>
  remove(path: string): Promise<void>
  fetchBytes(url: string): Promise<Buffer>
}

const defaultAdapters: ProgramaGovernoExtractionAdapters = {
  readBytes: readFile,
  async run(command, args) {
    const result = await execFileAsync(command, args, { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 })
    return result.stdout as Buffer
  },
  makeTempDir: () => mkdtemp(join(tmpdir(), "puxa-ficha-programa-governo-")),
  remove: (path) => rm(path, { recursive: true, force: true }),
  async fetchBytes(url) {
    const response = await fetch(url, { headers: { Accept: "application/pdf, application/zip" } })
    if (!response.ok) throw new Error(`TSE respondeu HTTP ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
  },
}

function adaptersWith(overrides: Partial<ProgramaGovernoExtractionAdapters> = {}): ProgramaGovernoExtractionAdapters {
  return { ...defaultAdapters, ...overrides }
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function normalizePageText(raw: string): string {
  return raw
    .replace(/\f/g, "")
    .split(/\r?\n/u)
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()
}

function isTrustworthyText(text: string): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0
  const digits = text.match(/\p{N}/gu)?.length ?? 0
  const replacementCharacters = text.match(/�/gu)?.length ?? 0
  // Capas e separadores oficiais podem conter somente o numero da pagina.
  // Ausencia total continua sendo falha, pois pode indicar um scan sem OCR.
  return letters + digits >= 1 && replacementCharacters <= Math.max(2, Math.floor(Math.max(letters, 1) * 0.01))
}

function stableId(title: string, page: number, used: Set<string>): string {
  const base = stripAccents(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72)
    .replace(/-$/g, "") || `pagina-${page}`
  let candidate = base
  let suffix = 2
  while (used.has(candidate)) candidate = `${base}-${suffix++}`
  used.add(candidate)
  return candidate
}

type ExtractedPage = { text: string; origin: "pdftotext" | "ocr" | "sem-texto" }

function sectionsFromPages(pages: ExtractedPage[]): ProgramaGovernoSecao[] {
  const used = new Set<string>()
  return pages.map(({ text: content, origin }, index) => {
    const page = index + 1
    const firstLine = content.split("\n").find((line) => line.trim().length > 0)?.trim() ?? `Página ${page}`
    const title = firstLine.length > 120 ? `Página ${page}` : firstLine
    return {
      id: stableId(title, page, used),
      titulo: title,
      nivel: 1,
      paginaInicial: page,
      paginaFinal: page,
      origem: origin,
      conteudo: content,
    }
  })
}

export function assertTseProgramaUrl(
  raw: string,
): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error("fonte deve ser uma URL valida")
  }
  if (url.protocol !== "https:" || !OFFICIAL_TSE_HOSTS.has(url.hostname)) {
    throw new Error("fonte deve usar HTTPS em dominio oficial do TSE")
  }
  return url
}

export async function createProgramaTempWorkspace(
  overrides: Partial<ProgramaGovernoExtractionAdapters> = {},
): Promise<{ directory: string; cleanup(): Promise<void> }> {
  const adapters = adaptersWith(overrides)
  const directory = await adapters.makeTempDir()
  return { directory, cleanup: () => adapters.remove(directory) }
}

export async function fetchTseProgramaBytes(
  rawUrl: string,
  overrides: Partial<ProgramaGovernoExtractionAdapters> = {},
): Promise<Buffer> {
  assertTseProgramaUrl(rawUrl)
  return adaptersWith(overrides).fetchBytes(rawUrl)
}

export async function extractProgramaPdf(
  pdfPath: string,
  overrides: Partial<ProgramaGovernoExtractionAdapters> = {},
): Promise<ProgramaGovernoExtracaoRastreavel> {
  const adapters = adaptersWith(overrides)
  const bytes = await adapters.readBytes(pdfPath)
  let info: string
  try {
    info = (await adapters.run("pdfinfo", [pdfPath])).toString("utf8")
  } catch (error) {
    throw new ProgramaGovernoExtractionError(`pdfinfo nao conseguiu ler o documento: ${String(error)}`)
  }
  const pageMatch = info.match(/^Pages:\s+(\d+)$/mu)
  if (!pageMatch) throw new ProgramaGovernoExtractionError("numero de paginas ausente no pdfinfo")
  const paginas = Number(pageMatch[1])
  if (!Number.isInteger(paginas) || paginas < 1) throw new ProgramaGovernoExtractionError("numero de paginas invalido")

  const pageTexts: ExtractedPage[] = []
  let ocrWorkspace: Awaited<ReturnType<typeof createProgramaTempWorkspace>> | null = null
  try {
    for (let page = 1; page <= paginas; page += 1) {
    let raw: string
    try {
      raw = (await adapters.run("pdftotext", ["-f", String(page), "-l", String(page), "-enc", "UTF-8", pdfPath, "-"])).toString("utf8")
    } catch (error) {
      throw new ProgramaGovernoExtractionError(`pagina ${page} nao pôde ser extraida: ${String(error)}`)
    }
      let text = normalizePageText(raw)
      let origin: ExtractedPage["origin"] = "pdftotext"
      if (!isTrustworthyText(text)) {
        ocrWorkspace ??= await createProgramaTempWorkspace(adapters)
        const prefix = resolve(ocrWorkspace.directory, `pagina-${page}`)
        try {
          await adapters.run("pdftoppm", ["-f", String(page), "-l", String(page), "-png", "-r", "150", "-singlefile", pdfPath, prefix])
          const script = resolve(import.meta.dirname, "ocr-programa-governo.swift")
          text = normalizePageText((await adapters.run("xcrun", ["swift", script, `${prefix}.png`])).toString("utf8"))
          origin = "ocr"
        } catch (error) {
          throw new ProgramaGovernoExtractionError(`pagina ${page} sem texto confiavel e OCR indisponivel: ${String(error)}`)
        }
      }
      if (!isTrustworthyText(text)) {
        text = "[Página sem conteúdo textual no documento original.]"
        origin = "sem-texto"
      }
      pageTexts.push({ text, origin })
    }
  } finally {
    await ocrWorkspace?.cleanup()
  }

  if (pageTexts.every((page) => page.origin === "sem-texto")) {
    throw new ProgramaGovernoExtractionError("documento inteiro sem texto confiavel apos OCR")
  }

  const canonicalText = pageTexts.map((page) => page.text).join("\n\f\n")
  return {
    extractionVersion: PROGRAMA_GOVERNO_EXTRACTION_VERSION,
    method: PROGRAMA_GOVERNO_EXTRACTION_METHOD,
    sourceSha256: sha256(bytes),
    extractedTextSha256: sha256(canonicalText),
    paginas,
    secoes: sectionsFromPages(pageTexts),
    pageMap: pageTexts.map((page, index) => ({
      pagina: index + 1,
      origem: page.origin,
      textSha256: sha256(page.text),
    })),
  }
}
