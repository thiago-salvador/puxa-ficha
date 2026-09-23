/**
 * Mede e, quando autorizado por fonte local, extrai as miniaturas oficiais do
 * TSE para o roster de deputados.
 *
 * O comando é dry-run por padrão. Sem os zips `foto_cand2026_<UF>_div.zip`,
 * ele só produz um relatório de ausência. Isso evita transformar a ausência
 * de fonte em fixture ou alegação de cobertura.
 *
 * Uso:
 *   tsx scripts/ingest-roster-thumbnails.ts --input-dir /dados/tse/fotos
 *   tsx scripts/ingest-roster-thumbnails.ts --input-dir /dados/tse/fotos --apply
 *   tsx scripts/ingest-roster-thumbnails.ts --input-dir /dados/tse/fotos --json /tmp/fotos.json
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"

import { UF_BRASIL } from "./lib/tse-roster"
import { readImageDimensions } from "./lib/image-dimensions"

const ZIP_NAME = /^foto_cand2026_([A-Z]{2})_div\.zip$/i
const JPEG_NAME = /(?:^|\/)(\d+)\.(?:jpe?g)$/i
const THUMB_WIDTH = 161
const THUMB_HEIGHT = 225
const SOURCE_URL = "https://dadosabertos.tse.jus.br/dataset/eleicoes-2026"
const DEFAULT_INPUT_DIRS = ["data/tse-fotos-2026", "data/fotos-tse-2026", "/data/tse-fotos-2026"]
const MANIFEST_PATH = "scripts/data/candidate-photo-tse-official.json"
const REPORT_PATH = "scripts/data/candidate-photo-tse-thumbnails-report.json"

export interface ThumbnailSourceMeasurement {
  uf: string
  path: string
  bytes: number | null
  entries: number
  image_entries: number
  sha256: string | null
  measured_at: string
  status: "available" | "missing" | "unreadable"
  reason?: string
}

export interface ThumbnailRosterRow {
  sq_candidato: string
  uf: string
  cargo: string
}

export interface ThumbnailEntry {
  file: string
  width: number
  height: number
  sha256: string
  source: string
  tier: "thumb"
  uf: string
  cargo?: string
  sq_candidato: string
}

export interface ThumbnailMissing {
  sq_candidato: string
  uf: string
  cargo: string
  reason: "source_zip_missing" | "entry_missing" | "unsupported_entry" | "dimension_mismatch" | "roster_missing_sq"
}

export interface ThumbnailReport {
  schema_version: "tse-roster-thumbnails-v1"
  generated_at: string
  source_url: string
  input_dirs: string[]
  sources: ThumbnailSourceMeasurement[]
  totals: {
    roster: number
    extracted: number
    missing: number
    source_bytes: number
    zip_entries: number
    image_entries: number
  }
  coverage_by_uf_cargo: Record<string, { roster: number; extracted: number; missing: number; coverage: number }>
  missing: ThumbnailMissing[]
  entries: ThumbnailEntry[]
  apply: boolean
}

type JsonRecord = Record<string, unknown>

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function listZipEntries(path: string): string[] {
  return execFileSync("unzip", ["-Z1", path], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
    .split(/\r?\n/).filter(Boolean)
}

function readZipEntry(path: string, name: string): Buffer {
  return execFileSync("unzip", ["-p", path, name], { maxBuffer: 8 * 1024 * 1024 })
}

function locateZips(inputDirs: string[]): Map<string, string> {
  const found = new Map<string, string>()
  for (const dir of inputDirs) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
    for (const file of readdirSync(dir).sort()) {
      const match = ZIP_NAME.exec(file)
      if (match && !found.has(match[1].toUpperCase())) found.set(match[1].toUpperCase(), join(dir, file))
    }
  }
  return found
}

export function medirFontes(inputDirs: string[], now = new Date().toISOString()): ThumbnailSourceMeasurement[] {
  const zips = locateZips(inputDirs)
  return UF_BRASIL.map((uf) => {
    const path = zips.get(uf)
    if (!path) return { uf, path: join(inputDirs[0] ?? DEFAULT_INPUT_DIRS[0], `foto_cand2026_${uf}_div.zip`), bytes: null, entries: 0, image_entries: 0, sha256: null, measured_at: now, status: "missing", reason: "zip oficial ausente no diretório informado" }
    try {
      const entries = listZipEntries(path)
      return { uf, path, bytes: statSync(path).size, entries: entries.length, image_entries: entries.filter((name) => JPEG_NAME.test(name)).length, sha256: sha256File(path), measured_at: now, status: "available" }
    } catch (error) {
      return { uf, path, bytes: statSync(path).size, entries: 0, image_entries: 0, sha256: null, measured_at: now, status: "unreadable", reason: error instanceof Error ? error.message : String(error) }
    }
  })
}

function carregarRoster(path?: string): ThumbnailRosterRow[] {
  if (!path || !existsSync(path)) return []
  const value: unknown = JSON.parse(readFileSync(path, "utf8"))
  const rows: unknown[] = Array.isArray(value)
    ? value
    : isJsonRecord(value) && Array.isArray(value.records)
      ? value.records
      : isJsonRecord(value) && Array.isArray(value.rows)
        ? value.rows
        : isJsonRecord(value) && Array.isArray(value.profiles)
          ? value.profiles
          : isJsonRecord(value) && Array.isArray(value.candidates)
            ? value.candidates
            : []
  return rows.filter(isJsonRecord).map((row) => {
    const ids = isJsonRecord(row.ids) ? row.ids : null
    const sqs = ids && isJsonRecord(ids.tse_sq_candidato) ? ids.tse_sq_candidato : null
    return {
      sq_candidato: asText(row.sq_candidato ?? row.SQ_CANDIDATO ?? sqs?.["2026"]).trim(),
      uf: asText(row.uf ?? row.SG_UF).trim().toUpperCase(),
      cargo: asText(row.cargo ?? row.DS_CARGO).trim(),
    }
  }).filter((row) => row.sq_candidato && row.uf)
}

function cargoRosterRows(rows: ThumbnailRosterRow[]): ThumbnailRosterRow[] {
  return rows.filter((row) => {
    const cargo = row.cargo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-\s]+/g, "_")
    return /(^|_)deputad[oa]?_(federal|estadual|distrital)$/.test(cargo) || /deputad[oa]?_(federal|estadual|distrital)/.test(cargo)
  })
}

function loadImageEntries(source: ThumbnailSourceMeasurement): Map<string, { name: string; bytes: Buffer }> {
  if (source.status !== "available") return new Map()
  const names = listZipEntries(source.path)
  const output = new Map<string, { name: string; bytes: Buffer }>()
  for (const name of names) {
    const match = JPEG_NAME.exec(name)
    if (!match) continue
    const sq = match[1]
    if (output.has(sq)) continue
    const bytes = readZipEntry(source.path, name)
    if (bytes.length > 0) output.set(sq, { name, bytes })
  }
  return output
}

export function makeReport(rows: ThumbnailRosterRow[], sources: ThumbnailSourceMeasurement[], apply: boolean, outputDir?: string): ThumbnailReport {
  const sourceByUf = new Map(sources.map((source) => [source.uf, source]))
  const entries: ThumbnailEntry[] = []
  const missing: ThumbnailMissing[] = []
  const coverage: ThumbnailReport["coverage_by_uf_cargo"] = {}
  const imagesByUf = new Map<string, Map<string, { name: string; bytes: Buffer }>>()
  for (const source of sources) if (source.status === "available") imagesByUf.set(source.uf, loadImageEntries(source))

  for (const row of rows) {
    const key = `${row.uf}:${row.cargo || "desconhecido"}`
    const bucket = coverage[key] ?? { roster: 0, extracted: 0, missing: 0, coverage: 0 }
    bucket.roster++
    const source = sourceByUf.get(row.uf)
    const image = imagesByUf.get(row.uf)?.get(row.sq_candidato)
    if (!source || source.status !== "available") {
      missing.push({ ...row, reason: "source_zip_missing" })
      bucket.missing++
    } else if (!image) {
      missing.push({ ...row, reason: "entry_missing" })
      bucket.missing++
    } else {
      const dimensions = readImageDimensions(image.bytes)
      if (!dimensions || dimensions.width !== THUMB_WIDTH || dimensions.height !== THUMB_HEIGHT) {
        missing.push({ ...row, reason: "dimension_mismatch" })
        bucket.missing++
        bucket.coverage = bucket.roster === 0 ? 0 : bucket.extracted / bucket.roster
        coverage[key] = bucket
        continue
      }
      const file = `tse-2026-${row.sq_candidato}-thumb.jpg`
      const target = outputDir ? resolve(outputDir, file) : null
      if (apply && target) {
        mkdirSync(dirname(target), { recursive: true })
        if (existsSync(target) && !readFileSync(target).equals(image.bytes)) throw new Error(`arquivo local divergente: ${target}`)
        if (!existsSync(target)) writeFileSync(target, image.bytes)
      }
      entries.push({ file, width: dimensions.width, height: dimensions.height, sha256: createHash("sha256").update(image.bytes).digest("hex"), source: `TSE ${basename(source.path)}; entrada ${image.name}; sha256_zip=${source.sha256}`, tier: "thumb", uf: row.uf, cargo: row.cargo, sq_candidato: row.sq_candidato })
      bucket.extracted++
    }
    bucket.coverage = bucket.roster === 0 ? 0 : bucket.extracted / bucket.roster
    coverage[key] = bucket
  }
  return { schema_version: "tse-roster-thumbnails-v1", generated_at: new Date().toISOString(), source_url: SOURCE_URL, input_dirs: [], sources, totals: { roster: rows.length, extracted: entries.length, missing: missing.length, source_bytes: sources.reduce((sum, source) => sum + (source.bytes ?? 0), 0), zip_entries: sources.reduce((sum, source) => sum + source.entries, 0), image_entries: sources.reduce((sum, source) => sum + source.image_entries, 0) }, coverage_by_uf_cargo: coverage, missing, entries, apply }
}

function flag(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
}

function atualizarManifesto(entries: ThumbnailEntry[]): void {
  if (entries.length === 0) return
  const parsed: unknown = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) : []
  const atual: JsonRecord[] = Array.isArray(parsed) ? parsed.filter(isJsonRecord) : []
  const byFile = new Map<string, JsonRecord>(atual.map((entry) => [asText(entry.file), entry]))
  for (const entry of entries) byFile.set(entry.file, { ...entry })
  writeFileSync(MANIFEST_PATH, `${JSON.stringify([...byFile.values()].sort((a, b) => asText(a.file).localeCompare(asText(b.file))), null, 2)}\n`)
}

export function main(): void {
  const inputDirs = (flag("input-dir") ? [resolve(flag("input-dir")!)] : DEFAULT_INPUT_DIRS).filter((dir, index, all) => all.indexOf(dir) === index)
  const rosterPath = flag("roster") ?? "data/candidate-roster-deputados-2026.json"
  const reportPath = flag("json") ?? REPORT_PATH
  const outputDir = flag("output-dir") ?? "public/candidates"
  const apply = process.argv.includes("--apply")
  const sources = medirFontes(inputDirs)
  const rows = cargoRosterRows(carregarRoster(rosterPath))
  const report = makeReport(rows, sources, apply, outputDir)
  report.input_dirs = inputDirs
  mkdirSync(dirname(resolve(reportPath)), { recursive: true })
  writeFileSync(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`)
  if (apply) atualizarManifesto(report.entries)
  console.log(`ingest-roster-thumbnails: ${apply ? "APPLY" : "DRY-RUN"}`)
  console.log(`fontes: ${sources.filter((source) => source.status === "available").length}/${sources.length} zips; bytes=${report.totals.source_bytes}; entradas=${report.totals.zip_entries}; imagens=${report.totals.image_entries}`)
  console.log(`roster deputados: ${report.totals.roster}; extraídas: ${report.totals.extracted}; faltas: ${report.totals.missing}`)
  for (const source of sources.filter((source) => source.status !== "available")) console.log(`ausente: ${source.uf} ${source.path} (${source.reason})`)
  console.log(`relatório: ${resolve(reportPath)}`)
}

if (process.argv[1]?.endsWith("ingest-roster-thumbnails.ts")) main()
