/**
 * Materializa os sites declarados por candidatos no recurso oficial do TSE.
 *
 * Entrada: os ZIPs e o catalog.json produzidos por
 * `npm run data:identidade-etapa2:fontes -- --destino=<diretorio>`.
 * Saida: snapshot versionado, restrito aos perfis conhecidos pelo Puxa Ficha.
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { parse } from "csv-parse/sync"
import {
  buildCandidateSitesTseDataset,
  type LinhaCandidatoTse,
  type LinhaSiteCandidatoTse,
  type PerfilSitesTse,
  type ReciboSitesTse,
} from "./lib/candidate-sites-tse"

function argument(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

function readBrasilCsv<T extends object>(zipPath: string): T[] {
  const entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter((entry) => /_BRASIL\.csv$/i.test(entry))
  if (entries.length !== 1) {
    throw new Error(`${zipPath}: esperado um CSV _BRASIL, encontrados ${entries.length}`)
  }

  const buffer = execFileSync("unzip", ["-p", zipPath, entries[0]], {
    maxBuffer: 100 * 1024 * 1024,
  })
  const csv = new TextDecoder("windows-1252").decode(buffer)
  return parse(csv, {
    bom: true,
    columns: true,
    delimiter: ";",
    relax_quotes: false,
    skip_empty_lines: true,
    trim: true,
  }) as T[]
}

function assertFileSha256(path: string, expectedSha256: string): void {
  const actualSha256 = createHash("sha256").update(readFileSync(path)).digest("hex")
  if (actualSha256 !== expectedSha256) {
    throw new Error(`${path}: SHA-256 ${actualSha256} diverge do recibo ${expectedSha256}`)
  }
}

function main(): void {
  const sourceDir = resolve(argument("source-dir") ?? "output/sites-candidato-tse-2026")
  const outputPath = resolve(
    argument("output") ?? "src/data/candidate-sites-tse-2026.json",
  )
  const profiles = JSON.parse(
    readFileSync(resolve("data/candidatos.json"), "utf8"),
  ) as PerfilSitesTse[]
  const receipt = JSON.parse(
    readFileSync(resolve(sourceDir, "catalog.json"), "utf8"),
  ) as ReciboSitesTse
  const candidateResource = receipt.resources.find((resource) => resource.name === "Candidatos")
  const socialResource = receipt.resources.find(
    (resource) => resource.name === "Redes sociais de candidatos",
  )
  if (!candidateResource || !socialResource) throw new Error("recibo incompleto do TSE")

  const candidateZipPath = resolve(sourceDir, "consulta_cand_2026.zip")
  const socialZipPath = resolve(sourceDir, "rede_social_candidato_2026.zip")
  assertFileSha256(candidateZipPath, candidateResource.sha256)
  assertFileSha256(socialZipPath, socialResource.sha256)

  const candidates = readBrasilCsv<LinhaCandidatoTse>(candidateZipPath)
  const socialRows = readBrasilCsv<LinhaSiteCandidatoTse>(socialZipPath)

  const dataset = buildCandidateSitesTseDataset({ profiles, candidates, socialRows, receipt })
  writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`)
  console.log(JSON.stringify({ output: outputPath, ...dataset.counts }, null, 2))
}

main()
