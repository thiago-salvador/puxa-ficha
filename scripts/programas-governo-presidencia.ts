import { execFile } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { promisify } from "node:util"

import fontesJson from "./data/programas-governo-presidencia-2026-fontes.json"
import {
  assertTseProgramaUrl,
  createProgramaTempWorkspace,
  extractProgramaPdf,
  fetchTseProgramaBytes,
} from "./lib/programas-governo-extracao"
import { assertProgramaGovernoFonte, type ProgramaGovernoFonte } from "../src/lib/programa-governo"

const execFileAsync = promisify(execFile)
const sources = fontesJson as ProgramaGovernoFonte[]

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2))
  const slugArg = process.argv.find((arg) => arg.startsWith("--slug="))?.slice("--slug=".length)
  const archiveArg = process.argv.find((arg) => arg.startsWith("--archive="))?.slice("--archive=".length)

  for (const [index, source] of sources.entries()) assertProgramaGovernoFonte(source, `fontes[${index}]`)

  if (args.has("--dry-run")) {
    for (const source of sources) {
      console.log(JSON.stringify({ slug: source.slug, sqCandidato: source.sqCandidato, arquivo: source.arquivoNoPacote, estado: "nao_coletado" }))
    }
    console.log(`PROGRAMAS_DRY_RUN_PASS total=${sources.length}`)
    return
  }

  if (!slugArg || (!args.has("--extract") && !args.has("--review-packet"))) {
    throw new Error("use --dry-run ou --slug=<slug> com --extract/--review-packet")
  }
  const source = sources.find((candidate) => candidate.slug === slugArg)
  if (!source) throw new Error(`slug nao encontrado no registro oficial: ${slugArg}`)
  assertTseProgramaUrl(source.pacoteUrl)

  const workspace = await createProgramaTempWorkspace()
  try {
    const archivePath = resolve(workspace.directory, "fonte-tse.zip")
    const pdfPath = resolve(workspace.directory, basename(source.arquivoNome))
    const archiveBytes = archiveArg ? await readFile(resolve(archiveArg)) : await fetchTseProgramaBytes(source.pacoteUrl)
    await writeFile(archivePath, archiveBytes)
    const extracted = await execFileAsync("unzip", ["-p", archivePath, source.arquivoNoPacote], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 })
    await writeFile(pdfPath, extracted.stdout as Buffer)
    const extraction = await extractProgramaPdf(pdfPath)
    const packet = {
      version: 1,
      estado: "aguardando_revisao",
      fonte: source,
      extracao: extraction,
      promptVersion: "programa-governo-resumo-v1",
      resumoIa: null,
      aviso: "Rascunho sem aprovação. Exige geração por IA e revisão humana explícita.",
    }
    if (args.has("--review-packet")) {
      const outputDir = resolve("output/programas-governo")
      await mkdir(outputDir, { recursive: true })
      const outputPath = resolve(outputDir, `${slugArg}-review-packet.json`)
      await writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8")
      console.log(`PROGRAMAS_REVIEW_PACKET_PASS ${outputPath}`)
    } else {
      console.log(JSON.stringify({ slug: slugArg, paginas: extraction.paginas, sourceSha256: extraction.sourceSha256, extractedTextSha256: extraction.extractedTextSha256 }))
      console.log("PROGRAMAS_EXTRACT_PASS")
    }
  } finally {
    await workspace.cleanup()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
