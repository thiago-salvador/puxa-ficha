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
 * Uso:
 *   npx tsx scripts/check-candidate-photo-resolution.ts            # relatório
 *   npx tsx scripts/check-candidate-photo-resolution.ts --gate    # exit 1 em violação
 *   npx tsx scripts/check-candidate-photo-resolution.ts --write-baseline
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

export interface AuditResult {
  ok: boolean
  violations: string[]
  warnings: string[]
  belowSlot: PhotoInfo[]
}

export function isBelowSlot(width: number, height: number): boolean {
  return width < MIN_WIDTH || height < MIN_HEIGHT
}

export function auditPhotos(photos: PhotoInfo[], baseline: BaselineEntry[]): AuditResult {
  const baselineByFile = new Map(baseline.map((entry) => [entry.file, entry]))
  const violations: string[] = []
  const warnings: string[] = []
  const belowSlot: PhotoInfo[] = []

  for (const photo of photos) {
    const legacy = baselineByFile.get(photo.file)
    if (!isBelowSlot(photo.width, photo.height)) {
      if (legacy) {
        warnings.push(
          `${photo.file} agora tem ${photo.width}x${photo.height} (>= ${MIN_WIDTH}x${MIN_HEIGHT}): remover da baseline com --write-baseline`
        )
      }
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

  return { ok: violations.length === 0, violations, warnings, belowSlot }
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

function loadBaseline(): BaselineEntry[] {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as BaselineEntry[]
  } catch {
    return []
  }
}

function main() {
  const gate = process.argv.includes("--gate")
  const writeBaseline = process.argv.includes("--write-baseline")
  const { photos, unreadable } = collectPhotos(CANDIDATES_DIR)

  if (writeBaseline) {
    const below = photos.filter((photo) => isBelowSlot(photo.width, photo.height))
    writeFileSync(BASELINE_PATH, `${JSON.stringify(below, null, 2)}\n`)
    console.log(`Baseline regravada com ${below.length} fotos legadas abaixo do slot.`)
    return
  }

  const result = auditPhotos(photos, loadBaseline())
  for (const violation of result.violations) console.error(`VIOLACAO: ${violation}`)
  for (const warning of result.warnings) console.warn(`aviso: ${warning}`)
  for (const file of unreadable) console.error(`VIOLACAO: ${file} ilegível pelo leitor de dimensões`)

  const failed = !result.ok || unreadable.length > 0
  console.log(
    `${photos.length} fotos auditadas, ${result.belowSlot.length} legadas abaixo do slot toleradas, ${result.violations.length + unreadable.length} violações.`
  )
  if (failed && gate) process.exit(1)
}

const isDirectRun = process.argv[1]?.includes("check-candidate-photo-resolution")
if (isDirectRun) main()
