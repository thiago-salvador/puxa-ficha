import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { supabase } from "./lib/supabase"
import { escreverAuditado } from "./lib/escrita-auditada"
import { DEFAULT_COMPLEMENT_PACKAGE, DEFAULT_ROSTER_PACKAGE, COMPLEMENT_SOURCE_URL, ROSTER_SOURCE_URL, buildRoster, compareRoster, loadRows, type ComplementRow, type RosterRecord, type SnapshotRow } from "./lib/roster-deputados"

function arg(name: string): string | null {
  const prefix = `--${name}=`
  const found = process.argv.find((item) => item.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

const snapshotPath = arg("snapshot") ?? DEFAULT_ROSTER_PACKAGE
const complementPath = arg("complement") ?? DEFAULT_COMPLEMENT_PACKAGE
const outputPath = arg("out")
const rosterOutputPath = arg("roster-out")
const apply = process.argv.includes("--apply")
const includeMajoritarios = process.argv.includes("--include-majoritarios")
const now = new Date().toISOString()

function emit(value: unknown): void {
  const text = `${JSON.stringify(value, null, 2)}\n`
  if (outputPath) writeFileSync(resolve(outputPath), text)
  process.stdout.write(text)
}

async function main(): Promise<void> {
 if (!existsSync(resolve(snapshotPath)) || !existsSync(resolve(complementPath))) {
  emit({ status: "pending", reason: "pacote_oficial_ausente", expected: [resolve(snapshotPath), resolve(complementPath)], source_urls: [ROSTER_SOURCE_URL, COMPLEMENT_SOURCE_URL], apply: false, coverage_proven: false })
  return
 }
 try {
  const snapshot = loadRows(snapshotPath)
  const complement = loadRows(complementPath)
 const summary = buildRoster(snapshot.rows as SnapshotRow[], complement.rows as ComplementRow[], { sha256: snapshot.sha256, sourceUrl: ROSTER_SOURCE_URL, collectedAt: now }, { includeMajoritarios })
 summary.source = { path: snapshot.path, sha256: snapshot.sha256, files: snapshot.files, complementPath: complement.path, complementSha256: complement.sha256 }
  if (rosterOutputPath) writeFileSync(resolve(rosterOutputPath), `${JSON.stringify({ records: summary.records }, null, 2)}\n`)
  let previous: RosterRecord[] = []
  if (arg("previous")) previous = JSON.parse(readFileSync(resolve(arg("previous") as string), "utf8")) as RosterRecord[]
  const diff = compareRoster(previous, summary.records)
  if (apply) {
    const rows = summary.records
    // O PostgREST limita linhas retornadas por requisição. Cada lote mantém
    // a contagem do escreverAuditado igual às linhas efetivamente escritas.
    const batchSize = 500
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const batch = rows.slice(offset, offset + batchSize)
      await escreverAuditado({ script: "ingest-roster-deputados", tabela: "candidatos_roster_2026", motivo: "atualiza roster oficial de deputados 2026", recorte: `linhas ${offset + 1}-${offset + batch.length} de ${rows.length}` }, () => supabase.from("candidatos_roster_2026").upsert(batch, { onConflict: "ano,sq_candidato,uf,cargo" }).select("ano,sq_candidato,uf,cargo"))
    }
  }
  emit({ status: apply ? "applied" : "dry_run", source: summary.source, snapshot_em: summary.records[0]?.snapshot_em ?? null, coletado_em: now, counts: summary.counts, total: summary.records.length, replacements: summary.replacements, diff: { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length }, apply, include_majoritarios: includeMajoritarios, coverage_proven: Boolean(summary.records.length && summary.records.every((record) => record.snapshot_em)) })
 } catch (error) {
  emit({ status: "error", error: error instanceof Error ? error.message : String(error), apply })
  process.exitCode = 1
 }
}

void main()
