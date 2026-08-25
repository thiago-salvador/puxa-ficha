import "server-only"

import { inflateRawSync } from "node:zlib"

const DEFAULT_MAX_OUTPUT_BYTES = 50_000_000
const MAX_ZIP_ENTRIES = 10_000

export interface RegistroTseMonitoramento {
  registration_id: string
  office: string
  geography: string
  field_start: string
  field_end: string
  sample_size: number
  margin_error_pp: number | null
  institute: string
}

function findEocd(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - 65_557)
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  }
  throw new Error("ZIP TSE sem diretorio central")
}

interface ZipEntry {
  compressedSize: number
  fileName: string
  localOffset: number
  method: number
  nextOffset: number
  uncompressedSize: number
}

function readCentralEntry(buffer: Buffer, centralOffset: number): ZipEntry {
  if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error("ZIP TSE com entrada central invalida")
  const fileNameLength = buffer.readUInt16LE(centralOffset + 28)
  const extraLength = buffer.readUInt16LE(centralOffset + 30)
  const commentLength = buffer.readUInt16LE(centralOffset + 32)
  return {
    method: buffer.readUInt16LE(centralOffset + 10),
    compressedSize: buffer.readUInt32LE(centralOffset + 20),
    uncompressedSize: buffer.readUInt32LE(centralOffset + 24),
    localOffset: buffer.readUInt32LE(centralOffset + 42),
    fileName: buffer.subarray(centralOffset + 46, centralOffset + 46 + fileNameLength).toString("utf8"),
    nextOffset: centralOffset + 46 + fileNameLength + extraLength + commentLength,
  }
}

function decodeCsvEntry(buffer: Buffer, entry: ZipEntry, maxOutputBytes: number): string {
  if (entry.uncompressedSize > maxOutputBytes) throw new Error("CSV TSE excede limite descomprimido")
  if (buffer.readUInt32LE(entry.localOffset) !== 0x04034b50) throw new Error("ZIP TSE com entrada local invalida")
  const localNameLength = buffer.readUInt16LE(entry.localOffset + 26)
  const localExtraLength = buffer.readUInt16LE(entry.localOffset + 28)
  const dataStart = entry.localOffset + 30 + localNameLength + localExtraLength
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize)
  if (entry.method !== 0 && entry.method !== 8) throw new Error(`ZIP TSE usa compressao nao suportada: ${entry.method}`)
  const csvBytes = entry.method === 0
    ? compressed
    : inflateRawSync(compressed, { maxOutputLength: maxOutputBytes })
  if (csvBytes.byteLength > maxOutputBytes || csvBytes.byteLength !== entry.uncompressedSize) {
    throw new Error("CSV TSE tem tamanho descomprimido invalido")
  }
  return new TextDecoder("windows-1252").decode(csvBytes).replace(/^\uFEFF/, "")
}

export function extrairCsvDoZipTse(bytes: Uint8Array, maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES): string {
  const buffer = Buffer.from(bytes)
  const eocd = findEocd(buffer)
  const entries = buffer.readUInt16LE(eocd + 10)
  if (entries > MAX_ZIP_ENTRIES) throw new Error("ZIP TSE excede limite de entradas")
  let centralOffset = buffer.readUInt32LE(eocd + 16)

  for (let index = 0; index < entries; index += 1) {
    const entry = readCentralEntry(buffer, centralOffset)
    if (/\.csv$/i.test(entry.fileName)) return decodeCsvEntry(buffer, entry, maxOutputBytes)
    centralOffset = entry.nextOffset
  }
  throw new Error("ZIP TSE sem CSV")
}

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let value = ""
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ";" && !quoted) {
      values.push(value)
      value = ""
    } else {
      value += char
    }
  }
  values.push(value)
  return values
}

function first(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) if (row[key]?.trim()) return row[key].trim()
  return ""
}

function normalizeRegistration(raw: string): string {
  if (/^[A-Z]{2}-\d{5}\/\d{4}$/.test(raw)) return raw
  const compact = raw.replace(/[^A-Z0-9]/gi, "").toLocaleUpperCase("en-US")
  const match = compact.match(/^([A-Z]{2})(\d{5})(\d{4})$/)
  return match ? `${match[1]}-${match[2]}/${match[3]}` : raw
}

function normalizeDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : raw
}

export function parseRegistrosTse(csv: string): RegistroTseMonitoramento[] {
  const lines = csv.split(/\r?\n/).filter(Boolean)
  const headers = parseCsvLine(lines.shift() ?? "")
  return lines.map((line) => {
    const values = parseCsvLine(line)
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
    const registration = normalizeRegistration(first(row, ["NR_PROTOCOLO_REGISTRO", "NR_IDENTIFICACAO_PESQUISA", "registration_id"]))
    if (!registration) throw new Error("registro TSE sem identificador")
    const margin = first(row, ["VR_MARGEM_ERRO", "margin_error_pp"])
    return {
      registration_id: registration,
      office: first(row, ["DS_CARGOS", "DS_CARGO", "office"]),
      geography: first(row, ["NM_UE", "SG_UF", "geography"]),
      field_start: normalizeDate(first(row, ["DT_INICIO_PESQUISA", "field_start"])),
      field_end: normalizeDate(first(row, ["DT_FIM_PESQUISA", "field_end"])),
      sample_size: Number(first(row, ["QT_ENTREVISTADOS", "sample_size"])),
      margin_error_pp: margin ? Number(margin.replace(",", ".")) : null,
      institute: first(row, ["NM_EMPRESA_FANTASIA", "NM_EMPRESA", "institute"]),
    }
  })
}

export function descobrirUrlZipTse(datasetHtml: string): string {
  const match = datasetHtml.match(/https:\/\/cdn\.tse\.jus\.br\/[^"'<>\s]*pesquisa_eleitoral_2026\.zip/i)
  if (!match) throw new Error("pagina oficial TSE sem recurso ZIP de 2026")
  return match[0]
}
