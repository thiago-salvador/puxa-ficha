/** Reconcile official TSE NR_CANDIDATO. Dry-run is the only default. */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseCSV } from "./lib/parse-csv-local"
import { supabase, supabaseProjectRefParaAuditoria } from "./lib/supabase"
import { escreverAuditado } from "./lib/escrita-auditada"
import { stripAccents } from "../src/lib/strip-accents"

const SOURCE_MANIFEST = resolve(process.cwd(), "scripts/audit/numero-urna-source.json")
const CARGO_BY_CODE: Record<string, string> = {
  "1": "PRESIDENTE", "2": "VICE-PRESIDENTE", "3": "GOVERNADOR", "4": "VICE-GOVERNADOR",
  "5": "SENADOR", "6": "DEPUTADO FEDERAL", "7": "DEPUTADO ESTADUAL", "8": "DEPUTADO DISTRITAL",
}

export interface SourceMatch { sq: string; uf: string; cargo: string; numero: string; nome: string }
export interface DatabaseCandidate { id: string; slug: string; sq_candidato_2026: string | null; estado: string | null; cargo_disputado: string | null; publicavel: boolean; numero_urna?: string | null }
export interface BackfillJournalRow { id: string; slug: string; sq: string; estado: string | null; cargo: string; officialNumber: string; sourceSha256: string }
export interface BackfillJournal { version: 1; kind: "numero-urna-backfill"; createdAt: string; sourceSha256: string; rows: BackfillJournalRow[]; integritySha256: string }
export interface BackfillReport {
  sourceSha256: string; sourceRows: number; uniqueRows: number; sourceAggregateConflicts: string[]
  seedSqCount: number; seedMatchedCount: number; seedUnmatchedCount: number; seedIdentityConflicts: string[]
  matchesByUfCargo: Record<string, number>; unmatchedSeedSqs: string[]
  database: "skipped" | "queried" | "error"; schemaPresent?: boolean; databasePublishedCount?: number
  databaseMatchCount?: number; databaseMissingCount?: number; databasePending?: number; databaseAlreadyFilled?: number
  databaseDrift?: number; databaseApplied?: number; databaseReadback?: number; databaseUnmatchedByUfCargo?: Record<string, number>; databaseIdentityMismatches?: string[]
  databaseMissingFieldsByReason?: Record<string, number>
}

function arg(name: string): string | null { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] ?? null : null }
export function normalizeCargo(value: string): string { return stripAccents(value).trim().toUpperCase().replace(/\s+/g, " ") }
function sourceSha256(path: string): string { return createHash("sha256").update(readFileSync(path)).digest("hex") }
function loadSeedSqs(): Map<string, string> {
  const candidates = JSON.parse(readFileSync(resolve(process.cwd(), "data/candidatos.json"), "utf8")) as Array<{ slug: string; ids?: { tse_sq_candidato?: Record<string, string> } }>
  const out = new Map<string, string>(); for (const candidate of candidates) { const sq = candidate.ids?.tse_sq_candidato?.["2026"]?.trim(); if (sq) out.set(sq, candidate.slug) }; return out
}
function sourceRow(row: Record<string, string>): SourceMatch | null {
  const sq = (row.SQ_CANDIDATO ?? "").trim(), uf = (row.SG_UF ?? "").trim().toUpperCase()
  const cargo = CARGO_BY_CODE[(row.CD_CARGO ?? "").trim()] ?? normalizeCargo(row.DS_CARGO ?? ""), numero = (row.NR_CANDIDATO ?? "").trim()
  return sq && uf && cargo && /^\d+$/.test(numero) ? { sq, uf, cargo, numero, nome: (row.NM_CANDIDATO ?? "").trim() } : null
}
function identity(row: Pick<SourceMatch, "sq" | "uf" | "cargo">): string { return `${row.sq}|${row.uf}|${normalizeCargo(row.cargo)}` }
function journalPayload(journal: Omit<BackfillJournal, "integritySha256">): string { return JSON.stringify(journal) }
export function journalIntegrity(journal: Omit<BackfillJournal, "integritySha256">): string { return createHash("sha256").update(journalPayload(journal)).digest("hex") }
export function validateJournal(input: unknown): BackfillJournal {
  if (!input || typeof input !== "object") throw new Error("journal inválido: objeto esperado")
  const journal = input as Partial<BackfillJournal>
  const sourceSha256 = journal.sourceSha256
  if (journal.version !== 1 || journal.kind !== "numero-urna-backfill" || typeof journal.createdAt !== "string" || typeof sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(sourceSha256) || !Array.isArray(journal.rows) || typeof journal.integritySha256 !== "string") throw new Error("journal inválido: schema")
  const rows = journal.rows as BackfillJournalRow[]
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || typeof row.slug !== "string" || typeof row.sq !== "string" || (row.estado !== null && typeof row.estado !== "string") || typeof row.cargo !== "string" || !/^\d+$/.test(row.officialNumber) || row.sourceSha256 !== sourceSha256) throw new Error("journal inválido: linha")
  }
  const payload = { version: 1 as const, kind: "numero-urna-backfill" as const, createdAt: journal.createdAt, sourceSha256, rows }
  if (journal.integritySha256 !== journalIntegrity(payload)) throw new Error("journal inválido: checksum")
  return { ...payload, integritySha256: journal.integritySha256 }
}
export function buildJournal(sourceSha256: string, rows: BackfillJournalRow[], createdAt = new Date().toISOString()): BackfillJournal {
  const payload = { version: 1 as const, kind: "numero-urna-backfill" as const, createdAt, sourceSha256, rows }
  return { ...payload, integritySha256: journalIntegrity(payload) }
}
function assertJournalPath(path: string): void {
  const absolute = resolve(path)
  if (absolute !== path || !absolute.startsWith("/") || absolute === resolve(process.cwd()) || absolute.startsWith(resolve(process.cwd()) + "/")) throw new Error("--journal deve ser um caminho absoluto fora do repositório")
  if (existsSync(absolute)) throw new Error(`journal já existe: ${absolute}`)
}
function writeJournal(path: string, journal: BackfillJournal): void { writeFileSync(path, JSON.stringify(journal, null, 2) + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" }); if ((statSync(path).mode & 0o777) !== 0o600) throw new Error("journal não ficou com modo 0600") }
export function casIdentity(row: Pick<DatabaseCandidate, "sq_candidato_2026" | "estado" | "cargo_disputado">, match: SourceMatch): { sq: string; estado: string | null; cargo: string | null } {
  const uf = row.estado?.toUpperCase() || (normalizeCargo(row.cargo_disputado ?? "") === "PRESIDENTE" || normalizeCargo(row.cargo_disputado ?? "") === "VICE-PRESIDENTE" ? "BR" : "")
  if (`${row.sq_candidato_2026 ?? ""}|${uf}|${normalizeCargo(row.cargo_disputado ?? "")}` !== identity(match)) throw new Error("CAS identity mismatch")
  return { sq: match.sq, estado: row.estado, cargo: row.cargo_disputado }
}
async function fetchPublished(columns: string): Promise<{ data: DatabaseCandidate[]; error: { message: string } | null }> {
  const rows: DatabaseCandidate[] = []
  for (let offset = 0; ; offset += 1000) {
    const result = await supabase.from("candidatos").select(columns).eq("publicavel", true).neq("status", "removido").order("id").range(offset, offset + 999)
    if (result.error) return { data: rows, error: result.error }
    rows.push(...((result.data ?? []) as unknown as DatabaseCandidate[]))
    if ((result.data ?? []).length < 1000) return { data: rows, error: null }
  }
}

async function readSource(zipPath: string): Promise<{ rows: SourceMatch[]; total: number; conflicts: string[] }> {
  const temp = join("/tmp", `pf-numero-urna-${process.pid}`); mkdirSync(temp, { recursive: true })
  try {
    execFileSync("unzip", ["-q", "-o", zipPath, "-d", temp])
    const files = readdirSync(temp).filter((name) => /^consulta_cand_2026_[A-Z]{2,6}\.csv$/i.test(name)), brasil = files.find((name) => /_BRASIL\.csv$/i.test(name))
    if (!brasil) throw new Error("ZIP sem consulta_cand_2026_BRASIL.csv")
    const aggregate = new Map<string, Set<string>>(), perUf = new Map<string, Set<string>>(), rows = new Map<string, SourceMatch>(); let total = 0
    const read = async (file: string, target: Map<string, Set<string>>, collect: boolean) => parseCSV(join(temp, file), (raw) => {
      if (collect) total += 1; const row = sourceRow(raw); if (!row) return; const key = identity(row); const set = target.get(key) ?? new Set<string>(); set.add(row.numero); target.set(key, set); if (collect) rows.set(key, row)
    })
    await read(brasil, aggregate, true); for (const file of files.filter((name) => name !== brasil)) await read(file, perUf, false)
    const keys = new Set([...aggregate.keys(), ...perUf.keys()])
    const conflicts = [...keys].filter((key) => {
      const aggregateNumbers = aggregate.get(key)
      const ufNumbers = perUf.get(key)
      return !aggregateNumbers || !ufNumbers || aggregateNumbers.size !== 1 || ufNumbers.size !== 1 || !ufNumbers.has([...aggregateNumbers][0])
    }).map((key) => `${key}: BRASIL=${[...(aggregate.get(key) ?? [])].sort().join(",")} UF=${[...(perUf.get(key) ?? [])].sort().join(",")}`)
    return { rows: [...rows.values()], total, conflicts }
  } finally { rmSync(temp, { recursive: true, force: true }) }
}

async function main() {
  const zipArg = arg("--zip"); if (!zipArg) throw new Error("--zip é obrigatório; use o ZIP registrado no manifesto")
  const zipPath = resolve(zipArg); if (!existsSync(zipPath)) throw new Error(`ZIP ausente: ${zipPath}`)
  const manifest = JSON.parse(readFileSync(SOURCE_MANIFEST, "utf8")) as { sha256: string; url: string; retrieved_at: string }, sha = sourceSha256(zipPath)
  if (sha !== manifest.sha256) throw new Error(`SHA256 inesperado: ${sha}; esperado ${manifest.sha256}`)
  const source = await readSource(zipPath), seed = loadSeedSqs(), bySq = new Map<string, SourceMatch[]>()
  for (const row of source.rows) bySq.set(row.sq, [...(bySq.get(row.sq) ?? []), row])
  const matches: SourceMatch[] = [], seedIdentityConflicts: string[] = []
  for (const sq of seed.keys()) { const found = bySq.get(sq) ?? []; if (found.length === 1) matches.push(found[0]); else if (found.length > 1) seedIdentityConflicts.push(`${sq}: ${found.map(identity).sort().join(",")}`) }
  const matchedSqs = new Set(matches.map((row) => row.sq)), matchesByUfCargo: Record<string, number> = {}
  for (const row of matches) matchesByUfCargo[`${row.uf}/${row.cargo}`] = (matchesByUfCargo[`${row.uf}/${row.cargo}`] ?? 0) + 1
  const report: BackfillReport = { sourceSha256: sha, sourceRows: source.total, uniqueRows: source.rows.length, sourceAggregateConflicts: source.conflicts, seedSqCount: seed.size, seedMatchedCount: matchedSqs.size, seedUnmatchedCount: seed.size - matchedSqs.size, seedIdentityConflicts, matchesByUfCargo, unmatchedSeedSqs: [...seed.keys()].filter((sq) => !matchedSqs.has(sq)), database: "skipped" }
  if (process.argv.includes("--with-db") || process.argv.includes("--apply")) {
    const base = await fetchPublished("id,slug,sq_candidato_2026,estado,cargo_disputado,publicavel")
    if (base.error) { report.database = "error"; throw new Error(`database_error=${base.error.message}`) }
    report.database = "queried"; const published = base.data
    const withColumn = await fetchPublished("id,slug,sq_candidato_2026,estado,cargo_disputado,publicavel,numero_urna"), schemaPresent = !withColumn.error
    report.schemaPresent = schemaPresent; const candidates = (schemaPresent ? withColumn.data : published) as DatabaseCandidate[], sourceByIdentity = new Map(source.rows.map((row) => [identity(row), row]))
    const unmatchedByUfCargo: Record<string, number> = {}, missingFields: Record<string, number> = {}, mismatches: string[] = []; let pending = 0, alreadyFilled = 0, drift = 0; const toWrite: Array<{ row: DatabaseCandidate; match: SourceMatch }> = []
    for (const row of candidates) {
      const cargo = normalizeCargo(row.cargo_disputado ?? ""), isNational = cargo === "PRESIDENTE" || cargo === "VICE-PRESIDENTE", uf = row.estado?.toUpperCase() || (isNational ? "BR" : "")
      const missingReason = !row.sq_candidato_2026 ? "sq_candidato_2026_nulo" : !row.cargo_disputado ? "cargo_disputado_nulo" : !row.estado && !isNational ? "estado_nulo_nao_nacional" : !row.estado ? "estado_nulo_nacional_mapeado_br" : null
      if (missingReason) missingFields[missingReason] = (missingFields[missingReason] ?? 0) + 1
      const key = `${row.sq_candidato_2026 ?? ""}|${uf}|${cargo}`, match = sourceByIdentity.get(key)
      if (!match) { const bucket = `${row.estado ?? "?"}/${row.cargo_disputado ?? "?"}`; unmatchedByUfCargo[bucket] = (unmatchedByUfCargo[bucket] ?? 0) + 1; mismatches.push(`${row.slug}: ${key}`); continue }
      if (!schemaPresent || row.numero_urna == null) { pending++; toWrite.push({ row, match }) } else if (row.numero_urna === match.numero) alreadyFilled++; else drift++
    }
    report.databasePublishedCount = candidates.length; report.databaseMatchCount = pending + alreadyFilled + drift; report.databaseMissingCount = Object.values(unmatchedByUfCargo).reduce((a, b) => a + b, 0); report.databasePending = pending; report.databaseAlreadyFilled = alreadyFilled; report.databaseDrift = drift; report.databaseUnmatchedByUfCargo = unmatchedByUfCargo; report.databaseIdentityMismatches = mismatches; report.databaseMissingFieldsByReason = missingFields
    if (process.argv.includes("--apply")) {
      if (!schemaPresent) throw new Error("--apply abortado: numero_urna ainda não existe")
      if (source.conflicts.length || seedIdentityConflicts.length || report.databaseMissingCount || drift) throw new Error("CAS abortado: conflito de identidade, fonte divergente ou drift no banco")
      if (process.env.PF_NUMERO_URNA_APPLY_CONFIRM !== "I_CONFIRM_CAS") throw new Error("--apply exige PF_NUMERO_URNA_APPLY_CONFIRM=I_CONFIRM_CAS")
      if (supabaseProjectRefParaAuditoria() !== "wskpzsobvqwhnbsdsmok") throw new Error("--apply exige o projeto de produção do Puxa Ficha")
      const journalArg = arg("--journal"); if (!journalArg) throw new Error("--apply exige --journal com caminho absoluto fora do repositório")
      assertJournalPath(journalArg)
      const journal = buildJournal(sha, toWrite.map(({ row, match }) => ({ id: row.id, slug: row.slug, sq: match.sq, estado: row.estado, cargo: row.cargo_disputado ?? "", officialNumber: match.numero, sourceSha256: sha })))
      writeJournal(journalArg, journal)
      for (const { row, match } of toWrite) await escreverAuditado({ script: "backfill-numero-urna", tabela: "candidatos", motivo: "preenche número de urna oficial do TSE 2026", recorte: `${row.slug}:${identity(match)}` }, async () => {
        const cas = casIdentity(row, match)
        let query = supabase.from("candidatos").update({ numero_urna: match.numero }).eq("id", row.id).eq("slug", row.slug).eq("publicavel", true).neq("status", "removido").eq("sq_candidato_2026", cas.sq).eq("cargo_disputado", cas.cargo).is("numero_urna", null)
        query = cas.estado == null ? query.is("estado", null) : query.eq("estado", cas.estado)
        const result = await query.select("id")
        if (result.error == null && (result.data?.length ?? 0) !== 1) throw new Error(`CAS numero_urna: esperado 1 id para ${row.slug}, recebido ${result.data?.length ?? 0}`)
        return result
      })
      const after = await fetchPublished("id,slug,sq_candidato_2026,estado,cargo_disputado,publicavel,numero_urna")
      if (after.error) throw new Error(`backfill readback: ${after.error.message}`)
      const actualById = new Map(after.data.map((row) => [row.id, row]))
      for (const { row, match } of toWrite) {
        const actual = actualById.get(row.id)
        if (!actual || actual.slug !== row.slug || actual.numero_urna !== match.numero || actual.sq_candidato_2026 !== match.sq || actual.cargo_disputado !== row.cargo_disputado || actual.estado !== row.estado) {
          throw new Error(`backfill readback divergente: ${row.slug}`)
        }
      }
      report.databaseApplied = toWrite.length
      report.databaseReadback = toWrite.length
    }
  }
  console.log(JSON.stringify(report, null, 2))
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error) => { console.error(`backfill-numero-urna: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 })
