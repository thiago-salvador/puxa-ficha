/**
 * Gate de resolução das fotos de candidato (G5-02 do master review 2026-08-04).
 *
 * O maior slot público é o card da home: 281x375 CSS px, ou seja 562x750 em
 * tela 2x. Foto de ORIGEM abaixo disso chega borrada na grade principal, e
 * recompressão não conserta resolução que nunca existiu.
 *
 * Regra do gate:
 * - Foto nova (fora da baseline) precisa ter pelo menos 562x750.
 * - Foto legada listada na baseline é tolerada ENQUANTO for o mesmo arquivo
 *   (hash igual). Substituir uma foto legada por outra ainda abaixo do slot
 *   falha: reposição só entra se resolver o problema.
 * - Foto legada que passou a cumprir o slot gera aviso para sair da baseline
 *   (rodar com --write-baseline depois de curar as fotos).
 *
 * Categoria "Foto oficial do registro TSE" (decisão de produto aprovada em
 * 2026-09-16): candidatos ao Senado podem sair com a foto oficial do registro
 * de candidatura, que o TSE só entrega em 161x225 no arquivo
 * foto_cand2026_<UF>_div.zip. A exceção é estreita:
 * - o nome do arquivo casa com ^tse-2026-\d+\.(jpg|jpeg)$;
 * - as dimensões não passam do máximo entregue pelo TSE (161x225) e batem
 *   exatamente com as registradas no manifesto;
 * - o sha256 bate com o registrado em scripts/data/candidate-photo-tse-official.json.
 * Hash ou dimensão diferente do manifesto é violação. Trocar a foto do TSE por
 * uma melhor (outro nome, ou mesmo nome fora do manifesto) segue a regra normal
 * do slot. Entrada do manifesto sem arquivo correspondente gera aviso.
 * O manifesto é regravado com --write-tse-manifest, que lista toda foto
 * tse-2026-*.jpg dentro do máximo do TSE; --write-baseline não inclui essas fotos.
 *
 * Uso:
 *   npx tsx scripts/check-candidate-photo-resolution.ts            # relatório
 *   npx tsx scripts/check-candidate-photo-resolution.ts --gate    # exit 1 em violação
 *   npx tsx scripts/check-candidate-photo-resolution.ts --write-baseline
 *   npx tsx scripts/check-candidate-photo-resolution.ts --write-tse-manifest
 */
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { readImageDimensions } from "./lib/image-dimensions"

export const MIN_WIDTH = 562
export const MIN_HEIGHT = 750

export interface BaselineEntry {
  file: string
  width: number
  height: number
  sha256: string
}

export interface PhotoInfo {
  file: string
  width: number
  height: number
  sha256: string
}

/** Nome dos arquivos extraídos do ZIP oficial de fotos do TSE. */
export const TSE_OFFICIAL_FILE_PATTERN = /^tse-2026-\d+\.(jpg|jpeg)$/
/** Maior dimensão medida nas fotos de foto_cand2026_<UF>_div.zip (todas 161x225). */
export const TSE_OFFICIAL_MAX_WIDTH = 161
export const TSE_OFFICIAL_MAX_HEIGHT = 225
export const TSE_OFFICIAL_SOURCE =
  "TSE foto_cand2026_<UF>_div.zip (UF não rastreada em dado versionado)"

export interface TseOfficialEntry {
  file: string
  width: number
  height: number
  sha256: string
  source: string
}

export interface AuditResult {
  ok: boolean
  violations: string[]
  warnings: string[]
  belowSlot: PhotoInfo[]
  tseOfficial: PhotoInfo[]
}

export function isBelowSlot(width: number, height: number): boolean {
  return width < MIN_WIDTH || height < MIN_HEIGHT
}

export function isTseOfficialCandidate(photo: Pick<PhotoInfo, "file" | "width" | "height">): boolean {
  return (
    TSE_OFFICIAL_FILE_PATTERN.test(photo.file) &&
    photo.width <= TSE_OFFICIAL_MAX_WIDTH &&
    photo.height <= TSE_OFFICIAL_MAX_HEIGHT
  )
}

export function buildTseOfficialManifest(photos: PhotoInfo[]): TseOfficialEntry[] {
  return photos
    .filter((photo) => isTseOfficialCandidate(photo))
    .map((photo) => ({
      file: photo.file,
      width: photo.width,
      height: photo.height,
      sha256: photo.sha256,
      source: TSE_OFFICIAL_SOURCE,
    }))
}

export function auditPhotos(
  photos: PhotoInfo[],
  baseline: BaselineEntry[],
  tseManifest: TseOfficialEntry[] = []
): AuditResult {
  const baselineByFile = new Map(baseline.map((entry) => [entry.file, entry]))
  const tseByFile = new Map(tseManifest.map((entry) => [entry.file, entry]))
  const violations: string[] = []
  const warnings: string[] = []
  const belowSlot: PhotoInfo[] = []
  const tseOfficial: PhotoInfo[] = []

  for (const photo of photos) {
    const legacy = baselineByFile.get(photo.file)
    const official = tseByFile.get(photo.file)
    if (!isBelowSlot(photo.width, photo.height)) {
      if (legacy) {
        warnings.push(
          `${photo.file} agora tem ${photo.width}x${photo.height} (>= ${MIN_WIDTH}x${MIN_HEIGHT}): remover da baseline com --write-baseline`
        )
      }
      if (official) {
        warnings.push(
          `${photo.file} agora tem ${photo.width}x${photo.height} (>= ${MIN_WIDTH}x${MIN_HEIGHT}): remover do manifesto TSE com --write-tse-manifest`
        )
      }
      continue
    }

    if (official) {
      const problems: string[] = []
      if (!TSE_OFFICIAL_FILE_PATTERN.test(official.file)) {
        problems.push(`nome fora do padrão ${TSE_OFFICIAL_FILE_PATTERN}`)
      }
      if (official.width > TSE_OFFICIAL_MAX_WIDTH || official.height > TSE_OFFICIAL_MAX_HEIGHT) {
        problems.push(
          `manifesto registra ${official.width}x${official.height}, acima do máximo entregue pelo TSE (${TSE_OFFICIAL_MAX_WIDTH}x${TSE_OFFICIAL_MAX_HEIGHT})`
        )
      }
      if (official.width !== photo.width || official.height !== photo.height) {
        problems.push(
          `tem ${photo.width}x${photo.height}, diferente dos ${official.width}x${official.height} registrados`
        )
      }
      if (official.sha256 !== photo.sha256) {
        problems.push("sha256 difere do registrado")
      }
      if (problems.length === 0) {
        tseOfficial.push(photo)
        continue
      }
      belowSlot.push(photo)
      violations.push(
        `${photo.file} não confere com o manifesto de fotos oficiais do TSE (${problems.join("; ")}); foto fora do manifesto precisa cumprir o slot em 2x (${MIN_WIDTH}x${MIN_HEIGHT})`
      )
      continue
    }

    belowSlot.push(photo)
    if (!legacy) {
      violations.push(
        `${photo.file} tem ${photo.width}x${photo.height}, abaixo do slot em 2x (${MIN_WIDTH}x${MIN_HEIGHT}); foto nova precisa cumprir o slot`
      )
      continue
    }
    if (legacy.sha256 !== photo.sha256) {
      violations.push(
        `${photo.file} foi substituído mas continua com ${photo.width}x${photo.height}, abaixo do slot em 2x (${MIN_WIDTH}x${MIN_HEIGHT}); reposição precisa cumprir o slot`
      )
    }
  }

  for (const entry of baseline) {
    if (!photos.some((photo) => photo.file === entry.file)) {
      warnings.push(`${entry.file} está na baseline mas não existe mais em public/candidates`)
    }
  }

  const photoFiles = new Set(photos.map((photo) => photo.file))
  for (const entry of tseManifest) {
    if (!photoFiles.has(entry.file)) {
      warnings.push(
        `${entry.file} está no manifesto de fotos oficiais do TSE mas não existe mais em public/candidates`
      )
    }
  }

  return { ok: violations.length === 0, violations, warnings, belowSlot, tseOfficial }
}

export function collectPhotos(dir: string): { photos: PhotoInfo[]; unreadable: string[] } {
  const photos: PhotoInfo[] = []
  const unreadable: string[] = []
  for (const file of readdirSync(dir).sort()) {
    if (!/\.(jpe?g|png|webp|avif)$/i.test(file)) continue
    const buf = readFileSync(join(dir, file))
    const dims = readImageDimensions(buf)
    if (!dims) {
      unreadable.push(file)
      continue
    }
    photos.push({
      file,
      width: dims.width,
      height: dims.height,
      sha256: createHash("sha256").update(buf).digest("hex"),
    })
  }
  return { photos, unreadable }
}

const CANDIDATES_DIR = "public/candidates"
const BASELINE_PATH = "scripts/data/candidate-photo-baseline.json"
export const TSE_OFFICIAL_MANIFEST_PATH = "scripts/data/candidate-photo-tse-official.json"

function loadJsonArray<T>(path: string): T[] {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T[]
  } catch {
    return []
  }
}

function main() {
  const gate = process.argv.includes("--gate")
  const writeBaseline = process.argv.includes("--write-baseline")
  const writeTseManifest = process.argv.includes("--write-tse-manifest")
  const { photos, unreadable } = collectPhotos(CANDIDATES_DIR)

  if (writeTseManifest) {
    const manifest = buildTseOfficialManifest(photos)
    writeFileSync(TSE_OFFICIAL_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`Manifesto TSE regravado com ${manifest.length} fotos oficiais do registro.`)
    if (!writeBaseline) return
  }

  if (writeBaseline) {
    const tseFiles = new Set(loadJsonArray<TseOfficialEntry>(TSE_OFFICIAL_MANIFEST_PATH).map((entry) => entry.file))
    const below = photos.filter(
      (photo) => isBelowSlot(photo.width, photo.height) && !tseFiles.has(photo.file)
    )
    writeFileSync(BASELINE_PATH, `${JSON.stringify(below, null, 2)}\n`)
    console.log(`Baseline regravada com ${below.length} fotos legadas abaixo do slot.`)
    return
  }

  const result = auditPhotos(
    photos,
    loadJsonArray<BaselineEntry>(BASELINE_PATH),
    loadJsonArray<TseOfficialEntry>(TSE_OFFICIAL_MANIFEST_PATH)
  )
  for (const violation of result.violations) console.error(`VIOLACAO: ${violation}`)
  for (const warning of result.warnings) console.warn(`aviso: ${warning}`)
  for (const file of unreadable) console.error(`VIOLACAO: ${file} ilegível pelo leitor de dimensões`)

  const failed = !result.ok || unreadable.length > 0
  console.log(
    `${photos.length} fotos auditadas, ${result.belowSlot.length} abaixo do slot fora do manifesto TSE, ${result.tseOfficial.length} fotos oficiais do registro TSE, ${result.violations.length + unreadable.length} violações.`
  )
  if (failed && gate) process.exit(1)
}

const isDirectRun = process.argv[1]?.includes("check-candidate-photo-resolution")
if (isDirectRun) main()
