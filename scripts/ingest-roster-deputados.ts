import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { supabase } from "./lib/supabase"
import { escreverAuditado } from "./lib/escrita-auditada"
import { DEFAULT_COMPLEMENT_PACKAGE, DEFAULT_ROSTER_PACKAGE, COMPLEMENT_SOURCE_URL, ROSTER_MIN_TOTAL, ROSTER_SOURCE_URL, buildRoster, compareRoster, loadRows, rosterApplyBlock, type ComplementRow, type RosterRecord, type SnapshotRow } from "./lib/roster-deputados"

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
const minTotal = Number(arg("piso") ?? ROSTER_MIN_TOTAL)
const removedOutputPath = arg("removed-out")
const now = new Date().toISOString()

/** Current roster keys in the database, to report rows the new package no longer lists. */
async function loadCurrentRoster(): Promise<RosterRecord[]> {
  const rows: RosterRecord[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("candidatos_roster_2026")
      .select("ano,sq_candidato,uf,cargo,nome_urna,partido_sigla,situacao_registro,snapshot_em")
      .order("sq_candidato").range(from, from + pageSize - 1)
    if (error) throw new Error(`leitura do roster atual falhou: ${error.message}`)
    rows.push(...((data ?? []) as unknown as RosterRecord[]))
    if (!data || data.length < pageSize) return rows
  }
}

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
  const previous: RosterRecord[] = arg("previous")
    ? JSON.parse(readFileSync(resolve(arg("previous") as string), "utf8")) as RosterRecord[]
    : await loadCurrentRoster()
  const diff = compareRoster(previous, summary.records)
  // Upsert never deletes: rows missing from the new package stay in the table and are only reported.
  const removed = diff.removed.map(({ sq_candidato, uf, cargo, nome_urna, partido_sigla, situacao_registro }) => ({ sq_candidato, uf, cargo, nome_urna, partido_sigla, situacao_registro }))
  if (removedOutputPath) writeFileSync(resolve(removedOutputPath), `${JSON.stringify({ kept_in_table: true, count: removed.length, rows: removed }, null, 2)}\n`)
  const block = rosterApplyBlock(summary.records, minTotal)
  if (apply && block) {
    emit({ status: "blocked", reason: block, total: summary.records.length, min_total: minTotal, apply: false, removed_from_package: removed.length })
    process.exitCode = 1
    return
  }
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
  emit({ status: apply ? "applied" : "dry_run", source: summary.source, snapshot_em: summary.records[0]?.snapshot_em ?? null, coletado_em: now, counts: summary.counts, total: summary.records.length, replacements: summary.replacements, diff: { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length }, removed_from_package: { kept_in_table: true, count: removed.length, sample: removed.slice(0, 20) }, apply, include_majoritarios: includeMajoritarios, min_total: minTotal, apply_block: block, coverage_proven: Boolean(summary.records.length && summary.records.every((record) => record.snapshot_em)) })
 } catch (error) {
  emit({ status: "error", error: error instanceof Error ? error.message : String(error), apply })
  process.exitCode = 1
 }
}

void main()
