import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parse as parseCsv } from "csv-parse/sync"

export const ROSTER_YEAR = 2026
export const ROSTER_CARGOS = ["deputado_federal", "deputado_estadual", "deputado_distrital"] as const
export type RosterCargo = typeof ROSTER_CARGOS[number]
export const MAJORITARIOS_CARGOS = ["presidente", "governador", "senador"] as const
export type RosterCargoCompleto = RosterCargo | typeof MAJORITARIOS_CARGOS[number]
export const ROSTER_UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const
export const DEFAULT_ROSTER_PACKAGE = "/data/tse-cpf/consulta_cand_2026.zip"
export const DEFAULT_COMPLEMENT_PACKAGE = "/output/sites-candidato-tse-2026/consulta_cand_complementar_2026.zip"
export const ROSTER_SOURCE_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip"
export const COMPLEMENT_SOURCE_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip"

export interface SnapshotRow {
  ANO_ELEICAO?: string
  SG_UF?: string
  CD_CARGO?: string
  DS_CARGO?: string
  SQ_CANDIDATO?: string
  NR_CANDIDATO?: string
  NM_CANDIDATO?: string
  NM_URNA_CANDIDATO?: string
  SG_PARTIDO?: string
  CD_SITUACAO_CANDIDATURA?: string
  DS_SITUACAO_CANDIDATURA?: string
  ST_SUBSTITUIDO?: string
  SQ_SUBSTITUIDO?: string
  DT_GERACAO?: string
  HH_GERACAO?: string
  [key: string]: string | undefined
}

export interface ComplementRow {
  ANO_ELEICAO?: string
  SG_UF?: string
  SQ_CANDIDATO?: string
  CD_SITUACAO_JULGAMENTO?: string
  DS_SITUACAO_JULGAMENTO?: string
  CD_SITUACAO_JULGAMENTO_PLEITO?: string
  DS_SITUACAO_JULGAMENTO_PLEITO?: string
  CD_SITUACAO_CANDIDATO_PLEITO?: string
  DS_SITUACAO_CANDIDATO_PLEITO?: string
  ST_SUBSTITUIDO?: string
  SQ_SUBSTITUIDO?: string
  [key: string]: string | undefined
}

export interface RosterRecord {
  ano: number
  sq_candidato: string
  uf: string
  cargo: RosterCargoCompleto
  nome_urna: string
  nome_completo: string
  numero_urna: string
  partido_sigla: string
  situacao_registro: string
  fonte_url: string
  sha256_pacote: string
  coletado_em: string
  foto_path: null
  snapshot_em: string | null
}

export interface RosterSummary {
  records: RosterRecord[]
  counts: Record<string, number>
  replacements: Array<{ sq_candidato: string; sq_substituido: string; uf: string; cargo: RosterCargoCompleto }>
  source: { path: string; sha256: string; files: string[]; complementPath: string | null; complementSha256: string | null }
}

const norm = (v: unknown) => String(v ?? "").trim()
const upper = (v: unknown) => norm(v).toUpperCase()
const cargoByCode: Record<string, RosterCargoCompleto> = { "1": "presidente", "3": "governador", "5": "senador", "6": "deputado_federal", "7": "deputado_estadual", "8": "deputado_distrital" }

export function cargoFromRow(row: Pick<SnapshotRow, "CD_CARGO" | "DS_CARGO">): RosterCargoCompleto | null {
  const code = norm(row.CD_CARGO)
  if (cargoByCode[code]) return cargoByCode[code]
  const text = upper(row.DS_CARGO).replace(/Í/g, "I")
  if (text === "DEPUTADO FEDERAL") return "deputado_federal"
  if (text === "DEPUTADO ESTADUAL") return "deputado_estadual"
  if (text === "DEPUTADO DISTRITAL") return "deputado_distrital"
  if (text === "PRESIDENTE") return "presidente"
  if (text === "GOVERNADOR") return "governador"
  if (text === "SENADOR") return "senador"
  return null
}

function sha256(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex") }
export function parseSnapshotTimestamp(dateValue: unknown, timeValue: unknown): string | null {
  const date = norm(dateValue)
  const match = date.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/) ?? date.match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})$/)
  if (!match) return null
  const [, a, b, c] = match
  const isoDate = a.length === 4 ? `${a}-${b}-${c}` : `${c}-${b}-${a}`
  const time = norm(timeValue).replace(/[^0-9:]/g, "")
  const hhmmss = /^\d{2}:\d{2}(?::\d{2})?$/.test(time) ? (time.length === 5 ? `${time}:00` : time) : "00:00:00"
  const parsed = new Date(`${isoDate}T${hhmmss}Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(isoDate) ? parsed.toISOString() : null
}
function parseCsvText(text: string): Record<string, string>[] {
  return parseCsv(text, { delimiter: ";", columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true, bom: true, cast: (v: string) => v.trim() }) as Record<string, string>[]
}

export function loadRows(path: string): { rows: Record<string, string>[]; path: string; sha256: string; files: string[] } {
  const absolute = resolve(path)
  if (!existsSync(absolute)) throw new Error(`fonte TSE não encontrada: ${absolute}`)
  const bytes = readFileSync(absolute)
  if (!absolute.toLowerCase().endsWith(".zip")) return { rows: parseCsvText(bytes.toString("latin1")), path: absolute, sha256: sha256(bytes), files: [absolute] }
  const files = execFileSync("unzip", ["-Z1", absolute], { encoding: "utf8" }).split(/\r?\n/).filter((name) => /_[A-Z]{2}\.csv$/i.test(name)).sort()
  const rows = files.flatMap((file) => parseCsvText(execFileSync("unzip", ["-p", absolute, file], { encoding: "latin1", maxBuffer: 256 * 1024 * 1024 })))
  return { rows, path: absolute, sha256: sha256(bytes), files }
}

function statusFor(row: SnapshotRow, complement?: ComplementRow): string {
  const values = [
    complement?.DS_SITUACAO_JULGAMENTO_PLEITO,
    complement?.DS_SITUACAO_JULGAMENTO,
    complement?.DS_SITUACAO_CANDIDATO_PLEITO,
    row.DS_SITUACAO_CANDIDATURA,
  ]
  const situation = values.map(norm).find((value) => value && !/^#(?:NULO|NE)#?$/i.test(value)) ?? "não informado"
  return upper(complement?.ST_SUBSTITUIDO ?? row.ST_SUBSTITUIDO) === "S"
    ? `SUBSTITUÍDO · ${situation}`
    : situation
}

export function buildRoster(snapshot: SnapshotRow[], complement: ComplementRow[], source: { sha256: string; sourceUrl?: string; collectedAt?: string }, options: { includeMajoritarios?: boolean } = {}): RosterSummary {
  const bySq = new Map(complement.filter((r) => norm(r.SQ_CANDIDATO)).map((r) => [norm(r.SQ_CANDIDATO), r]))
  const records: RosterRecord[] = []
  const parsedSnapshotDates = snapshot.map((row) => parseSnapshotTimestamp(row.DT_GERACAO, row.HH_GERACAO))
  const snapshotDates = [...new Set(parsedSnapshotDates.filter((value): value is string => Boolean(value)))]
  const snapshotEm = parsedSnapshotDates.length > 0 && parsedSnapshotDates.every(Boolean) && snapshotDates.length === 1 ? snapshotDates[0] : null
  const replacements: RosterSummary["replacements"] = []
  for (const row of snapshot) {
    const cargo = cargoFromRow(row)
    const sq = norm(row.SQ_CANDIDATO)
    const uf = upper(row.SG_UF)
    if (norm(row.ANO_ELEICAO) !== String(ROSTER_YEAR) || !cargo || (!options.includeMajoritarios && !ROSTER_CARGOS.includes(cargo as RosterCargo)) || !/^([A-Z]{2}|BR)$/.test(uf) || !sq) continue
    const complementRow = bySq.get(sq)
    records.push({ ano: ROSTER_YEAR, sq_candidato: sq, uf, cargo, nome_urna: norm(row.NM_URNA_CANDIDATO), nome_completo: norm(row.NM_CANDIDATO), numero_urna: norm(row.NR_CANDIDATO), partido_sigla: upper(row.SG_PARTIDO), situacao_registro: statusFor(row, complementRow), fonte_url: source.sourceUrl ?? ROSTER_SOURCE_URL, sha256_pacote: source.sha256, coletado_em: source.collectedAt ?? new Date().toISOString(), foto_path: null, snapshot_em: snapshotEm })
    const replaced = norm(complementRow?.SQ_SUBSTITUIDO ?? row.SQ_SUBSTITUIDO)
    if (replaced && !new Set(["-1", "0", "#NULO#", "#NE#"]).has(replaced)) replacements.push({ sq_candidato: sq, sq_substituido: replaced, uf, cargo })
  }
  const unique = new Map(records.map((record) => [[record.ano, record.sq_candidato, record.uf, record.cargo].join("|"), record]))
  const counts: Record<string, number> = {}
  for (const record of unique.values()) counts[`${record.uf}/${record.cargo}`] = (counts[`${record.uf}/${record.cargo}`] ?? 0) + 1
  return { records: [...unique.values()].sort((a, b) => a.uf.localeCompare(b.uf) || a.cargo.localeCompare(b.cargo) || a.nome_urna.localeCompare(b.nome_urna)), counts, replacements, source: { path: "", sha256: source.sha256, files: [], complementPath: null, complementSha256: null } }
}

export function compareRoster(previous: RosterRecord[], current: RosterRecord[]) {
  const key = (r: RosterRecord) => [r.ano, r.sq_candidato, r.uf, r.cargo].join("|")
  const before = new Map(previous.map((r) => [key(r), r]))
  const after = new Map(current.map((r) => [key(r), r]))
  return { added: current.filter((r) => !before.has(key(r))), removed: previous.filter((r) => !after.has(key(r))), changed: current.filter((r) => { const old = before.get(key(r)); return old && JSON.stringify(old) !== JSON.stringify(r) }) }
}

export function rosterQuality(records: RosterRecord[], snapshotAt: string | null, now = new Date()) {
  const expected = ROSTER_UFS.flatMap((uf) => uf === "DF"
    ? ["DF/deputado_federal", "DF/deputado_distrital"]
    : [`${uf}/deputado_federal`, `${uf}/deputado_estadual`])
  const zero = expected.filter((key) => !records.some((r) => `${r.uf}/${r.cargo}` === key))
  const ageDays = snapshotAt ? Math.max(0, (now.getTime() - Date.parse(snapshotAt)) / 86_400_000) : Infinity
  return { status: zero.length || ageDays > 30 ? "partial" : "ok", zero, ageDays }
}
