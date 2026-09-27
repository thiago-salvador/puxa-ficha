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
import { fileURLToPath } from "node:url"
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

/**
 * Valida o roster curado usado no modo de coorte atual.
 *
 * Esse modo precisa ser identificável por SQ, porque o nome do candidato não
 * distingue homônimos, candidaturas históricas e mudanças no pacote do TSE.
 */
export function validateDeclaredSqRoster(profiles: PerfilSitesTse[]): void {
  const seenSlugs = new Set<string>()
  const seenSqs = new Set<string>()
  for (const [index, profile] of profiles.entries()) {
    const slug = profile.slug?.trim()
    const sq = profile.ids?.tse_sq_candidato?.["2026"]?.trim()
    if (!slug) throw new Error(`roster[${index}]: slug obrigatório`)
    if (seenSlugs.has(slug)) throw new Error(`roster: slug duplicado ${slug}`)
    seenSlugs.add(slug)
    if (!sq) throw new Error(`roster[${index}] ${slug}: SQ 2026 obrigatório`)
    if (seenSqs.has(sq)) throw new Error(`roster: SQ 2026 duplicado ${sq}`)
    seenSqs.add(sq)
  }
}

function main(): void {
  const sourceDir = resolve(argument("source-dir") ?? "output/sites-candidato-tse-2026")
  const outputPath = resolve(
    argument("output") ?? "src/data/candidate-sites-tse-2026.json",
  )
  const profilesInput = argument("profiles-input")
  const profiles = JSON.parse(
    readFileSync(resolve(profilesInput ?? "data/candidatos.json"), "utf8"),
  ) as PerfilSitesTse[]
  if (!Array.isArray(profiles)) throw new Error("profiles-input: esperado um array de perfis")
  if (profilesInput) validateDeclaredSqRoster(profiles)
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
  const payload = `${JSON.stringify(dataset, null, 2)}\n`
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ dry_run: true, output: outputPath, ...dataset.counts }, null, 2))
    return
  }

  writeFileSync(outputPath, payload)
  const readback = JSON.parse(readFileSync(outputPath, "utf8")) as typeof dataset
  if (JSON.stringify(readback) !== JSON.stringify(dataset)) {
    throw new Error(`${outputPath}: readback diverge do dataset gerado`)
  }
  console.log(JSON.stringify({ output: outputPath, readback: "ok", ...readback.counts }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}
